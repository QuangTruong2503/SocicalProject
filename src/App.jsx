import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CompanyConfig from './components/CompanyConfig';
import ProductForm from './components/ProductForm';
import ResultTabs from './components/ResultTabs';
import HistoryDropdown from './components/HistoryDrop';
import { callOpenAI, extractTextFromImage } from './services/openaiService';
import { generateWebsitePrompt, generateYouTubePrompt, generateFacebookPrompt, generateTiktokPrompt } from './utils/promptTemplates';
import { predefinedCompanies } from './utils/companyData';

export default function App() {
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [companyInfo, setCompanyInfo] = useState(predefinedCompanies[0].details);
  const [keywords, setKeywords] = useState(''); // State mới cho từ khóa
  const [isExtracting, setIsExtracting] = useState(false); // Trạng thái đang đọc ảnh
  
  // State quản lý Checkbox
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    website: true,
    youtube: true,
    facebook: true,
    tiktok: true // Mặc định chọn cả 4
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState({
    website: '',
    youtube: '',
    facebook: '',
    tiktok: ''
  });

  const [history, setHistory] = useState([]);

  useEffect(() => {
    const savedHistory = sessionStorage.getItem('seo_content_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const handleGenerate = async () => {
    if (!productName.trim()) {
      alert("Vui lòng nhập tên sản phẩm!");
      return;
    }

    setIsLoading(true);
    
    // Mảng lưu trữ các tác vụ gọi API song song
    const apiCalls = [];
    const keys = [];

    // Chỉ đưa vào mảng gọi API nếu checkbox được chọn
    if (selectedPlatforms.website) {
      apiCalls.push(callOpenAI(generateWebsitePrompt(productName, specs, companyInfo)));
      keys.push('website');
    }
    if (selectedPlatforms.youtube) {
      apiCalls.push(callOpenAI(generateYouTubePrompt(productName, specs, companyInfo, keywords)));
      keys.push('youtube');
    }
    if (selectedPlatforms.facebook) {
      apiCalls.push(callOpenAI(generateFacebookPrompt(productName, specs, companyInfo)));
      keys.push('facebook');
    }
    if (selectedPlatforms.tiktok) {
      apiCalls.push(callOpenAI(generateTiktokPrompt(productName, specs)));
      keys.push('tiktok');
    }

    try {
      // Thực thi đồng loạt các API cần thiết
      const responses = await Promise.all(apiCalls);
      
      // Tạo object kết quả mới (các nền tảng không được chọn sẽ trả về chuỗi rỗng)
      const newResults = { website: '', youtube: '', facebook: '', tiktok: '' };
      keys.forEach((key, index) => {
        newResults[key] = responses[index];
      });

      setResults(newResults);

      // Lưu lịch sử
      const newItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
        productName,
        specs,
        companyInfo,
        selectedPlatforms, // Lưu lại cả cấu hình nền tảng lúc tạo
        results: newResults
      };
      
      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      sessionStorage.setItem('seo_content_history', JSON.stringify(updatedHistory));

    } catch (error) {
      alert("Đã xảy ra lỗi khi tạo nội dung. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistory = (historyId) => {
    const selectedItem = history.find(item => item.id === historyId);
    if (selectedItem) {
      setProductName(selectedItem.productName);
      setSpecs(selectedItem.specs);
      setKeywords(selectedItem.keywords || ''); // Phục hồi từ khóa
      setCompanyInfo(selectedItem.companyInfo);
      setResults(selectedItem.results);
      if (selectedItem.selectedPlatforms) {
        setSelectedPlatforms(selectedItem.selectedPlatforms);
      }
    }
  };

  // Hàm chuyển file ảnh sang dạng Base64 để gửi lên OpenAI
  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // Hàm xử lý khi người dùng dán/tải ảnh lên
  const handleImageUpload = async (file) => {
    setIsExtracting(true);
    try {
      const base64Image = await convertToBase64(file);
      const extractedText = await extractTextFromImage(base64Image);
      
      // Nếu ô từ khóa đã có sẵn chữ, thì thêm dấu phẩy nối tiếp vào
      setKeywords(prev => prev ? `${prev}, ${extractedText}` : extractedText);
    } catch (error) {
      alert(error.message || "Lỗi khi trích xuất chữ từ ảnh!");
    } finally {
      setIsExtracting(false);
    }
  };
  return (
    <div className="bg-light min-vh-100 pb-5">
      <Header />
      <div className="container">
        
        <HistoryDropdown history={history} onSelectHistory={handleSelectHistory} />

        {/* BỐ CỤC MỚI: HÀNG 1 - Khu vực Nhập liệu (chia làm 2 cột) */}
        <div className="row mb-3">
          <div className="col-lg-5">
            <CompanyConfig 
              companyInfo={companyInfo} 
              setCompanyInfo={setCompanyInfo} 
            />
          </div>
          <div className="col-lg-7">
            <ProductForm 
              productName={productName}
              setProductName={setProductName}
              specs={specs}
              setSpecs={setSpecs}
              keywords={keywords}               // Truyền state mới
              setKeywords={setKeywords}
              onImageUpload={handleImageUpload} // Truyền hàm xử lý ảnh
              isExtracting={isExtracting}       // Truyền trạng thái loading ảnh
              onGenerate={handleGenerate}
              isLoading={isLoading}
              selectedPlatforms={selectedPlatforms}
              setSelectedPlatforms={setSelectedPlatforms}
            />
          </div>
        </div>
        
        {/* BỐ CỤC MỚI: HÀNG 2 - Khu vực Kết quả (Dàn ngang full width) */}
        <div className="row">
          <div className="col-12">
            <ResultTabs results={results} />
          </div>
        </div>

      </div>
    </div>
  );
}