import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import seoprompt from '../asset/SKPrompt.txt?raw';
import '../styles/SEOKeywords.css';

export default function SEOKeywords() {
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generateKeywords = async (e) => {
    e.preventDefault();

    if (!productName.trim() || !specs.trim()) {
      setError('Vui lòng nhập tên sản phẩm và thông số kỹ thuật');
      return;
    }

    setLoading(true);
    setError('');
    setKeywords(null);

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error('API key không được cấu hình. Vui lòng kiểm tra file .env');
      }
      
        

      const prompt = seoprompt
        .replace(/\$\{productName\}/g, productName.trim())
        .replace(/\$\{specs\}/g, specs.trim());

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi khi gọi OpenAI API');
      }

      const data = await response.json();
      const keywordString = data.choices[0].message.content.trim();

      // Parse keywords
      const keywordList = keywordString
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      setKeywords({
        raw: keywordString,
        list: keywordList,
        count: keywordList.length,
      });
    } catch (err) {
      setError(err.message || 'Đã xảy ra lỗi. Vui lòng thử lại.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadKeywords = () => {
    if (!keywords) return;

    const element = document.createElement('a');
    const file = new Blob([keywords.raw], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `keywords-${productName.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const clearForm = () => {
    setProductName('');
    setSpecs('');
    setKeywords(null);
    setError('');
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <>
      <Helmet>
        <title>SEO Keywords Generator - AISEO</title>
        <meta name="description" content="Tạo từ khóa SEO tối ưu cho sản phẩm của bạn bằng AI" />
      </Helmet>

      <div className="seo-container">
        {/* Background decoration */}
        <div className="seo-bg-decoration">
          <div className="decoration-blob-1"></div>
          <div className="decoration-blob-2"></div>
          <div className="decoration-grid"></div>
        </div>

        {/* Header */}
        <section className="seo-header">
          <div className="seo-header-content">
            <div className="seo-icon-wrapper">🔍</div>
            <h1 className="seo-title">SEO Keywords Generator</h1>
            <p className="seo-subtitle">
              Tạo từ khóa SEO toàn diện cho sản phẩm của bạn bằng AI
            </p>
          </div>
        </section>

        {/* Main Content */}
        <section className="seo-content">
          <div className="seo-grid">
            {/* Form Section */}
            <div className="seo-form-section">
              <div className="form-wrapper">
                <h2 className="form-title">Nhập Thông Tin Sản Phẩm</h2>

                <form onSubmit={generateKeywords} className="seo-form">
                  {/* Product Name Input */}
                  <div className="form-group">
                    <label htmlFor="productName" className="form-label">
                      <span className="label-text">Tên Sản Phẩm</span>
                      <span className="label-required">*</span>
                    </label>
                    <input
                      id="productName"
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ví dụ: Laptop Dell XPS 13"
                      className="form-input"
                      disabled={loading}
                    />
                    <p className="form-hint">
                      Nhập tên sản phẩm, mã sản phẩm hoặc nhãn hiệu
                    </p>
                  </div>

                  {/* Specs Input */}
                  <div className="form-group">
                    <label htmlFor="specs" className="form-label">
                      <span className="label-text">Thông Số Kỹ Thuật</span>
                      <span className="label-required">*</span>
                    </label>
                    <textarea
                      id="specs"
                      value={specs}
                      onChange={(e) => setSpecs(e.target.value)}
                      placeholder="Ví dụ: Intel Core i7, 16GB RAM, 512GB SSD, Màn hình 13.3 inch FHD"
                      className="form-textarea"
                      rows="5"
                      disabled={loading}
                    />
                    <p className="form-hint">
                      Nhập chi tiết kỹ thuật, đặc điểm, lợi ích của sản phẩm
                    </p>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="error-message">
                      <span className="error-icon">⚠️</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn-generate"
                      disabled={loading || !productName.trim() || !specs.trim()}
                    >
                      {loading ? (
                        <>
                          <span className="spinner"></span>
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          <span className="btn-icon">✨</span>
                          Tạo Từ Khóa
                        </>
                      )}
                    </button>

                    {(productName || specs) && (
                      <button
                        type="button"
                        onClick={clearForm}
                        className="btn-clear"
                        disabled={loading}
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </form>

                {/* Info Box */}
                <div className="info-box">
                  <div className="info-icon">ℹ️</div>
                  <div className="info-content">
                    <h4>Mẹo Sử Dụng</h4>
                    <ul className="info-list">
                      <li>Cung cấp tên sản phẩm chính xác nhất</li>
                      <li>Liệt kê tất cả các thông số kỹ thuật quan trọng</li>
                      <li>Nêu rõ lợi ích và ứng dụng của sản phẩm</li>
                      <li>Từ khóa sẽ được phân loại thành 3 nhóm</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Section */}
            {keywords && (
              <div className="seo-results-section">
                <div className="results-wrapper">
                  <div className="results-header">
                    <h2 className="results-title">Từ Khóa SEO</h2>
                    <div className="results-stats">
                      <div className="stat">
                        <span className="stat-label">Tổng cộng</span>
                        <span className="stat-value">{keywords.count}</span>
                      </div>
                    </div>
                  </div>

                  {/* Keywords Display */}
                  <div className="keywords-display">
                    <div className="keywords-box">
                      <div className="keywords-text">{keywords.raw}</div>
                      <button
                        onClick={() => copyToClipboard(keywords.raw)}
                        className="btn-copy"
                        title="Copy to clipboard"
                      >
                        {copied ? '✓ Đã sao chép' : '📋 Sao chép'}
                      </button>
                    </div>
                  </div>

                  {/* Keywords List */}
                  <div className="keywords-list-section">
                    <h3 className="keywords-list-title">Danh Sách Chi Tiết</h3>
                    <div className="keywords-list">
                      {keywords.list.map((keyword, index) => (
                        <div key={index} className="keyword-item">
                          <span className="keyword-number">{index + 1}</span>
                          <span className="keyword-text">{keyword}</span>
                          <button
                            onClick={() => copyToClipboard(keyword)}
                            className="keyword-copy-btn"
                            title="Copy keyword"
                          >
                            📋
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="results-actions">
                    <button
                      onClick={downloadKeywords}
                      className="btn-download"
                    >
                      <span className="btn-icon">📥</span>
                      Tải Xuống
                    </button>
                    <button
                      onClick={() => {
                        clearForm();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="btn-new"
                    >
                      <span className="btn-icon">➕</span>
                      Tạo Mới
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Empty State */}
        {!keywords && !loading && (
          <section className="seo-empty-state">
            <div className="empty-state-content">
              <div className="empty-state-icon">🎯</div>
              <h3>Chưa có từ khóa</h3>
              <p>Nhập thông tin sản phẩm và nhấn "Tạo Từ Khóa" để bắt đầu</p>
            </div>
          </section>
        )}

        {/* Loading State */}
        {loading && (
          <section className="seo-loading-state">
            <div className="loading-content">
              <div className="loading-animation">
                <div className="loading-circle"></div>
                <div className="loading-circle"></div>
                <div className="loading-circle"></div>
              </div>
              <h3>Đang tạo từ khóa...</h3>
              <p>AI đang phân tích thông tin sản phẩm của bạn</p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}