/**
 * Facebook Crawler Engine: Fast scrolling, exhaustive sub-comment (reply) expansion,
 * deduplication, and hierarchical thread construction.
 */

class FBCrawlerEngine {
  constructor(customConfig = {}) {
    const defaultBuffer = customConfig.bufferMs || customConfig.delayMs || 1200;
    this.config = Object.assign({
      bufferMs: defaultBuffer,     // Settled buffer delay after receiving new content (ms)
      delayMs: defaultBuffer,      // Backward compatibility
      networkTimeoutMs: 3500,      // Max wait for GraphQL / new comments (ms)
      maxComments: 0,              // 0 = unlimited
      expandReplies: true,         // Expand sub-comments / replies
      autoSwitchFilter: true,      // Switch to "Tất cả bình luận" / "All comments"
      scrollStep: 900              // Natural scroll step in pixels
    }, customConfig);

    this.status = 'IDLE'; // IDLE | RUNNING | PAUSED | STOPPED | FINISHED | ERROR
    this.postData = null;
    this.expectedCommentsCount = 0;
    this.threadsMap = new Map(); // signature -> top-level comment with .replies array
    this.listeners = [];
    this.stopRequested = false;
    this.pauseRequested = false;
    this.stagnantCount = 0;
    this.currentRound = 0;
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  /**
   * Emit progress to all subscribers
   */
  emit(eventData) {
    let topLevelCount = this.threadsMap.size;
    let repliesCount = 0;

    for (const thread of this.threadsMap.values()) {
      if (Array.isArray(thread.replies)) {
        repliesCount += thread.replies.length;
      }
    }

    const totalAll = topLevelCount + repliesCount;

    const payload = Object.assign({
      status: this.status,
      totalTopLevel: topLevelCount,
      totalReplies: repliesCount,
      totalComments: totalAll,
      expectedComments: this.expectedCommentsCount || (this.postData?.expectedComments || 0),
      post: this.postData,
      round: this.currentRound
    }, eventData);

    this.listeners.forEach(cb => {
      try { cb(payload); } catch (e) { console.error(e); }
    });
  }

  /**
   * Pause the crawler
   */
  pause() {
    if (this.status === 'RUNNING') {
      this.pauseRequested = true;
      this.status = 'PAUSED';
      this.emit({ message: 'Đã tạm dừng quá trình cào dữ liệu.' });
    }
  }

  /**
   * Resume the crawler
   */
  resume() {
    if (this.status === 'PAUSED') {
      this.pauseRequested = false;
      this.status = 'RUNNING';
      this.emit({ message: 'Tiếp tục cào dữ liệu...' });
    }
  }

  /**
   * Stop the crawler completely
   */
  stop() {
    this.stopRequested = true;
    this.status = 'STOPPED';
    this.emit({ message: 'Người dùng đã dừng quá trình cào.' });
  }

  /**
   * Adaptive wait: monitors DOM mutations, Facebook loading indicators,
   * and comment count growth. Once new content is detected, waits for an
   * optimal settled buffer (bufferMs) before proceeding.
   */
  async waitForNewCommentsOrSettled(prevCommentCount, timeoutMs = 3000, bufferMs = 800, scrollContainer = null) {
    const startTime = Date.now();
    let wasLoading = false;
    let newContentDetected = false;
    const checkInterval = 100; // check every 100ms
    const startScrollHeight = scrollContainer?.scrollHeight || document.documentElement?.scrollHeight || 0;

    while (Date.now() - startTime < timeoutMs) {
      if (this.stopRequested) break;
      while (this.pauseRequested && !this.stopRequested) {
        await this.sleep(200);
      }

      const isLoading = FBDomSelectors.isCommentsLoading();
      if (isLoading) {
        wasLoading = true;
      }

      // Periodically force trigger IntersectionObservers so background tabs load next batch
      try {
        document.dispatchEvent(new CustomEvent('__FB_SCRAPER_FORCE_INTERSECT__'));
      } catch (e) {}

      const currentDomCount = FBDomSelectors.countVisibleCommentElements();
      const currentScrollHeight = scrollContainer?.scrollHeight || document.documentElement?.scrollHeight || 0;

      // Detect if new comments arrived (either element count grew, or scrollable height expanded)
      if (currentDomCount > prevCommentCount || currentScrollHeight > startScrollHeight + 40) {
        newContentDetected = true;
        await this.sleep(bufferMs);
        return {
          receivedNew: true,
          newCount: Math.max(currentDomCount, prevCommentCount + 1),
          duration: Date.now() - startTime
        };
      }

      // If spinner was active and now finished
      if (wasLoading && !isLoading) {
        // Facebook GraphQL response just completed; DOM rendering might take 100-800ms
        const renderWaitStart = Date.now();
        while (Date.now() - renderWaitStart < 1200) {
          await this.sleep(100);
          const postLoadCount = FBDomSelectors.countVisibleCommentElements(scrollContainer);
          const postLoadHeight = scrollContainer?.scrollHeight || document.documentElement?.scrollHeight || 0;
          if (postLoadCount > prevCommentCount || postLoadHeight > startScrollHeight + 30) {
            await this.sleep(Math.min(bufferMs, 300));
            return {
              receivedNew: true,
              newCount: Math.max(postLoadCount, prevCommentCount + 1),
              duration: Date.now() - startTime
            };
          }
        }
        break; // Spinner finished and settled
      }

      await this.sleep(checkInterval);
    }

    return {
      receivedNew: newContentDetected,
      newCount: prevCommentCount,
      duration: Date.now() - startTime
    };
  }

  /**
   * Fast targeted wait for sub-comments (replies) GraphQL response
   * Once loading finishes or DOM settles, returns immediately (typically 200ms - 500ms)
   */
  async waitForSubCommentsSettled(maxWaitMs = 1500, startCount = 0) {
    const start = Date.now();
    let wasLoading = false;
    while (Date.now() - start < maxWaitMs) {
      if (this.stopRequested) break;
      const isLoading = FBDomSelectors.isCommentsLoading();
      if (isLoading) {
        wasLoading = true;
      } else if (wasLoading && !isLoading) {
        // Facebook loading spinner just finished!
        await this.sleep(150);
        break;
      }
      if (startCount > 0) {
        const current = FBDomSelectors.countVisibleCommentElements();
        if (current > startCount) {
          await this.sleep(150);
          break;
        }
      }
      await this.sleep(60);
    }
  }

  /**
   * Exhaustively expand all visible reply buttons (sub-comments) in rapid batches
   */
  async expandAllVisibleReplies() {
    if (!this.config.expandReplies) return 0;

    let totalExpanded = 0;
    let pass = 0;
    const buffer = this.config.bufferMs || 300;

    while (pass < 12 && !this.stopRequested) {
      pass++;
      const replyBtns = FBDomSelectors.findViewRepliesButtons();
      if (replyBtns.length === 0) break;

      let clickedThisPass = 0;
      for (const btn of replyBtns) {
        if (this.stopRequested) break;
        try {
          FBDomSelectors.triggerClick(btn);
          clickedThisPass++;
          totalExpanded++;
          await this.sleep(40); // 40ms fast batch stagger
        } catch (e) {}
      }

      if (clickedThisPass === 0) break;

      // Wait for Facebook GraphQL request to load child comments into DOM
      const countBefore = FBDomSelectors.countVisibleCommentElements();
      await this.waitForNewCommentsOrSettled(countBefore, 2500, buffer);
    }

    return totalExpanded;
  }

  /**
   * Click all "Xem thêm bình luận" / "Xem các bình luận trước" buttons (both top & bottom)
   */
  async loadMoreCommentsPass() {
    if (this.stopRequested) return false;

    const moreCommentsBtns = FBDomSelectors.findViewMoreCommentsButtons();
    if (moreCommentsBtns.length === 0) return false;

    let clickedAny = false;
    const buffer = this.config.bufferMs || 300;

    for (const btn of moreCommentsBtns) {
      if (this.stopRequested) break;
      try {
        FBDomSelectors.triggerClick(btn);
        clickedAny = true;
        await this.sleep(50);
      } catch (e) {}
    }

    if (clickedAny) {
      const countBefore = FBDomSelectors.countVisibleCommentElements();
      await this.waitForNewCommentsOrSettled(countBefore, 2500, buffer);
    }

    return clickedAny;
  }

  /**
   * Start crawling with optimized 3-phase pipeline:
   * Phase 1: Fast Full-DOM Loading (Scroll & Click pagination into DOM)
   * Phase 2: Exhaustive Nested Reply & Text Unfolding (Expand replies & see-more)
   * Phase 3: Single-Pass Exhaustive Extraction (Extract complete clean hierarchical dataset)
   */
  async start() {
    if (this.status === 'RUNNING') return;

    this.status = 'RUNNING';
    this.stopRequested = false;
    this.pauseRequested = false;
    this.threadsMap.clear();
    this.stagnantCount = 0;
    this.currentRound = 0;

    try {
      this.emit({ message: 'Đang kiểm tra và phân tích bài viết...' });

      // Immediate check for login barrier
      const loginStatus = FBDomSelectors.checkHardLoginBarrier();
      if (loginStatus.required) {
        const msg = `Yêu cầu đăng nhập: ${loginStatus.reason}. Vui lòng đăng nhập Facebook trên trình duyệt rồi thử lại.`;
        this.emit({ message: msg });
        throw new Error(msg);
      }

      // Auto-dismiss any soft login/prompt overlays
      FBDomSelectors.dismissLoginOverlayIfAny();

      // Step 0: Ensure comments panel is open (crucial for Reels, Videos & popups)
      FBDomSelectors.openCollapsedCommentsIfAny();
      await this.sleep(300);

      // Step 1: Detect Post and extract initial details
      const postContainer = FBDomSelectors.getPostContainer();
      this.postData = FBDomSelectors.extractPostDetails(postContainer);
      this.expectedCommentsCount = this.postData.expectedComments || 0;

      const authorName = this.postData.author || 'Facebook Post';
      const targetText = this.expectedCommentsCount > 0 ? ` (Mục tiêu: ${this.expectedCommentsCount} bình luận)` : '';
      this.emit({ message: `Đã tìm thấy bài viết: ${authorName}${targetText}` });

      // Step 2: Switch to "Tất cả bình luận" / "All comments" (Strictly avoids "Phù hợp nhất" / "Mới nhất")
      if (this.config.autoSwitchFilter && !this.stopRequested) {
        this.emit({ message: 'Đang kiểm tra và chọn "Tất cả bình luận" (All comments)...' });
        let switched = await FBDomSelectors.switchToAllComments();
        if (!switched) {
          await this.sleep(800);
          switched = await FBDomSelectors.switchToAllComments();
        }
        if (switched) {
          this.emit({ message: 'Đã chuyển sang "Tất cả bình luận" thành công!' });
          await this.sleep(1500); // Đợi Facebook GraphQL nạp lại danh sách bình luận đầy đủ
        }
      }

      // Re-check expectedCommentsCount if it was 0 initially
      if (this.expectedCommentsCount === 0) {
        this.expectedCommentsCount = FBDomSelectors.extractExpectedCommentsCount(postContainer);
        if (this.expectedCommentsCount > 0) {
          this.postData.expectedComments = this.expectedCommentsCount;
        }
      }

      const scrollContainer = FBDomSelectors.getScrollableContainer();

      // =========================================================================
      // GIAI ĐOẠN 1: PROGRESSIVE IN-FLIGHT EXPANSION & EXTRACTION
      // Bung phản hồi, nạp và trích xuất lũy tiến theo từng đợt cuộn.
      // Bảo đảm thu thập 100% comment trước khi Facebook Comet unmount khỏi DOM!
      // =========================================================================
      this.emit({
        message: this.expectedCommentsCount > 0 ?
          `Giai đoạn 1/2: Đang cuộn & nạp dữ liệu (Mục tiêu: ${this.expectedCommentsCount} bình luận)...` :
          'Giai đoạn 1/2: Đang cuộn & nạp dữ liệu...'
      });

      let domStagnantCount = 0;
      let bottomStagnantCount = 0;
      let prevTotalComments = 0;
      let deadMorePassCount = 0; // Đếm số lần reset stagnant do hasMoreButtons nhưng không progress
      const maxAllowedStagnant = 15; // Hard limit for maximum empty scrolls before giving up

      while (!this.stopRequested) {
        while (this.pauseRequested && !this.stopRequested) {
          await this.sleep(300);
        }
        if (this.stopRequested) break;

        this.currentRound++;

        // Regularly dismiss any soft login or notice overlays that Facebook shows during scroll
        if (this.currentRound % 3 === 0) {
          FBDomSelectors.dismissLoginOverlayIfAny();
        }

        // Detect if redirected to login during scroll
        if (this.currentRound >= 3 && prevTotalComments === 0) {
          const midCheck = FBDomSelectors.checkHardLoginBarrier();
          if (midCheck.required) {
            const msg = `Yêu cầu đăng nhập: ${midCheck.reason}.`;
            this.emit({ message: msg });
            throw new Error(msg);
          }
        }

        // 1. Bung phản hồi con (Replies) đang hiển thị trong DOM trước khi bị scroll qua
        if (this.config.expandReplies) {
          const replyBtns = FBDomSelectors.findViewRepliesButtons();
          for (const btn of replyBtns) {
            if (this.stopRequested) break;
            try {
              btn.__fb_clicked = Date.now();
              FBDomSelectors.triggerClick(btn);
              await this.sleep(35);
            } catch (e) {}
          }
        }

        // 2. Bung văn bản "Xem thêm" / "See more" cho các comment dài
        const seeMoreBtns = FBDomSelectors.findSeeMoreButtons();
        for (const btn of seeMoreBtns) {
          if (this.stopRequested) break;
          try {
            FBDomSelectors.triggerClick(btn);
          } catch (e) {}
        }

        // 3. Trích xuất lũy tiến các bình luận đang hiện diện trong DOM & merge vào threadsMap
        const snapThreads = FBDomSelectors.extractHierarchicalComments();
        this.mergeExtractedThreads(snapThreads);

        // 4. Tính toán số lượng bình luận thực tế tích lũy được
        const currentTotal = this.calculateTotalComments();
        let currentReplies = 0;
        for (const t of this.threadsMap.values()) {
          if (Array.isArray(t.replies)) currentReplies += t.replies.length;
        }
        const currentTop = this.threadsMap.size;

        // Cập nhật tiến trình thời gian thực lên Dashboard & HUD
        const targetProgress = this.expectedCommentsCount > 0 ? ` / ${this.expectedCommentsCount}` : '';
        this.emit({
          totalComments: currentTotal,
          totalTopLevel: currentTop,
          totalReplies: currentReplies,
          message: `Giai đoạn 1/2: Đang thu thập... ${currentTotal}${targetProgress} bình luận (${currentTop} cha, ${currentReplies} con)`
        });

        // Kiểm tra đạt mục tiêu người dùng yêu cầu
        if (this.config.maxComments > 0 && currentTotal >= this.config.maxComments) {
          this.emit({ message: `Đã thu thập đủ ${this.config.maxComments} bình luận theo yêu cầu!` });
          break;
        }



        // 5. Click các nút phân trang: "Xem các bình luận trước" (ở trên) và "Xem thêm bình luận" (ở dưới)
        const moreClicked = await this.loadMoreCommentsPass();

        // 6. Kiểm tra vị trí cuộn: Chạm đáy (Batch Boundary) hay đang ở giữa trang
        const isAtBottom = FBDomSelectors.isScrollAtBottom(scrollContainer);
        const countBeforeDom = FBDomSelectors.countVisibleCommentElements(scrollContainer);
        const heightBefore = scrollContainer?.scrollHeight || document.documentElement?.scrollHeight || 0;

        if (isAtBottom) {
          // KHI CHẠM ĐÁY (không thể cuộn xuống thêm vì đã tới giới hạn scrollable):
          // Facebook cần được kích thích nhẹ (Scroll Bounce + WheelEvent) để IntersectionObserver
          // nhận biết vị trí và gửi GraphQL request tải batch tiếp theo.
          this.scrollUp(scrollContainer, 100);
          await this.sleep(60);
          this.scrollDown(scrollContainer, 150);
          try {
            const target = (scrollContainer && scrollContainer !== window) ? scrollContainer : window;
            target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 250 }));
          } catch (e) {}
        } else {
          // KHI ĐANG Ở GIỮA TRANG:
          if (this.currentRound % 6 === 0) {
            this.scrollUp(scrollContainer, 1200);
            await this.sleep(150);
            await this.loadMoreCommentsPass();
          } else {
            const lastCommentEl = FBDomSelectors.getLastCommentElement(scrollContainer);
            if (lastCommentEl) {
              try {
                lastCommentEl.scrollIntoView({ behavior: 'auto', block: 'end' });
              } catch (e) {}
            }
            this.scrollDown(scrollContainer, this.config.scrollStep);
          }
        }

        // 7. Chờ phản hồi nạp dữ liệu mới từ Facebook GraphQL hoặc bộ đệm DOM
        const waitResult = await this.waitForNewCommentsOrSettled(
          countBeforeDom,
          this.config.networkTimeoutMs,
          this.config.bufferMs,
          scrollContainer
        );

        // 8. Đánh giá tiến trình nạp
        const heightNow = scrollContainer?.scrollHeight || document.documentElement?.scrollHeight || 0;
        const heightGrew = heightNow > (heightBefore + 20);
        const isLoadingNow = FBDomSelectors.isCommentsLoading();
        const hasMoreButtons = FBDomSelectors.findViewMoreCommentsButtons().length > 0;

        // Trích xuất lại nhanh để kiểm tra xem có bình luận mới được thêm vào map không
        const checkSnap = FBDomSelectors.extractHierarchicalComments();
        this.mergeExtractedThreads(checkSnap);
        const updatedTotal = this.calculateTotalComments();

        const hadProgress = (updatedTotal > currentTotal) || waitResult.receivedNew || moreClicked || heightGrew || isLoadingNow;

        if (hadProgress) {
          domStagnantCount = 0;
          bottomStagnantCount = 0;
        } else {
          domStagnantCount++;

          if (isAtBottom) {
            bottomStagnantCount++;

            // Khi ở đáy và không có tiến trình, thử các biện pháp kích hoạt luân phiên
            if (bottomStagnantCount === 1) {
              // Nhấp nhô đáy lại một lần nữa
              this.scrollUp(scrollContainer, 150);
              await this.sleep(100);
              this.scrollDown(scrollContainer, 200);
            } else if (bottomStagnantCount === 2) {
              // Cuộn lùi lên trên một đoạn rồi cuộn lại xuống đáy
              this.scrollUp(scrollContainer, 600);
              await this.sleep(200);
              this.scrollToBottom(scrollContainer);
            } else if (bottomStagnantCount === 3) {
              // Cuộn lên tận đỉnh để kiểm tra phân trang ngược (Xem các bình luận trước)
              this.scrollToTop(scrollContainer);
              await this.sleep(250);
              await this.loadMoreCommentsPass();
              this.scrollToBottom(scrollContainer);
            }

            // Chỉ khi đã thử kích hoạt 4 lần liên tiếp (~4-5 giây) mà:
            // - Không có comment mới
            // - Facebook KHÔNG đang xoay spinner loading
            // - DOM height không tăng
            // - Không có nút bấm nạp thêm
            // -> Khi đó mới chắc chắn 100% là đã nạp hết toàn bộ comment chính!
            // Break khi: ở đáy + stagnant 4 lần + không loading
            // Không còn yêu cầu !hasMoreButtons — nút "Xem thêm" đôi khi tồn tại
            // nhưng click vào cũng không load thêm (ghost button), cần break cứng.
            if (bottomStagnantCount >= 4 && !isLoadingNow) {
              this.emit({
                message: `⚡ Đã nạp hết toàn bộ bình luận chính (${updatedTotal} bình luận). Chuyển sang mở các cụm phản hồi con (replies)...`
              });
              break;
            }
          } else {
            // Không ở đáy nhưng stagnant
            if (domStagnantCount % 3 === 1) {
              this.scrollToTop(scrollContainer);
              await this.sleep(200);
              await this.loadMoreCommentsPass();
            } else if (domStagnantCount % 3 === 2) {
              this.scrollToBottom(scrollContainer);
              await this.sleep(200);
            }

            if (domStagnantCount >= maxAllowedStagnant) {
              if (!isLoadingNow) {
                if (!hasMoreButtons || deadMorePassCount >= 3) {
                  // Không còn nút hoặc đã thử > 3 lần mà nút không mang lại progress
                  this.emit({ message: `Đã cuộn hết trang, tổng cộng ${updatedTotal} bình luận đã thu thập.` });
                  break;
                } else {
                  // Còn nút nhưng chưa biết — reset thêm 1 lần, tăng bộ đếm dead
                  deadMorePassCount++;
                  domStagnantCount = Math.floor(maxAllowedStagnant / 2);
                }
              }
            }
          }
        }

        prevTotalComments = updatedTotal;
      }

      // =========================================================================
      // GIAI ĐOẠN 2: TARGETED SUB-THREAD EXPANSION
      // CHỈ TẬP TRUNG NẠP VÀO CÁC COMMENT CỦA THREAD CON (REPLIES) CÒN LẠI!
      // Không cuộn mù quáng, chỉ xử lý chính xác các nút phản hồi đang tồn tại.
      // =========================================================================
      if (!this.stopRequested && this.config.expandReplies) {
        this.emit({ message: 'Giai đoạn 2/2: Đang quét và mở toàn bộ các cụm phản hồi con còn lại...' });

        let subPass = 0;
        const maxSubPasses = 15;
        let consecutiveNoReplies = 0;
        let consecutiveNoGrowth = 0; // Đếm số lần click reply nhưng DOM không tăng (ghost button)
        let lastPhase2Total = this.calculateTotalComments();

        while (subPass < maxSubPasses && !this.stopRequested) {
          subPass++;

          // 1. Tìm tất cả các nút phản hồi con ("Xem X phản hồi", "Xem câu trả lời", etc.)
          const replyBtns = FBDomSelectors.findViewRepliesButtons();

          if (replyBtns.length > 0) {
            consecutiveNoReplies = 0;
            this.emit({
              message: `Giai đoạn 2/2: Đang bung ${replyBtns.length} cụm phản hồi con (Đợt ${subPass})...`
            });

            const countBeforeSub = FBDomSelectors.countVisibleCommentElements();
            // Bấm theo đợt siêu tốc (stagger 30ms)
            for (const btn of replyBtns) {
              if (this.stopRequested) break;
              try {
                btn.__fb_clicked = Date.now();
                FBDomSelectors.triggerClick(btn);
                await this.sleep(30);
              } catch (e) {}
            }

            // Chờ phản hồi GraphQL nạp sub-comments (có loading kết thúc hoặc có comment mới là tiếp tục ngay)
            await this.waitForSubCommentsSettled(1200, countBeforeSub);

            // Bung văn bản "Xem thêm" nếu có trong các phản hồi con vừa nạp
            const seeMoreBtns = FBDomSelectors.findSeeMoreButtons();
            for (const btn of seeMoreBtns) {
              try { FBDomSelectors.triggerClick(btn); } catch (e) {}
            }

            // Trích xuất và cập nhật ngay vào master map
            const currentSnap = FBDomSelectors.extractHierarchicalComments();
            this.mergeExtractedThreads(currentSnap);

            const currentTotal = this.calculateTotalComments();
            let currentReplies = 0;
            for (const t of this.threadsMap.values()) {
              if (Array.isArray(t.replies)) currentReplies += t.replies.length;
            }
            const targetProgress = this.expectedCommentsCount > 0 ? ` / ${this.expectedCommentsCount}` : '';

            this.emit({
              totalComments: currentTotal,
              totalTopLevel: this.threadsMap.size,
              totalReplies: currentReplies,
              message: `Giai đoạn 2/2: Đã nạp ${currentTotal}${targetProgress} bình luận (${this.threadsMap.size} cha, ${currentReplies} con)...`
            });

            // Kiểm tra progress sau khi click reply buttons
            if (currentTotal > lastPhase2Total) {
              consecutiveNoGrowth = 0;
              lastPhase2Total = currentTotal;
            } else {
              consecutiveNoGrowth++;
              if (consecutiveNoGrowth >= 4) {
                // Đã click reply buttons 4 lần liên tiếp mà không có comment mới → ghost buttons, dừng
                break;
              }
            }


          } else {
            consecutiveNoReplies++;
            // Nếu trong vị trí hiện tại không còn nút phản hồi nào:
            // Cuộn ngược lên để tìm các nút reply ở phía trên (scroll thuần, không trigger FORCE_INTERSECT)
            if (consecutiveNoReplies <= 3) {
              try {
                // Scroll ngược KHÔNG dispatch FORCE_INTERSECT để tránh load thêm content mới
                // làm reset vòng lặp liên tục
                if (scrollContainer && scrollContainer !== window && scrollContainer.scrollTop !== undefined) {
                  scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - 2200);
                } else {
                  window.scrollBy({ top: -2200, behavior: 'auto' });
                }
              } catch (e) {}
              await this.sleep(300);

              const newBtns = FBDomSelectors.findViewRepliesButtons();
              if (newBtns.length > 0) {
                consecutiveNoReplies = 0;
              }
            } else {
              // Đã quét ngược toàn bộ trang và không còn bất kỳ nút phản hồi con nào!
              break;
            }
          }
        }
      }

      // Cập nhật lại post details lần cuối (văn bản bài viết sau khi bung xem thêm, reactions)
      const refreshedPost = FBDomSelectors.extractPostDetails(postContainer);
      if (refreshedPost.text) this.postData.text = refreshedPost.text;
      if (refreshedPost.reactions && refreshedPost.reactions !== '0') this.postData.reactions = refreshedPost.reactions;
      if (refreshedPost.expectedComments && refreshedPost.expectedComments > 0) {
        this.expectedCommentsCount = refreshedPost.expectedComments;
        this.postData.expectedComments = refreshedPost.expectedComments;
      }

      if (!this.stopRequested) {
        this.status = 'FINISHED';
        const finalCount = this.calculateTotalComments();
        let finalReplies = 0;
        for (const t of this.threadsMap.values()) {
          if (Array.isArray(t.replies)) finalReplies += t.replies.length;
        }
        const pct = (this.expectedCommentsCount > 0) ? Math.min(100, Math.round((finalCount / this.expectedCommentsCount) * 100)) : 100;
        const matchText = (this.expectedCommentsCount > 0 && finalCount >= this.expectedCommentsCount) ?
          ` (Đạt đủ ${finalCount}/${this.expectedCommentsCount})` :
          (this.expectedCommentsCount > 0 ? ` (${finalCount}/${this.expectedCommentsCount} - ${pct}% Facebook hiển thị)` : '');
        this.emit({
          totalComments: finalCount,
          totalTopLevel: this.threadsMap.size,
          totalReplies: finalReplies,
          message: `Hoàn tất cào! Tổng cộng: ${finalCount} bình luận (${this.threadsMap.size} cha, ${finalReplies} phản hồi con)${matchText}.`
        });
      }

    } catch (err) {
      console.error('[FBCrawlerEngine] Execution error:', err);
      this.status = 'ERROR';
      this.emit({ message: `Lỗi trong quá trình cào: ${err.message}` });
    }

    return this.getData();
  }

  /**
   * Fast instant scroll helper
   */
  scrollDown(scrollContainer, amount) {
    try {
      if (scrollContainer && scrollContainer !== window && scrollContainer.scrollTop !== undefined) {
        scrollContainer.scrollTop += amount;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    } catch (e) {}
    try {
      if (document.scrollingElement) document.scrollingElement.scrollTop += amount;
      if (document.documentElement) document.documentElement.scrollTop += amount;
      if (document.body) document.body.scrollTop += amount;
      window.scrollBy({ top: amount, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('__FB_SCRAPER_FORCE_INTERSECT__'));
    } catch (e) {}
  }

  scrollUp(scrollContainer, amount) {
    try {
      if (scrollContainer && scrollContainer !== window && scrollContainer.scrollTop !== undefined) {
        scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - amount);
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    } catch (e) {}
    try {
      if (document.scrollingElement) document.scrollingElement.scrollTop = Math.max(0, document.scrollingElement.scrollTop - amount);
      if (document.documentElement) document.documentElement.scrollTop = Math.max(0, document.documentElement.scrollTop - amount);
      if (document.body) document.body.scrollTop = Math.max(0, document.body.scrollTop - amount);
      window.scrollBy({ top: -amount, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('__FB_SCRAPER_FORCE_INTERSECT__'));
    } catch (e) {}
  }

  scrollToTop(scrollContainer) {
    try {
      if (scrollContainer && scrollContainer !== window && scrollContainer.scrollTop !== undefined) {
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    } catch (e) {}
    try {
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('__FB_SCRAPER_FORCE_INTERSECT__'));
    } catch (e) {}
  }

  scrollToBottom(scrollContainer) {
    try {
      if (scrollContainer && scrollContainer !== window && scrollContainer.scrollHeight !== undefined) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    } catch (e) {}
    try {
      const maxH = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0, 80000);
      if (document.scrollingElement) document.scrollingElement.scrollTop = maxH;
      if (document.documentElement) document.documentElement.scrollTop = maxH;
      if (document.body) document.body.scrollTop = maxH;
      window.scrollTo({ top: maxH, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('__FB_SCRAPER_FORCE_INTERSECT__'));
    } catch (e) {}
  }

  /**
   * Merge new extracted comment threads into master map
  /**
   * Merge new extracted comment threads into master map
   * Uses collision-proof uniqueSignature and handles unmounted parent-child linking.
   */
  mergeExtractedThreads(newThreads) {
    if (!Array.isArray(newThreads)) return;

    newThreads.forEach(thread => {
      // 1. If thread is a sub-comment whose parent was extracted earlier:
      if (thread.isReply && !thread.parentId && thread.parentAuthor) {
        for (const existing of this.threadsMap.values()) {
          if (existing.author === thread.parentAuthor) {
            thread.parentId = existing.id;
            if (!existing.replies) existing.replies = [];
            const repKey = thread.uniqueSignature || thread.fbCommentId || `${thread.author}_${thread.text.slice(0, 40)}`;
            const hasRep = existing.replies.some(r => (r.uniqueSignature || r.fbCommentId || `${r.author}_${r.text.slice(0, 40)}`) === repKey);
            if (!hasRep) {
              existing.replies.push({ ...thread });
            }
            return;
          }
        }
      }

      const threadKey = thread.uniqueSignature || thread.fbCommentId || `${thread.author}_${thread.authorUrl}_${thread.time}_${thread.text.slice(0, 40)}`;

      if (!this.threadsMap.has(threadKey)) {
        const copy = { ...thread, replies: [] };
        if (Array.isArray(thread.replies)) {
          thread.replies.forEach(r => copy.replies.push({ ...r }));
        }
        this.threadsMap.set(threadKey, copy);
      } else {
        // Thread already exists, merge new sub-replies into it
        const existing = this.threadsMap.get(threadKey);
        if (!existing.replies) existing.replies = [];

        // Update with full text if unfolded
        if (thread.text && thread.text.length > (existing.text?.length || 0)) {
          existing.text = thread.text;
        }
        if (thread.reactions && thread.reactions !== '0') {
          existing.reactions = thread.reactions;
        }

        if (Array.isArray(thread.replies)) {
          thread.replies.forEach(reply => {
            const repKey = reply.uniqueSignature || reply.fbCommentId || `${reply.author}_${reply.authorUrl}_${reply.time}_${reply.text.slice(0, 40)}`;
            const alreadyHasReply = existing.replies.some(r => {
              const rKey = r.uniqueSignature || r.fbCommentId || `${r.author}_${r.authorUrl}_${r.time}_${r.text.slice(0, 40)}`;
              return rKey === repKey;
            });
            if (!alreadyHasReply) {
              existing.replies.push({ ...reply });
            }
          });
        }
      }
    });
  }

  /**
   * Calculate total comments count (Parent comments + all replies)
   */
  calculateTotalComments() {
    let count = this.threadsMap.size;
    for (const thread of this.threadsMap.values()) {
      if (Array.isArray(thread.replies)) {
        count += thread.replies.length;
      }
    }
    return count;
  }

  /**
   * Return collected structured dataset
   */
  getData() {
    if (this.threadsMap.size === 0) {
      try {
        const snap = FBDomSelectors.extractHierarchicalComments();
        this.mergeExtractedThreads(snap);
      } catch (e) {}
    }

    const commentsList = Array.from(this.threadsMap.values());
    let repliesCount = 0;
    commentsList.forEach(t => {
      if (Array.isArray(t.replies)) repliesCount += t.replies.length;
    });

    return {
      post: this.postData || {},
      comments: commentsList,
      stats: {
        totalTopLevelComments: commentsList.length,
        totalReplies: repliesCount,
        totalComments: commentsList.length + repliesCount,
        expectedComments: this.expectedCommentsCount || 0
      },
      crawledAt: new Date().toISOString()
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global export
if (typeof window !== 'undefined') {
  window.FBCrawlerEngine = FBCrawlerEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBCrawlerEngine;
}
