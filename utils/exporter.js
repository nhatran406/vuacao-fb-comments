/**
 * Exporter Module: handles exporting crawled data to JSON and CSV (with UTF-8 BOM)
 * Supports nested hierarchical comments and child replies
 */

const Exporter = {
  /**
   * Generates a clean safe filename based on post author and timestamp
   */
  generateFilename(postData, ext = 'json') {
    const author = (postData?.author || 'fb_post')
      .toLowerCase()
      .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/gi, '')
      .replace(/\s+/g, '_')
      .slice(0, 30);
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
    return `fb_comments_${author}_${date}_${time}.${ext}`;
  },

  /**
   * Export to JSON and trigger download
   */
  exportJSON(dataset, customFilename) {
    const filename = customFilename || this.generateFilename(dataset.post, 'json');
    const jsonString = JSON.stringify(dataset, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    this.triggerDownload(blob, filename);
  },

  /**
   * Export to CSV with UTF-8 BOM for perfect Excel / Sheets Vietnamese display
   */
  exportCSV(dataset, customFilename) {
    const filename = customFilename || this.generateFilename(dataset.post, 'csv');

    // CSV Headers
    const headers = [
      'Type',
      'Level',
      'Comment_ID',
      'Parent_ID',
      'Parent_Author',
      'Author_Name',
      'Author_Profile_URL',
      'Time_Text',
      'Content',
      'Reactions_Count',
      'Media_Type',
      'Media_URL',
      'Post_URL'
    ];

    const rows = [];

    // Helper to escape CSV cell
    const escapeCell = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const post = dataset.post || {};
    const postUrl = post.url || (typeof window !== 'undefined' ? window.location.href : '');

    // 1. Post Row
    rows.push([
      escapeCell('POST'),
      escapeCell('0'),
      escapeCell(post.id || 'post_main'),
      escapeCell(''),
      escapeCell(''),
      escapeCell(post.author || ''),
      escapeCell(post.authorUrl || ''),
      escapeCell(post.time || ''),
      escapeCell(post.text || ''),
      escapeCell(post.reactions || ''),
      escapeCell(post.mediaUrls?.length ? 'media' : ''),
      escapeCell((post.mediaUrls || []).join(' ; ')),
      escapeCell(postUrl)
    ].join(','));

    // 2. Comments & Nested Replies Rows
    const threads = dataset.comments || [];
    threads.forEach(parentComment => {
      const cPostUrl = parentComment.postUrl || postUrl;
      // Parent Comment Row
      rows.push([
        escapeCell('COMMENT'),
        escapeCell('1'),
        escapeCell(parentComment.id || ''),
        escapeCell(''),
        escapeCell(''),
        escapeCell(parentComment.author || ''),
        escapeCell(parentComment.authorUrl || ''),
        escapeCell(parentComment.time || ''),
        escapeCell(parentComment.text || ''),
        escapeCell(parentComment.reactions || '0'),
        escapeCell(parentComment.mediaType || ''),
        escapeCell(parentComment.mediaUrl || ''),
        escapeCell(cPostUrl)
      ].join(','));

      // Nested Child Replies
      if (Array.isArray(parentComment.replies)) {
        parentComment.replies.forEach(reply => {
          rows.push([
            escapeCell('REPLY'),
            escapeCell('2'),
            escapeCell(reply.id || ''),
            escapeCell(parentComment.id || ''),
            escapeCell(parentComment.author || ''),
            escapeCell(reply.author || ''),
            escapeCell(reply.authorUrl || ''),
            escapeCell(reply.time || ''),
            escapeCell(reply.text || ''),
            escapeCell(reply.reactions || '0'),
            escapeCell(reply.mediaType || ''),
            escapeCell(reply.mediaUrl || ''),
            escapeCell(reply.postUrl || cPostUrl)
          ].join(','));
        });
      }
    });

    // UTF-8 BOM (\uFEFF) ensures Excel opens Vietnamese accents properly without mojibake
    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, filename);
  },

  /**
   * Copies formatted JSON to system clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  },

  /**
   * Helper to trigger file download in browser
   */
  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

// Export for ES modules or global window in content script
if (typeof window !== 'undefined') {
  window.FBExporter = Exporter;
  window.Exporter = Exporter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Exporter;
}
