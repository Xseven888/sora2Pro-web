/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useRef, useEffect } from 'react';
import { createCharacter, uploadVideo, CreateCharacterResponse } from '../services/api';
import { LogEntry } from '../types';
import './CharacterCreator.css';

const CharacterCreator: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('1');
  const [endTime, setEndTime] = useState<string>('3');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [createdCharacter, setCreatedCharacter] = useState<CreateCharacterResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (level: LogEntry['level'], message: string, details?: any) => {
    const log: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    setLogs((prev) => [...prev, log]);
  };

  // 处理视频文件上传
  const handleVideoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // 检查文件类型
    if (!file.type.startsWith('video/')) {
      addLog('error', '请选择视频文件');
      alert('请选择视频文件');
      return;
    }
    
    setVideoFile(file);
    
    // 创建预览URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const target = e.target;
      if (target && target.result) {
        setVideoPreviewUrl(target.result as string);
      }
    };
    reader.readAsDataURL(file);
    
    addLog('info', `已选择视频文件: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  };

  // 处理拖拽上传
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleVideoUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // 移除视频
  const removeVideo = () => {
    setVideoFile(null);
    setVideoUrl('');
    setVideoPreviewUrl('');
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    addLog('info', '已移除视频');
  };

  // 验证时间戳
  const validateTimestamps = (): boolean => {
    const start = parseFloat(startTime);
    const end = parseFloat(endTime);
    
    if (isNaN(start) || isNaN(end)) {
      addLog('error', '时间戳必须是数字');
      alert('时间戳必须是数字');
      return false;
    }
    
    if (start < 0 || end < 0) {
      addLog('error', '时间戳不能为负数');
      alert('时间戳不能为负数');
      return false;
    }
    
    if (start >= end) {
      addLog('error', '开始时间必须小于结束时间');
      alert('开始时间必须小于结束时间');
      return false;
    }
    
    const duration = end - start;
    if (duration < 1) {
      addLog('error', '时间范围最小为1秒');
      alert('时间范围最小为1秒');
      return false;
    }
    
    if (duration > 3) {
      addLog('error', '时间范围最大为3秒');
      alert('时间范围最大为3秒');
      return false;
    }
    
    return true;
  };

  // 创建角色
  const handleCreateCharacter = async () => {
    // 验证视频
    if (!videoFile && !videoUrl) {
      addLog('error', '请先上传视频或输入视频URL');
      alert('请先上传视频或输入视频URL');
      return;
    }
    
    // 验证时间戳
    if (!validateTimestamps()) {
      return;
    }
    
    setIsCreating(true);
    setCreatedCharacter(null);
    addLog('info', '开始创建角色...');
    
    try {
      let finalVideoUrl = videoUrl;
      
      // 如果上传了视频文件，优先使用上传的文件
      if (videoFile) {
        addLog('info', `正在上传视频文件: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)...`);
        try {
          const uploadResult = await uploadVideo(videoFile);
          finalVideoUrl = uploadResult.url;
          setVideoUrl(finalVideoUrl);
          addLog('success', `视频上传成功: ${finalVideoUrl}`);
        } catch (uploadError: any) {
          const uploadErrorMessage = uploadError.response?.data?.message || 
                                    uploadError.response?.data?.error || 
                                    uploadError.message || 
                                    '视频上传失败';
          addLog('error', `视频上传失败: ${uploadErrorMessage}`);
          throw new Error(`视频上传失败: ${uploadErrorMessage}`);
        }
      } else if (!videoUrl || !videoUrl.trim()) {
        throw new Error('请上传视频文件或输入视频URL');
      }
      
      // 验证视频URL格式
      if (!finalVideoUrl || !finalVideoUrl.trim()) {
        throw new Error('视频URL不能为空');
      }
      
      // 构建时间戳字符串
      const timestamps = `${startTime},${endTime}`;
      
      addLog('info', `正在创建角色...`);
      addLog('info', `视频URL: ${finalVideoUrl}`);
      addLog('info', `时间范围: ${timestamps}秒`);
      
      // 调用创建角色API
      const result = await createCharacter({
        url: finalVideoUrl.trim(),
        timestamps: timestamps,
      });
      
      setCreatedCharacter(result);
      addLog('success', `角色创建成功！`);
      addLog('info', `角色ID: ${result.id}`);
      addLog('info', `角色名称: ${result.username}`);
      addLog('info', `提示词用法: @{${result.username}}`);
      
    } catch (error: any) {
      console.error('创建角色错误详情:', error);
      
      let errorMessage = '未知错误';
      if (error.response) {
        // 服务器返回了响应，但状态码不是2xx
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      error.response.data?.detail ||
                      `服务器错误 (${error.response.status})`;
        addLog('error', `服务器响应: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // 请求已发出，但没有收到响应
        errorMessage = '网络错误：无法连接到服务器，请检查网络连接';
        addLog('error', '网络错误：请求已发出但未收到响应');
      } else {
        // 其他错误
        errorMessage = error.message || '未知错误';
        addLog('error', `错误: ${error.message}`);
      }
      
      addLog('error', `创建角色失败: ${errorMessage}`);
      alert(`创建角色失败: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  // 复制角色信息
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      addLog('success', `${label}已复制到剪贴板`);
    }).catch(() => {
      addLog('error', `复制${label}失败`);
    });
  };

  // 自动滚动到日志底部
  useEffect(() => {
    if (showLogModal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogModal]);

  // 清理预览URL
  useEffect(() => {
    return () => {
      if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  return (
    <div className="character-creator">
      <div className="character-creator-content">
        <div className="character-form">
          <h2>创建Sora角色</h2>
          
          {/* 视频上传区域 */}
          <div className="form-section">
            <label className="form-label">视频文件</label>
            <div className="upload-area">
              {videoPreviewUrl ? (
                <div className="video-preview-container">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="video-preview"
                  />
                  <button
                    className="remove-video-btn"
                    onClick={removeVideo}
                    title="移除视频"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  className="upload-dropzone"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">📹</div>
                  <div className="upload-text">
                    <p>点击或拖拽视频文件到这里</p>
                    <p className="upload-hint">支持 MP4, MOV, AVI 等视频格式</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoUpload(e.target.files)}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* 视频URL输入（可选） */}
          <div className="form-section">
            <label className="form-label">或输入视频URL</label>
            <input
              type="text"
              className="form-input"
              placeholder="https://example.com/video.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              disabled={!!videoFile}
            />
            {videoFile && (
              <p className="form-hint">已上传视频文件，URL输入已禁用</p>
            )}
          </div>

          {/* 时间戳输入 */}
          <div className="form-section">
            <label className="form-label">角色出现时间范围（秒）</label>
            <div className="timestamp-inputs">
              <div className="timestamp-group">
                <label>开始时间</label>
                <input
                  type="number"
                  className="form-input timestamp-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  min="0"
                  step="0.1"
                />
              </div>
              <div className="timestamp-separator">~</div>
              <div className="timestamp-group">
                <label>结束时间</label>
                <input
                  type="number"
                  className="form-input timestamp-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
            <p className="form-hint">时间范围：最小1秒，最大3秒（例如：1,3 表示1-3秒）</p>
          </div>

          {/* 创建按钮 */}
          <div className="form-section">
            <button
              className="create-character-btn"
              onClick={handleCreateCharacter}
              disabled={isCreating || (!videoFile && !videoUrl)}
            >
              {isCreating ? '创建中...' : '创建角色'}
            </button>
          </div>

          {/* 创建的角色信息 */}
          {createdCharacter && (
            <div className="character-result">
              <h3>角色创建成功！</h3>
              <div className="character-info">
                <div className="character-avatar">
                  <img
                    src={createdCharacter.profile_picture_url}
                    alt={createdCharacter.username}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23ccc"/></svg>';
                    }}
                  />
                </div>
                <div className="character-details">
                  <div className="character-detail-item">
                    <label>角色ID:</label>
                    <div className="detail-value">
                      <span>{createdCharacter.id}</span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(createdCharacter.id, '角色ID')}
                        title="复制"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="character-detail-item">
                    <label>角色名称:</label>
                    <div className="detail-value">
                      <span>{createdCharacter.username}</span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(createdCharacter.username, '角色名称')}
                        title="复制"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="character-detail-item">
                    <label>提示词用法:</label>
                    <div className="detail-value">
                      <span className="prompt-usage">@{'{'}{createdCharacter.username}{'}'}</span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(`@{${createdCharacter.username}}`, '提示词')}
                        title="复制"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="character-detail-item">
                    <label>角色主页:</label>
                    <div className="detail-value">
                      <a
                        href={createdCharacter.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="character-link"
                      >
                        {createdCharacter.permalink}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 日志按钮 */}
        <div className="log-section">
          <button
            className="log-toggle-btn"
            onClick={() => setShowLogModal(!showLogModal)}
          >
            {showLogModal ? '隐藏日志' : '显示日志'} ({logs.length})
          </button>
        </div>
      </div>

      {/* 日志模态框 */}
      {showLogModal && (
        <div className="log-modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="log-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>操作日志</h3>
              <button
                className="log-modal-close"
                onClick={() => setShowLogModal(false)}
              >
                ×
              </button>
            </div>
            <div className="log-modal-body">
              {logs.length === 0 ? (
                <p className="log-empty">暂无日志</p>
              ) : (
                <div className="log-list">
                  {logs.map((log) => (
                    <div key={log.id} className={`log-item log-${log.level}`}>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCreator;

