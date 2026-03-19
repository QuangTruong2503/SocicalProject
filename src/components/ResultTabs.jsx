import React, { useState } from 'react';
import OutputPanel from './OutputPanel';

export default function ResultTabs({ results }) {
  const [activeTab, setActiveTab] = useState('website');

  return (
    <div className="card shadow-sm border-primary">
      <div className="card-header bg-white border-bottom-0 pt-3 pb-0">
        <ul className="nav nav-tabs">
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
        </ul>
      </div>
      <div className="card-body bg-white">
        {/* Render nội dung tương ứng với tab được chọn */}
        {activeTab === 'website' && <OutputPanel content={results.website} />}
        {activeTab === 'youtube' && <OutputPanel content={results.youtube} />}
        {activeTab === 'facebook' && <OutputPanel content={results.facebook} />}
      </div>
    </div>
  );
}