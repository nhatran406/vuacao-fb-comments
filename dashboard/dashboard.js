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
      const val = parseInt(cfgConcurrency.value, 10) || 50;
      chrome.runtime.sendMessage({ action: 'SET_CONCURRENCY', limit: val });
    });
  }

  // Overview metrics
  const valTotalJobs = document.getElementById('val-total-jobs');
  const valRunningJobs = document.getElementById('val-running-jobs');
  const valCompletedJobs = document.getElementById('val-completed-jobs');
  const valTotalCommentsAll = document.getElementById('val-total-comments-all');
  const badgeJobsCount = document.getElementById('badge-jobs-count');

  // Top action buttons
  const searchInput = document.getElementById('search-jobs-input');
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

  // --- Search & Extract Logic ---
  const inputSearch = document.getElementById('input-search-keyword');
  const btnStartSearch = document.getElementById('btn-start-search');
  const searchStatus = document.getElementById('search-status-text');

  if (btnStartSearch) {
    btnStartSearch.addEventListener('click', () => {
      const keyword = inputSearch ? inputSearch.value.trim() : '';
      if (!keyword) {
        if (searchStatus) {
          searchStatus.textContent = 'Vui lòng nhập từ khóa!';
          searchStatus.style.color = '#dc2626';
        }
        return;
      }

      btnStartSearch.disabled = true;
      if (searchStatus) {
        searchStatus.textContent = '⏳ Đang mở tab ngầm, tự động cuộn trang và tìm kiếm... Vui lòng đợi khoảng 10 giây.';
        searchStatus.style.color = '#d97706';
      }

      chrome.runtime.sendMessage({ action: 'START_FB_SEARCH', keyword: keyword }, (res) => {
        if (chrome.runtime.lastError) {
          btnStartSearch.disabled = false;
          if (searchStatus) {
            searchStatus.textContent = 'Lỗi gửi yêu cầu: ' + chrome.runtime.lastError.message;
            searchStatus.style.color = '#dc2626';
          }
        }
      });
    });
  }

  // Lắng nghe kết quả từ background service worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'FB_SEARCH_FINISHED') {
      if (btnStartSearch) btnStartSearch.disabled = false;

      if (!msg.success) {
        if (searchStatus) {
          searchStatus.textContent = '❌ Lỗi: ' + (msg.error || 'Không thể lấy bài viết.');
          searchStatus.style.color = '#dc2626';
        }
        return;
      }

      const urls = msg.urls || [];
      if (urls.length === 0) {
        if (searchStatus) {
          searchStatus.textContent = '⚠️ Không tìm thấy bài viết nào phù hợp với từ khóa này.';
          searchStatus.style.color = '#dc2626';
        }
        return;
      }

      if (searchStatus) {
        searchStatus.textContent = '✅ Đã tìm thấy ' + urls.length + ' link post! Đang đưa vào danh sách và bắt đầu cào...';
        searchStatus.style.color = '#16a34a';
      }

      const ta = document.getElementById('input-batch-urls');
      if (ta) {
        const currentVal = ta.value.trim();
        const cleanUrls = urls.map(u => u.trim()).filter(u => u.length > 0);
        if (cleanUrls.length > 0) {
          ta.value = (currentVal ? currentVal + '\n' : '') + cleanUrls.join('\n') + '\n';
        }
      }

      const keyword = inputSearch ? inputSearch.value.trim() : '';
      window.__currentSearchGroupName = '🔍 ' + (keyword || 'Search') + ' (' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ')';

      setTimeout(() => {
        const btnSubmit = document.getElementById('btn-submit-jobs');
        if (btnSubmit) btnSubmit.click();
      }, 1000);
    }
  });



  // Table
const groupsContainer = document.getElementById('jobs-groups-container');
  const emptyStateRow = document.getElementById('empty-state-row');

  let jobsList = [];

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

    if (valTotalJobs) valTotalJobs.innerText = total;
    if (valRunningJobs) valRunningJobs.innerText = running;
    if (valCompletedJobs) valCompletedJobs.innerText = completed;
    if (valTotalCommentsAll) valTotalCommentsAll.innerText = commentsSum.toLocaleString();
    if (badgeJobsCount) badgeJobsCount.innerText = `${total} jobs`;
  }

  function fetchAndRenderJobs() {
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

  function fetchJobsQuietly() {
    chrome.runtime.sendMessage({ action: 'GET_ALL_JOBS' }, (res) => {
      if (res && res.jobs) {
        const seenIds = new Set();
        jobsList = res.jobs.filter(j => {
          if (!j || !j.id || seenIds.has(j.id)) return false;
          seenIds.add(j.id);
          return true;
        });
        updateMetrics();
        jobsList.forEach(j => updateRowElement(j));
      }
    });
  }

  // 1. Initial load
  fetchAndRenderJobs();

  // 2. Listen for live updates from background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'JOB_UPDATED' && message.job) {
      addOrUpdateJobInList(message.job);
    }
  });

  // Polling fallback every 2.5s for ultra consistency
  setInterval(() => {
    fetchJobsQuietly();
  }, 2500);


  // Render Table Rows grouped by Group ID
  function renderJobsTable() {
    if (!groupsContainer) return;
    groupsContainer.innerHTML = '';

    const filterQuery = (searchInput.value || '').trim().toLowerCase();
    const visibleJobs = jobsList.filter(j => {
      if (!filterQuery) return true;
      const author = (j.progress?.postAuthor || '').toLowerCase();
      const text = (j.progress?.postText || '').toLowerCase();
      const url = (j.url || '').toLowerCase();
      return author.includes(filterQuery) || text.includes(filterQuery) || url.includes(filterQuery);
    });

    if (visibleJobs.length === 0) {
      groupsContainer.appendChild(emptyStateRow);
      return;
    }

    // Group jobs by groupId (or created date if standalone)
    const groupsMap = new Map();
    visibleJobs.forEach(job => {
      const gId = job.groupId || 'group_standalone';
      if (!groupsMap.has(gId)) {
        groupsMap.set(gId, []);
      }
      groupsMap.get(gId).push(job);
    });

    // Render each group
    groupsMap.forEach((gJobs, gId) => {
      const groupCard = createGroupElement(gId, gJobs);
      groupsContainer.appendChild(groupCard);
    });
  }

  function createGroupElement(groupId, gJobs) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'job-group';
    groupDiv.id = `group-${groupId}`;

    const totalInGroup = gJobs.length;
    const completedInGroup = gJobs.filter(j => j.status === 'COMPLETED').length;
    const runningInGroup = gJobs.filter(j => j.status === 'RUNNING' || j.status === 'STARTING').length;
    let commentsInGroup = 0;
    gJobs.forEach(j => {
      commentsInGroup += (j.resultData?.stats?.totalComments || j.progress?.totalComments || 0);
    });

    const groupTitle = groupId === 'group_standalone' ? '📌 Các bài cào đơn lẻ' : `📦 Đợt cào: ${groupId}`;

    groupDiv.innerHTML = `
      <div class="job-group-header">
        <div>
          <h3 class="job-group-title">${groupTitle}</h3>
          <div class="job-group-meta">
            <span>Tổng: <strong>${totalInGroup} bài</strong></span> • 
            <span style="color: #16a34a;">Hoàn tất: <strong>${completedInGroup}</strong></span> • 
            <span style="color: #d97706;">Đang cào: <strong>${runningInGroup}</strong></span> • 
            <span style="color: #8b5cf6;">Bình luận: <strong>${commentsInGroup.toLocaleString()}</strong></span>
          </div>
        </div>
        <div class="job-group-actions">
          <button class="btn btn-sm btn-sentiment-group" title="Phân tích sắc thái (Sentiment) toàn bộ Group này" style="background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; font-weight: 600;">🧠 AI Phân Tích Group</button>
          <button class="btn btn-sm btn-outline-gray btn-export-group-csv" title="Xuất gộp CSV Group này">📊 Xuất CSV Group</button>
          <button class="btn btn-sm btn-outline-gray btn-delete-group" title="Xóa Group này" style="color: #dc2626;">🗑 Xóa Group</button>
        </div>
      </div>
      <div class="jobs-table-container">
        <table class="jobs-table">
          <thead>
            <tr>
              <th style="width: 130px;">Trạng Thái</th>
              <th>Bài Viết / Tác Giả</th>
              <th style="width: 140px;">Bình Luận</th>
              <th style="width: 200px;">Tiến Trình</th>
              <th style="width: 120px;">Thời Gian</th>
              <th style="width: 260px; text-align: right;">Thao Tác</th>
            </tr>
          </thead>
          <tbody class="group-jobs-tbody">
          </tbody>
        </table>
      </div>
    `;

    const tbody = groupDiv.querySelector('.group-jobs-tbody');
    gJobs.forEach(job => {
      const tr = createJobRow(job);
      tbody.appendChild(tr);
    });

    // Group actions
    const btnSentimentGroup = groupDiv.querySelector('.btn-sentiment-group');
    if (btnSentimentGroup) {
      btnSentimentGroup.onclick = () => {
        const completedWithData = gJobs.filter(j => j.resultData && j.resultData.comments && j.resultData.comments.length > 0);
        if (completedWithData.length === 0) {
          alert('Chưa có bài viết nào trong Group này có bình luận để phân tích.');
          return;
        }

        // Chạy phân tích cho từng job
        if (window.SentimentAnalyzer) {
          completedWithData.forEach(j => {
            window.SentimentAnalyzer.analyze(j.resultData);
          });
          chrome.storage.local.set({ fb_jobs: jobsList });
          // Cập nhật giao diện từng row
          completedWithData.forEach(j => updateRowElement(j));
        }

        // Gom tất cả bình luận trong group vào 1 dataset để mở modal tổng thể
        const mergedGroupData = {
          post: {
            author: "Group: " + groupId,
            text: "Tổng hợp phân tích " + completedWithData.length + " bài viết trong Group " + groupId
          },
          comments: []
        };

        completedWithData.forEach(j => {
          (j.resultData.comments || []).forEach(c => {
            const copyC = Object.assign({}, c);
            if (!copyC.parentAuthor && j.progress?.postAuthor) {
              copyC.parentAuthor = j.progress.postAuthor;
            }
            mergedGroupData.comments.push(copyC);
          });
        });

        openCommentsModal({ resultData: mergedGroupData, progress: { postAuthor: "Group: " + groupId + " (" + completedWithData.length + " bài)" } });
      };
    }

    const btnExportGroup = groupDiv.querySelector('.btn-export-group-csv');
    btnExportGroup.onclick = () => {
      const completed = gJobs.filter(j => j.resultData && j.resultData.comments?.length > 0);
      if (completed.length === 0) return alert('Chưa có bài nào trong Group này hoàn tất.');
      const merged = {
        post: { id: `group_${groupId}`, author: `Batch_${groupId}`, text: `Gộp từ Group ${groupId}`, time: new Date().toLocaleString(), url: '' },
        comments: []
      };
      completed.forEach(j => {
        (j.resultData.comments || []).forEach(c => {
          c.postAuthor = j.resultData.post?.author || j.progress?.postAuthor || '';
          c.postUrl = j.url;
          merged.comments.push(c);
        });
      });
      Exporter.exportCSV(merged, `fb_group_${groupId}_${Date.now()}.csv`);
    };

    const btnDeleteGroup = groupDiv.querySelector('.btn-delete-group');
    btnDeleteGroup.onclick = () => {
      if (confirm(`Bạn có chắc muốn xóa Group ${groupId} (${gJobs.length} bài)?`)) {
        gJobs.forEach(j => chrome.runtime.sendMessage({ action: 'DELETE_JOB', jobId: j.id }));
        jobsList = jobsList.filter(j => (j.groupId || 'group_standalone') !== groupId);
        renderJobsTable();
        updateMetrics();
      }
    };

    return groupDiv;
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

    
    function formatDuration(ms) {
      if (!ms || ms < 0) return '0s';
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      const remainSec = sec % 60;
      return `${min}p ${remainSec}s`;
    }

    const startTime = job.startedAt || (job.createdAt ? new Date(job.createdAt).getTime() : Date.now());
    let durationText = '';

    if (job.status === 'COMPLETED' || job.status === 'STOPPED') {
      const endTime = job.completedAt || Date.now();
      const diff = Math.max(0, endTime - startTime);
      durationText = `<div style="font-weight: 600; color: #059669;">⏱ Xong trong: ${formatDuration(diff)}</div>`;
    } else if (job.status === 'RUNNING' || job.status === 'STARTING') {
      const diff = Math.max(0, Date.now() - startTime);
      durationText = `<div style="font-weight: 600; color: #d97706;">⏳ Đang cào: ${formatDuration(diff)}</div>`;
    } else {
      durationText = `<div style="color: #64748b;">⏳ Đang chờ</div>`;
    }

    const createdTimeFormatted = job.createdAt ? new Date(job.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';


    const hasData = (job.resultData && job.resultData.comments?.length > 0) || totalCmt > 0;

    let sentimentHtml = '';
    if (job.resultData && job.resultData.sentimentStats) {
      const s = job.resultData.sentimentStats;
      sentimentHtml = `<div style="font-size: 11px; margin-top: 4px; display:flex; gap: 4px;">
        <span style="color: #16a34a;" title="Tích cực">😊 ${s.POSITIVE}</span>
        <span style="color: #dc2626;" title="Tiêu cực">😡 ${s.NEGATIVE}</span>
        <span style="color: #64748b;" title="Bình thường">😐 ${s.NORMAL}</span>
      </div>`;
    }

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
        <div style="display: flex; align-items: center; gap: 6px; margin: 3px 0;">
          <a href="${job.url}" target="_blank" class="job-url-link" style="color: #1877f2; font-weight: 500; text-decoration: none;" title="${job.url}">🔗 ${job.url}</a>
          <button class="btn-copy-url" data-url="${job.url}" title="Copy link bài viết" style="border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; padding: 1px 5px; font-size: 10px; cursor: pointer;">📋 Copy</button>
        </div>
        <div class="job-text-snippet" title="${prog.postText || ''}">${prog.postText || 'Chưa nạp nội dung...'}</div>
      </td>
      <td>
        <div class="comment-metric-pill ${isVirtuallyComplete ? 'pill-success' : ''}" title="${metricTooltip}">${displayCmtMetric}</div>
        <div class="comment-metric-sub" title="${metricTooltip}">${subMetricText}</div>
        ${sentimentHtml}
      </td>
      <td>
        <div class="progress-status-text" title="${prog.statusMessage || ''}" style="${isLoginError ? 'color: #dc2626; font-weight: 600;' : ''}">
          ${spinnerHtml}${prog.statusMessage || 'Đang xử lý...'}
        </div>
        ${isLoginError ? `<button class="btn btn-warning-sm btn-login-retry" data-id="${job.id}" style="margin-top: 6px; font-size: 11px; padding: 2px 8px; cursor: pointer;">🔑 Đăng nhập FB & Cào lại</button>` : ''}
      </td>
      <td>
        <div style="font-size: 11.5px; line-height: 1.4;">
          ${durationText}
          <div style="font-size: 10.5px; color: #94a3b8;">Bắt đầu: ${createdTimeFormatted}</div>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-action-icon btn-csv" data-id="${job.id}" ${hasData ? '' : 'disabled'} title="Tải file CSV">📊 CSV</button>
          <button class="btn-action-icon btn-json" data-id="${job.id}" ${hasData ? '' : 'disabled'} title="Tải file JSON">📄 JSON</button>
          <button class="btn-action-icon btn-sentiment" data-id="${job.id}" ${hasData ? '' : 'disabled'} title="Phân tích sắc thái (Tích cực / Tiêu cực / Lái / Bơm tin)" style="background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; font-weight: 600;">🧠 AI Phân Tích</button>
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

  
  function runSentiment(job) {
    if (!job || !job.resultData) return;
    if (window.SentimentAnalyzer) {
      window.SentimentAnalyzer.analyze(job.resultData);
      // Lưu lại kết quả phân tích vào storage
      chrome.storage.local.set({ fb_jobs: jobsList });
      updateRowElement(job);
      openCommentsModal(job);
    } else {
      console.warn("SentimentAnalyzer not loaded.");
    }
  }

  function bindRowActions(tr, job) {

    const sentimentBtn = tr.querySelector('.btn-sentiment');
    const cmtPill = tr.querySelector('.comment-metric-pill');
    if (cmtPill) {
      cmtPill.style.cursor = 'pointer';
      cmtPill.onclick = () => {
        if (job.resultData) {
          openCommentsModal(job);
        }
      };
    }

    if (sentimentBtn) {
      sentimentBtn.onclick = () => {
        if (!job.resultData || !job.resultData.comments || job.resultData.comments.length === 0) {
          queryTabDataAndExport(job, (data) => {
            job.resultData = data;
            runSentiment(job);
          });
        } else {
          runSentiment(job);
        }
      };
    }


    const copyUrlBtn = tr.querySelector('.btn-copy-url');
    if (copyUrlBtn) {
      copyUrlBtn.onclick = (e) => {
        e.stopPropagation();
        const urlToCopy = copyUrlBtn.getAttribute('data-url');
        navigator.clipboard.writeText(urlToCopy).then(() => {
          copyUrlBtn.textContent = '✓ Copied';
          setTimeout(() => { copyUrlBtn.textContent = '📋 Copy'; }, 1500);
        });
      };
    }

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
    if (!job.tabId) return // alert('Chưa có dữ liệu hoàn tất.');
    chrome.tabs.sendMessage(job.tabId, { action: 'GET_DATA' }, (res) => {
      if (res && res.data) {
        callback(res.data);
      } else {
        // alert('Chưa thể lấy dữ liệu từ tab.');
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

      // Chuyển đổi link ảnh trong Group về link bài viết Group chuẩn
      // Ví dụ: set=gm.3476188215889796 & idorvanity=3215789238596363 -> /groups/3215789238596363/posts/3476188215889796/
      const setParam = parsed.searchParams.get("set") || "";
      const vanity = parsed.searchParams.get("idorvanity") || "";
      if (setParam.startsWith("gm.") && vanity) {
        const postId = setParam.replace("gm.", "");
        return "https://www.facebook.com/groups/" + vanity + "/posts/" + postId + "/";
      }
      if (setParam.startsWith("pcb.") && vanity) {
        const postId = setParam.replace("pcb.", "");
        return "https://www.facebook.com/groups/" + vanity + "/posts/" + postId + "/";
      }

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
      // alert('Vui lòng dán ít nhất 1 link bài viết Facebook vào ô nhập liệu.');
      return;
    }

    const lines = extractFacebookUrls(rawText);

    if (lines.length === 0) {
      // alert('Không tìm thấy link Facebook hợp lệ (cần chứa "facebook.com" hoặc "fb.watch").');
      return;
    }

    const speedValue = parseInt(cfgSpeed.value, 10) || 300;
    const concurrencyValue = parseInt(cfgConcurrency ? cfgConcurrency.value : 50, 10) || 50;
    const windowModeValue = cfgWindowMode ? cfgWindowMode.value : 'tabs_rotate';
    const autoCloseValue = cfgAutoClose ? cfgAutoClose.checked : true;

    const config = {
      groupId: window.__currentSearchGroupName || ('Group_' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      groupName: window.__currentSearchGroupName || null,
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

    // inputUrls.value = ''; (Giữ lại danh sách links)
    const modeDesc = windowModeValue === 'smart_background' ? 'Tab ngầm thông minh (Không đảo)' : (windowModeValue === 'tabs_rotate' ? 'Đảo Tab (mỗi vài giây)' : (windowModeValue === 'single_worker' ? 'Cửa sổ riêng' : 'Tab ngầm thuần'));
    const concText = concurrencyValue >= 999 ? 'song song toàn bộ' : `${concurrencyValue} bài cùng lúc`;
    // alert(`Đã khởi tạo thành công ${lines.length} bài viết!\n• Chế độ: ${modeDesc}\n• Luồng: ${concText}\n• Đệm nạp Turbo: ${speedValue}ms`);
  });

  // Action: Export All Merged CSV
  btnExportAllCsv.addEventListener('click', () => {
    const completedJobs = jobsList.filter(j => j.resultData && j.resultData.comments?.length > 0);
    if (completedJobs.length === 0) {
      // alert('Chưa có job nào hoàn thành hoặc có dữ liệu để xuất.');
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
    if (toDelete.length === 0) return // alert('Không có job đã hoàn thành nào.');

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
  
  // --- Comments Modal & Sentiment Details Logic ---
  const modal = document.getElementById('comments-modal');
  const modalClose = document.getElementById('modal-close');
  const modalTitle = document.getElementById('modal-title');
  const modalCommentsList = document.getElementById('modal-comments-list');
  const filterBtns = document.querySelectorAll('.filter-btn');
  let currentModalData = [];
  let currentFilter = 'ALL';

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = '#ffffff';
      });
      e.currentTarget.classList.add('active');
      e.currentTarget.style.background = '#e2e8f0';
      currentFilter = e.currentTarget.getAttribute('data-filter');
      renderModalComments();
    });
  });

  function openCommentsModal(job) {
    if (!job || !job.resultData || !job.resultData.comments) return;
    
    modalTitle.textContent = `Chi tiết bình luận: ${job.progress?.postAuthor || job.resultData.post?.author || 'Bài viết'}`;
    
    // Flatten comments hierarchy
    currentModalData = [];
    job.resultData.comments.forEach(c => {
      currentModalData.push({ ...c, isReply: false });
      if (c.replies && Array.isArray(c.replies)) {
        c.replies.forEach(r => {
          currentModalData.push({ ...r, isReply: true });
        });
      }
    });
    
    // Calculate counts
    const counts = { ALL: currentModalData.length, POSITIVE: 0, NEGATIVE: 0, NORMAL: 0 };
    currentModalData.forEach(c => {
      const s = c.sentiment || 'NORMAL';
      if (counts[s] !== undefined) counts[s]++;
      else counts.NORMAL++;
    });
    
    document.getElementById('count-all').textContent = counts.ALL;
    document.getElementById('count-positive').textContent = counts.POSITIVE;
    document.getElementById('count-negative').textContent = counts.NEGATIVE;
    document.getElementById('count-normal').textContent = counts.NORMAL;
    
    // Reset filter
    currentFilter = 'ALL';
    filterBtns.forEach(b => {
      if (b.getAttribute('data-filter') === 'ALL') {
        b.classList.add('active');
        b.style.background = '#e2e8f0';
      } else {
        b.classList.remove('active');
        b.style.background = '#ffffff';
      }
    });
    
    renderModalComments();
    modal.style.display = 'flex';
  }

  function renderModalComments() {
    if (!modalCommentsList) return;
    modalCommentsList.innerHTML = '';
    
    const filtered = currentModalData.filter(c => {
      const s = c.sentiment || 'NORMAL';
      return currentFilter === 'ALL' || s === currentFilter;
    });
    
    if (filtered.length === 0) {
      modalCommentsList.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Không có bình luận nào khớp với bộ lọc này.</div>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    filtered.forEach(c => {
      const div = document.createElement('div');
      div.style.background = '#ffffff';
      div.style.padding = '12px 16px';
      div.style.borderRadius = '8px';
      div.style.border = '1px solid #e2e8f0';
      if (c.isReply) {
        div.style.marginLeft = '28px';
        div.style.borderLeft = '3px solid #cbd5e1';
      }
      
      const s = c.sentiment || 'NORMAL';
      let sentimentBadge = '<span style="color: #64748b; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">😐 Bình thường</span>';
      if (s === 'POSITIVE') {
        sentimentBadge = '<span style="color: #16a34a; font-size: 11px; background: #dcfce7; padding: 2px 6px; border-radius: 4px; font-weight: 600;">😊 Tích cực</span>';
      } else if (s === 'NEGATIVE') {
        sentimentBadge = '<span style="color: #dc2626; font-size: 11px; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-weight: 600;">😡 Tiêu cực</span>';
      }
      
      const replyTo = c.isReply && c.parentAuthor ? `<span style="font-size: 11px; color: #94a3b8;">↳ Trả lời: ${c.parentAuthor}</span>` : '';
      
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: #1e293b; font-size: 13px;">${c.author || 'Người dùng ẩn danh'}</span>
              ${replyTo}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              <span>${c.time || ''}</span>
              ${c.reactions ? ` • <span>❤️ ${c.reactions}</span>` : ''}
            </div>
          </div>
          <div>${sentimentBadge}</div>
        </div>
        <div style="font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${c.text || '[Không có nội dung văn bản]'}</div>
      `;
      fragment.appendChild(div);
    });
    
    modalCommentsList.appendChild(fragment);
  }


  searchInput.addEventListener('input', () => {
    renderJobsTable();
  });
});
