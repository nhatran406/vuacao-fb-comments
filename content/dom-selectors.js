/**
 * DOM Selectors and Heuristics for Facebook's dynamic structure
 * Exhaustive sub-comment (nested reply) expansion and hierarchical extraction.
 */

const FBDomSelectors = {
  patterns: {
    // Comment filter dropdown triggers
    filterDropdown: /phù hợp nhất|most relevant|tất cả bình luận|all comments|mới nhất|newest|bình luận hàng đầu|top comments/i,

    // Expand top/bottom comments (both older comments at top and more comments at bottom)
    viewMoreComments: /xem thêm.*bình luận|xem các bình luận trước|xem.*bình luận cũ hơn|xem.*bình luận trước đó|bình luận khác|view more comments|view previous comments|view.*more comments|view.*older comments|xem.*bình luận|bình luận trước|older comments|previous comments/i,

    // Comprehensive Reply Expander patterns (Vietnamese & English)
    replyExpanders: [
      /xem.*phản hồi/i,
      /\d+[\d.,]*\s*phản hồi/i,
      /phản hồi trước/i,
      /phản hồi khác/i,
      /xem.*trả lời/i,
      /\d+[\d.,]*\s*trả lời/i,
      /trả lời trước/i,
      /câu trả lời trước/i,
      /đã trả lời/i,
      /câu trả lời/i,
      /\d+[\d.,]*\s*câu trả lời/i,
      /tác giả đã trả lời/i,
      /view.*repl/i,
      /\d+[\d.,]*\s*repl/i,
      /previous\s*repl/i,
      /more\s*repl/i,
      /other\s*repl/i,
      /replied/i,
      /all.*replies/i
    ],

    // Truncated text expander
    seeMore: /^xem thêm$|^see more$/i,

    // Open collapsed comments button
    openComments: /\d+[\d.,]*\s*(bình luận|comments|lượt bình luận|phản hồi)/i,

    // Action button labels on comments
    actionReply: /^(phản hồi|trả lời|reply)$/i,
    actionLike: /^(thích|like)$/i,
    actionButtons: /^(thích|bày tỏ cảm xúc|phản hồi|trả lời|chia sẻ|chỉnh sửa|xóa|like|reply|share|edit|delete|gửi|dịch|xem bản dịch|see translation)$/i,

    // Time text indicators
    timeIndicators: /^\d+\s*(phút|giờ|ngày|tháng|năm|giây|h|m|d|w|y|min|hr|yesterday|ago|vừa xong|just now)/i
  },

  /**
   * Safe text extraction: works in both active and background/hidden tabs
   */
  getText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').trim();
  },

  /**
   * Full pointer/mouse click simulation for Facebook React Pressable components
   */
  triggerClick(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (e) {}
    try {
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      if (typeof el.focus === 'function') el.focus();
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.click();
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) {
      try { el.click(); } catch (err) {}
    }
  },

  /**
   * Check if a dialog is a login prompt, "See more on Facebook" banner, or cookie consent
   */
  isLoginOrNoticeDialog(element) {
    if (!element) return false;
    const text = (element.textContent || '').toLowerCase();
    const hasLoginForm = !!element.querySelector('form#login_form, form[action*="/login"], input[name="email"], input[name="pass"], button[name="login"]');
    const hasLoginText = text.includes('xem thêm trên facebook') ||
                         text.includes('xem bài viết này trên facebook') ||
                         text.includes('đăng nhập để tiếp tục') ||
                         text.includes('đăng nhập hoặc đăng ký') ||
                         text.includes('see more on facebook') ||
                         text.includes('log in to facebook') ||
                         text.includes('log into facebook');
    const hasPostArticle = !!element.querySelector('div[role="article"], div[data-ad-preview="message"]');
    return (hasLoginForm || hasLoginText) && !hasPostArticle;
  },

  /**
   * Automatically detect and click the Close button on soft login walls or overlay notices
   */
  dismissLoginOverlayIfAny() {
    try {
      const closeButtons = Array.from(document.querySelectorAll(
        'div[aria-label="Đóng" i], div[aria-label="Close" i], div[role="button"][aria-label*="Đóng" i], div[role="button"][aria-label*="Close" i], div[data-dialog-dismiss], [aria-label="Đóng bảng thông báo" i]'
      ));
      for (const btn of closeButtons) {
        if (btn.closest('#fb-scraper-hud-root')) continue;
        const dialog = btn.closest('div[role="dialog"], div[role="banner"]');
        if (dialog && this.isLoginOrNoticeDialog(dialog)) {
          console.log('[FBDomSelectors] Auto-dismissing login / notice overlay dialog...');
          this.triggerClick(btn);
          return true;
        }
      }
    } catch (e) {}
    return false;
  },

  /**
   * Check if page requires user login (e.g. redirected to /login or showing hard login form)
   */
  checkHardLoginBarrier() {
    const href = window.location.href;
    const path = window.location.pathname;
    if (path.includes('/login') || path.includes('/checkpoint') || path.includes('/recover') || href.includes('/login.php')) {
      return { required: true, reason: 'Facebook chuyển hướng sang trang đăng nhập' };
    }
    const loginForm = document.querySelector('form#login_form, form[action*="/login"], input[name="email"], input[name="pass"]');
    const hasArticle = document.querySelector('div[role="article"], div[data-ad-preview], div[data-pagelet*="Post"]');
    if (loginForm && !hasArticle) {
      return { required: true, reason: 'Yêu cầu đăng nhập tài khoản để xem bài viết' };
    }
    return { required: false };
  },

  /**
   * Find the main post container on current page
   */
  getPostContainer() {
    this.dismissLoginOverlayIfAny();

    // Special check for photo view (theater mode)
    if (window.location.pathname.includes('/photo')) {
      const sidebar = document.querySelector('div[role="complementary"], form, div[data-pagelet*="PhotoViewerSidePane"], div[data-pagelet*="Comments"]');
      if (sidebar) return sidebar;
    }

    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (const modal of dialogs) {
      if (modal.id === 'fb-scraper-hud-root') continue;
      if (this.isLoginOrNoticeDialog(modal)) continue;
      if (modal.querySelector('div[role="article"], div[data-ad-preview], div[data-pagelet*="Post"], div[data-pagelet*="Feed"], div[dir="auto"]')) {
        return modal;
      }
    }
    return document.querySelector('div[role="main"]') || document.body;
  },

  /**
   * Find the scope where comments reside (dialog or main body)
   */
  getCommentsScope() {
    this.dismissLoginOverlayIfAny();

    // Special check for photo view (theater mode)
    if (window.location.pathname.includes('/photo')) {
      const sidebar = document.querySelector('div[role="complementary"], form, div[data-pagelet*="PhotoViewerSidePane"], div[data-pagelet*="Comments"]');
      if (sidebar) return sidebar;
    }

    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (const d of dialogs) {
      if (d.id === 'fb-scraper-hud-root') continue;
      if (this.isLoginOrNoticeDialog(d)) continue;
      const rect = d.getBoundingClientRect();
      if ((rect.width > 300 && rect.height > 200) || d.offsetWidth > 300) {
        if (d.querySelector('div[role="article"], div[data-ad-preview], [aria-label*="bình luận" i], [aria-label*="comment" i]')) {
          return d;
        }
      }
    }
    return document.querySelector('div[role="main"]') || document.body;
  },

  /**
   * Find the scrollable container for comments
   */
  getScrollableContainer() {

    if (window.location.pathname.includes('/photo')) {
      const pane = document.querySelector('div[role="complementary"], div[data-pagelet*="PhotoViewerSidePane"]');
      if (pane) {
        const divs = Array.from(pane.querySelectorAll('div'));
        for (const d of divs) {
          if (d.scrollHeight > d.clientHeight + 40) {
            return d;
          }
        }
        return pane;
      }
    }

    const scope = this.getCommentsScope();
    if (scope && scope !== document.body) {
      const allDivs = Array.from(scope.querySelectorAll('div'));
      // Prioritize divs that actually have scrollable content (scrollHeight > clientHeight)
      for (const d of allDivs) {
        if (d.scrollHeight > d.clientHeight + 40) {
          const style = window.getComputedStyle(d);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return d;
          }
        }
      }
      if (scope.scrollHeight > scope.clientHeight + 40) {
        return scope;
      }
      for (const d of allDivs) {
        const style = window.getComputedStyle(d);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return d;
        }
      }
      return scope;
    }
    return document.scrollingElement || document.documentElement || document.body || window;
  },

  /**
   * Check if Facebook comments section is currently loading (spinner or progressbar active)
   */
  isCommentsLoading(scope) {
    const s = scope || this.getCommentsScope();
    try {
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      // Progress bars
      const busy = s.querySelectorAll('[role="progressbar"], [aria-busy="true"], [data-visualcompletion="loading-state"]');
      for (const el of busy) {
        if (el.closest('#fb-scraper-hud-root')) continue;
        if (isVisible(el)) return true;
      }
      
      // Explicit loading SVGs
      const svgs = s.querySelectorAll('svg[aria-label*="loading" i], svg[aria-label*="đang tải" i]');
      for (const svg of svgs) {
        if (svg.closest('#fb-scraper-hud-root')) continue;
        if (isVisible(svg)) return true;
      }
      
      // Remove the overly aggressive "circle" check that causes false positives
    } catch (e) {}
    return false;
  },

  /**
   * Check if container is scrolled to the bottom
   */
  isScrollAtBottom(container) {
    try {
      const c = container || this.getScrollableContainer();
      if (c && c !== window && c.scrollTop !== undefined && c.scrollHeight > c.clientHeight) {
        return (c.scrollTop + c.clientHeight) >= (c.scrollHeight - 45);
      }
      const docH = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
      const winBottom = (window.innerHeight || document.documentElement.clientHeight || 0) + (window.scrollY || window.pageYOffset || 0);
      return winBottom >= (docH - 70);
    } catch (e) {
      return false;
    }
  },

  /**
   * Find the last comment element in the DOM to trigger natural intersection scrolling
   */
  getLastCommentElement(scope) {
    const s = scope || this.getCommentsScope();
    const articles = s.querySelectorAll('div[role="article"], li');
    for (let i = articles.length - 1; i >= 0; i--) {
      const el = articles[i];
      if (el.id === 'fb-scraper-hud-root' || el === s) continue;
      if (el.querySelector('div[dir="auto"], span[dir="auto"], img[src*="fbcdn"]')) {
        return el;
      }
    }
    return null;
  },

  /**
   * Fast lightweight count of comment-like elements currently in DOM
   */
  countVisibleCommentElements(scope) {
    const s = scope || this.getCommentsScope();
    try {
      const replyAnchors = s.querySelectorAll('div[role="button"], span[role="button"]');
      let replyCount = 0;
      for (const btn of replyAnchors) {
        const t = this.getText(btn);
        if (this.patterns.actionReply.test(t)) replyCount++;
      }
      if (replyCount > 0) return replyCount;

      const articles = s.querySelectorAll('div[role="article"], li');
      let artCount = 0;
      for (const a of articles) {
        if (a.id === 'fb-scraper-hud-root' || a === s) continue;
        if (a.querySelector('div[dir="auto"], span[dir="auto"]')) artCount++;
      }
      return artCount;
    } catch (e) {
      return 0;
    }
  },

  /**
   * If comments section is collapsed (e.g. in Reels, Videos, or compact feeds), click to expand it
   */
  openCollapsedCommentsIfAny() {
    const candidateButtons = Array.from(document.querySelectorAll(
      'div[role="button"], span[role="button"], a[role="link"], a[role="button"], div[aria-label*="bình luận" i], div[aria-label*="comment" i]'
    ));

    for (const btn of candidateButtons) {
      if (btn.closest('#fb-scraper-hud-root')) continue;
      const text = this.getText(btn);
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();

      // Text match: e.g. "34 bình luận", "Viết bình luận", "125 comments"
      if (this.patterns.openComments.test(text) && text.length < 35) {
        console.log('[FBDomSelectors] Found collapsed comments button by text:', text);
        try {
          this.triggerClick(btn);
          return true;
        } catch (e) {}
      }

      // Reels / Watch / Video action bar button match (comment icon on the right sidebar)
      if (aria && (aria.includes('bình luận') || aria.includes('comment')) && !aria.includes('bày tỏ') && !aria.includes('chia sẻ')) {
        // If comments are not currently visible in the DOM
        if (this.countVisibleCommentElements() === 0) {
          console.log('[FBDomSelectors] Found Reel/Video collapsed comments button by aria:', aria);
          try {
            this.triggerClick(btn);
            return true;
          } catch (e) {}
        }
      }
    }
    return false;
  },

  /**
   * Extract expected comment count displayed on the post itself
   * E.g. "34 bình luận", "125 comments", "1,2K bình luận"
   */
  extractExpectedCommentsCount(postContainer) {
    const container = postContainer || this.getPostContainer();
    const commentRegex = /([\d.,]+)\s*([kKmMtrTr])?\s*(?:bình luận|lượt bình luận|câu trả lời|comments?)/i;

    try {
      // 1. Look for targeted spans or links in the post metrics/footer bar
      const candidates = Array.from(container.querySelectorAll('span[dir="auto"], span, a[role="link"], div[role="button"]'));
      for (const el of candidates) {
        const text = this.getText(el);
        if (!text || text.length > 40) continue;
        // Avoid match with filter dropdown button itself if it just says "Tất cả bình luận"
        if (/^(tất cả bình luận|phù hợp nhất|mới nhất|all comments|most relevant|newest)$/i.test(text)) continue;

        const match = text.match(commentRegex);
        if (match) {
          let numStr = match[1].replace(/\./g, '').replace(/,/g, '.');
          let num = parseFloat(numStr);
          const unit = (match[2] || '').toLowerCase();
          if (unit === 'k') num *= 1000;
          else if (unit === 'm' || unit === 'tr') num *= 1000000;
          if (!isNaN(num) && num > 0) {
            return Math.round(num);
          }
        }
      }

      // 2. Global text fallback
      const fullText = this.getText(container);
      const lines = fullText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 50) {
          const match = trimmed.match(commentRegex);
          if (match) {
            let numStr = match[1].replace(/\./g, '').replace(/,/g, '.');
            let num = parseFloat(numStr);
            const unit = (match[2] || '').toLowerCase();
            if (unit === 'k') num *= 1000;
            else if (unit === 'm' || unit === 'tr') num *= 1000000;
            if (!isNaN(num) && num > 0) return Math.round(num);
          }
        }
      }
    } catch (e) {}

    return 0;
  },

  /**
   * Extract post metadata (Author, Time, Text, Media, Reactions, Expected Comments)
   */
  extractPostDetails(postContainer) {
    const container = postContainer || this.getPostContainer();
    const result = {
      id: 'post_' + (window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_') || Date.now()),
      url: window.location.href,
      author: '',
      authorUrl: '',
      avatar: '',
      time: '',
      text: '',
      mediaUrls: [],
      reactions: '0',
      expectedComments: this.extractExpectedCommentsCount(container)
    };

    try {
      const authorLinks = Array.from(container.querySelectorAll('h2 a, h3 a, strong a, a[role="link"]'));
      for (const link of authorLinks) {
        const text = this.getText(link);
        const rawHref = link.getAttribute('href') || '';
        const fullHref = link.href || '';
        if (text && !text.match(/theo dõi|follow|tham gia|join|được tài trợ|sponsored|thích|bình luận|chia sẻ/i) &&
            rawHref && !rawHref.startsWith('#') &&
            (rawHref.includes('facebook.com') || fullHref.includes('facebook.com') || rawHref.startsWith('/'))) {
          result.author = text.split('\n')[0].trim();
          result.authorUrl = link.href;
          break;
        }
      }

      const avatarImg = container.querySelector('image, img[src*="fbcdn"], img[src*="scontent"]');
      if (avatarImg) {
        result.avatar = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('src') || '';
      }

      const timeElements = container.querySelectorAll('a[role="link"] span, abbr, a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]');
      for (const el of timeElements) {
        const text = this.getText(el);
        const aria = el.getAttribute('aria-label') || '';
        if (this.patterns.timeIndicators.test(text) || this.patterns.timeIndicators.test(aria)) {
          result.time = aria || text;
          break;
        }
      }

      const seeMoreInPost = Array.from(container.querySelectorAll('div[role="button"], span[role="button"]'))
        .find(b => this.patterns.seeMore.test(this.getText(b)));
      if (seeMoreInPost) {
        try { this.triggerClick(seeMoreInPost); } catch (e) {}
      }

      const messageElem = container.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
      if (messageElem) {
        result.text = this.getText(messageElem);
      } else {
        const textCandidates = container.querySelectorAll('div[dir="auto"]');
        for (const candidate of textCandidates) {
          const text = this.getText(candidate);
          if (text.length > 20 && !text.includes(result.author) && !this.patterns.actionButtons.test(text)) {
            result.text = text;
            break;
          }
        }
      }

      const mediaImgs = container.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]');
      const seenUrls = new Set();
      mediaImgs.forEach(img => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if ((w > 120 || h > 120 || (!w && !h)) && !img.src.includes('rsrc.php')) {
          if (!seenUrls.has(img.src)) {
            seenUrls.add(img.src);
            result.mediaUrls.push(img.src);
          }
        }
      });

      const reactionBar = container.querySelector('[aria-label*="bày tỏ cảm xúc" i], [aria-label*="reactions" i], span[role="toolbar"]');
      if (reactionBar) {
        const countSpan = reactionBar.querySelector('span[dir="auto"]');
        if (countSpan) result.reactions = this.getText(countSpan);
      }
      if (!result.reactions || result.reactions === '0') {
        const reactionMatch = this.getText(container).match(/(\d+[\d.,]*)\s*(thích|like|người khác|others)/i);
        if (reactionMatch) result.reactions = reactionMatch[1];
      }
    } catch (e) {
      console.warn('[FBDomSelectors] Extract post details error:', e);
    }

    return result;
  },

  /**
   * Switch comment sort dropdown to "Tất cả bình luận" / "All comments"
   */
  /**
   * Switch comment sort dropdown to "Tất cả bình luận" / "All comments"
   */
  async switchToAllComments() {
    console.log('[FBDomSelectors] Checking comment filter dropdown...');

    const allClickable = Array.from(document.querySelectorAll(
      'div[role="button"], span[role="button"], a[role="button"], div[aria-haspopup], div[role="combobox"], div[tabindex="0"]'
    ));
    const candidateButtons = allClickable.filter(el => {
      if (el.closest('#fb-scraper-hud-root')) return false;
      const text = this.getText(el);
      const aria = (el.getAttribute('aria-label') || '').trim();
      return (this.patterns.filterDropdown.test(text) && text.length < 50) ||
             (aria && this.patterns.filterDropdown.test(aria) && aria.length < 50);
    });

    if (candidateButtons.length === 0) {
      console.log('[FBDomSelectors] No filter dropdown button found on page.');
      return false;
    }

    // Prioritize button that explicitly displays current sort state
    let filterBtn = candidateButtons.find(b => {
      const t = this.getText(b).toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('tất cả bình luận') || t.includes('all comments') ||
             t.includes('phù hợp nhất') || t.includes('most relevant') ||
             t.includes('bình luận hàng đầu') || t.includes('top comments') ||
             a.includes('tất cả bình luận') || a.includes('all comments') ||
             a.includes('phù hợp nhất') || a.includes('most relevant');
    }) || candidateButtons[0];

    const currentText = (this.getText(filterBtn) || filterBtn.getAttribute('aria-label') || '').toLowerCase();

    if (currentText.includes('tất cả bình luận') || currentText.includes('all comments')) {
      console.log('[FBDomSelectors] Already set to All comments! ("' + currentText + '")');
      return true;
    }

    console.log('[FBDomSelectors] Clicking filter dropdown button:', currentText);
    try {
      this.triggerClick(filterBtn);
    } catch (e) {
      console.warn('[FBDomSelectors] Error clicking filter button:', e);
      return false;
    }

    let allCommentsItem = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 3500) {
      await new Promise(r => setTimeout(r, 120));

      const menuItems = Array.from(document.querySelectorAll(
        'div[role="menu"] [role^="menuitem"], div[role="menu"] [role="option"], div[role="listbox"] [role="option"], div[role="menu"] div[tabindex="0"], div[data-pagelet*="Menu"] [role^="menuitem"], div[role="dialog"] [role^="menuitem"], div[role="dialog"] [role="option"]'
      ));

      for (const item of menuItems) {
        const fullText = this.getText(item).toLowerCase();
        const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
        const firstLine = fullText.split('\n')[0].trim();

        if (firstLine.includes('mới nhất') || firstLine.includes('newest')) continue;
        if (firstLine.includes('phù hợp nhất') || firstLine.includes('most relevant')) continue;

        if (firstLine.includes('tất cả bình luận') || firstLine.includes('all comments') ||
            ariaLabel.includes('tất cả bình luận') || ariaLabel.includes('all comments')) {
          allCommentsItem = item;
          break;
        }
      }

      if (!allCommentsItem) {
        const spans = Array.from(document.querySelectorAll(
          'div[role="menu"] span[dir="auto"], div[data-pagelet*="Menu"] span[dir="auto"], div[role="menu"] span, div[role="dialog"] span[dir="auto"]'
        ));
        for (const sp of spans) {
          const spText = this.getText(sp).toLowerCase();
          if (spText.includes('tất cả bình luận') || spText.includes('all comments')) {
            allCommentsItem = sp.closest('[role^="menuitem"], [role="option"]') || sp;
            break;
          }
        }
      }

      if (allCommentsItem) break;
    }

    if (allCommentsItem) {
      console.log('[FBDomSelectors] Successfully selected "Tất cả bình luận" item. Clicking...');
      this.triggerClick(allCommentsItem);
      await new Promise(r => setTimeout(r, 1200));
      return true;
    } else {
      console.warn('[FBDomSelectors] Could not find "Tất cả bình luận" in menu.');
      try { document.body.click(); } catch (e) {}
      return false;
    }
  },

  /**
   * Find all "Xem thêm bình luận" / "Xem các bình luận trước" buttons
   */
  findViewMoreCommentsButtons() {
    const scope = this.getCommentsScope();
    const candidates = Array.from(scope.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], span[dir="auto"], span, div, a'));
    const matchedButtons = new Set();
    const now = Date.now();

    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    for (const el of candidates) {
      if (el.closest('#fb-scraper-hud-root')) continue;
      if (!isVisible(el)) continue; // Xử lý ghost buttons ẩn
      const text = (el.innerText || el.textContent || '').trim();
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (!text && !aria) continue;
      if (text.length > 70) continue;
      if (this.patterns.viewMoreComments.test(text) || (aria && this.patterns.viewMoreComments.test(aria))) {
        const btn = el.closest('div[role="button"], span[role="button"], a[role="button"]') || el;
        if (btn.__fb_clicked && (now - btn.__fb_clicked < 2500)) continue;
        matchedButtons.add(btn);
      }
    }

    return Array.from(matchedButtons);
  },

  /**
   * Find all Reply Expander buttons ("Xem X phản hồi", "X phản hồi khác", "Xem các phản hồi trước", etc.)
   */
  findViewRepliesButtons() {
    const scope = this.getCommentsScope();
    const elements = Array.from(scope.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], span[dir="auto"], div[dir="auto"], span'));
    const matchedButtons = new Set();
    const now = Date.now();

    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    for (const el of elements) {
      if (el.closest('#fb-scraper-hud-root')) continue;
      if (!isVisible(el)) continue; // Xử lý ghost buttons ẩn
      const text = (el.innerText || el.textContent || '').trim();
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (!text && !aria) continue;
      if (text.length > 70) continue;
      
      const matchText = this.patterns.replyExpanders.some(p => p.test(text));
      const matchAria = aria && this.patterns.replyExpanders.some(p => p.test(aria));
      
      if (matchText || matchAria) {
        const btn = el.closest('div[role="button"], span[role="button"], a[role="button"]') || el;
        if (btn.__fb_clicked && (now - btn.__fb_clicked < 2500)) continue;
        matchedButtons.add(btn);
      }
    }

    return Array.from(matchedButtons);
  },

  /**
   * Find all "Xem thêm" / "See more" text snippets in comments
   */
  findSeeMoreButtons() {
    const scope = this.getCommentsScope();
    const elements = Array.from(scope.querySelectorAll('div[role="button"], span[role="button"], span[dir="auto"]'));
    return elements.filter(el => {
      const text = this.getText(el);
      return this.patterns.seeMore.test(text);
    });
  },

  /**
   * Find leaf elements with text "Phản hồi", "Trả lời", or "Reply"
   */
  findAllCommentReplyAnchors(scope) {
    const candidates = Array.from(scope.querySelectorAll('div[role="button"], span[role="button"], span, div, a'));
    const matched = [];

    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!this.patterns.actionReply.test(text)) continue;
      // Must be a leaf node (no element children) to avoid duplicate parent matching
      if (el.children && el.children.length > 0) continue;
      if (this.patterns.replyExpanders.some(p => p.test(text))) continue;
      matched.push(el);
    }
    return matched;
  },

  /**
   * Walk up DOM from reply anchor to locate enclosing comment box
   */
  /**
   * Walk up DOM from reply anchor to locate enclosing comment box
   * Must strictly return the innermost comment card (div[role="article"] or direct container),
   * NEVER an outer <li> or <ul> that encloses multiple comments / nested replies.
   */
  findCommentBoxFromAnchor(replyBtn, scope) {
    if (!replyBtn) return null;

    // 1. Try closest div[role="article"]
    const art = replyBtn.closest('div[role="article"]');
    if (art && art !== scope && art.id !== 'fb-scraper-hud-root') {
      return art;
    }

    // 2. Walk up parent elements, but strictly STOP before enclosing nested lists or multiple comments
    let curr = replyBtn.parentElement;
    let bestCandidate = null;

    for (let i = 0; i < 7 && curr && curr !== scope && curr !== document.body; i++) {
      if (curr.querySelectorAll('div[role="article"]').length > 1) break;
      if (curr.tagName.toLowerCase() === 'ul' || curr.tagName.toLowerCase() === 'ol') break;

      const hasAuthor = Boolean(this.getCommentAuthor(curr).name);
      const textEl = curr.querySelector('div[dir="auto"], span[dir="auto"], img[src*="fbcdn"], img[src*="scontent"]');

      if (hasAuthor || textEl) {
        bestCandidate = curr;
        if (curr.getAttribute('role') === 'article') {
          return curr;
        }
      }
      curr = curr.parentElement;
    }

    return bestCandidate || replyBtn.closest('div[role="article"]') || replyBtn.parentElement?.parentElement;
  },

  /**
   * Extract author name and profile URL from comment container
   */
  getCommentAuthor(commentEl) {
    // 1. Try links
    const links = Array.from(commentEl.querySelectorAll('a[role="link"], a[href]'));
    for (const link of links) {
      const text = (link.innerText || link.textContent || '').trim();
      const href = link.getAttribute('href') || '';

      if (text && text.length > 1 && text.length < 50) {
        if (!this.patterns.actionButtons.test(text) &&
            !this.patterns.timeIndicators.test(text) &&
            !href.startsWith('#') &&
            !href.includes('/hashtag/')) {
          return {
            name: text.split('\n')[0].trim(),
            url: link.href || ''
          };
        }
      }
    }

    // 2. Try aria-label on comment card: e.g. "Bình luận của [Tên]..." or "Comment by [Name]..."
    const aria = commentEl.getAttribute('aria-label') || '';
    const ariaMatch = aria.match(/(?:bình luận của|comment by|phản hồi của|reply by)\s+([^,.:\n]+)/i);
    if (ariaMatch && ariaMatch[1]) {
      return {
        name: ariaMatch[1].trim(),
        url: ''
      };
    }

    // 3. Try prominent text/headings (e.g. deactivated account "Người dùng Facebook" or span without a link)
    const strongOrHeadings = Array.from(commentEl.querySelectorAll('strong, h3, h4, span[dir="auto"], span'));
    for (const el of strongOrHeadings) {
      const t = (el.innerText || el.textContent || '').trim();
      if (t === 'Người dùng Facebook' || t.toLowerCase() === 'facebook user') {
        return { name: t, url: '' };
      }
    }

    return { name: '', url: '' };
  },

  /**
   * Extract comment text content
   */
  getCommentText(commentEl, authorName) {
    const candidates = Array.from(commentEl.querySelectorAll('div[dir="auto"], span[dir="auto"], span[lang]'));
    const textParts = [];

    for (const el of candidates) {
      if (el.closest('ul ul') && !commentEl.closest('ul ul')) continue;

      const text = (el.innerText || el.textContent || '').trim();
      if (!text) continue;
      if (authorName && text === authorName) continue;
      if (this.patterns.actionButtons.test(text)) continue;
      if (this.patterns.seeMore.test(text)) continue;
      if (this.patterns.timeIndicators.test(text) && text.length < 25) continue;
      if (this.patterns.replyExpanders.some(p => p.test(text))) continue;

      if (!textParts.some(p => p.includes(text) || text.includes(p))) {
        textParts.push(text);
      }
    }

    return textParts.join('\n').trim();
  },

  /**
   * Parse single comment DOM box with collision-proof identifiers
   */
  parseSingleCommentBox(commentEl, fallbackIndex = 0) {
    try {
      if (!window.__fb_cid_seq) window.__fb_cid_seq = 1000;
      if (!commentEl.__fb_cid) {
        commentEl.__fb_cid = `cid_${Date.now()}_${++window.__fb_cid_seq}`;
      }
      const domCid = commentEl.__fb_cid;

      const authorInfo = this.getCommentAuthor(commentEl);
      let author = authorInfo.name;
      const rawAuthorUrl = authorInfo.url || '';

      if (!author) {
        author = 'Người dùng Facebook';
      }

      // Canonicalize authorUrl (strip tracking params like __cft__, __tn__)
      let cleanAuthorUrl = rawAuthorUrl;
      try {
        if (cleanAuthorUrl && cleanAuthorUrl.includes('?')) {
          const u = new URL(cleanAuthorUrl, window.location.origin);
          u.searchParams.delete('__cft__[0]');
          u.searchParams.delete('__tn__');
          cleanAuthorUrl = u.origin + u.pathname + (u.search ? u.search : '');
        }
      } catch (e) {}

      let avatar = '';
      const avatarImg = commentEl.querySelector('image, img[src*="fbcdn"], img[src*="scontent"]');
      if (avatarImg) {
        avatar = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('src') || '';
      }

      let time = '';
      let exactTime = '';
      const timeLinks = commentEl.querySelectorAll('a[role="link"] span, a[href*="comment_id"], a[href*="reply_comment_id"], span');
      for (const tEl of timeLinks) {
        const tText = (tEl.innerText || tEl.textContent || '').trim();
        if (this.patterns.timeIndicators.test(tText) && tText.length < 30) {
          time = tText;
          const anchor = tEl.closest('a');
          if (anchor) {
            exactTime = anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '';
          }
          break;
        }
      }

      let text = this.getCommentText(commentEl, author);

      let mediaUrl = '';
      let mediaType = '';

      const mediaImgs = commentEl.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"], img[src*="stickers"]');
      mediaImgs.forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src && !src.includes('rsrc.php') && img !== avatarImg) {
          mediaUrl = src;
          mediaType = (src.includes('sticker') || src.includes('stickers')) ? 'sticker' : 'image';
        }
      });

      if (!text) {
        if (mediaType === 'sticker') text = '[Nhãn dán]';
        else if (mediaType === 'image') text = '[Hình ảnh]';
        else if (commentEl.querySelector('video')) text = '[Video]';
        else text = '[Bình luận]';
      }

      let reactions = '0';
      const reactionBadge = commentEl.querySelector('[aria-label*="bày tỏ cảm xúc" i], [aria-label*="reaction" i], span[role="toolbar"]');
      if (reactionBadge) {
        const countEl = reactionBadge.querySelector('span[dir="auto"]') || reactionBadge;
        reactions = this.getText(countEl) || '1';
      }

      // Extract Facebook comment ID (numeric or base64)
      let fbCommentId = '';
      const cmtLinks = Array.from(commentEl.querySelectorAll('a[href*="comment_id="], a[href*="reply_comment_id="], a[href*="ctoken="], a[href*="/comments/"]'));
      for (const l of cmtLinks) {
        const href = l.getAttribute('href') || '';
        const m = href.match(/(?:comment_id|reply_comment_id|ctoken)=([^&/?#]+)/i) ||
                  href.match(/\/comments\/([^&/?#]+)/i);
        if (m && m[1]) {
          fbCommentId = m[1];
          break;
        }
      }

      if (!fbCommentId) {
        const withDataId = commentEl.closest('[data-commentid]') || commentEl.querySelector('[data-commentid]');
        if (withDataId) {
          fbCommentId = withDataId.getAttribute('data-commentid');
        }
      }

      // Collision-proof unique signature for deduplication
      const uniqueSignature = fbCommentId
        ? `fbid_${fbCommentId}`
        : `sig_${author}__${cleanAuthorUrl || avatar}__${exactTime || time}__${text.slice(0, 50)}__${mediaUrl}`;

      return {
        id: fbCommentId ? `cmt_${fbCommentId}` : `cmt_${domCid}`,
        fbCommentId,
        uniqueSignature,
        domCid,
        author,
        authorUrl: cleanAuthorUrl || rawAuthorUrl,
        avatar,
        time: exactTime || time,
        rawTime: time,
        text,
        mediaUrl,
        mediaType,
        reactions,
        isReply: false,
        parentId: null,
        parentAuthor: '',
        replies: []
      };
    } catch (e) {
      console.warn('[FBDomSelectors] Parse comment box error:', e);
      return null;
    }
  },

  /**
   * Hierarchical Comment Extraction:
   * Accurately groups parent comments and nested child replies without dropping any comments.
   */
  extractHierarchicalComments() {
    const scope = this.getCommentsScope();
    const commentBoxes = [];
    const seenElements = new Set();
    const postContainer = this.getPostContainer();

    // Strategy 1: Find all leaf comment articles (div[role="article"]) in comments scope
    const articles = Array.from(scope.querySelectorAll('div[role="article"]'));
    articles.forEach(art => {
      if (art === scope || art.id === 'fb-scraper-hud-root') return;
      if (postContainer && (art === postContainer || art.contains(postContainer))) return;
      // If an article contains another article, it's a wrapper, not a leaf comment
      if (art.querySelector('div[role="article"]')) return;

      const aria = (art.getAttribute('aria-label') || '').toLowerCase();
      const hasCommentIndicator = aria.includes('bình luận') || aria.includes('comment') ||
                                  aria.includes('phản hồi') || aria.includes('reply') ||
                                  art.querySelector('div[dir="auto"], span[dir="auto"]');
      if (hasCommentIndicator) {
        if (!seenElements.has(art)) {
          seenElements.add(art);
          commentBoxes.push(art);
        }
      }
    });

    // Strategy 2: Catch any comment containers from leaf "Phản hồi" / "Trả lời" / "Reply" action buttons
    const replyAnchors = this.findAllCommentReplyAnchors(scope);
    replyAnchors.forEach(anchor => {
      const box = this.findCommentBoxFromAnchor(anchor, scope);
      if (box && !seenElements.has(box)) {
        let isWrapper = false;
        for (const seen of seenElements) {
          if (box.contains(seen)) {
            isWrapper = true;
            break;
          }
        }
        if (!isWrapper) {
          seenElements.add(box);
          commentBoxes.push(box);
        }
      }
    });

    // Strategy 3: Fallback list items if nothing found
    if (commentBoxes.length === 0) {
      const listItems = Array.from(scope.querySelectorAll('ul > li'));
      listItems.forEach(li => {
        if (li.id === 'fb-scraper-hud-root') return;
        if (li.querySelector('div[dir="auto"], span[dir="auto"], img[src*="fbcdn"]')) {
          if (!seenElements.has(li)) {
            seenElements.add(li);
            commentBoxes.push(li);
          }
        }
      });
    }

    // Sort DOM elements in document tree order to preserve natural conversation sequence
    commentBoxes.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const topLevelThreads = [];
    const threadMap = new Map();
    let currentParent = null;

    commentBoxes.forEach((box, idx) => {
      const commentData = this.parseSingleCommentBox(box, idx);
      if (!commentData) return;

      const rect = box.getBoundingClientRect();
      const isNestedList = Boolean(box.closest('ul ul, ol ol, li li'));
      const aria = (box.getAttribute('aria-label') || '').toLowerCase();
      const isAriaReply = aria.includes('phản hồi') || aria.includes('reply') || aria.includes('trả lời');

      const replyMatch = aria.match(/(?:phản hồi của|reply by)\s+(.*?)\s+(?:cho bình luận của|to)\s+([^,.:\n]+)/i);
      if (replyMatch && replyMatch[2]) {
        commentData.parentAuthor = replyMatch[2].trim();
      }

      let isIndented = false;
      if (currentParent && currentParent._rectLeft > 0 && rect.left > currentParent._rectLeft + 15) {
        isIndented = true;
      }

      const isReply = isNestedList || isAriaReply || isIndented || Boolean(commentData.parentAuthor);
      commentData._rectLeft = rect.left;

      if (isReply) {
        commentData.isReply = true;
        if (currentParent) {
          commentData.parentId = currentParent.id;
          if (!commentData.parentAuthor) commentData.parentAuthor = currentParent.author;

          const repKey = commentData.uniqueSignature || commentData.fbCommentId || `${commentData.author}_${commentData.text.slice(0, 40)}`;
          const exists = currentParent.replies.some(r => {
            const rKey = r.uniqueSignature || r.fbCommentId || `${r.author}_${r.text.slice(0, 40)}`;
            return rKey === repKey;
          });

          if (!exists) {
            currentParent.replies.push(commentData);
          }
        } else {
          // Parent was unmounted earlier, keep as topLevelThreads entry with isReply: true so it's not lost
          const uniqueKey = commentData.uniqueSignature || commentData.fbCommentId || `${commentData.author}_${commentData.text.slice(0, 40)}`;
          if (!threadMap.has(uniqueKey)) {
            threadMap.set(uniqueKey, commentData);
            topLevelThreads.push(commentData);
          }
        }
      } else {
        commentData.isReply = false;
        commentData.replies = [];

        const uniqueKey = commentData.uniqueSignature || commentData.fbCommentId || `${commentData.author}_${commentData.text.slice(0, 40)}`;
        if (!threadMap.has(uniqueKey)) {
          threadMap.set(uniqueKey, commentData);
          topLevelThreads.push(commentData);
          currentParent = commentData;
        } else {
          currentParent = threadMap.get(uniqueKey);
        }
      }
    });

    return topLevelThreads;
  }
};

// Global export
if (typeof window !== 'undefined') {
  window.FBDomSelectors = FBDomSelectors;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBDomSelectors;
}
