/**
 * Facebook Scraper - Page Visibility & Background Tab Unthrottler
 * Injected into the MAIN world at document_start.
 * 
 * Solves Chrome's background tab limitations:
 * 1. Spoofs Page Visibility API (document.hidden = false, visibilityState = 'visible', hasFocus = true)
 * 2. Unthrottles requestAnimationFrame in background tabs via dedicated Web Worker ticker (prevents 1000ms timer clamp)
 * 3. Unthrottles requestIdleCallback for Relay GraphQL pagination
 * 4. Hooks IntersectionObserver so sentinel elements can be force-triggered during scrolling in background tabs
 * 5. Intercepts blur/visibilitychange events so Facebook never freezes GraphQL comment queries
 */

(function () {
  if (window.__fb_scraper_unthrottler_installed__) return;
  window.__fb_scraper_unthrottler_installed__ = true;

  // 1. Page Visibility & Focus Spoofing on document & Document.prototype
  const spoofVisibility = (target) => {
    try {
      Object.defineProperty(target, 'hidden', {
        get: () => false,
        configurable: true
      });
      Object.defineProperty(target, 'visibilityState', {
        get: () => 'visible',
        configurable: true
      });
      Object.defineProperty(target, 'webkitVisibilityState', {
        get: () => 'visible',
        configurable: true
      });
    } catch (e) {}
  };

  spoofVisibility(document);
  if (typeof Document !== 'undefined' && Document.prototype) {
    spoofVisibility(Document.prototype);
    try {
      Document.prototype.hasFocus = () => true;
    } catch (e) {}
  }
  try {
    document.hasFocus = () => true;
  } catch (e) {}

  // 2. Event blocking: prevent Facebook from detecting when tab loses focus or becomes hidden
  const blockEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout'];
  blockEvents.forEach(evtName => {
    window.addEventListener(evtName, (e) => {
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener(evtName, (e) => {
      e.stopImmediatePropagation();
    }, true);
  });

  // 3. Shim requestIdleCallback for Facebook Relay GraphQL pagination
  const origRIC = window.requestIdleCallback?.bind(window);
  window.requestIdleCallback = function (callback, options) {
    let executed = false;
    let fallbackId = null;

    if (origRIC) {
      try {
        origRIC((deadline) => {
          if (!executed) {
            executed = true;
            clearTimeout(fallbackId);
            try { callback(deadline); } catch (e) {}
          }
        }, options);
      } catch (e) {}
    }

    fallbackId = setTimeout(() => {
      if (!executed) {
        executed = true;
        try {
          callback({
            didTimeout: true,
            timeRemaining: () => 50
          });
        } catch (e) {}
      }
    }, 40);

    return fallbackId;
  };

  window.cancelIdleCallback = function (id) {
    clearTimeout(id);
  };

  // 4. Unthrottles requestAnimationFrame in background tabs via dedicated Web Worker ticker
  // Prevents Chrome from freezing React/Relay DOM rendering when tab is hidden.
  try {
    const workerBlob = new Blob([`
      let rafInterval = null;
      self.onmessage = function(e) {
        if (e.data === 'start' && !rafInterval) {
          // Fire a tick every 16ms (~60fps) to keep the event loop busy and unthrottle RAF
          rafInterval = setInterval(() => postMessage('tick'), 16);
        } else if (e.data === 'stop' && rafInterval) {
          clearInterval(rafInterval);
          rafInterval = null;
        }
      };
    `], { type: 'application/javascript' });
    
    const worker = new Worker(URL.createObjectURL(workerBlob));
    const originalRAF = window.requestAnimationFrame;
    const originalCancelRAF = window.cancelAnimationFrame;
    
    let rafCallbacks = new Map();
    let rafIdCount = 0;
    
    worker.onmessage = () => {
      if (rafCallbacks.size === 0) return;
      const now = performance.now();
      const current = new Map(rafCallbacks);
      rafCallbacks.clear();
      current.forEach(cb => {
        try { cb(now); } catch(err) {}
      });
    };
    
    window.requestAnimationFrame = function(callback) {
      // If we spoofed visibility, document.hidden is ALWAYS false.
      // So we must rely on checking actual browser throttling, or just always route through worker.
      // Since Facebook is heavy, routing through worker unconditionally for RAF is safer
      // or we can detect true hidden state by looking at document.visibilityState (the real one).
      // Since we spoofed it, we can't. Let's just use the worker as a fallback ticker.
      
      const id = ++rafIdCount;
      rafCallbacks.set(id, callback);
      worker.postMessage('start');
      
      // We still call original RAF. If the tab is active, original RAF fires first.
      originalRAF((now) => {
        if (rafCallbacks.has(id)) {
          rafCallbacks.delete(id);
          callback(now);
        }
      });
      
      return id;
    };
    
    window.cancelAnimationFrame = function(id) {
      rafCallbacks.delete(id);
      if (rafCallbacks.size === 0) {
        worker.postMessage('stop');
      }
      originalCancelRAF(id);
    };
    
    console.log('[FB Scraper] RAF Web Worker Unthrottler activated.');
  } catch(e) {}


  
  // 5. Ultimate Background Unthrottler: Silent Audio Loop
  // Chrome completely disables timer/RAF throttling for tabs playing audio.
  // We play a silent base64 audio track on a loop to keep the tab fully active.
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      gainNode.gain.value = 0.00001; // Essentially silent
      oscillator.type = 'sine';
      oscillator.frequency.value = 20000; // 20kHz (out of human hearing range)
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      
      // Keep context alive
      setInterval(() => {
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
      }, 2000);
      
      // Auto-resume on any click/scroll
      const resumeAudio = () => {
        if (ctx.state === 'suspended') ctx.resume();
      };
      window.addEventListener('scroll', resumeAudio, { passive: true, once: true });
      document.addEventListener('click', resumeAudio, { passive: true, once: true });
      
      console.log('[FB Scraper] Silent Audio Unthrottler activated.');
    }
  } catch(e) {}


  // 6. Hook IntersectionObserver so sentinels can be force-triggered during scroll in background tabs
  const OriginalIntersectionObserver = window.IntersectionObserver;
  const activeObservers = new Set();

  if (OriginalIntersectionObserver) {
    window.IntersectionObserver = class FBScraperIntersectionObserver extends OriginalIntersectionObserver {
      constructor(callback, options) {
        super(callback, options);
        this._fbCallback = callback;
        this._fbTargets = new Set();
        activeObservers.add(this);
      }

      observe(target) {
        super.observe(target);
        if (target) this._fbTargets.add(target);
      }

      unobserve(target) {
        super.unobserve(target);
        if (target) this._fbTargets.delete(target);
      }

      disconnect() {
        super.disconnect();
        this._fbTargets.clear();
        activeObservers.delete(this);
      }

      _fbForceTriggerAll() {
        const entries = [];
        for (const target of this._fbTargets) {
          if (target && document.contains(target)) {
            let rect = { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
            try {
              const r = target.getBoundingClientRect();
              if (r.width > 0 || r.height > 0) rect = r;
            } catch (e) {}

            entries.push({
              time: performance.now(),
              target: target,
              isIntersecting: true,
              intersectionRatio: 1.0,
              boundingClientRect: rect,
              intersectionRect: rect,
              rootBounds: {
                top: 0,
                left: 0,
                width: window.innerWidth || 1920,
                height: window.innerHeight || 1080,
                bottom: window.innerHeight || 1080,
                right: window.innerWidth || 1920
              }
            });
          }
        }
        if (entries.length > 0) {
          try {
            this._fbCallback(entries, this);
          } catch (e) {}
        }
      }
    };

    // Trigger sentinels ONLY when crawler explicitly asks during scroll pass
    document.addEventListener('__FB_SCRAPER_FORCE_INTERSECT__', () => {
      for (const obs of activeObservers) {
        if (typeof obs._fbForceTriggerAll === 'function') {
          obs._fbForceTriggerAll();
        }
      }
    });
  }

  console.log('[FB Scraper] High-performance Worker-backed unthrottler initialized.');
})();
