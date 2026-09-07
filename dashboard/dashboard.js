/**
 * Dashboard Script: Handles multi-job creation, live progress monitoring,
 * and bulk export of all scraping jobs.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const inputUrls = document.getElementById('input-batch-urls');
  const cfgReplies = document.getElementById('cfg-job-replies');
  const cfgFilter = document.getElementById('cfg-job-filter');
  const cfgWindowMode = document.getElementById('cfg-job-window-mode');
  const cfgAutoClose = document.getElementById('cfg-job-autoclose');
  const cfgMax = document.getElementById('cfg-job-max');
  const cfgSpeed = document.getElementById('cfg-job-speed');
  const cfgConcurrency = document.getElementById('cfg-job-concurrency');
  const btnSubmit = document.getElementById('btn-submit-jobs');

  if (cfgConcurrency) {
    cfgConcurrency.addEventListener('change', () => {
      const val = parseInt(cfgConcurrency.value, 10) || 10;
      chrome.runtime.sendMessage({ action: 'SET_CONCURRENCY', limit: val });
    });
  }

  // Overview metrics
  const valTotalJobs = document.getElementById('val-total-jobs');
  const valRunningJobs = document.getElementById('val-running-jobs');
  const valCompletedJobs = document.getElementById('val-completed-jobs');
  const valTotalCommentsAll = document.getElementById('val-total-comments-all');
  const badgeJobsCount = document.getElementById('badge-jobs-count');

  // Table
  const tableBody = document.getElementById('jobs-table-body');
  const emptyStateRow = document.getElementById('empty-state-row');
  const searchInput = document.getElementById('search-jobs-input');

  // Top action buttons
  const btnFbLogin = document.getElementById('btn-fb-login');
  const btnExportAllCsv = document.getElementById('btn-export-all-csv');
  const btnRefreshAll = document.getElementById('btn-refresh-all');
  const btnStopAll = document.getElementById('btn-stop-all');
  const btnClearCompleted = document.getElementById('btn-clear-completed');

  if (btnFbLogin) {
    btnFbLogin.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.facebook.com', active: true });
    });
  }

  // Register dashboard tab & window with background worker for focus return
  try {
    chrome.tabs.getCurrent((tab) => {
      if (tab) {
        chrome.runtime.sendMessage({
          action: 'REGISTER_DASHBOARD',
          tabId: tab.id,
          windowId: tab.windowId
        });
      }
    });
  } catch (e) {}

  let jobsList = [];

  // 1. Initial load
  await fetchAndRenderJobs();

  // 2. Listen for live updates from background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'JOB_UPDATED' && message.job) {
      addOrUpdateJobInList(message.job);
    }
  });

  // Polling fallback every 2.5s for ultra consistency
  setInterval(() => {
    fetchJobsQuietly();
  }, 2500);

  // Fetch all jobs from background
  async function fetchAndRenderJobs() {
    chrome.runtime.sendMessage({ action: 'GET_ALL_JOBS' }, (res) => {
      if (res && res.jobs) {
        const seenIds = new Set();
        jobsList = res.jobs.filter(j => {
          if (!j || !j.id || seenIds.has(j.id)) return false;
          seenIds.add(j.id);
          return true;
        });
        renderJobsTable();
        updateMetrics();
      }
    });
  }

  async function fetchJobsQuietly() {
    chrome.runtime.sendMessage({ action: 'GET_ALL_JOBS' }, (res) => {
      if (res && res.jobs) {
        const seenIds = new Set();
        jobsList = res.jobs.filter(j => {
          if (!j || !j.id || seenIds.has(j.id)) return false;
          seenIds.add(j.id);
          return true;
        });
        updateMetrics();
        // Update live rows without re-rendering entire table
        jobsList.forEach(j => updateRowElement(j));
      }
    });
  }

  function addOrUpdateJobInList(job) {
    if (!job || !job.id) return;
    const idx = jobsList.findIndex(j => j.id === job.id);
    if (idx !== -1) {
      jobsList[idx] = job;
      const tr = document.getElementById(`row-${job.id}`);
      if (tr) {
        populateRowHTML(tr, job);
      } else {
        renderJobsTable();
      }
    } else {
      jobsList.unshift(job);
      renderJobsTable();
    }
    updateMetrics();
  }

  // Update summary metrics
  function updateMetrics() {
    const total = jobsList.length;
    let running = 0;
    let completed = 0;
    let commentsSum = 0;

    jobsList.forEach(j => {
      if (j.status === 'RUNNING' || j.status === 'STARTING') running++;
      if (j.status === 'COMPLETED') completed++;
      const cCount = j.resultData?.stats?.totalComments || j.progress?.totalComments || 0;
      commentsSum += cCount;
    });

    valTotalJobs.innerText = total;
    valRunningJobs.innerText = running;
    valCompletedJobs.innerText = completed;
    valTotalCommentsAll.innerText = commentsSum.toLocaleString();
    badgeJobsCount.innerText = `${total} jobs`;
  }

  // Render Table Rows
  function renderJobsTable() {
    tableBody.innerHTML = '';

    const filterQuery = (searchInput.value || '').trim().toLowerCase();
    const visibleJobs = jobsList.filter(j => {
      if (!filterQuery) return true;
      const author = (j.progress?.postAuthor || '').toLowerCase();
      const text = (j.progress?.postText || '').toLowerCase();
      const url = (j.url || '').toLowerCase();
      return author.includes(filterQuery) || text.includes(filterQuery) || url.includes(filterQuery);
    });

    if (visibleJobs.length === 0) {
      tableBody.appendChild(emptyStateRow);
      return;
    }

    visibleJobs.forEach(job => {
      const tr = createJobRow(job);
      tableBody.appendChild(tr);
    });
  }

  function createJobRow(job) {
    const tr = document.createElement('tr');
    tr.id = `row-${job.id}`;
    populateRowHTML(tr, job);
    return tr;
  }

  function updateRowElement(job) {
    const tr = document.getElementById(`row-${job.id}`);
    if (tr) {
      populateRowHTML(tr, job);
    }
  }

  function populateRowHTML(tr, job) {
    const prog = job.progress || {};
    const totalCmt = prog.totalComments || job.resultData?.stats?.totalComments || 0;
    const topCmt = prog.totalTopLevel || job.resultData?.stats?.totalTopLevelComments || 0;
    const repCmt = prog.totalReplies || job.resultData?.stats?.totalReplies || 0;
    const expCmt = prog.expectedComments || job.resultData?.stats?.expectedComments || 0;

    let statusBadge = '';
    let spinnerHtml = '';

    const pct = (expCmt > 0) ? Math.min(100, Math.round((totalCmt / expCmt) * 100)) : 100;
    const isTargetReached = (expCmt > 0 && totalCmt >= expCmt);
    const isVirtuallyComplete = isTargetReached || (job.status === 'COMPLETED' && pct >= 85);

    if (job.status === 'RUNNING' || job.status === 'STARTING') {
      statusBadge = '<span class="badge badge-running">⚡ Đang cào...</span>';
      spinnerHtml = '<div class="spinner-sm"></div>';
    } else if (job.status === 'WAITING') {
      statusBadge = '<span class="badge badge-waiting">⏳ Đang chờ</span>';
      spinnerHtml = '<div class="spinner-sm" style="border-top-color: #d97706;"></div>';
    } else if (job.status === 'COMPLETED') {
      statusBadge = isTargetReached ? '<span class="badge badge-completed">✓ Đủ 100%</span>' : `<span class="badge badge-completed">✓ Đạt ${pct}%</span>`;
    } else if (job.status === 'STOPPED') {
      statusBadge = '<span class="badge badge-stopped">⏹ Đã dừng</span>';
    } else {
      statusBadge = `<span class="badge badge-error">✕ ${job.status}</span>`;
    }

    const createdTime = job.createdAt ? new Date(job.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

    const hasData = (job.resultData && job.resultData.comments?.length > 0) || totalCmt > 0;

    let displayCmtMetric = `${totalCmt}`;
    let subMetricText = `${topCmt} cha, ${repCmt} con`;
    if (expCmt > 0) {
      displayCmtMetric = `${totalCmt} / ${expCmt}`;
      subMetricText = `${topCmt} cha, ${repCmt} con (${pct}%)`;
    }

    const metricTooltip = (expCmt > 0 && totalCmt < expCmt && job.status === 'COMPLETED')
      ? 'Đã thu thập đầy đủ mọi bình luận Facebook hiển thị. Phần chênh lệch là bình luận đã bị người dùng xóa hoặc Facebook tự động ẩn do bộ lọc spam.'
      : 'Tổng số bình luận thu thập';

    const isLoginError = (prog.statusMessage || '').toLowerCase().includes('đăng nhập') || (prog.statusMessage || '').toLowerCase().includes('login');

    tr.innerHTML = `
      <td>${statusBadge}</td>
      <td>
        <span class="job-author">👤 ${prog.postAuthor || 'Facebook Post'}</span>
        <a href="${job.url}" target="_blank" class="job-url-link" title="${job.url}">${job.url}</a>
        <div class="job-text-snippet" title="${prog.postText || ''}">${prog.postText || 'Chưa nạp nội dung...'}</div>
      </td>
      <td>
        <div class="comment-metric-pill ${isVirtuallyComplete ? 'pill-success' : ''}" title="${metricTooltip}">${displayCmtMetric}</div>
        <div class="comment-metric-sub" title="${metricTooltip}">${subMetricText}</div>
      </td>
      <td>
        <div class="progress-status-text" title="${prog.statusMessage || ''}" style="${isLoginError ? 'color: #dc2626; font-weight: 600;' : ''}">
          ${spinnerHtml}${prog.statusMessage || 'Đang xử lý...'}
        </div>
        ${isLoginError ? `<button class="btn btn-warning-sm btn-login-retry" data-id="${job.id}" style="margin-top: 6px; font-size: 11px; padding: 2px 8px; cursor: pointer;">🔑 Đăng nhập FB & Cào lại</button>` : ''}
      </td>
      <td>
        <span style="font-size: 11.5px; color: #65676b;">${createdTime}</span>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-action-icon btn-csv" data-id="${job.id}" ${hasData ? '' : 'disabled'} title="Tải file CSV">📊 CSV</button>
          <button class="btn-action-icon btn-json" data-id="${job.id}" ${hasData ? '' : 'disabled'} title="Tải file JSON">📄 JSON</button>
          <button class="btn-action-icon btn-view" data-id="${job.id}" title="Xem tab này">👁 Tab</button>
          ${(job.status === 'RUNNING' || job.status === 'STARTING' || job.status === 'WAITING') ?
            `<button class="btn-action-icon btn-stop" data-id="${job.id}" title="Dừng cào">⏹</button>` :
            `<button class="btn-action-icon btn-retry" data-id="${job.id}" title="Cào lại">🔄</button>`
          }
          <button class="btn-action-icon danger btn-delete" data-id="${job.id}" title="Xóa job">🗑</button>
        </div>
      </td>
    `;

    bindRowActions(tr, job);
  }

  function bindRowActions(tr, job) {
    const csvBtn = tr.querySelector('.btn-csv');
    const jsonBtn = tr.querySelector('.btn-json');
    const viewBtn = tr.querySelector('.btn-view');
    const stopBtn = tr.querySelector('.btn-stop');
    const retryBtn = tr.querySelector('.btn-retry');
    const deleteBtn = tr.querySelector('.btn-delete');

    if (csvBtn) {
      csvBtn.onclick = () => {
        if (job.resultData) {
          Exporter.exportCSV(job.resultData);
        } else {
          // If still running, query current tab data
          queryTabDataAndExport(job, (data) => Exporter.exportCSV(data));
        }
      };
    }

    if (jsonBtn) {
      jsonBtn.onclick = () => {
        if (job.resultData) {
          Exporter.exportJSON(job.resultData);
        } else {
          queryTabDataAndExport(job, (data) => Exporter.exportJSON(data));
        }
      };
    }

    if (viewBtn) {
      viewBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'OPEN_JOB_TAB', jobId: job.id });
      };
    }

    if (stopBtn) {
      stopBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'STOP_JOB', jobId: job.id });
      };
    }

    if (retryBtn) {
      retryBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'RETRY_JOB', jobId: job.id });
      };
    }

    if (deleteBtn) {
      deleteBtn.onclick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa job của bài viết "${job.progress?.postAuthor || job.url}"?`)) {
          chrome.runtime.sendMessage({ action: 'DELETE_JOB', jobId: job.id }, () => {
            jobsList = jobsList.filter(j => j.id !== job.id);
            renderJobsTable();
            updateMetrics();
          });
        }
      };
    }

    const loginRetryBtn = tr.querySelector('.btn-login-retry');
    if (loginRetryBtn) {
      loginRetryBtn.onclick = () => {
        chrome.tabs.create({ url: 'https://www.facebook.com', active: true });
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: 'RETRY_JOB', jobId: job.id });
        }, 1500);
      };
    }
  }

  function queryTabDataAndExport(job, callback) {
    if (!job.tabId) return alert('Chưa có dữ liệu hoàn tất.');
    chrome.tabs.sendMessage(job.tabId, { action: 'GET_DATA' }, (res) => {
      if (res && res.data) {
        callback(res.data);
      } else {
        alert('Chưa thể lấy dữ liệu từ tab.');
      }
    });
  }

  // URL normalizer: converts mobile web to desktop, strips restricting comment_id parameters
  function normalizeAndCleanFbUrl(urlStr) {
    try {
      let u = urlStr.trim().replace(/^[<"'(]+|[>"')]+$/g, '').replace(/[.,;!?)]+$/, '');
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      u = u.replace(/^(https?:\/\/)?(?:m|mobile|touch|mbasic)\.facebook\.com/i, 'https://www.facebook.com');

      const parsed = new URL(u);
      // Remove restricting parameters that prevent loading all comments (e.g. comment_id, reply_comment_id)
      const paramsToRemove = ['comment_id', 'reply_comment_id', 'notif_id', 'notif_t', 'ref', 'mibextid', 'rdid', '__cft__', '__tn__'];
      paramsToRemove.forEach(p => parsed.searchParams.delete(p));

      let cleaned = parsed.toString();
      if (cleaned.endsWith('?')) cleaned = cleaned.slice(0, -1);
      return cleaned;
    } catch (e) {
      return urlStr;
    }
  }

  // Smart URL parser: detects facebook.com, fb.watch, fb.com links across any delimiters
  function extractFacebookUrls(text) {
    if (!text) return [];

    // Split input text by newlines, carriage returns, commas, semicolons
    const rawTokens = text.split(/[\r\n,;]+/).map(t => t.trim()).filter(Boolean);
    const uniqueUrls = [];
    const seen = new Set();

    for (const token of rawTokens) {
      // Find any Facebook or fb.watch link inside token (even if surrounded by markdown, quotes, etc.)
      const match = token.match(/(https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*(?:facebook\.com|fb\.watch|fb\.com)\/[^\s<>"')]+/i);
      if (match) {
        const cleanUrl = normalizeAndCleanFbUrl(match[0]);
        if (!seen.has(cleanUrl)) {
          seen.add(cleanUrl);
          uniqueUrls.push(cleanUrl);
        }
      } else if (token.includes('facebook.com') || token.includes('fb.watch') || token.includes('fb.com')) {
        const cleanUrl = normalizeAndCleanFbUrl(token);
        if (!seen.has(cleanUrl)) {
          seen.add(cleanUrl);
          uniqueUrls.push(cleanUrl);
        }
      }
    }

    // Also handle URLs on a single line separated by whitespace
    if (uniqueUrls.length === 0) {
      const spaceTokens = text.split(/\s+/).map(t => t.trim()).filter(Boolean);
      for (const st of spaceTokens) {
        if (st.includes('facebook.com') || st.includes('fb.watch') || st.includes('fb.com')) {
          const cleanUrl = normalizeAndCleanFbUrl(st);
          if (!seen.has(cleanUrl)) {
            seen.add(cleanUrl);
            uniqueUrls.push(cleanUrl);
          }
        }
      }
    }

    return uniqueUrls;
  }

  // Action: Create Jobs & Start Crawl
  btnSubmit.addEventListener('click', () => {
    const rawText = inputUrls.value.trim();
    if (!rawText) {
      alert('Vui lòng dán ít nhất 1 link bài viết Facebook vào ô nhập liệu.');
      return;
    }

    const lines = extractFacebookUrls(rawText);

    if (lines.length === 0) {
      alert('Không tìm thấy link Facebook hợp lệ (cần chứa "facebook.com" hoặc "fb.watch").');
      return;
    }

    const speedValue = parseInt(cfgSpeed.value, 10) || 300;
    const concurrencyValue = parseInt(cfgConcurrency ? cfgConcurrency.value : 10, 10) || 10;
    const windowModeValue = cfgWindowMode ? cfgWindowMode.value : 'tabs_rotate';
    const autoCloseValue = cfgAutoClose ? cfgAutoClose.checked : true;

    const config = {
      expandReplies: cfgReplies.checked,
      autoSwitchFilter: cfgFilter.checked,
      windowMode: windowModeValue,
      useWorkerWindow: windowModeValue === 'single_worker' || windowModeValue === 'smart_background',
      autoCloseTab: autoCloseValue,
      maxComments: parseInt(cfgMax.value, 10) || 0,
      bufferMs: speedValue,
      delayMs: speedValue,
      concurrency: concurrencyValue
    };

    if (lines.length === 1) {
      chrome.runtime.sendMessage({ action: 'CREATE_JOB', url: lines[0], config, concurrency: concurrencyValue }, (res) => {
        if (res && res.job) {
          addOrUpdateJobInList(res.job);
        }
      });
    } else {
      chrome.runtime.sendMessage({ action: 'CREATE_BATCH_JOBS', urls: lines, config, concurrency: concurrencyValue }, (res) => {
        if (res && res.jobs) {
          res.jobs.forEach(j => addOrUpdateJobInList(j));
        }
      });
    }

    inputUrls.value = '';
    const modeDesc = windowModeValue === 'smart_background' ? 'Tab ngầm thông minh (Không đảo)' : (windowModeValue === 'tabs_rotate' ? 'Đảo Tab (mỗi vài giây)' : (windowModeValue === 'single_worker' ? 'Cửa sổ riêng' : 'Tab ngầm thuần'));
    const concText = concurrencyValue >= 999 ? 'song song toàn bộ' : `${concurrencyValue} bài cùng lúc`;
    alert(`Đã khởi tạo thành công ${lines.length} bài viết!\n• Chế độ: ${modeDesc}\n• Luồng: ${concText}\n• Đệm nạp Turbo: ${speedValue}ms`);
  });

  // Action: Export All Merged CSV
  btnExportAllCsv.addEventListener('click', () => {
    const completedJobs = jobsList.filter(j => j.resultData && j.resultData.comments?.length > 0);
    if (completedJobs.length === 0) {
      alert('Chưa có job nào hoàn thành hoặc có dữ liệu để xuất.');
      return;
    }

    // Merge all comments into one giant dataset
    const mergedDataset = {
      post: {
        id: 'merged_all_jobs',
        author: `All_Jobs_${completedJobs.length}_posts`,
        text: `Hợp nhất từ ${completedJobs.length} bài viết Facebook`,
        time: new Date().toLocaleString('vi-VN'),
        url: ''
      },
      comments: []
    };

    completedJobs.forEach((j) => {
      const cList = j.resultData.comments || [];
      // Tag each thread with the post's author or url
      cList.forEach(thread => {
        thread.postAuthor = j.resultData.post?.author || j.progress?.postAuthor || '';
        thread.postUrl = j.url;
        mergedDataset.comments.push(thread);
      });
    });

    Exporter.exportCSV(mergedDataset, `fb_merged_comments_${completedJobs.length}_posts_${Date.now()}.csv`);
  });

  // Action: Stop all jobs
  btnStopAll.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn dừng tất cả các job đang cào?')) {
      jobsList.forEach(j => {
        if (j.status === 'RUNNING' || j.status === 'STARTING' || j.status === 'WAITING') {
          chrome.runtime.sendMessage({ action: 'STOP_JOB', jobId: j.id });
        }
      });
    }
  });

  // Action: Clear Completed
  btnClearCompleted.addEventListener('click', () => {
    const toDelete = jobsList.filter(j => j.status === 'COMPLETED' || j.status === 'STOPPED');
    if (toDelete.length === 0) return alert('Không có job đã hoàn thành nào.');

    if (confirm(`Bạn có muốn xóa ${toDelete.length} jobs đã hoàn tất/đã dừng không?`)) {
      toDelete.forEach(j => {
        chrome.runtime.sendMessage({ action: 'DELETE_JOB', jobId: j.id });
      });
      jobsList = jobsList.filter(j => j.status === 'RUNNING' || j.status === 'STARTING');
      renderJobsTable();
      updateMetrics();
    }
  });

  // Action: Refresh
  btnRefreshAll.addEventListener('click', () => {
    fetchAndRenderJobs();
  });

  // Action: Search filtering
  searchInput.addEventListener('input', () => {
    renderJobsTable();
  });
});
