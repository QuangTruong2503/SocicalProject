import React, { useState } from 'react';
import Header from './components/Header.jsx';
import ProductForm from './components/ProductForm.jsx';
import CompanyConfig from './components/CompanyConfig.jsx';
import ResultTabs from './components/ResultTabs.jsx';
import { callOpenAI } from './services/openaiService';
import { generateWebsitePrompt, generateYouTubePrompt, generateFacebookPrompt } from './utils/promptTemplates';

export default function App() {
  // State quản lý Input
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [companyInfo, setCompanyInfo] = useState('CÔNG TY TNHH THƯƠNG MẠI MÁY MÓC MINH TÂM\nĐịa chỉ: Số 83 Đường Ao Đôi, Phường Bình Trị Đông, Thành phố Hồ Chí Minh\nHotline: 0902.988.539\nWebsite: www.nppminhtam.com');
  
  // State quản lý Output & Loading
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState({
    website: '',
    youtube: '',
    facebook: ''
  });

  const handleGenerate = async () => {
    if (!productName.trim()) {
      alert("Vui lòng nhập tên sản phẩm!");
      return;
    }

    setIsLoading(true);
    
    // Khởi tạo 3 prompts
    const promptWeb = generateWebsitePrompt(productName, specs, companyInfo);
    const promptYT = generateYouTubePrompt(productName, specs, companyInfo);
    const promptFB = generateFacebookPrompt(productName, specs, companyInfo);

    try {
      // Chạy song song 3 API calls để tiết kiệm thời gian
      const [resWeb, resYT, resFB] = await Promise.all([
        callOpenAI(promptWeb),
        callOpenAI(promptYT),
        callOpenAI(promptFB)
      ]);

      setResults({
        website: resWeb,
        youtube: resYT,
        facebook: resFB
      });
    } catch (error) {
      alert("Đã xảy ra lỗi khi tạo nội dung. Xem console để biết chi tiết.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-light min-vh-100 pb-5">
      <Header />
      <div className="container">
        <div className="row">
          {/* Cột Trái: Nhập liệu */}
          <div className="col-lg-5">
            <CompanyConfig 
              companyInfo={companyInfo} 
              setCompanyInfo={setCompanyInfo} 
            />
            <ProductForm 
              productName={productName}
              setProductName={setProductName}
              specs={specs}
              setSpecs={setSpecs}
              onGenerate={handleGenerate}
              isLoading={isLoading}
            />
          </div>
          
          {/* Cột Phải: Kết quả */}
          <div className="col-lg-7">
            <ResultTabs results={results} />
          </div>
        </div>
      </div>
    </div>
  );
}