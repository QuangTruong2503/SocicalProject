import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CompanyConfig from './components/CompanyConfig';
import ProductForm from './components/ProductForm';
import ResultTabs from './components/ResultTabs';
import HistoryDropdown from './components/HistoryDropDown.jsx';
import { callOpenAI } from './services/openaiService';
import { generateWebsitePrompt, generateYouTubePrompt, generateFacebookPrompt } from './utils/promptTemplates';
import { predefinedCompanies } from './utils/companyData';

export default function App() {
  // State quản lý Input
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [companyInfo, setCompanyInfo] = useState(predefinedCompanies[0].details);
  
  // State quản lý Output & Loading
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState({
    website: '',
    youtube: '',
    facebook: ''
  });

  // State quản lý Lịch sử
  const [history, setHistory] = useState([]);

  // Hook: Đọc lịch sử từ Session Storage khi ứng dụng vừa load
  useEffect(() => {
    const savedHistory = sessionStorage.getItem('seo_content_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Hàm tạo nội dung bằng OpenAI
  const handleGenerate = async () => {
    if (!productName.trim()) {
      alert("Vui lòng nhập tên sản phẩm!");
      return;
    }

    setIsLoading(true);
    
    const promptWeb = generateWebsitePrompt(productName, specs, companyInfo);
    const promptYT = generateYouTubePrompt(productName, specs);
    const promptFB = generateFacebookPrompt(productName, specs, companyInfo);

    try {
      const [resWeb, resYT, resFB] = await Promise.all([
        callOpenAI(promptWeb),
        callOpenAI(promptYT),
        callOpenAI(promptFB)
      ]);

      const newResults = {
        website: resWeb,
        youtube: resYT,
        facebook: resFB
      };

      setResults(newResults);

      // --- LOGIC LƯU LỊCH SỬ ---
      // Tạo object lưu trữ đầy đủ Input và Output của phiên bản này
      const newItem = {
        id: Date.now().toString(), // ID duy nhất dựa trên thời gian
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
        productName,
        specs,
        companyInfo,
        results: newResults
      };
      
      // Đưa item mới lên đầu mảng lịch sử
      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      
      // Lưu mảng mới vào Session Storage
      sessionStorage.setItem('seo_content_history', JSON.stringify(updatedHistory));

    } catch (error) {
      alert("Đã xảy ra lỗi khi tạo nội dung. Xem console để biết chi tiết.");
    } finally {
      setIsLoading(false);
    }
  };

  // Hàm xử lý khi người dùng chọn một mục trong Dropbox lịch sử
  const handleSelectHistory = (historyId) => {
    const selectedItem = history.find(item => item.id === historyId);
    if (selectedItem) {
      // Phục hồi lại toàn bộ State tương ứng với mục lịch sử đó
      setProductName(selectedItem.productName);
      setSpecs(selectedItem.specs);
      setCompanyInfo(selectedItem.companyInfo);
      setResults(selectedItem.results);
    }
  };

  return (
    <div className="bg-light min-vh-100 pb-5">
      <Header />
      <div className="container">
        
        {/* Dropdown Lịch sử */}
        <HistoryDropdown 
          history={history} 
          onSelectHistory={handleSelectHistory} 
        />

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