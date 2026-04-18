import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import CompanyConfig from '../components/CompanyConfig';
import ProductForm from '../components/ProductForm';
import ResultTabs from '../components/ResultTabs';
import HistoryDropdown from '../components/HistoryDrop';
import { callOpenAI, extractTextFromImage } from '../services/openaiService';
import { generateWebsitePrompt, generateYouTubePrompt, generateFacebookPrompt, generateTiktokPrompt } from '../utils/promptTemplates';
import { predefinedCompanies } from '../utils/companyData';

export default function AISEO() {
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [companyInfo, setCompanyInfo] = useState(predefinedCompanies[0].details);
  const [keywords, setKeywords] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    website: true,
    youtube: true,
    facebook: true,
    tiktok: true
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
      alert('Vui lòng nhập tên sản phẩm!');
      return;
    }

    setIsLoading(true);
    const apiCalls = [];
    const keys = [];

    if (selectedPlatforms.website) {
      apiCalls.push(callOpenAI(generateWebsitePrompt(productName, specs, companyInfo, keywords, imageUrls)));
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
      const responses = await Promise.all(apiCalls);
      const newResults = { website: '', youtube: '', facebook: '', tiktok: '' };
      keys.forEach((key, index) => {
        newResults[key] = responses[index];
      });

      setResults(newResults);

      const newItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
        productName,
        specs,
        companyInfo,
        keywords,
        imageUrls,
        selectedPlatforms,
        results: newResults
      };

      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      sessionStorage.setItem('seo_content_history', JSON.stringify(updatedHistory));
    } catch (error) {
      alert('Đã xảy ra lỗi khi tạo nội dung. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistory = (historyId) => {
    const selectedItem = history.find(item => item.id === historyId);
    if (selectedItem) {
      setProductName(selectedItem.productName);
      setSpecs(selectedItem.specs);
      setKeywords(selectedItem.keywords || '');
      setImageUrls(selectedItem.imageUrls || '');
      setCompanyInfo(selectedItem.companyInfo);
      setResults(selectedItem.results);
      if (selectedItem.selectedPlatforms) {
        setSelectedPlatforms(selectedItem.selectedPlatforms);
      }
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageUpload = async (file) => {
    setIsExtracting(true);
    try {
      const base64Image = await convertToBase64(file);
      const extractedText = await extractTextFromImage(base64Image);
      setKeywords(prev => prev ? `${prev}, ${extractedText}` : extractedText);
    } catch (error) {
      alert(error.message || 'Lỗi khi trích xuất chữ từ ảnh!');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="bg-light min-vh-100 pb-5">
      <div className="container">
        <HistoryDropdown history={history} onSelectHistory={handleSelectHistory} />

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
              keywords={keywords}
              setKeywords={setKeywords}
              imageUrls={imageUrls}
              setImageUrls={setImageUrls}
              onImageUpload={handleImageUpload}
              isExtracting={isExtracting}
              onGenerate={handleGenerate}
              isLoading={isLoading}
              selectedPlatforms={selectedPlatforms}
              setSelectedPlatforms={setSelectedPlatforms}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-12">
            <ResultTabs results={results} />
          </div>
        </div>
      </div>
    </div>
  );
}
