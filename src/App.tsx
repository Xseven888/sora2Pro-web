/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useEffect, useRef } from 'react';
import VideoGenerator, { VideoGeneratorRef } from './components/VideoGenerator';
import ProductList, { ProductListRef } from './components/ProductList';
import VideoLibrary from './components/VideoLibrary';
import WatermarkRemover from './components/WatermarkRemover';
import WebsiteGuide from './components/WebsiteGuide';
import CharacterCreator from './components/CharacterCreator';
import { updateApiKey, loadApiKey, updateSora2ProApiKey, loadSora2ProApiKey } from './config';
import { selectOutputDirectory } from './utils/download';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'video' | 'product' | 'library' | 'watermark' | 'guide' | 'character'>('video');
  const [apiKey, setApiKey] = useState<string>('');
  const [sora2ProApiKey, setSora2ProApiKey] = useState<string>('');
  const [hasVideoTasks, setHasVideoTasks] = useState(false);
  const [outputDirectoryName, setOutputDirectoryName] = useState<string>('');
  const [outputDirectoryHandle, setOutputDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const videoGeneratorRef = useRef<VideoGeneratorRef | null>(null);
  const productListRef = useRef<ProductListRef | null>(null);

  useEffect(() => {
    // 加载保存的API Key
    const savedKey = loadApiKey();
    if (savedKey) {
      setApiKey(savedKey);
    }
    // 加载保存的Sora-2-Pro API Key
    const savedSora2ProKey = loadSora2ProApiKey();
    if (savedSora2ProKey) {
      setSora2ProApiKey(savedSora2ProKey);
    }
    // 加载保存的输出目录名称
    const savedDirName = localStorage.getItem('outputDirectoryName');
    if (savedDirName) {
      setOutputDirectoryName(savedDirName);
    }
  }, []);

  // 定期检查是否有视频任务
  useEffect(() => {
    if (activeTab === 'video') {
      const interval = setInterval(() => {
        if (videoGeneratorRef.current) {
          setHasVideoTasks(videoGeneratorRef.current.hasTasks());
        }
      }, 500); // 每500ms检查一次，更实时
      // 立即检查一次
      if (videoGeneratorRef.current) {
        setHasVideoTasks(videoGeneratorRef.current.hasTasks());
      }
      return () => clearInterval(interval);
    } else {
      setHasVideoTasks(false);
    }
  }, [activeTab]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      updateApiKey(apiKey.trim());
      alert('API Key 已保存');
    } else {
      alert('请输入有效的 API Key');
    }
  };

  const handleSora2ProApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSora2ProApiKey(e.target.value);
  };

  const handleSaveSora2ProApiKey = () => {
    if (sora2ProApiKey.trim()) {
      updateSora2ProApiKey(sora2ProApiKey.trim());
      alert('Sora-2-Pro API Key 已保存');
    } else {
      alert('请输入有效的 Sora-2-Pro API Key');
    }
  };

  const handleSelectOutputDirectory = async () => {
    const handle = await selectOutputDirectory();
    if (handle) {
      setOutputDirectoryHandle(handle);
      setOutputDirectoryName(handle.name);
      alert(`已选择输出目录: ${handle.name}`);
    }
  };

  const handleDownloadAllVideos = async () => {
    if (activeTab === 'video' && videoGeneratorRef.current) {
      await videoGeneratorRef.current.downloadAllVideos(outputDirectoryHandle);
    } else if (activeTab === 'product' && productListRef.current) {
      await productListRef.current.downloadAllVideos(outputDirectoryHandle);
    }
  };

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'video':
        return '工作台 > 视频生成';
      case 'product':
        return '工作台 > 一键带货';
      case 'library':
        return '工作台 > 提示词生成';
      case 'watermark':
        return '工作台 > sora免费去水印';
      case 'guide':
        return '工作台 > 网站功能说明';
      case 'character':
        return '工作台 > 创建角色';
      default:
        return '工作台';
    }
  };

  return (
    <div className="app">
      <div className="app-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src="/logo.png" alt="AI创作工作台" className="logo-img" />
            <span className="logo-text">AI创作工作台</span>
          </div>
          <div className="subtitle">AI赋予无限可能</div>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'video' ? 'active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            <span className="nav-icon">✨</span>
            <span>视频生成</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'product' ? 'active' : ''}`}
            onClick={() => setActiveTab('product')}
          >
            <span className="nav-icon">🛒</span>
            <span>一键带货</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'character' ? 'active' : ''}`}
            onClick={() => setActiveTab('character')}
          >
            <span className="nav-icon">👤</span>
            <span>创建角色</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            <span className="nav-icon">📝</span>
            <span>提示词生成</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'watermark' ? 'active' : ''}`}
            onClick={() => setActiveTab('watermark')}
          >
            <span className="nav-icon">🎬</span>
            <span>sora免费去水印</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            <span className="nav-icon">📖</span>
            <span>网站功能说明</span>
          </button>
        </nav>

        <div className="sidebar-api-settings">
          <div className="api-key-link-item">
            <a
              href="https://api.sora2.email/register?aff=J0Aw"
              target="_blank"
              rel="noopener noreferrer"
              className="api-key-link"
            >
              APIkey获取地址：https://api.sora2.email/register?aff=J0Aw
            </a>
          </div>
          <div className="api-setting-item">
            <label>输出目录</label>
            <div className="output-directory-selector">
              <button
                className="select-directory-button"
                onClick={handleSelectOutputDirectory}
                title="选择视频保存目录"
              >
                📁 {outputDirectoryName || '选择目录'}
              </button>
              {outputDirectoryName && (
                <span className="directory-name" title={outputDirectoryName}>
                  {outputDirectoryName}
                </span>
              )}
            </div>
          </div>
          <div className="api-setting-item">
            <label>API Key （选择限时特价分组）</label>
            <input
              type="text"
              className="api-key-input-sidebar"
              placeholder="请输入API Key"
              value={apiKey}
              onChange={handleApiKeyChange}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveApiKey();
                }
              }}
            />
            <button
              className="save-api-key-button-sidebar"
              onClick={handleSaveApiKey}
            >
              保存
            </button>
          </div>
          <div className="api-setting-item">
            <label>API Key（选择default分组）</label>
            <input
              type="text"
              className="api-key-input-sidebar"
              placeholder="请输入Sora-2-Pro API Key"
              value={sora2ProApiKey}
              onChange={handleSora2ProApiKeyChange}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveSora2ProApiKey();
                }
              }}
            />
            <button
              className="save-api-key-button-sidebar"
              onClick={handleSaveSora2ProApiKey}
            >
              保存
            </button>
          </div>
        </div>
      </div>

      <div className="app-main">
        <div className="main-header">
          <div className="breadcrumb">{getBreadcrumb()}</div>
          <div className="header-actions">
            {(activeTab === 'video' || activeTab === 'product') && (
              <button
                className="download-all-button-header"
                onClick={handleDownloadAllVideos}
                title="下载全部视频"
              >
                ⬇️ 下载全部视频
              </button>
            )}
            {activeTab === 'video' && hasVideoTasks && (
              <button
                className="clear-all-tasks-button-header"
                onClick={() => videoGeneratorRef.current?.clearAllTasks()}
                title="清除所有任务"
              >
                🗑️ 清除所有任务
              </button>
            )}
            {activeTab === 'video' && (
              <button
                className="log-button-header"
                onClick={() => videoGeneratorRef.current?.showLogModal()}
              >
                📋 日志
              </button>
            )}
            {activeTab === 'product' && (
              <button
                className="log-button-header"
                onClick={() => productListRef.current?.showLogModal()}
              >
                📋 日志
              </button>
            )}
            {activeTab === 'watermark' && (
              <button
                className="video-enhancer-button-header"
                onClick={() => {
                  window.open('https://www.runninghub.cn/ai-detail/1987914185591951362?inviteCode=me7mbc41', '_blank', 'noopener,noreferrer');
                }}
                title="在新标签页打开模糊视频高清修复"
              >
                ✨ 模糊视频高清修复
              </button>
            )}
          </div>
        </div>
        <div className="main-content">
          {activeTab === 'video' && <VideoGenerator ref={videoGeneratorRef} />}
          {activeTab === 'product' && <ProductList ref={productListRef} />}
          {activeTab === 'character' && <CharacterCreator />}
          {activeTab === 'library' && <VideoLibrary />}
          {activeTab === 'watermark' && <WatermarkRemover />}
          {activeTab === 'guide' && <WebsiteGuide />}
        </div>
      </div>
    </div>
  );
}

export default App;

