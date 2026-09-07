/**
 * Central Background Service Worker & Job Orchestrator
 * Manages multiple concurrent scraping jobs across separate tabs
 */

// In-memory jobs store
const jobs = new Map();
const tabToJobMap = new Map();

// Initialize from chrome.storage.local
async function loadStoredJobs() {
  try {
    const data = await chrome.storage.local.get('fb_jobs');
    if (Array.isArray(data.fb_jobs)) {
      data.fb_jobs.forEach(j => {
        // Reset running status to stopped on restart
        if (j.status === 'RUNNING' || j.status === 'STARTING') {
          j.status = 'STOPPED';
          if (j.progress) j.progress.statusMessage = 'Đã dừng khi tiện ích khởi động lại.';
        }
        jobs.set(j.id, j);
      });
      console.log(`[Job Manager] Loaded ${jobs.size} jobs from storage.`);
    }
  } catch (e) {
    console.warn('[Job Manager] Failed to load jobs from storage:', e);
  }
}

// Persist jobs to chrome.storage.local (debounced)
let saveTimeout = null;
function persistJobs() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const jobsArray = Array.from(jobs.values()).map(j => {
        // Do not store huge payloads in memory index if too big
        return {
          id: j.id,
          url: j.url,
          status: j.status,
          createdAt: j.createdAt,
          config: j.config,
          progress: j.progress,
          resultData: j.resultData
        };
      });
      await chrome.storage.local.set({ fb_jobs: jobsArray });
    } catch (e) {
      console.error('[Job Manager] Error saving jobs:', e);
    }
  }, 1000);
}

// Broadcast progress to Dashboard and Popup
function broadcastJobUpdate(job) {
  try {
    chrome.runtime.sendMessage({
      type: 'JOB_UPDATED',
      job: job
    }).catch(() => {});
  } catch (e) {}
}

// Create a job record and save immediately
function createJobRecord(url, customConfig = {}) {
  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  const job = {
    id: jobId,
    url: url.trim(),
    status: 'STARTING',
    createdAt: new Date().toISOString(),
    tabId: null,
    config: Object.assign({
      maxComments: 0,
      expandReplies: true,
      autoSwitchFilter: true,
      bufferMs: 1200,
      delayMs: 1200
    }, customConfig),
    progress: {
      postAuthor: 'Đang mở bài viết...',
      postText: '',
      postUrl: url,
      totalComments: 0,
      totalTopLevel: 0,
      totalReplies: 0,
      expectedComments: 0,
      statusMessage: 'Đang mở tab trong nền và nạp trang Facebook...'
    },
    resultData: null
  };

  jobs.set(jobId, job);
  persistJobs();
  broadcastJobUpdate(job);
  return job;
}

let workerWindowId = null;
let workerWindowPromise = null;
let lastDashboardWindowId = null;
let lastDashboardTabId = null;

// Concurrency & execution queue
const jobQueue = []; // array of job IDs waiting to execute
const runningJobIds = new Set(); // set of running job IDs
let maxConcurrentLimit = 999; // Default: Run ALL jobs concurrently (Song song toàn bộ)

function setMaxConcurrency(limit) {
  const parsed = parseInt(limit, 10);
  maxConcurrentLimit = (!isNaN(parsed) && parsed > 0) ? parsed : 999;
  processNextJobInQueue();
}

function processNextJobInQueue() {
  while (runningJobIds.size < maxConcurrentLimit && jobQueue.length > 0) {
    const nextJobId = jobQueue.shift();
    const nextJob = jobs.get(nextJobId);
    if (!nextJob) continue;

    // Only run if job is still waiting
    if (nextJob.status === 'WAITING' || nextJob.status === 'STARTING') {
      runningJobIds.add(nextJob.id);
      nextJob.status = 'STARTING';
      nextJob.progress.statusMessage = 'Đang mở bài viết và bắt đầu cào...';
      broadcastJobUpdate(nextJob);
      persistJobs();

      openJobTabAndStart(nextJob);
    }
  }

  // Update position text for any remaining waiting jobs
  jobQueue.forEach((qId, idx) => {
    const qJob = jobs.get(qId);
    if (qJob && qJob.status === 'WAITING') {
      qJob.progress.statusMessage = `Đang chờ trong hàng đợi (bài ${idx + 1}/${jobQueue.length})...`;
      broadcastJobUpdate(qJob);
    }
  });
}

function enqueueJob(job) {
  if (runningJobIds.size < maxConcurrentLimit) {
    runningJobIds.add(job.id);
    job.status = 'STARTING';
    job.progress.statusMessage = 'Đang mở tab bài viết...';
    broadcastJobUpdate(job);
    persistJobs();
    openJobTabAndStart(job);
  } else {
    job.status = 'WAITING';
    const queuePosition = jobQueue.length + 1;
    job.progress.statusMessage = `Đang chờ trong hàng đợi (vị trí ${queuePosition})...`;
    jobQueue.push(job.id);
    broadcastJobUpdate(job);
    persistJobs();
  }
}

function onJobFinished(jobId) {
  runningJobIds.delete(jobId);
  checkStopTabRotator();

  // If all running jobs have finished, refocus the dashboard
  if (runningJobIds.size === 0) {
    stopTabRotator();
    if (lastDashboardTabId) {
      chrome.tabs.update(lastDashboardTabId, { active: true }).catch(() => {});
    }
    if (lastDashboardWindowId) {
      chrome.windows.update(lastDashboardWindowId, { focused: true }).catch(() => {});
    }
  }

  setTimeout(() => {
    processNextJobInQueue();
  }, 300);
}

function setupJobTab(job, tabId) {
  job.tabId = tabId;
  tabToJobMap.set(tabId, job.id);

  // Prevent Chrome Memory Saver from discarding/freezing this crawling tab
  try {
    chrome.tabs.update(tabId, { autoDiscardable: false }, () => {
      if (chrome.runtime.lastError) {}
    });
  } catch (e) {}

  let started = false;

  const triggerStart = () => {
    if (started) return;
    started = true;
    chrome.tabs.onUpdated.removeListener(onUpdatedListener);

    // Wait 2s for Facebook scripts to initialize
    setTimeout(() => {
      job.status = 'RUNNING';
      job.progress.statusMessage = 'Đang phân tích bài viết và bắt đầu cào...';
      broadcastJobUpdate(job);

      let retries = 0;
      const sendStartMsg = () => {
        chrome.tabs.sendMessage(tabId, {
          action: 'START_JOB_CRAWL',
          jobId: job.id,
          config: job.config
        }, (res) => {
          if (chrome.runtime.lastError) {
            retries++;
            if (retries <= 3) {
              // Try programmatically injecting content scripts if needed
              try {
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content/dom-selectors.js', 'content/crawler-engine.js', 'content/content.js']
                }).catch(() => {});
              } catch (e) {}
              setTimeout(sendStartMsg, 1500);
            } else {
              // If failed after retries, check if redirected to login page
              chrome.tabs.get(tabId, (t) => {
                if (t && t.url && (t.url.includes('/login') || t.url.includes('/checkpoint'))) {
                  job.status = 'STOPPED';
                  job.progress.statusMessage = 'Yêu cầu đăng nhập: Facebook đã chuyển hướng sang trang đăng nhập.';
                } else {
                  job.status = 'STOPPED';
                  job.progress.statusMessage = 'Không thể kết nối đến tab bài viết sau các lần thử.';
                }
                broadcastJobUpdate(job);
                persistJobs();
                onJobFinished(job.id);
                if (job.windowId) {
                  const wId = job.windowId;
                  job.windowId = null;
                  setTimeout(() => chrome.windows.remove(wId).catch(() => {}), 600);
                }
              });
            }
          }
        });
      };
      sendStartMsg();
    }, 2000);
  };

  const onUpdatedListener = (tId, changeInfo) => {
    if (tId === tabId && changeInfo.status === 'complete') {
      triggerStart();
    }
  };

  chrome.tabs.onUpdated.addListener(onUpdatedListener);

  // Check if tab is already loaded
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.status === 'complete') {
      triggerStart();
    }
  });

  // Watchdog: If tab takes too long to load (35s), attempt to trigger anyway
  setTimeout(() => {
    if (!started && (job.status === 'STARTING' || job.status === 'WAITING')) {
      console.warn(`[Job Manager] Watchdog triggered crawl for job ${job.id}`);
      triggerStart();
    }
  }, 35000);
}

async function getOrCreateWorkerWindow(initialUrl) {
  if (workerWindowId) {
    try {
      const win = await chrome.windows.get(workerWindowId, { populate: true });
      if (win) return win;
    } catch (e) {
      workerWindowId = null;
    }
  }

  if (workerWindowPromise) {
    return workerWindowPromise;
  }

  workerWindowPromise = new Promise((resolve) => {
    chrome.windows.create({
      url: initialUrl || 'about:blank',
      populate: true,
      focused: false,
      width: 1050,
      height: 850,
      top: 40,
      left: 40,
      type: 'normal'
    }, (win) => {
      workerWindowPromise = null;
      if (chrome.runtime.lastError || !win) {
        console.warn('[Job Manager] Worker window create failed:', chrome.runtime.lastError);
        workerWindowId = null;
        resolve(null);
      } else {
        workerWindowId = win.id;
        resolve(win);
      }
    });
  });

  return workerWindowPromise;
}

// ============================================================================
// High-Performance Tab Rotator ("Lần lượt đảo Tab trong trình duyệt để cào siêu tốc")
// Rapidly cycles active tabs across running crawling jobs in the browser window.
// Keeps Chrome from throttling background tabs; forces full-speed DOM rendering.
// When any job completes, its tab is immediately closed.
// When all jobs complete, focus automatically returns to the Dashboard tab.
// ============================================================================
let tabRotatorTimer = null;
let currentTabDeck = [];
let lastActiveTabId = null;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getActiveRunningTabIds() {
  const tabIds = [];
  for (const jId of runningJobIds) {
    const j = jobs.get(jId);
    if (j && j.tabId && (j.status === 'RUNNING' || j.status === 'STARTING')) {
      if (!tabIds.includes(j.tabId)) {
        tabIds.push(j.tabId);
      }
    }
  }
  return tabIds;
}

function stopTabRotator() {
  if (tabRotatorTimer) {
    clearTimeout(tabRotatorTimer);
    tabRotatorTimer = null;
  }
  currentTabDeck = [];
  lastActiveTabId = null;
}

function checkStopTabRotator() {
  const activeTabs = getActiveRunningTabIds();
  if (activeTabs.length === 0) {
    stopTabRotator();
  }
}

function startTabRotatorIfNeeded() {
  if (tabRotatorTimer) return;

  const triggerNextTab = async () => {
    const activeTabs = getActiveRunningTabIds();
    if (activeTabs.length === 0) {
      stopTabRotator();
      return;
    }

    // If only 1 tab is running, just activate it once
    if (activeTabs.length === 1) {
      const singleTabId = activeTabs[0];
      if (singleTabId !== lastActiveTabId) {
        try {
          await chrome.tabs.update(singleTabId, { active: true });
          lastActiveTabId = singleTabId;
        } catch (e) {}
      }
      if (runningJobIds.size > 0 && getActiveRunningTabIds().length > 0) {
        tabRotatorTimer = setTimeout(triggerNextTab, 5000);
      } else {
        stopTabRotator();
      }
      return;
    }

    // Filter deck to only include still-active running tabs
    currentTabDeck = currentTabDeck.filter(tId => activeTabs.includes(tId));

    // Refill and shuffle deck when empty (fair "lần lượt" round-robin + randomized sequence)
    if (currentTabDeck.length === 0) {
      currentTabDeck = shuffleArray(activeTabs);
    }

    // Pop next tab to activate
    const targetTabId = currentTabDeck.shift();

    if (targetTabId && targetTabId !== lastActiveTabId) {
      try {
        await chrome.tabs.update(targetTabId, { active: true });
        lastActiveTabId = targetTabId;
      } catch (e) {
        // Tab may have been closed
      }
    }

    // Rotator interval adjusted based on user feedback (slower, ~1750ms)
    // Ensures a full cycle across 4 tabs takes roughly 7 seconds.
    if (runningJobIds.size > 0 && getActiveRunningTabIds().length > 0) {
      const nextDelay = 1500 + Math.floor(Math.random() * 1000);
      tabRotatorTimer = setTimeout(triggerNextTab, nextDelay);
    } else {
      stopTabRotator();
    }
  };

  tabRotatorTimer = setTimeout(triggerNextTab, 5000);
}

// Open tab for job (Always open as Tab in current browser window!)
async function openJobTabAndStart(job) {
  const windowMode = job.config?.windowMode || 'tabs_rotate';

  // Mode: 1 separate worker window (only if user explicitly chooses single_worker)
  if (windowMode === 'single_worker' || windowMode === 'smart_background') {
    try {
      const win = await getOrCreateWorkerWindow(job.url);
      if (win) {
        job.windowId = win.id;
        const firstTab = win.tabs && win.tabs[0];
        if (firstTab && !tabToJobMap.has(firstTab.id)) {
          if (firstTab.url !== job.url && firstTab.pendingUrl !== job.url) {
            chrome.tabs.update(firstTab.id, { url: job.url });
          }
          setupJobTab(job, firstTab.id);
          startTabRotatorIfNeeded();
          return;
        }

        chrome.tabs.create({ windowId: win.id, url: job.url, active: false }, (newTab) => {
          if (newTab) {
            setupJobTab(job, newTab.id);
            startTabRotatorIfNeeded();
          } else {
            chrome.tabs.create({ url: job.url, active: false }, (fbTab) => {
              setupJobTab(job, fbTab.id);
              startTabRotatorIfNeeded();
            });
          }
        });
        return;
      }
    } catch (e) {
      console.warn('[Job Manager] Worker window creation error, falling back to tab:', e);
      workerWindowId = null;
    }
  }

  // DEFAULT & PRIMARY MODE: Open as Tab in current browser window (NO new browser window)
  chrome.tabs.create({ url: job.url, active: false }, (newTab) => {
    if (newTab) {
      setupJobTab(job, newTab.id);
      if (windowMode !== 'background_tab') {
        startTabRotatorIfNeeded();
      }
    }
  });
}

// Start a single job
async function startJob(url, customConfig = {}) {
  const job = createJobRecord(url, customConfig);
  enqueueJob(job);
  return job;
}

// Handle tab closure by user
chrome.tabs.onRemoved.addListener((tabId) => {
  const jobId = tabToJobMap.get(tabId);
  if (jobId && jobs.has(jobId)) {
    const job = jobs.get(jobId);
    if (job.status === 'RUNNING' || job.status === 'STARTING') {
      job.status = 'STOPPED';
      job.progress.statusMessage = 'Tab đã bị đóng.';
      broadcastJobUpdate(job);
      persistJobs();
      onJobFinished(job.id);
    }
    tabToJobMap.delete(tabId);
  }
});

// Handle window closure by user or system
chrome.windows.onRemoved.addListener((winId) => {
  if (winId === workerWindowId) {
    workerWindowId = null;
  }
  for (const [jobId, job] of jobs.entries()) {
    if (job.windowId === winId) {
      job.windowId = null;
      if (job.status === 'RUNNING' || job.status === 'STARTING') {
        job.status = 'STOPPED';
        job.progress.statusMessage = 'Cửa sổ đã bị đóng.';
        broadcastJobUpdate(job);
        persistJobs();
        onJobFinished(job.id);
      }
    }
  }
  checkStopWindowRotator();
});

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  // Track dashboard window & tab for automatic refocus after all jobs finish
  if (sender && sender.tab && sender.tab.url && sender.tab.url.includes('dashboard.html')) {
    lastDashboardWindowId = sender.tab.windowId;
    lastDashboardTabId = sender.tab.id;
  }

  switch (message.action) {
    case 'REGISTER_DASHBOARD': {
      if (message.windowId) lastDashboardWindowId = message.windowId;
      if (message.tabId) lastDashboardTabId = message.tabId;
      sendResponse({ success: true, registered: true });
      return true;
    }

    case 'OPEN_AND_CRAWL_URL':
    case 'CREATE_JOB': {
      const concurrency = parseInt(message.concurrency || message.config?.concurrency, 10);
      if (!isNaN(concurrency) && concurrency > 0) {
        setMaxConcurrency(concurrency);
      }
      startJob(message.url, message.config).then(job => {
        sendResponse({ success: true, job });
      });
      return true;
    }

    case 'CREATE_BATCH_JOBS': {
      const urls = message.urls || [];
      const concurrency = parseInt(message.concurrency || message.config?.concurrency, 10);
      if (!isNaN(concurrency) && concurrency > 0) {
        setMaxConcurrency(concurrency);
      }
      const createdJobs = [];
      urls.forEach((u, idx) => {
        const job = createJobRecord(u, message.config);
        createdJobs.push(job);
        // Stagger tab creation slightly (250ms) to ensure smooth Chrome resource allocation
        setTimeout(() => {
          enqueueJob(job);
        }, idx * 250);
      });
      sendResponse({ success: true, count: createdJobs.length, jobs: createdJobs });
      return true;
    }

    case 'SET_CONCURRENCY': {
      const limit = parseInt(message.limit, 10);
      if (!isNaN(limit)) {
        setMaxConcurrency(limit);
      }
      sendResponse({ success: true, maxConcurrent: maxConcurrentLimit });
      return true;
    }

    case 'GET_ALL_JOBS': {
      sendResponse({
        success: true,
        jobs: Array.from(jobs.values()).reverse()
      });
      return true;
    }

    case 'STOP_JOB': {
      const job = jobs.get(message.jobId);
      if (job) {
        const qIdx = jobQueue.indexOf(job.id);
        if (qIdx !== -1) {
          jobQueue.splice(qIdx, 1);
        }
        job.status = 'STOPPED';
        job.progress.statusMessage = 'Người dùng đã dừng job.';
        if (job.tabId) {
          chrome.tabs.sendMessage(job.tabId, { action: 'STOP_CRAWL' }, () => {});
        }
        if (job.windowId) {
          const wId = job.windowId;
          job.windowId = null;
          chrome.windows.remove(wId).catch(() => {});
        }
        broadcastJobUpdate(job);
        persistJobs();
        onJobFinished(job.id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Job not found' });
      }
      return true;
    }

    case 'DELETE_JOB': {
      const job = jobs.get(message.jobId);
      if (job) {
        const qIdx = jobQueue.indexOf(job.id);
        if (qIdx !== -1) {
          jobQueue.splice(qIdx, 1);
        }
        if (job.windowId) {
          const wId = job.windowId;
          job.windowId = null;
          chrome.windows.remove(wId).catch(() => {});
        } else if (job.tabId) {
          try { chrome.tabs.remove(job.tabId); } catch (e) {}
          tabToJobMap.delete(job.tabId);
        }
        jobs.delete(message.jobId);
        persistJobs();
        onJobFinished(message.jobId);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Job not found' });
      }
      return true;
    }

    case 'RETRY_JOB': {
      const job = jobs.get(message.jobId);
      if (job) {
        job.status = 'STARTING';
        job.progress.statusMessage = 'Đang xếp hàng để cào lại...';
        job.progress.totalComments = 0;
        job.progress.totalTopLevel = 0;
        job.progress.totalReplies = 0;
        job.resultData = null;
        broadcastJobUpdate(job);
        enqueueJob(job);
        sendResponse({ success: true, job });
      }
      return true;
    }

    case 'OPEN_JOB_TAB': {
      const job = jobs.get(message.jobId);
      if (job && job.tabId) {
        chrome.tabs.get(job.tabId, (tab) => {
          if (tab) {
            chrome.tabs.update(job.tabId, { active: true });
            if (tab.windowId) {
              chrome.windows.update(tab.windowId, { focused: true });
            }
          }
        });
        sendResponse({ success: true });
      } else if (job && job.url) {
        chrome.tabs.create({ url: job.url, active: true }, (t) => {
          job.tabId = t.id;
          tabToJobMap.set(t.id, job.id);
        });
        sendResponse({ success: true });
      }
      return true;
    }

    // Handlers for messages from content scripts
    case 'JOB_CRAWLER_PROGRESS': {
      const job = jobs.get(message.jobId);
      if (job && message.payload) {
        const p = message.payload;
        job.status = p.status || job.status;
        if (p.post) {
          if (p.post.author) job.progress.postAuthor = p.post.author;
          if (p.post.text) job.progress.postText = p.post.text;
          if (p.post.expectedComments) job.progress.expectedComments = p.post.expectedComments;
        }
        if (p.expectedComments) job.progress.expectedComments = p.expectedComments;
        job.progress.totalComments = p.totalComments || 0;
        job.progress.totalTopLevel = p.totalTopLevel || 0;
        job.progress.totalReplies = p.totalReplies || 0;
        if (p.message) job.progress.statusMessage = p.message;

        broadcastJobUpdate(job);
        persistJobs();
      }
      sendResponse({ received: true });
      return true;
    }

    case 'JOB_CRAWLER_COMPLETED': {
      const job = jobs.get(message.jobId);
      if (job) {
        job.status = 'COMPLETED';
        job.resultData = message.data;
        if (message.data?.stats?.expectedComments) job.progress.expectedComments = message.data.stats.expectedComments;
        const totalGot = message.data?.stats?.totalComments || 0;
        const exp = job.progress.expectedComments || 0;
        const pct = (exp > 0) ? Math.min(100, Math.round((totalGot / exp) * 100)) : 100;
        let matchText = '';
        if (exp > 0 && totalGot >= exp) {
          matchText = ` (Đạt ${totalGot}/${exp} - Đủ 100%)`;
        } else if (exp > 0) {
          matchText = ` (${totalGot}/${exp} - ${pct}% FB hiển thị)`;
        }
        job.progress.statusMessage = `Đã hoàn tất! Thu thập ${totalGot} bình luận${matchText}.`;
        if (message.data?.post?.author) job.progress.postAuthor = message.data.post.author;
        if (message.data?.post?.text) job.progress.postText = message.data.post.text;

        broadcastJobUpdate(job);
        persistJobs();
        onJobFinished(job.id);

        // Auto-close mini worker window or tab immediately (400ms flush buffer)
        const closeWinId = job.windowId;
        const closeTabId = job.tabId;
        job.windowId = null;

        const shouldClose = (closeWinId || job.config?.autoCloseTab !== false);
        if (shouldClose) {
          setTimeout(() => {
            if (closeWinId) {
              chrome.windows.remove(closeWinId).catch(() => {});
            } else if (closeTabId) {
              chrome.tabs.remove(closeTabId).catch(() => {});
            }
          }, 400);
        }
      }
      sendResponse({ received: true });
      return true;
    }

    case 'JOB_CRAWLER_FAILED': {
      const job = jobs.get(message.jobId);
      if (job) {
        job.status = 'STOPPED';
        job.progress.statusMessage = `Lỗi: ${message.error || 'Không thể cào dữ liệu'}`;
        if (job.windowId) {
          const wId = job.windowId;
          job.windowId = null;
          setTimeout(() => {
            chrome.windows.remove(wId).catch(() => {});
          }, 800);
        }
        broadcastJobUpdate(job);
        persistJobs();
        onJobFinished(job.id);
      }
      sendResponse({ received: true });
      return true;
    }

    case 'OPEN_DASHBOARD': {
      const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
      chrome.tabs.create({ url: dashboardUrl, active: true }, (t) => {
        if (t) {
          lastDashboardTabId = t.id;
          lastDashboardWindowId = t.windowId;
        }
      });
      sendResponse({ success: true });
      return true;
    }
  }
});

// Load stored jobs on startup
loadStoredJobs();
