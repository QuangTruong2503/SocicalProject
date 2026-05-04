import React, { useState } from 'react';
import OutputPanel from './OutputPanel';
import '../styles/ResultTabs.css';

export default function ResultTabs({ results }) {
  const [activeTab, setActiveTab] = useState('website');

  return (
    <div className="result-tabs-card">
      <div className="result-tabs-header">
        <ul className="result-tabs-list">
          <li className="result-tabs-item">
            <button className={`result-tabs-button ${activeTab === 'website' ? 'active' : ''}`} onClick={() => setActiveTab('website')}>
              🌐 Website SEO
            </button>
          </li>
          <li className="result-tabs-item">
            <button className={`result-tabs-button ${activeTab === 'youtube' ? 'active' : ''}`} onClick={() => setActiveTab('youtube')}>
              ▶️ YouTube Shorts
            </button>
          </li>
          <li className="result-tabs-item">
            <button className={`result-tabs-button ${activeTab === 'facebook' ? 'active' : ''}`} onClick={() => setActiveTab('facebook')}>
              📘 Facebook Post
            </button>
          </li>
          <li className="result-tabs-item">
            <button className={`result-tabs-button ${activeTab === 'tiktok' ? 'active' : ''}`} onClick={() => setActiveTab('tiktok')}>
              🎵 TikTok Cap
            </button>
          </li>
        </ul>
      </div>
      <div className="result-tabs-body">
        {activeTab === 'website' && <OutputPanel content={results.website} />}
        {activeTab === 'youtube' && <OutputPanel content={results.youtube} />}
        {activeTab === 'facebook' && <OutputPanel content={results.facebook} />}
        {activeTab === 'tiktok' && <OutputPanel content={results.tiktok} />}
      </div>
    </div>
  );
}