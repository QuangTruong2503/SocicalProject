import React, { useState } from 'react';
import OutputPanel from './OutputPanel';

export default function ResultTabs({ results }) {
  const [activeTab, setActiveTab] = useState('website');

  return (
    <div className="card shadow-sm border-primary">
      <div className="card-header bg-white border-bottom-0 pt-3 pb-0 d-flex flex-wrap">
        <ul className="nav nav-tabs w-100">
          <li className="nav-item">
            <button className={`nav-link fw-bold ${activeTab === 'website' ? 'active text-primary border-primary border-bottom-0' : 'text-muted'}`} onClick={() => setActiveTab('website')}>
              🌐 Website SEO
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link fw-bold ${activeTab === 'youtube' ? 'active text-primary border-primary border-bottom-0' : 'text-muted'}`} onClick={() => setActiveTab('youtube')}>
              ▶️ YouTube Shorts
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link fw-bold ${activeTab === 'facebook' ? 'active text-primary border-primary border-bottom-0' : 'text-muted'}`} onClick={() => setActiveTab('facebook')}>
              📘 Facebook Post
            </button>
          </li>
          {/* TAB TIKTOK MỚI */}
          <li className="nav-item">
            <button className={`nav-link fw-bold ${activeTab === 'tiktok' ? 'active text-primary border-primary border-bottom-0' : 'text-muted'}`} onClick={() => setActiveTab('tiktok')}>
              🎵 TikTok Cap
            </button>
          </li>
        </ul>
      </div>
      <div className="card-body bg-white">
        {activeTab === 'website' && <OutputPanel content={results.website} />}
        {activeTab === 'youtube' && <OutputPanel content={results.youtube} />}
        {activeTab === 'facebook' && <OutputPanel content={results.facebook} />}
        {activeTab === 'tiktok' && <OutputPanel content={results.tiktok} />}
      </div>
    </div>
  );
}