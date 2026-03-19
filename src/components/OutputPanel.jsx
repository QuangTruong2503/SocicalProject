import React, { useState, useRef } from 'react';
import { marked } from 'marked';

export default function OutputPanel({ content }) {
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);

  // Parse Markdown từ AI sang định dạng HTML
  const htmlContent = content ? marked.parse(content) : '';

  // Nhúng CSS vào bên trong Iframe để giao diện đồng bộ với Bootstrap bên ngoài
  const iframeStyle = `
    <style>
      body {
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 1rem;
        line-height: 1.6;
        color: #212529;
        padding: 1rem;
        margin: 0;
        word-wrap: break-word;
      }
      h1, h2, h3 { color: #0d6efd; margin-top: 1rem; margin-bottom: 0.5rem; }
      ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
      p { margin-bottom: 1rem; }
      strong { font-weight: bold; color: #000; }
      /* Tùy chỉnh thanh cuộn cho đẹp */
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
    </style>
  `;

  // Cấu trúc HTML hoàn chỉnh đưa vào Iframe (bật contenteditable để cho phép edit)
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>${iframeStyle}</head>
      <body contenteditable="true">${htmlContent}</body>
    </html>
  `;

  const handleCopy = () => {
    if (!iframeRef.current) return;
    try {
      // Lấy document bên trong iframe
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
      
      // Tạo vùng chọn bôi đen toàn bộ nội dung trong iframe
      const range = iframeDoc.createRange();
      range.selectNodeContents(iframeDoc.body);
      const selection = iframeDoc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Thực thi lệnh copy (giữ nguyên định dạng Rich Text)
      iframeDoc.execCommand('copy');
      
      // Xóa vùng bôi đen sau khi copy xong
      selection.removeAllRanges();

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Lỗi khi copy từ iframe:', err);
      alert('Trình duyệt không hỗ trợ copy tự động. Vui lòng bôi đen và nhấn Ctrl+C.');
    }
  };

  if (!content) return <div className="text-muted fst-italic p-3">Chưa có nội dung. Hãy điền thông tin và bấm tạo!</div>;

  return (
    <div className="position-relative">
      <button 
        className={`btn btn-sm position-absolute top-0 end-0 m-2 ${copied ? 'btn-success' : 'btn-primary shadow-sm'}`}
        style={{ zIndex: 10 }}
        onClick={handleCopy}
      >
        {copied ? '✅ Đã copy định dạng' : '📋 Copy (Giữ Format)'}
      </button>
      
      <div className="bg-light rounded border border-primary-subtle" style={{ height: '500px', overflow: 'hidden' }}>
        <iframe
          ref={iframeRef}
          srcDoc={fullHtml}
          title="Output Editor"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
      
      <small className="text-muted mt-2 d-block">
        <i className="bi bi-pencil-square me-1"></i>
        * Mẹo: Bạn có thể click trực tiếp vào khung trên để chỉnh sửa chữ trước khi Copy.
      </small>
    </div>
  );
}