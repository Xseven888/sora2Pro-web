/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useRef } from 'react';
import { PromptSettings, LogEntry } from '../types';
import { storage } from '../utils/storage';
import { uploadImage, generateImageWithGemini, generatePromptWithChatGPT } from '../services/api';
import PromptSettingsModal from './PromptSettingsModal';
import './VideoLibrary.css';

interface GeneratedPrompt {
  id: string;
  title: string;
  mainImage: string;
  geminiImage: string;
  geminiOutput: string;
  chatgptPrompt: string;
  createdAt: number;
}

const VideoLibrary: React.FC = () => {
  const [promptSettings, setPromptSettings] = useState<PromptSettings>(storage.getPromptSettings());
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [title, setTitle] = useState('');
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [mainImageUrl, setMainImageUrl] = useState<string>('');
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isLogsMinimized, setIsLogsMinimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 添加日志
  const addLog = (level: 'info' | 'success' | 'error' | 'warning', message: string, details?: any) => {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // 自动滚动到日志底部
  React.useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleImageUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setMainImage(file);
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      const target = e.target;
      if (target && target.result) {
        setMainImageUrl(target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setMainImage(null);
    setMainImageUrl('');
  };

  const handleSavePromptSettings = (settings: PromptSettings) => {
    setPromptSettings(settings);
    storage.savePromptSettings(settings);
    setShowPromptModal(false);
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      alert('请输入产品标题');
      return;
    }

    if (!mainImage) {
      alert('请上传图片');
      return;
    }

    // 检查API Key是否设置
    const apiKey = localStorage.getItem('sora2_api_key');
    if (!apiKey) {
      alert('请先在侧边栏输入并保存 API Key！');
      return;
    }

    setIsGenerating(true);
    addLog('info', `开始为"${title.trim()}"生成提示词...`);

    try {
      // 步骤1: 上传主图到图床
      addLog('info', '正在上传主图到服务器...');
      const mainImageUploadResult = await uploadImage(mainImage);
      const mainImageUrl = mainImageUploadResult.url;
      addLog('success', `主图上传成功: ${mainImageUrl}`);

      // 步骤2: 使用Gemini根据主图处理提示词生成图片
      addLog('info', '正在使用Gemini生成图片...');
      let geminiImageUrl = '';
      let geminiOutput = '';

      try {
        // 构建Gemini消息
        const geminiMessages = [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptSettings.mainImagePrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: mainImageUrl,
                },
              },
            ],
          },
        ];

        const geminiResponse = await generateImageWithGemini({
          model: 'gemini-2.5-flash-image',
          messages: geminiMessages as any,
          temperature: 0.7,
          max_tokens: 1000,
        });

        geminiOutput = geminiResponse.choices[0]?.message?.content || '';
        addLog('info', `Gemini输出: ${geminiOutput.substring(0, 200)}...`);

        // 从响应中提取图片URL或base64
        const urlMatch = geminiOutput.match(/https?:\/\/[^\s\)]+/);
        if (urlMatch) {
          geminiImageUrl = urlMatch[0];
          addLog('success', `Gemini生成图片成功: ${geminiImageUrl}`);
        } else {
          // 尝试提取 base64 图片数据
          const base64Match = geminiOutput.match(/data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)/);
          if (base64Match) {
            // 将 base64 转换为 Blob 并上传到图床
            const base64Data = base64Match[2];
            const mimeType = base64Match[1] === 'png' ? 'image/png' : 'image/jpeg';
            
            // 将 base64 转换为 Blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            
            // 创建 File 对象
            const file = new File([blob], 'gemini-generated.png', { type: mimeType });
            
            // 上传到图床
            addLog('info', '正在上传Gemini生成的图片到图床...');
            const uploadResult = await uploadImage(file);
            geminiImageUrl = uploadResult.url;
            addLog('success', `图片上传成功: ${geminiImageUrl}`);
          } else {
            throw new Error(`未能从Gemini响应中提取图片。响应内容: ${geminiOutput.substring(0, 500)}`);
          }
        }
      } catch (error: any) {
        addLog('error', `Gemini生成图片失败: ${error.message}`);
        throw error;
      }

      if (!geminiImageUrl) {
        throw new Error('未能获取Gemini生成的图片URL');
      }

      // 步骤3: 使用ChatGPT根据产品标题和场景提示词生成提示词
      addLog('info', '正在使用ChatGPT生成提示词...');
      let chatgptPrompt = '';

      try {
        const chatgptMessages = [
          {
            role: 'system',
            content: `你是一个专业的视频脚本生成助手。根据提供的产品图片和标题，生成符合以下要求的视频脚本提示词：\n\n${promptSettings.scenePrompt}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `产品标题：${title.trim()}\n\n请根据上述要求生成视频脚本提示词。`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: geminiImageUrl,
                },
              },
            ],
          },
        ];

        const chatgptResponse = await generatePromptWithChatGPT({
          model: 'gpt-5-chat-latest',
          messages: chatgptMessages as any,
          temperature: 0.8,
          max_tokens: 2000,
        });

        chatgptPrompt = chatgptResponse.choices[0]?.message?.content || '';
        addLog('success', `ChatGPT生成提示词成功`);
        addLog('info', `生成的提示词: ${chatgptPrompt.substring(0, 200)}...`);

        if (!chatgptPrompt) {
          throw new Error('ChatGPT未返回有效的提示词');
        }
      } catch (error: any) {
        addLog('error', `ChatGPT生成提示词失败: ${error.message}`);
        throw error;
      }

      // 保存生成结果
      const newPrompt: GeneratedPrompt = {
        id: Date.now().toString(),
        title: title.trim(),
        mainImage: mainImageUrl,
        geminiImage: geminiImageUrl,
        geminiOutput: geminiOutput,
        chatgptPrompt: chatgptPrompt,
        createdAt: Date.now(),
      };

      setGeneratedPrompts((prev) => [newPrompt, ...prev]);
      addLog('success', '提示词生成完成！');

      // 清空输入
      setTitle('');
      setMainImage(null);
      setMainImageUrl('');
    } catch (error: any) {
      addLog('error', `生成失败: ${error.message}`);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="prompt-generator">
      <div className="prompt-display-area">
        {generatedPrompts.length === 0 ? (
          <div className="empty-prompt-state">
            <div className="empty-icon">📝</div>
            <p className="empty-title">还没有生成的提示词</p>
            <p className="empty-hint">在下方输入产品标题并上传图片开始生成</p>
          </div>
        ) : (
          <div className="prompts-list">
            {generatedPrompts.map((prompt) => (
              <div key={prompt.id} className="prompt-item">
                <div className="prompt-header">
                  <h3>{prompt.title}</h3>
                  <span className="prompt-date">
                    {new Date(prompt.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="prompt-images">
                  <div className="prompt-image-item">
                    <label>主图</label>
                    <img src={prompt.mainImage} alt="主图" />
                  </div>
                  <div className="prompt-image-item">
                    <label>白底图</label>
                    <img src={prompt.geminiImage} alt="白底图" />
                  </div>
                </div>
                <div className="prompt-outputs">
                  <div className="output-section">
                    <label>sora2提示词</label>
                    <div className="output-content">{prompt.chatgptPrompt}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prompt-input-area">
        <div 
          className="input-main-section"
          onDrop={(e) => {
            e.preventDefault();
            handleImageUpload(e.dataTransfer.files);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
        >
          <div className="image-upload-container">
            {mainImageUrl ? (
              <div 
                className="image-preview"
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={mainImageUrl} alt="上传的图片" />
                <button 
                  className="remove-image-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                className="upload-image-button"
                onClick={() => fileInputRef.current?.click()}
              >
                📷 上传图片
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>
          <input
            className="title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入产品标题..."
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleGenerate();
              }
            }}
          />
          <button
            className="generate-button"
            onClick={handleGenerate}
            disabled={isGenerating || !title.trim() || !mainImage}
          >
            {isGenerating ? '生成中...' : '生成提示词'}
          </button>
        </div>

        <div className="input-settings-section">
          <div className="settings-row">
            <div className="setting-item">
              <label>提示词设置</label>
              <button
                className="prompt-settings-button-compact"
                onClick={() => setShowPromptModal(true)}
              >
                设置提示词
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPromptModal && (
        <PromptSettingsModal
          settings={promptSettings}
          onSave={handleSavePromptSettings}
          onClose={() => setShowPromptModal(false)}
        />
      )}

      {/* 打开日志按钮 */}
      {logs.length > 0 && !showLogs && (
        <button
          className="open-logs-button"
          onClick={() => {
            setShowLogs(true);
            setIsLogsMinimized(false);
          }}
        >
          📋 查看日志 ({logs.length})
        </button>
      )}

      {/* 日志弹窗 */}
      {logs.length > 0 && showLogs && (
        <div className={`logs-display ${isLogsMinimized ? 'minimized' : ''}`}>
          <div className="logs-header">
            <h4>生成日志</h4>
            <div className="logs-header-actions">
              <button
                className="logs-minimize-button"
                onClick={() => setIsLogsMinimized(!isLogsMinimized)}
                title={isLogsMinimized ? '展开' : '最小化'}
              >
                {isLogsMinimized ? '□' : '—'}
              </button>
              <button
                className="logs-close-button"
                onClick={() => setShowLogs(false)}
                title="关闭"
              >
                ×
              </button>
            </div>
          </div>
          {!isLogsMinimized && (
            <div className="logs-body">
              {logs.map((log) => (
                <div key={log.id} className={`log-entry log-${log.level}`}>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoLibrary;
