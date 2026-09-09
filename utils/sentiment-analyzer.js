/**
 * Bộ Keywords đánh giá sắc thái tiếng Việt
 * Cấu trúc hằng số để dễ dàng bổ sung keyword theo các lĩnh vực khác nhau sau này.
 */
const SENTIMENT_KEYWORDS = {
  POSITIVE: [

    // --- Chứng khoán / Đầu tư / Tài chính (Tích cực / Tin tốt) ---
    'múc', 'húp', 'ôm hàng', 'gom hàng', 'tím lịm', 'trần', 'bắt đáy', 'về bờ', 'lãi to', 
    'chốt lời', 'cổ tức', 'tăng trưởng', 'vượt đỉnh', 'uptrend', 'siêu cổ', 'siêu sóng', 
    'định giá rẻ', 'tiềm năng', 'dòng tiền vào', 'tay to vào', 'tự doanh gom', 'khối ngoại mua ròng',
    'kỳ vọng cao', 'lợi nhuận khủng', 'doanh thu tăng', 'tin tốt', 'đột biến', 'x2 tài khoản',

        // --- Drama / Bóc phốt / Xã hội ---
    'nhập kho', 'bóc lịch', 'chạy sớm', 'rửa ráy', 'rửa tiền', 'tài phiệt', 
    'vào mà húp', 'vào mà bênh', 'tẩy trắng', 'bênh vực', 'dắt mũi', 'thao túng',
    'bóc phốt', 'phốt', 'lừa tiền', 'ăn chặn', 'húp', 'lật mặt', 'giả trân',

    // --- Giao tiếp chung & Cảm xúc cơ bản ---
    'tốt', 'tuyệt vời', 'hay', 'xuất sắc', 'đỉnh', 'đẹp', 'ngon', 'xịn', 
    'thích', 'tuyệt', 'hợp lý', 'cảm ơn', 'ủng hộ', 'tuyệt hảo', 'haha',
    'ok', 'okee', 'oke', 'ổn', 'chất lượng', 'giỏi', 'đúng', 'chuẩn', '10 điểm',
    'uy tín', 'xịn xò', 'giá tốt', 'rẻ', 'tuyệt tác', 'đồng tình', 'nhất trí',
    'tuyệt cú mèo', 'đỉnh của chóp', 'mãi đỉnh', '10 đ', 'tuyệt cú', 'quá đã',
    'xuất thần', 'number one', 'số 1', 'hết sảy', 'hết sẩy', 'rất thích',
    'đúng ý', 'perfect', 'tuyệt đối', 'chim ưng', 'bá cháy', 'quá khen',
    'chính xác', 'công nhận', 'rất đúng', 'đáng tiền', 'đáng đồng tiền', 'đáng khen',
    'yêu', 'thương', 'quý', 'chúc mừng', 'hên', 'may mắn', 'vui', 'sướng', 
    'thoả mãn', 'thích quá', 'ghiền', 'quá tuyệt', 'không thể chê', 'ưng ý',
    'hoàn hảo', 'xuất chúng', 'trên cả tuyệt vời', 'vui vẻ', 'tự hào', 'hạnh phúc',

    // --- Ngôn từ Gen Z / Teen Slang ---
    'keo lỳ', 'tái châu', 'chấn bé đù', 'mận', 'mận chát', 'hết nước chấm', 
    'đỉnh kout', 'cháy', 'cháy phố', 'xịn xò con bò', '10 điểm không có nhưng', 
    'over hợp', 'dính', 'bấn', 'u mê', 'mê chữ ê kéo dài', 'flex', 'đỉnh chóp',
    'mãi keo', 'đỉnh cao', 'slay', 'cuốn', 'dễ thương xỉu', 'cưng xỉu', 
    'hết sẩy con bà bảy', 'chóp', 'ngầu', 'xức sắc',

    // --- Phương ngữ Miền Tây / Local Slang ---
    'nhức nách', 'ngon bá cháy', 'ngọt ngay', 'đã bớ trớn', 'ngon lành cành đào', 
    'ngon dở dang', 'bén', 'ngon ác', 'ngon lành', 'quá êm', 'êm ru', 'sướng rơn',
    'mát trời ông địa', 'đã ngứa', 'quá xá đã', 'ngọt xớt', 'bá phát', 'tới công chuyện',

    // --- Thương mại điện tử / Mua sắm (Gia dụng, Thời trang) ---
    'đẹp lắm', 'vải đẹp', 'giao hàng nhanh', 'shop nhiệt tình', 'tư vấn tốt',
    'form đẹp', 'mặc mát', 'đúng hình', 'đóng gói cẩn thận', 'shipper dễ thương',
    'chuẩn auth', 'chính hãng', 'sẽ mua lại', 'sẽ quay lại', 'đáng mua', 
    'nhân viên dễ thương', 'phục vụ chu đáo', 'không gian đẹp', 'nước ngon',
    'chuẩn size', 'mẫu xinh', 'chất vải mềm', 'đường may đẹp', 'dày dặn',
    'hàng đẹp', 'giao hỏa tốc', 'đóng gói kỹ', 'cẩn thận', 'uy tín nha shop',

    // --- F&B (Nhà hàng, Quán ăn, Đồ uống) ---
    'ăn ngon', 'vừa miệng', 'đậm đà', 'tươi', 'sạch sẽ', 'rẻ mà chất lượng',
    'nước dùng ngon', 'đồ ăn nóng hổi', 'nêm nếm vừa vặn', 'đồ ăn nhiều', 
    'topping ngập tràn', 'quán sạch', 'decor đẹp', 'view xịn', 'không gian chill',
    
    // --- Spa / Làm đẹp / Mỹ phẩm ---
    'mướt', 'mịn', 'trắng', 'thơm', 'thơm xỉu', 'sáng da', 'mờ thâm', 'nhẹ dịu', 
    'không kích ứng', 'bác sĩ mát tay', 'làm kỹ', 'mùi dễ chịu', 'thấm nhanh',
    'căng bóng', 'hiệu quả', 'cải thiện rõ', 'sạch mụn', 'nhân viên làm êm',

    // --- Công nghệ / Dịch vụ / SaaS ---
    'mượt', 'pin trâu', 'chụp hình đẹp', 'chụp đẹp', 'âm thanh hay', 
    'chạy êm', 'không giật lag', 'dễ sử dụng', 'bảo mật tốt', 'giao diện đẹp',
    'tính năng hay', 'bảo hành tốt', 'chăm sóc khách hàng tốt', 'support nhiệt tình',
    'giải quyết nhanh', 'xử lý nhanh', 'tiện lợi', 'đa năng', 'cấu hình mạnh',
    'dịch vụ ok', 'đường truyền ổn định', 'nhân viên kỹ thuật nhiệt tình',

    // --- Giải trí / Media / Content Creator ---
    'clip hay', 'video ý nghĩa', 'nhạc cuốn', 'giọng hay', 'content mặn',
    'edit xịn', 'góc quay đẹp', 'nội dung bổ ích', 'hài hước', 'mặn mòi',
    'duyên', 'kịch bản hay', 'cười đau bụng', 'ý nghĩa', 'truyền cảm hứng',
    'kênh hay', 'sub ngay', '1 like', 'triệu like', 'quá chất', 'xem bánh cuốn',
    'giải trí', 'thư giãn', 'diễn hay', 'chất xám',

    // --- Bất động sản / Đầu tư / Tài chính ---
    'sinh lời', 'vị trí đẹp', 'tiềm năng', 'pháp lý chuẩn', 'thanh khoản cao', 
    'view đẹp', 'chủ đầu tư uy tín', 'tiện ích tốt', 'giá hợp lý', 'chốt lời',
    'bắt đáy', 'lợi nhuận cao', 'lãi to', 'dự án đẹp', 'phong thủy tốt'
  ],
  NEGATIVE: [

    // --- Chứng khoán / Đầu tư (Tiêu cực / Lái / Thổi / Bơm tin / Úp bô) ---
    'lái', 'thổi giá', 'bơm tin', 'lùa gà', 'úp bô', 'úp sọt', 'thoát hàng', 'xả hàng', 
    'bán tháo', 'sập', 'sàn', 'múa bên trăng', 'lau sàn', 'cháy tài khoản', 'call margin', 
    'force sell', 'đu đỉnh', 'kẹp hàng', 'cắt lỗ', 'chia đôi', 'thua lỗ', 'lừa đảo', 
    'đội lái', 'phím hàng đểu', 'làm giá', 'thao túng giá', 'tin đồn', 'vỡ nợ', 'bắt bớ', 
    'thao túng', 'bẫy tăng giá', 'bulltrap', 'downtrend', 'tiêu cực', 'sợ hãi',

    // --- Drama / Bóc phốt / Xã hội ---
    'nhập kho', 'bóc lịch', 'chạy sớm', 'rửa ráy', 'rửa tiền', 'tài phiệt', 
    'vào mà húp', 'vào mà bênh', 'tẩy trắng', 'bênh', 'dắt mũi', 'thao túng',
    'bóc phốt', 'phốt', 'lừa tiền', 'ăn chặn', 'húp', 'lật mặt', 'giả trân',
    'bợ đít', 'seeder', 'dư luận viên', 'dlv', 'hít hà', 'hít drama', 'tóp tóp',

    // --- Giao tiếp chung & Cảm xúc cơ bản ---
    'tệ', 'dở', 'chán', 'kém', 'lừa đảo', 'đắt', 'xấu', 'vớ vẩn', 'ngu', 
    'tồi', 'phẫn nộ', 'đéo', 'rác', 'cút', 'dối trá', 'vãi', 'chửi', 
    'đcm', 'đm', 'vcl', 'vl', 'loz', 'lồn', 'cứt', 'bố láo', 'láo toét',
    'ảo', 'lùa gà', 'scam', 'hút máu', 'chê', 'dở tệ', 'ngáo', 'ngu dốt',
    'thất vọng', 'tẩy chay', 'vô dụng', 'cùi bắp', 'dốt', 'hãm', 'hãm lờ',
    'quá đáng', 'bất mãn', 'bực mình', 'tức giận', 'hối hận', 'kinh tởm',
    'gớm', 'bẩn', 'dơ', 'nhảm', 'nhảm nhí', 'vô lý', 'xạo', 'bốc phét', 
    'kém tắm', 'vô học', 'mất dạy', 'thảm họa', 'khinh', 'vô duyên', 'tệ hại',
    'xui', 'buồn', 'tức', 'ghét', 'giận', 'hờn', 'khổ', 'đau', 'bực', 'cáu', 
    'phiền', 'phiền phức', 'chướng mắt', 'chướng tai', 'điên', 'khùng', 
    'kinh khủng', 'ghê tởm', 'cay', 'cay cú',

    // --- Ngôn từ Gen Z / Teen Slang ---
    'ố dề', 'xà lơ', 'vô tri', 'báo', 'trầm cảm', 'cạn lời', 'chê nha', 
    'chê mạnh', 'xu cà na', 'ét o ét', 'ảo ma', 'cảm lạnh', 'ô dề',
    'đỏng đảnh', 'khó đào', 'tới công chuyện', 'xu', 'cờ cờ', 'khum',
    'thấy gớm', 'tét đầu', 'cringe', 'red flag', 'toxic',

    // --- Phương ngữ Miền Tây / Local Slang ---
    'dở ẹc', 'tào lao', 'lãng nhách', 'xạo sự', 'tàn bạo', 'ớn', 'thấy ghê', 
    'xàm', 'lầy', 'thấy bà', 'chán mớ đời', 'mắc mệt', 'tào lao bí đao',
    'trớt quớt', 'lạc nhách', 'tối thui', 'chướng', 'chướng khí', 'kỳ cục',
    'cà chớn', 'hóc búa', 'ba xàm ba láp', 'trời ơi đất hỡi', 'âm binh',

    // --- Thương mại điện tử / Mua sắm (Gia dụng, Thời trang) ---
    'giao hàng chậm', 'giao thiếu', 'shop thái độ', 'treo đầu dê bán thịt chó',
    'hàng giả', 'hàng fake', 'hàng nhái', 'kem trộn', 'form xấu', 'vải nóng',
    'đóng gói ẩu', 'hư hỏng', 'móp méo', 'không giống hình', 'sai màu', 
    'sai size', 'hàng dỏm', 'mỏng te', 'mỏng lét', 'giao nhầm', 'làm ăn chán',
    'nhắn tin không trả lời', 'bom hàng', 'boom hàng', 'không cho kiểm hàng',

    // --- F&B (Nhà hàng, Quán ăn, Đồ uống) ---
    'ăn dở', 'dở ẹc', 'nuốt không trôi', 'có dòi', 'có dị vật', 'chua loét',
    'chặt chém', 'giá chát', 'phục vụ kém', 'nhân viên thái độ', 'bắt khách đợi',
    'đợi lâu', 'không bao giờ quay lại', 'phí tiền', 'tiếc tiền', 'dịch vụ tệ',
    'đồ ăn ôi thiu', 'mùi kỳ', 'ruồi', 'tóc', 'quán dơ', 'bàn bẩn', 'đắt cắt cổ',
    
    // --- Spa / Làm đẹp / Mỹ phẩm ---
    'kích ứng', 'nổi mụn', 'ngứa', 'rát', 'dị ứng', 'bào da', 'dịch vụ dở', 
    'nhân viên vẽ vời', 'chèo kéo', 'ép mua', 'làm ẩu', 'sưng', 'bầm',
    'mùi hắc', 'bết dính', 'nặng mặt', 'phí tiền đi spa',

    // --- Công nghệ / Dịch vụ / SaaS ---
    'lag', 'giật', 'nóng máy', 'pin hẻo', 'tụt pin', 'lỗi', 'bug nhiều', 
    'sập', 'không vào được', 'load chậm', 'app lởm', 'mất kết nối',
    'support kém', 'hỗ trợ chậm', 'gọi không nghe máy', 'bảo hành tệ',
    'đem con bỏ chợ', 'trừ tiền vô lý', 'giao diện ngu', 'khó xài', 
    'tự động đăng xuất', 'bị văng', 'mất dữ liệu', 'mạng cùi',

    // --- Giải trí / Media / Content Creator ---
    'content rác', 'clip nhảm', 'câu view', 'câu like', 'làm màu', 'giả tạo',
    'diễn', 'kịch bản giả', 'đạo nhái', 'đạo ý tưởng', 'content bẩn',
    'cổ xúy', 'độc hại', 'vi phạm', 'block', 'unsub', 'hủy đăng ký', 
    'trẻ trâu', 'thiếu muối', 'lố lăng', 'phản cảm', 'lệch chuẩn', 'nghe mệt',
    'âm thanh rác', 'chói tai', 'nói nhảm',

    // --- Bất động sản / Đầu tư / Tài chính ---
    'giam vốn', 'dự án ma', 'lừa đảo bđs', 'sale láo', 'ngập nước', 'pháp lý mập mờ',
    'ôm hàng', 'kẹp hàng', 'mất trắng', 'trái phiếu lừa', 'mõm', 'lùa gà úp sọt',
    'bong bóng', 'vỡ nợ', 'treo giò'
  ]
};

class SentimentAnalyzer {
  /**
   * Tính điểm thô (base score) cho một đoạn text
   */
  /**
   * Làm sạch text: Xóa các ký tự lách luật như dấu chấm, phẩy xen giữa các chữ cái.
   * Ví dụ: "V.ãi", "b.ẩn", "h.úp", "t.ài ph.iệt" -> "vãi", "bẩn", "húp", "tài phiệt"
   */
  static normalizeText(text) {
    if (!text) return '';
    let normalized = text.toLowerCase();
    
    // Loại bỏ dấu chấm, phẩy, gạch ngang nằm GIỮA các chữ cái tiếng Việt
    // Dùng regex để tìm các ký tự không phải chữ/số xen giữa các chữ cái, và xóa chúng.
    // Lớp \p{L} match tất cả chữ cái (kể cả Unicode tiếng Việt)
    normalized = normalized.replace(/(?<=\p{L})[.,_*\-](?=\p{L})/gu, '');
    
    // Thu gọn nhiều khoảng trắng thành 1
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  static getBaseScore(text) {
    if (!text) return 0;
    const lowerText = this.normalizeText(text);
    let score = 0;
    
    // Quick keyword matching
    for (const kw of SENTIMENT_KEYWORDS.POSITIVE) {
      if (lowerText.includes(kw)) score += 1.0;
    }
    
    for (const kw of SENTIMENT_KEYWORDS.NEGATIVE) {
      if (lowerText.includes(kw)) score -= 1.5; // Phạt nặng hơn với từ tiêu cực rõ ràng
    }
    
    return score;
  }

  /**
   * Đánh giá toàn bộ comment trong 1 job
   * @param {Object} jobData - Dữ liệu job.resultData (chứa post và comments)
   */
  static analyze(jobData) {
    if (!jobData || !jobData.comments) return null;
    
    const postText = jobData.post?.text || '';
    const comments = jobData.comments;
    
    // 1. Tính ngữ cảnh của Post
    const postScore = this.getBaseScore(postText);
    
    let stats = {
      POSITIVE: 0,
      NEGATIVE: 0,
      NORMAL: 0
    };

    const parentScores = {};

    // 2. Phân tích Top-level comments
    comments.forEach(c => {
      let score = this.getBaseScore(c.text);
      
      // Ngữ cảnh post tác động nhẹ nếu comment đang ở ranh giới Neutral
      if (score === 0) {
        if (postScore > 3) score += 0.2;
        if (postScore < -3) score -= 0.2;
      }
      
      c._sentimentScore = score;
      parentScores[c.id || c.uniqueSignature] = score;
    });

    // 3. Phân tích Replies (Kết hợp ngữ cảnh comment cha)
    comments.forEach(c => {
      if (c.replies && Array.isArray(c.replies)) {
        c.replies.forEach(r => {
          let rScore = this.getBaseScore(r.text);
          const pScore = parentScores[c.id || c.uniqueSignature] || 0;
          
          // Phản hồi thừa hưởng 30% sắc thái của bình luận cha nếu bản thân nó không rõ ràng
          if (rScore === 0 && pScore !== 0) {
            rScore += pScore * 0.3;
          }
          r._sentimentScore = rScore;
        });
      }
    });

    // 4. Mark kết quả và thống kê
    const classify = (c) => {
      let type = 'NORMAL';
      // Ngưỡng >= 0.5 là tích cực, <= -0.5 là tiêu cực
      if (c._sentimentScore >= 0.5) type = 'POSITIVE';
      else if (c._sentimentScore <= -0.5) type = 'NEGATIVE';
      
      c.sentiment = type;
      stats[type]++;
      
      if (c.replies) {
        c.replies.forEach(classify);
      }
    };

    comments.forEach(classify);

    // Xóa biến tạm
    const cleanup = (c) => {
      delete c._sentimentScore;
      if (c.replies) c.replies.forEach(cleanup);
    };
    comments.forEach(cleanup);

    jobData.sentimentStats = stats;
    return stats;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.SentimentAnalyzer = SentimentAnalyzer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SentimentAnalyzer;
}
