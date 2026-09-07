/**
 * Popup Script: coordinates between popup UI, active Facebook tab, and background worker
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const postUrlInput = document.getElementById('post-url-input');
  const btnOpenCrawl = document.getElementById('btn-open-crawl');
  const displayAuthor = document.getElementById('display-post-author');
  const displayStatus = document.getElementById('display-post-status');
  const displaySnippet = document.getElementById('display-post-snippet');
  const statTotal = document.getElementById('stat-total-comments');
  const statThreads = document.getElementById('stat-total-threads');
  const statReplies = document.getElementById('stat-total-replies');
  const statReactions = document.getElementById('stat-reactions');
  const statusBanner = document.getElementById('status-banner');
  const statusSpinner = document.getElementById('status-spinner');
  const statusMessage = document.getElementById('status-message');
  const btnStart = document.getElementById('btn-start');
  const runningControls = document.getElementById('running-controls');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnCopy = document.getElementById('btn-copy');
  const btnToggleHud = document.getElementById('btn-toggle-hud');
  const btnLaunchDashboard = document.getElementById('btn-launch-dashboard');

  if (btnLaunchDashboard) {
    btnLaunchDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    });
  }

  // Config elements
  const cfgAutoFilter = document.getElementById('cfg-auto-filter');
  const cfgExpandReplies = document.getElementById('cfg-expand-replies');
  const cfgMaxComments = document.getElementById('cfg-max-comments');
  const cfgDelay = document.getElementById('cfg-delay');

  let activeTabId = null;
  let isFacebookTab = false;
  let cachedData = null;

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    activeTabId = tab.id;
    if (tab.url.includes('facebook.com')) {
      isFacebookTab = true;
      postUrlInput.value = tab.url;
      displayStatus.innerText = 'Đang trên Facebook';
      queryActiveTabStatus();
    } else {
      displayAuthor.innerText = 'Không ở trang Facebook';
      displaySnippet.innerText = 'Dán link bài viết Facebook vào ô bên trên và bấm "Mở & Cào".';
      displayStatus.innerText = 'Tab khác';
      btnStart.disabled = true;
    }
  }

  function getCrawlerConfig() {
    const delay = parseInt(cfgDelay.value, 10) || 1200;
    return {
      autoSwitchFilter: cfgAutoFilter.checked,
      expandReplies: cfgExpandReplies.checked,
      maxComments: parseInt(cfgMaxComments.value, 10) || 0,
      bufferMs: delay,
      delayMs: delay
    };
  }

  // Query tab for status
  function queryActiveTabStatus() {
    if (!activeTabId || !isFacebookTab) return;

    chrome.tabs.sendMessage(activeTabId, { action: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        console.log('[Popup] Tab not responding or content script initializing...');
        return;
      }
      updateUIWithStatus(res);
    });
  }

  // Update UI based on status
  function updateUIWithStatus(data) {
    if (!data) return;

    if (data.post) {
      if (data.post.author) displayAuthor.innerText = `👤 ${data.post.author}`;
      if (data.post.text) displaySnippet.innerText = data.post.text;
      if (data.post.reactions) statReactions.innerText = data.post.reactions;
    }

    const exp = data.expectedComments || data.post?.expectedComments || 0;
    if (typeof data.totalComments === 'number') {
      statTotal.innerText = (exp > 0) ? `${data.totalComments}/${exp}` : data.totalComments;
    }
    if (typeof data.totalTopLevel === 'number') {
      statThreads.innerText = data.totalTopLevel;
    }
    if (typeof data.totalReplies === 'number') {
      statReplies.innerText = data.totalReplies;
    }

    if (data.status === 'RUNNING') {
      displayStatus.innerText = 'Đang cào...';
      displayStatus.className = 'badge badge-info';
      statusSpinner.style.display = 'block';
      btnStart.style.display = 'none';
      runningControls.style.display = 'flex';
      btnPause.innerText = '⏸ Tạm Dừng';
    } else if (data.status === 'PAUSED') {
      displayStatus.innerText = 'Đang tạm dừng';
      statusSpinner.style.display = 'none';
      btnStart.style.display = 'block';
      btnStart.innerText = '▶ Tiếp Tục Cào';
      runningControls.style.display = 'none';
    } else if (data.status === 'FINISHED') {
      const isDone = exp > 0 && data.totalComments >= exp;
      displayStatus.innerText = isDone ? '✓ Đủ 100%' : 'Đã hoàn tất';
      displayStatus.className = 'badge badge-info';
      statusSpinner.style.display = 'none';
      btnStart.style.display = 'block';
      btnStart.innerText = '▶ Cào Lại';
      runningControls.style.display = 'none';
    } else {
      displayStatus.innerText = 'Sẵn sàng';
      statusSpinner.style.display = 'none';
      btnStart.style.display = 'block';
      btnStart.innerText = '▶ Bắt Đầu Cào Trên Tab Này';
      runningControls.style.display = 'none';
    }

    const hasData = (data.totalComments > 0) || (data.post && data.post.text);
    btnExportCsv.disabled = !hasData;
    btnExportJson.disabled = !hasData;
    btnCopy.disabled = !hasData;
  }

  // Listen for real-time progress broadcast
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CRAWLER_PROGRESS' && message.payload) {
      const p = message.payload;
      updateUIWithStatus(p);
      if (p.message) statusMessage.innerText = p.message;
    }
  });

  // Action: Open URL & Crawl
  btnOpenCrawl.addEventListener('click', () => {
    const url = postUrlInput.value.trim();
    if (!url || !url.includes('facebook.com')) {
      alert('Vui lòng nhập đường link bài viết Facebook hợp lệ (https://www.facebook.com/...)');
      return;
    }

    statusMessage.innerText = 'Đang mở tab mới và chuẩn bị cào...';
    statusSpinner.style.display = 'block';

    chrome.runtime.sendMessage({
      action: 'OPEN_AND_CRAWL_URL',
      url,
      config: getCrawlerConfig()
    }, (res) => {
      if (res && res.success) {
        statusMessage.innerText = 'Đã mở tab bài viết! Quá trình cào sẽ tự động kích hoạt.';
      } else {
        statusMessage.innerText = res?.error || 'Lỗi khi mở link.';
        statusSpinner.style.display = 'none';
      }
    });
  });

  // Action: Start Crawl on active tab
  btnStart.addEventListener('click', () => {
    if (!isFacebookTab) {
      alert('Vui lòng mở một bài viết trên Facebook trước khi bắt đầu.');
      return;
    }

    chrome.tabs.sendMessage(activeTabId, {
      action: 'START_CRAWL',
      config: getCrawlerConfig()
    }, (res) => {
      if (chrome.runtime.lastError) {
        alert('Vui lòng tải lại (F5) trang Facebook để nạp extension.');
        return;
      }
      queryActiveTabStatus();
    });
  });

  // Action: Pause
  btnPause.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'PAUSE_CRAWL' }, () => {
      queryActiveTabStatus();
    });
  });

  // Action: Stop
  btnStop.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'STOP_CRAWL' }, () => {
      queryActiveTabStatus();
    });
  });

  // Action: Export CSV
  btnExportCsv.addEventListener('click', () => {
    fetchDataAndExport((data) => {
      Exporter.exportCSV(data);
    });
  });

  // Action: Export JSON
  btnExportJson.addEventListener('click', () => {
    fetchDataAndExport((data) => {
      Exporter.exportJSON(data);
    });
  });

  // Action: Copy
  btnCopy.addEventListener('click', () => {
    fetchDataAndExport(async (data) => {
      const ok = await Exporter.copyToClipboard(JSON.stringify(data, null, 2));
      if (ok) {
        const orig = btnCopy.innerText;
        btnCopy.innerText = '✓ Đã copy!';
        setTimeout(() => btnCopy.innerText = orig, 1800);
      }
    });
  });

  // Action: Toggle HUD Widget
  btnToggleHud.addEventListener('click', () => {
    if (isFacebookTab) {
      chrome.tabs.sendMessage(activeTabId, { action: 'TOGGLE_HUD' });
    }
  });

  function fetchDataAndExport(callback) {
    if (!isFacebookTab) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'GET_DATA' }, (res) => {
      if (res && res.data) {
        callback(res.data);
      } else {
        alert('Chưa có dữ liệu hoặc không thể lấy dữ liệu.');
      }
    });
  }
});
