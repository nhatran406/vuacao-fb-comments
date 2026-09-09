console.log("[FB Search Scraper] Content script injected!");

function getCleanPostUrl(href) {
  if (!href) return null;

  // 1. Loại bỏ các URL hệ thống, tìm kiếm, cài đặt, thông báo, login
  const blacklist = [
    "/login_alerts/", "/checkpoint/", "/notifications", "/settings/", "/help/",
    "/messages/", "/friends/", "/marketplace/", "/gaming/", "/saved/", "/ads/",
    "login.php", "/search/"
  ];
  for (const b of blacklist) {
    if (href.includes(b)) return null;
  }

  // 2. Không lấy link comment lẻ
  if (href.includes("comment_id=") || href.includes("reply_comment_id=")) return null;

  // 3. TUYỆT ĐỐI KHÔNG LẤY LINK /photo/ vì đây là link ảnh đính kèm ("This photo is from a post")
  // Ngoại trừ trường hợp link chứa set=gm. hoặc set=pcb. trong Group thì ta sẽ chuyển về link bài viết Group gốc
  try {
    const urlObj = new URL(href);
    const pathname = urlObj.pathname;

    if (pathname.includes("/photo")) {
      const setParam = urlObj.searchParams.get("set") || "";
      const vanity = urlObj.searchParams.get("idorvanity") || "";
      if (setParam.startsWith("gm.") && vanity) {
        return "https://www.facebook.com/groups/" + vanity + "/posts/" + setParam.replace("gm.", "") + "/";
      }
      if (setParam.startsWith("pcb.") && vanity) {
        return "https://www.facebook.com/groups/" + vanity + "/posts/" + setParam.replace("pcb.", "") + "/";
      }
      // Nếu là link photo thường -> BỎ QUA HOÀN TOÀN, không lấy!
      return null;
    }

    // Link video chuẩn: /watch/?v=123456789...
    if (pathname.includes("/watch") && urlObj.searchParams.has("v")) {
      const vid = urlObj.searchParams.get("v");
      if (vid && /^\d+$/.test(vid)) {
        return "https://www.facebook.com/watch/?v=" + vid;
      }
    }

    // Link video chuẩn: /videos/123456789/
    const videoMatch = pathname.match(/\/videos\/(\d+)/i);
    if (videoMatch) {
      return "https://www.facebook.com/watch/?v=" + videoMatch[1];
    }

    // Link post chuẩn: /posts/123456789/ hoặc /user/posts/123456789/
    const postMatch = pathname.match(/\/posts\/([a-zA-Z0-9_]+)/i);
    if (postMatch) {
      return urlObj.origin + pathname.split("?")[0];
    }

    // Link group post chuẩn: /groups/.../posts/123/ hoặc /groups/.../permalink/123/
    const groupMatch = pathname.match(/\/groups\/[^\/]+\/(posts|permalink)\/(\d+)/i);
    if (groupMatch) {
      return urlObj.origin + pathname.split("?")[0];
    }

    // Link dạng story.php hoặc permalink.php có story_fbid hoặc id cụ thể
    if (pathname.includes("story.php") || pathname.includes("permalink.php")) {
      const fbid = urlObj.searchParams.get("story_fbid") || urlObj.searchParams.get("fbid") || urlObj.searchParams.get("id");
      if (fbid) {
        return href;
      }
    }

    // Link reels chuẩn: /reel/123456789/
    const reelMatch = pathname.match(/\/reel\/(\d+)/i);
    if (reelMatch) {
      return "https://www.facebook.com/reel/" + reelMatch[1];
    }
  } catch (e) {
    return null;
  }

  return null;
}

function extractSearchPosts() {
  const posts = [];

  // Chiến lược 1: Ưu tiên tìm các thẻ FeedUnit / bài viết trên trang tìm kiếm và lấy link thời gian (Timestamp link của Post)
  const feedUnits = Array.from(document.querySelectorAll('div[role="feed"] > div, div[data-pagelet^="FeedUnit"], div[role="article"]'));
  
  feedUnits.forEach(unit => {
    try {
      const links = Array.from(unit.querySelectorAll('a[role="link"]'));
      // Tìm link chứa thời gian đăng bài (ví dụ "1 giờ", "Hôm qua", "Vừa xong", v.v.)
      for (const a of links) {
        const href = a.href || "";
        const text = (a.innerText || a.textContent || "").trim();
        const aria = (a.getAttribute("aria-label") || "").trim();
        
        // Link thời gian bài viết thường ngắn và trỏ tới /posts/ hoặc /groups/.../posts/
        const isTimeIndicator = /^(\d+\s*[hmdwy]|vừa xong|hôm qua|tháng|yesterday|just now)/i.test(text) ||
                                /^(\d+\s*[hmdwy]|vừa xong|hôm qua|tháng|yesterday|just now)/i.test(aria);
                                
        if (isTimeIndicator || href.includes("/posts/") || href.includes("/permalink/")) {
          const clean = getCleanPostUrl(href);
          if (clean && !posts.find(p => p.url === clean)) {
            posts.push({ url: clean });
            return; // Đã tìm thấy link post chính của card này
          }
        }
      }
    } catch (e) {}
  });

  // Chiến lược 2: Vét thêm tất cả các thẻ a trên trang và lọc qua getCleanPostUrl
  const allLinks = Array.from(document.querySelectorAll('a[role="link"], a'));
  allLinks.forEach((a) => {
    try {
      const href = a.href || "";
      const cleanUrl = getCleanPostUrl(href);
      if (cleanUrl && !posts.find(p => p.url === cleanUrl)) {
        posts.push({ url: cleanUrl });
      }
    } catch(e) {
      console.warn("Lỗi parse link", e);
    }
  });

  console.log(`[FB Search Scraper] Tìm thấy ${posts.length} links bài viết chuẩn (đã loại bỏ toàn bộ link ảnh riêng lẻ).`);
  return posts;
}

function autoScrollAndExtract(scrollCount, delayBetweenScrolls) {
  return new Promise((resolve) => {
    let currentScroll = 0;
    console.log("[FB Search Scraper] Bắt đầu cuộn trang...");

    const scrollInterval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      currentScroll++;

      if (currentScroll >= scrollCount) {
        clearInterval(scrollInterval);
        setTimeout(() => {
          const posts = extractSearchPosts();
          resolve(posts);
        }, delayBetweenScrolls);
      }
    }, delayBetweenScrolls);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "EXTRACT_SEARCH_POSTS") {
    autoScrollAndExtract(3, 2000).then((posts) => {
      sendResponse({ posts: posts });
    });
    return true;
  }
});
