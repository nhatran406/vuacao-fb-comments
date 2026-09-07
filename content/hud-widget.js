/**
 * In-Page Floating HUD Widget
 * Renders an interactive draggable control panel directly on Facebook
 */

class FBHudWidget {
  constructor(engine) {
    this.engine = engine;
    this.isExpanded = true;
    this.root = null;
    this.init();
  }

  init() {
    if (document.getElementById('fb-scraper-hud-root')) return;

    this.root = document.createElement('div');
    this.root.id = 'fb-scraper-hud-root';
    document.body.appendChild(this.root);

    this.render();
    this.bindEvents();
    this.setupDrag();

    // Subscribe to engine events
    this.engine.onProgress(data => this.handleEngineProgress(data));
  }

  render() {
    this.root.innerHTML = `
      <!-- Collapsed Badge -->
      <div class="fb-hud-badge" id="fb-hud-badge" style="display: ${this.isExpanded ? 'none' : 'flex'};">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
        <span>FB Scraper</span>
        <span class="fb-hud-badge-count" id="fb-hud-badge-count">0</span>
      </div>

      <!-- Expanded Panel -->
      <div class="fb-hud-panel" id="fb-hud-panel" style="display: ${this.isExpanded ? 'flex' : 'none'};">
        <!-- Header (Draggable) -->
        <div class="fb-hud-header" id="fb-hud-header">
          <div class="fb-hud-title-box">
            <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
            <span class="fb-hud-title">FB Post & Comments Scraper</span>
          </div>
          <div class="fb-hud-controls">
            <button class="fb-hud-btn-icon" id="fb-hud-minimize-btn" title="Thu nhỏ">_</button>
            <button class="fb-hud-btn-icon" id="fb-hud-close-btn" title="Đóng">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div class="fb-hud-body">
          <!-- Post Information -->
          <div class="fb-hud-post-card">
            <div class="fb-hud-post-author">
              <span id="fb-hud-author">Đang quét bài viết...</span>
            </div>
            <div class="fb-hud-post-snippet" id="fb-hud-snippet">
              Nhấn "Bắt đầu cào" để quét nội dung bài viết và bình luận.
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="fb-hud-stats-grid">
            <div class="fb-hud-stat-box">
              <div class="fb-hud-stat-number" id="fb-hud-count-comments">0</div>
              <div class="fb-hud-stat-label">Tổng Bình Luận</div>
            </div>
            <div class="fb-hud-stat-box">
              <div class="fb-hud-stat-number" id="fb-hud-count-replies">0</div>
              <div class="fb-hud-stat-label">Phản Hồi (Sub)</div>
            </div>
          </div>

          <!-- Live Status Bar -->
          <div class="fb-hud-status-bar" id="fb-hud-status-bar">
            <div class="fb-hud-spinner" id="fb-hud-spinner" style="display:none;"></div>
            <span id="fb-hud-status-text">Sẵn sàng cào dữ liệu</span>
          </div>

          <!-- Action Buttons -->
          <div class="fb-hud-actions">
            <button class="fb-hud-btn fb-hud-btn-primary" id="fb-hud-start-btn">▶ Bắt Đầu Cào</button>
            <button class="fb-hud-btn fb-hud-btn-warning" id="fb-hud-pause-btn" style="display:none;">⏸ Tạm Dừng</button>
            <button class="fb-hud-btn fb-hud-btn-danger" id="fb-hud-stop-btn" style="display:none;">⏹ Dừng</button>
          </div>

          <!-- Settings -->
          <div class="fb-hud-settings-row">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="fb-hud-cfg-replies" checked> Mở rộng phản hồi (sub-comments)
            </label>
          </div>
          <div class="fb-hud-settings-row">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="fb-hud-cfg-filter" checked> Tự chuyển "Tất cả bình luận"
            </label>
          </div>

          <!-- Export Buttons -->
          <div class="fb-hud-export-group">
            <button class="fb-hud-btn fb-hud-btn-outline" id="fb-hud-export-csv" disabled>Xuất CSV</button>
            <button class="fb-hud-btn fb-hud-btn-outline" id="fb-hud-export-json" disabled>Xuất JSON</button>
            <button class="fb-hud-btn fb-hud-btn-outline" id="fb-hud-copy-btn" disabled>Copy</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const badge = this.root.querySelector('#fb-hud-badge');
    const minimizeBtn = this.root.querySelector('#fb-hud-minimize-btn');
    const closeBtn = this.root.querySelector('#fb-hud-close-btn');

    // Minimize / Expand
    badge.addEventListener('click', () => this.toggleExpand(true));
    minimizeBtn.addEventListener('click', () => this.toggleExpand(false));
    closeBtn.addEventListener('click', () => {
      this.root.remove();
    });

    // Action buttons
    const startBtn = this.root.querySelector('#fb-hud-start-btn');
    const pauseBtn = this.root.querySelector('#fb-hud-pause-btn');
    const stopBtn = this.root.querySelector('#fb-hud-stop-btn');

    startBtn.addEventListener('click', () => {
      if (this.engine.status === 'PAUSED') {
        this.engine.resume();
      } else {
        // Apply config
        this.engine.config.expandReplies = this.root.querySelector('#fb-hud-cfg-replies').checked;
        this.engine.config.autoSwitchFilter = this.root.querySelector('#fb-hud-cfg-filter').checked;
        this.engine.start();
      }
    });

    pauseBtn.addEventListener('click', () => {
      this.engine.pause();
    });

    stopBtn.addEventListener('click', () => {
      this.engine.stop();
    });

    // Export buttons
    const csvBtn = this.root.querySelector('#fb-hud-export-csv');
    const jsonBtn = this.root.querySelector('#fb-hud-export-json');
    const copyBtn = this.root.querySelector('#fb-hud-copy-btn');

    csvBtn.addEventListener('click', () => {
      const data = this.engine.getData();
      Exporter.exportCSV(data);
    });

    jsonBtn.addEventListener('click', () => {
      const data = this.engine.getData();
      Exporter.exportJSON(data);
    });

    copyBtn.addEventListener('click', async () => {
      const data = this.engine.getData();
      const success = await Exporter.copyToClipboard(JSON.stringify(data, null, 2));
      if (success) {
        copyBtn.innerText = '✓ Đã copy!';
        setTimeout(() => copyBtn.innerText = 'Copy', 2000);
      }
    });
  }

  toggleExpand(expand) {
    this.isExpanded = expand;
    this.root.querySelector('#fb-hud-badge').style.display = expand ? 'none' : 'flex';
    this.root.querySelector('#fb-hud-panel').style.display = expand ? 'flex' : 'none';
  }

  handleEngineProgress(data) {
    // Update count labels
    const totalCount = data.totalComments || 0;
    const topCount = data.totalTopLevel || 0;
    const repCount = data.totalReplies || 0;
    const exp = data.expectedComments || data.post?.expectedComments || 0;
    const expDisplay = exp > 0 ? ` / ${exp}` : '';
    this.root.querySelector('#fb-hud-count-comments').innerText = `${totalCount}${expDisplay} (${topCount} cha)`;
    this.root.querySelector('#fb-hud-count-replies').innerText = repCount;
    this.root.querySelector('#fb-hud-badge-count').innerText = `${totalCount}${expDisplay}`;

    // Update status message & spinner
    const statusText = this.root.querySelector('#fb-hud-status-text');
    const spinner = this.root.querySelector('#fb-hud-spinner');
    if (data.message) statusText.innerText = data.message;

    // Update post details
    if (data.post) {
      if (data.post.author) {
        this.root.querySelector('#fb-hud-author').innerText = `👤 ${data.post.author}`;
      }
      if (data.post.text) {
        this.root.querySelector('#fb-hud-snippet').innerText = data.post.text;
      }
    }

    // Update button states based on status
    const startBtn = this.root.querySelector('#fb-hud-start-btn');
    const pauseBtn = this.root.querySelector('#fb-hud-pause-btn');
    const stopBtn = this.root.querySelector('#fb-hud-stop-btn');
    const csvBtn = this.root.querySelector('#fb-hud-export-csv');
    const jsonBtn = this.root.querySelector('#fb-hud-export-json');
    const copyBtn = this.root.querySelector('#fb-hud-copy-btn');

    if (data.status === 'RUNNING') {
      spinner.style.display = 'block';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'flex';
      pauseBtn.innerText = '⏸ Tạm Dừng';
      stopBtn.style.display = 'flex';
    } else if (data.status === 'PAUSED') {
      spinner.style.display = 'none';
      startBtn.style.display = 'flex';
      startBtn.innerText = '▶ Tiếp Tục';
      pauseBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
    } else {
      // IDLE, STOPPED, FINISHED, ERROR
      spinner.style.display = 'none';
      startBtn.style.display = 'flex';
      startBtn.innerText = '▶ Bắt Đầu Cào';
      pauseBtn.style.display = 'none';
      stopBtn.style.display = 'none';
    }

    // Enable exports if comments exist
    const hasData = (data.totalComments > 0) || (data.post && data.post.text);
    csvBtn.disabled = !hasData;
    jsonBtn.disabled = !hasData;
    copyBtn.disabled = !hasData;
  }

  setupDrag() {
    const header = this.root.querySelector('#fb-hud-header');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.fb-hud-controls')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.root.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Unset bottom/right to allow absolute positioning via left/top
      this.root.style.bottom = 'auto';
      this.root.style.right = 'auto';
      this.root.style.left = `${initialLeft}px`;
      this.root.style.top = `${initialTop}px`;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        this.root.style.left = `${Math.max(10, Math.min(window.innerWidth - 370, initialLeft + deltaX))}px`;
        this.root.style.top = `${Math.max(10, Math.min(window.innerHeight - 300, initialTop + deltaY))}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }
}

// Global export
if (typeof window !== 'undefined') {
  window.FBHudWidget = FBHudWidget;
}
