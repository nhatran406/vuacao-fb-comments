/**
 * Content Script entry point: binds engine, HUD widget, and Chrome runtime messaging
 * Supports both standalone on-page scraping and automated background multi-job execution
 */

(function () {
  console.log('[FB Scraper] Content script initialized.');

  // Ensure page-unthrottler is loaded in MAIN world
  try {
    const unthrottlerScript = document.createElement('script');
    unthrottlerScript.src = chrome.runtime.getURL('content/page-unthrottler.js');
    unthrottlerScript.onload = () => unthrottlerScript.remove();
    (document.head || document.documentElement).appendChild(unthrottlerScript);
  } catch (e) {}

  // Shared Crawler Engine instance
  const engine = new FBCrawlerEngine();
  let activeJobId = null;

  // Create In-Page HUD Widget
  let hudWidget = null;
  try {
    hudWidget = new FBHudWidget(engine);
  } catch (e) {
    console.error('[FB Scraper] HUD Widget init error:', e);
  }

  // Forward engine progress to extension popup, background, and dashboard
  engine.onProgress((data) => {
    // 1. Send to popup
    try {
      chrome.runtime.sendMessage({
        type: 'CRAWLER_PROGRESS',
        payload: data
      }).catch(() => {});
    } catch (e) {}

    // 2. If this tab is running a managed background job, notify job manager
    if (activeJobId) {
      try {
        chrome.runtime.sendMessage({
          action: 'JOB_CRAWLER_PROGRESS',
          jobId: activeJobId,
          payload: data
        }).catch(() => {});
      } catch (e) {}
    }
  });

  // Listen for commands from Popup, Dashboard, or Background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    switch (message.action) {
      // Managed multi-job execution from Dashboard
      case 'START_JOB_CRAWL': {
        activeJobId = message.jobId;
        console.log(`[FB Scraper] Starting automated Job: ${activeJobId}`);

        if (message.config) {
          Object.assign(engine.config, message.config);
        }

        // Start crawling
        engine.start().then(resultData => {
          if (activeJobId) {
            chrome.runtime.sendMessage({
              action: 'JOB_CRAWLER_COMPLETED',
              jobId: activeJobId,
              data: resultData
            }).catch(() => {});
          }
        }).catch(err => {
          console.error('[FB Scraper] Job crawl error:', err);
          if (activeJobId) {
            chrome.runtime.sendMessage({
              action: 'JOB_CRAWLER_FAILED',
              jobId: activeJobId,
              error: err ? (err.message || String(err)) : 'Lỗi không xác định'
            }).catch(() => {});
          }
        });

        sendResponse({ success: true, jobId: activeJobId, status: engine.status });
        break;
      }

      // Standalone single tab actions
      case 'START_CRAWL': {
        if (message.config) {
          Object.assign(engine.config, message.config);
        }
        engine.start();
        sendResponse({ success: true, status: engine.status });
        break;
      }

      case 'PAUSE_CRAWL': {
        engine.pause();
        sendResponse({ success: true, status: engine.status });
        break;
      }

      case 'RESUME_CRAWL': {
        engine.resume();
        sendResponse({ success: true, status: engine.status });
        break;
      }

      case 'STOP_CRAWL': {
        engine.stop();
        sendResponse({ success: true, status: engine.status });
        break;
      }

      case 'GET_STATUS': {
        sendResponse({
          success: true,
          status: engine.status,
          totalComments: Math.max(FBDomSelectors.countVisibleCommentElements(), engine.calculateTotalComments()),
          post: engine.postData,
          config: engine.config
        });
        break;
      }

      case 'GET_DATA': {
        sendResponse({
          success: true,
          data: engine.getData()
        });
        break;
      }

      case 'TOGGLE_HUD': {
        if (hudWidget) {
          hudWidget.toggleExpand(!hudWidget.isExpanded);
        }
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });
})();
