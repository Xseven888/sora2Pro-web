/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { queryTask } from '../services/api';
import './Modal.css';

interface VideoDetailModalProps {
  product: Product;
  onClose: () => void;
}

const VideoDetailModal: React.FC<VideoDetailModalProps> = ({
  product,
  onClose,
}) => {
  const [taskDetail, setTaskDetail] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 如果有taskId，尝试查询任务详情
    if (product.taskId) {
      setIsLoading(true);
      queryTask(product.taskId)
        .then((result) => {
          setTaskDetail(result);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('查询任务详情失败:', error);
          setIsLoading(false);
        });
      
      // 如果任务还在处理中，定期刷新详情
      if (product.status === 'processing' || product.status === 'pending') {
        const interval = setInterval(() => {
          queryTask(product.taskId!)
            .then((result) => {
              setTaskDetail(result);
              // 如果任务完成，停止轮询
              if (result.status === 'completed' || result.status === 'failed') {
                clearInterval(interval);
                setIsLoading(false);
              }
            })
            .catch((error) => {
              console.error('查询任务详情失败:', error);
            });
        }, 3000); // 每3秒查询一次

        return () => clearInterval(interval);
      }
    }
  }, [product.taskId, product.status]);

  // 从product或taskDetail中获取数据，优先使用product中保存的提示词（因为这是ChatGPT生成的完整提示词）
  const getPrompt = () => {
    // 优先使用product中保存的prompt（这是ChatGPT生成的完整提示词）
    if (product.prompt) return product.prompt;
    // 其次使用API返回的enhanced_prompt
    if (taskDetail?.enhanced_prompt) return taskDetail.enhanced_prompt;
    // 最后使用API返回的原始prompt
    if (taskDetail?.detail?.input?.prompt) return taskDetail.detail.input.prompt;
    return '';
  };

  const getModel = () => {
    if (taskDetail?.detail?.input?.model) return taskDetail.detail.input.model;
    if (product.model) return product.model;
    return '';
  };

  const getDuration = () => {
    if (taskDetail?.detail?.input?.duration) return taskDetail.detail.input.duration;
    if (product.duration) return product.duration;
    return '';
  };

  const getOrientation = () => {
    if (taskDetail?.detail?.input?.orientation) return taskDetail.detail.input.orientation;
    if (product.orientation) return product.orientation;
    return '';
  };

  const getSize = () => {
    if (taskDetail?.detail?.input?.size) return taskDetail.detail.input.size;
    if (product.size) return product.size;
    return '';
  };

  const getVideoUrl = () => {
    if (taskDetail?.video_url) return taskDetail.video_url;
    if (product.videoUrl) return product.videoUrl;
    return '';
  };

  const prompt = getPrompt();
  const model = getModel();
  const duration = getDuration();
  const orientation = getOrientation();
  const size = getSize();
  const videoUrl = getVideoUrl();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>生成详情</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* 图片预览 */}
          <div className="detail-images">
            <div className="detail-image-item">
              <label>主图</label>
              {product.mainImage ? (
                <img src={product.mainImage} alt="主图" />
              ) : (
                <div className="image-placeholder">暂无图片</div>
              )}
            </div>
            <div className="detail-image-item">
              <label>白底图</label>
              {product.whiteBgImage ? (
                <img src={product.whiteBgImage} alt="白底图" />
              ) : (
                <div className="image-placeholder">暂无图片</div>
              )}
            </div>
          </div>

          {/* 提示词 */}
          <div className="detail-section">
            <label>提示词</label>
            <textarea
              value={prompt || '暂无提示词'}
              readOnly
              rows={4}
              className="detail-textarea"
            />
          </div>

          {/* 生成参数 */}
          <div className="detail-section">
            <label>生成参数</label>
            <div className="detail-params">
              <div className="detail-param-item">
                <span className="param-label">模型:</span>
                <span className="param-value">{model || '未知'}</span>
              </div>
              <div className="detail-param-item">
                <span className="param-label">时长:</span>
                <span className="param-value">{duration ? `${duration}秒` : '未知秒'}</span>
              </div>
              <div className="detail-param-item">
                <span className="param-label">比例:</span>
                <span className="param-value">
                  {orientation === 'portrait' ? '竖屏' : orientation === 'landscape' ? '横屏' : '未知'}
                </span>
              </div>
              <div className="detail-param-item">
                <span className="param-label">尺寸:</span>
                <span className="param-value">
                  {size === 'small' ? '720p' : size === 'large' ? '1080p' : '未知'}
                </span>
              </div>
            </div>
          </div>

          {/* 视频状态 */}
          <div className="detail-section">
            {isLoading ? (
              <div className="video-status">加载中...</div>
            ) : videoUrl ? (
              <div className="video-preview-container">
                <video src={videoUrl} controls className="detail-video" />
              </div>
            ) : (
              <div className="video-status">视频尚未生成</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="confirm-button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default VideoDetailModal;

