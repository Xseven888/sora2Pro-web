/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Product, PromptSettings, LogEntry } from '../types';
import { storage } from '../utils/storage';
import { generateVideoForProduct } from '../services/productService';
import PromptSettingsModal from './PromptSettingsModal';
import AddProductModal from './AddProductModal';
import VideoDetailModal from './VideoDetailModal';
import { uploadImage, queryTask } from '../services/api';
import { downloadFiles } from '../utils/download';
import './ProductList.css';

export interface ProductListRef {
  showLogModal: () => void;
  downloadAllVideos: (directoryHandle: FileSystemDirectoryHandle | null) => Promise<void>;
}

const MODELS = [
  { value: 'sora-2', label: 'Sora-2', durations: ['10', '15'] },
  { value: 'sora-2-pro', label: 'Sora-2-Pro', durations: ['15', '25'] },
];

const ProductList = forwardRef<ProductListRef>((_, ref) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>(storage.getPromptSettings());
  const [selectedModel, setSelectedModel] = useState<'sora-2' | 'sora-2-pro'>('sora-2');
  const [selectedDuration, setSelectedDuration] = useState<string>('10');
  const [newProductTitle, setNewProductTitle] = useState('');
  const [newProductImage, setNewProductImage] = useState<File | null>(null);
  const [newProductImageUrl, setNewProductImageUrl] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const productImageInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 下载全部视频
  const handleDownloadAllVideos = async (directoryHandle: FileSystemDirectoryHandle | null) => {
    const completedProducts = products.filter(p => p.videoUrl && p.status === 'completed');
    
    if (completedProducts.length === 0) {
      addLog('warning', '没有已完成的视频可下载');
      alert('没有已完成的视频可下载');
      return;
    }

    addLog('info', `开始下载 ${completedProducts.length} 个视频...`);
    
    const files = completedProducts.map((product) => {
      const extension = product.videoUrl?.split('.').pop() || 'mp4';
      const filename = `${product.title || 'product'}_${product.id}.${extension}`;
      return {
        url: product.videoUrl!,
        filename: filename
      };
    });

    try {
      await downloadFiles(
        files,
        directoryHandle,
        (current, total) => {
          addLog('info', `下载进度: ${current}/${total}`);
        }
      );
      addLog('success', `成功下载 ${completedProducts.length} 个视频`);
      alert(`成功下载 ${completedProducts.length} 个视频`);
    } catch (error: any) {
      addLog('error', `下载失败: ${error.message}`);
      alert(`下载失败: ${error.message}`);
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    showLogModal: () => setShowLogModal(true),
    downloadAllVideos: handleDownloadAllVideos
  }));

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
  useEffect(() => {
    if (showLogModal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogModal]);
  
  // 当模型改变时，更新默认时长
  useEffect(() => {
    const modelConfig = MODELS.find(m => m.value === selectedModel);
    if (modelConfig && !modelConfig.durations.includes(selectedDuration)) {
      setSelectedDuration(modelConfig.durations[0]);
    }
  }, [selectedModel]);

  useEffect(() => {
    loadProducts();
  }, []);

  // 定期刷新产品列表，以便实时更新生成状态
  useEffect(() => {
    const interval = setInterval(() => {
      loadProducts();
    }, 3000); // 每3秒刷新一次

    return () => clearInterval(interval);
  }, []);

  const loadProducts = async () => {
    const savedProducts = storage.getProducts();
    setProducts(savedProducts);
    
    // 对于有taskId但状态不是completed的任务，或者有videoUrl但状态不是completed的任务，主动查询一次状态
    const tasksToCheck = savedProducts.filter(
      (p) => p.taskId && (p.status !== 'completed' && p.status !== 'failed' || (p.videoUrl && p.status !== 'completed'))
    );
    
    if (tasksToCheck.length > 0) {
      // 并行查询所有未完成任务的状态
      const checkPromises = tasksToCheck.map(async (product) => {
        try {
          const taskStatus = await queryTask(product.taskId!);
          
          // 如果任务已完成，更新产品状态
          if (taskStatus.status === 'completed' && taskStatus.video_url) {
            const currentProducts = storage.getProducts(); // 重新读取，避免并发更新冲突
            const updatedProducts = currentProducts.map((p) =>
              p.id === product.id
                ? {
                    ...p,
                    status: 'completed' as const,
                    videoUrl: taskStatus.video_url,
                    taskId: p.taskId || product.taskId, // 确保保留taskId
                    // 如果API返回了enhanced_prompt，更新它
                    prompt: taskStatus.enhanced_prompt || p.prompt,
                  }
                : p
            );
            storage.saveProducts(updatedProducts);
            setProducts(updatedProducts);
            return true; // 表示有更新
          } else if (taskStatus.status === 'failed') {
            const currentProducts = storage.getProducts(); // 重新读取，避免并发更新冲突
            const updatedProducts = currentProducts.map((p) =>
              p.id === product.id 
                ? { 
                    ...p, 
                    status: 'failed' as const,
                    taskId: p.taskId || product.taskId, // 确保保留taskId
                  } 
                : p
            );
            storage.saveProducts(updatedProducts);
            setProducts(updatedProducts);
            return true; // 表示有更新
          }
        } catch (error) {
          console.error(`查询任务 ${product.taskId} 状态失败:`, error);
        }
        return false;
      });
      
      // 等待所有查询完成（不阻塞UI）
      Promise.all(checkPromises).catch((error) => {
        console.error('批量查询任务状态失败:', error);
      });
    }
  };

  // 删除单个产品
  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('确定要删除这个任务吗？')) {
      const updatedProducts = products.filter((p) => p.id !== productId);
      setProducts(updatedProducts);
      storage.saveProducts(updatedProducts);
      addLog('info', `已删除任务: ${productId}`);
    }
  };

  // 清除所有任务
  const handleClearAllTasks = () => {
    if (window.confirm('确定要清除所有任务吗？此操作不可恢复！')) {
      // 只清除有视频或正在处理的任务，保留未开始的任务
      const updatedProducts = products.filter((p) => !p.videoUrl && p.status !== 'processing' && p.status !== 'pending');
      setProducts(updatedProducts);
      storage.saveProducts(updatedProducts);
      addLog('info', '已清除所有任务');
    }
  };

  const handleSavePromptSettings = (settings: PromptSettings) => {
    setPromptSettings(settings);
    storage.savePromptSettings(settings);
    setShowPromptModal(false);
  };

  const handleAddProduct = (product: Omit<Product, 'id' | 'createdAt' | 'status' | 'whiteBgImage' | 'videoUrl'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
      createdAt: Date.now(),
      status: 'pending',
      whiteBgImage: '',
      videoUrl: undefined,
    };
    const updatedProducts = [...products, newProduct];
    setProducts(updatedProducts);
    storage.saveProducts(updatedProducts);
    setShowAddModal(false);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setNewProductImage(file);
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      const target = e.target;
      if (target && target.result) {
        setNewProductImageUrl(target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setNewProductImage(null);
    setNewProductImageUrl('');
  };

  const handleQuickAddProduct = async () => {
    if (!newProductTitle.trim()) {
      alert('请输入商品标题');
      return;
    }

    if (!newProductImage) {
      alert('请上传商品主图');
      return;
    }

    // 检查API Key是否设置
    const apiKey = localStorage.getItem('sora2_api_key');
    if (!apiKey) {
      alert('请先在侧边栏输入并保存 API Key！');
      return;
    }

    try {
      // 上传图片到图床
      const result = await uploadImage(newProductImage);
      
      const newProduct: Product = {
        title: newProductTitle.trim(),
        mainImage: result.url,
        id: Date.now().toString(),
        createdAt: Date.now(),
        status: 'pending',
        whiteBgImage: '',
        videoUrl: undefined,
      };
      
      const updatedProducts = [...products, newProduct];
      setProducts(updatedProducts);
      storage.saveProducts(updatedProducts);
      
      // 保存标题用于日志
      const productTitle = newProductTitle.trim();
      
      // 清空输入
      setNewProductTitle('');
      setNewProductImage(null);
      setNewProductImageUrl('');
      
      // 自动开始生成视频
      try {
        addLog('info', `开始为商品"${productTitle}"生成视频...`);
        // 更新状态为处理中
        const processingProducts = updatedProducts.map((p) =>
          p.id === newProduct.id ? { ...p, status: 'processing' as const } : p
        );
        setProducts(processingProducts);
        storage.saveProducts(processingProducts);

        // 生成视频，带进度回调
        await generateVideoForProduct(
          newProduct,
          promptSettings,
          selectedModel,
          parseInt(selectedDuration, 10),
          (step, progress) => {
            addLog('info', `${step} (${Math.round(progress)}%)`);
            // 在生成过程中实时更新产品列表
            loadProducts();
          }
        );
        
        addLog('success', `商品"${productTitle}"的视频生成完成！`);

        // 重新加载产品列表
        loadProducts();
      } catch (error: any) {
        console.error('生成视频失败:', error);
        const errorMessage = error.message || '生成视频失败';
        const errorStep = (error as any).step || '未知步骤';
        const isRetryable = (error as any).retryable;
        
        addLog('error', `生成视频失败 (${errorStep}): ${errorMessage}`);
        
        // 如果是401错误，提示检查API Key
        if (error.response?.status === 401 || errorMessage.includes('401')) {
          alert(`认证失败 (401): 请检查API Key是否正确设置。\n\n错误步骤: ${errorStep}\n错误信息: ${errorMessage}`);
        } else if (isRetryable) {
          alert(`生成视频失败: ${errorMessage}\n\n提示：可以稍后重试，或减少并发请求。`);
        } else {
          alert(`生成视频失败 (${errorStep}): ${errorMessage}`);
        }
        
        const failedProducts = updatedProducts.map((p) =>
          p.id === newProduct.id ? { ...p, status: 'failed' as const } : p
        );
        setProducts(failedProducts);
        storage.saveProducts(failedProducts);
      }
    } catch (error: any) {
      alert(`上传失败: ${error.message}`);
    }
  };

  // 注意：此函数已不再使用，实际使用的是 generateVideoForProduct
  // const handleGenerateVideo = async (product: Product) => {
  //   // 检查API Key是否设置
  //   const apiKey = localStorage.getItem('sora2_api_key');
  //   if (!apiKey) {
  //     alert('请先在顶部输入并保存 API Key！');
  //     return;
  //   }

  //   try {
  //     // 更新状态为处理中
  //     const updatedProducts = products.map((p) =>
  //       p.id === product.id ? { ...p, status: 'processing' as const } : p
  //     );
  //     setProducts(updatedProducts);
  //     storage.saveProducts(updatedProducts);

  //     // 生成视频，带进度回调
  //     await generateVideoForProduct(
  //       product,
  //       promptSettings,
  //       selectedModel,
  //       parseInt(selectedDuration, 10),
  //       (step, progress) => {
  //         console.log(`${step} - ${progress}%`);
  //         // 在生成过程中实时更新产品列表，以便显示已保存的提示词和参数
  //         loadProducts();
  //       }
  //     );

  //     // 重新加载产品列表
  //     loadProducts();
  //   } catch (error: any) {
  //     console.error('生成视频失败:', error);
  //     const errorMessage = error.message || '生成视频失败';
  //     const errorStep = (error as any).step || '未知步骤';
  //     const isRetryable = (error as any).retryable;
      
  //     // 如果是401错误，提示检查API Key
  //     if (error.response?.status === 401 || errorMessage.includes('401')) {
  //       alert(`认证失败 (401): 请检查API Key是否正确设置。\n\n错误步骤: ${errorStep}\n错误信息: ${errorMessage}`);
  //     } else if (isRetryable) {
  //       // 如果是可重试的错误（如服务器负载饱和），提供更友好的提示
  //       alert(`生成视频失败: ${errorMessage}\n\n提示：可以点击"重试"按钮稍后重试，或减少并发请求。`);
  //     } else {
  //       alert(`生成视频失败 (${errorStep}): ${errorMessage}`);
  //     }
      
  //     const updatedProducts = products.map((p) =>
  //       p.id === product.id ? { ...p, status: 'failed' as const } : p
  //     );
  //     setProducts(updatedProducts);
  //     storage.saveProducts(updatedProducts);
  //   }
  // };

  // 获取所有已生成视频的商品和正在处理中的商品
  const videosWithProducts = products.filter(p => p.videoUrl || p.status === 'processing' || p.status === 'pending');
  // 按创建时间倒序排列，最新的在前面
  const sortedVideos = [...videosWithProducts].sort((a, b) => b.createdAt - a.createdAt);

  // 将视频按每行6条分组
  const videoRows: Product[][] = [];
  for (let i = 0; i < sortedVideos.length; i += 6) {
    videoRows.push(sortedVideos.slice(i, i + 6));
  }

  return (
    <div className="product-list">
      <div className="product-display-area">
        <div className="product-list-header">
          <h2>生成的视频</h2>
          {sortedVideos.length > 0 && (
            <button
              className="clear-all-tasks-button"
              onClick={handleClearAllTasks}
              title="清除所有任务"
            >
              🗑️ 清除所有任务
            </button>
          )}
        </div>
        {sortedVideos.length === 0 ? (
          <div className="empty-video-state">
            <div className="empty-icon">🎬</div>
            <p className="empty-title">还没有生成的视频</p>
            <p className="empty-hint">添加商品并生成视频后，视频将显示在这里</p>
          </div>
        ) : (
          <div className="videos-display-table">
            {videoRows.map((row, rowIndex) => (
              <div key={rowIndex} className="videos-table-row">
                {row.map((product) => (
                  <div key={product.id} className="video-display-item">
                    <button
                      className="delete-task-button"
                      onClick={() => handleDeleteProduct(product.id)}
                      title="删除任务"
                    >
                      ×
                    </button>
                    {product.videoUrl ? (
                      <video controls src={product.videoUrl} />
                    ) : (
                      <div className="video-placeholder">
                        <div className="loading-spinner"></div>
                        <p>生成中...</p>
                      </div>
                    )}
                    <div className="video-display-info">
                      <p className="video-title">{product.title}</p>
                      <p className="video-status">状态: {product.status === 'completed' ? '已完成' : product.status === 'processing' ? '处理中' : product.status === 'pending' ? '待处理' : '失败'}</p>
                      {(product.taskId || product.videoUrl || product.status === 'processing' || product.status === 'pending') && (
                        <button
                          className="detail-button-small"
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowDetailModal(true);
                          }}
                        >
                          查看详情
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

      </div>

      <div className="product-input-area">
        <div className="input-main-section">
          <div 
            className="add-product-container"
            onDrop={(e) => {
              e.preventDefault();
              handleImageUpload(e.dataTransfer.files);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
          >
            {newProductImageUrl ? (
              <div 
                className="add-product-preview"
                onClick={() => productImageInputRef.current?.click()}
              >
                <img src={newProductImageUrl} alt="商品主图" />
                <button 
                  className="add-product-remove"
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
                className="add-product-button"
                onClick={() => productImageInputRef.current?.click()}
              >
                添加商品
              </button>
            )}
            <input
              ref={productImageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>
          <input
            className="product-title-input"
            type="text"
            value={newProductTitle}
            onChange={(e) => setNewProductTitle(e.target.value)}
            placeholder="输入商品标题..."
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleQuickAddProduct();
              }
            }}
          />
          <button
            className="quick-add-button"
            onClick={handleQuickAddProduct}
            disabled={!newProductTitle.trim() || !newProductImage}
          >
            添加
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
            <div className="setting-item">
              <label>模型</label>
              <select
                className="setting-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as 'sora-2' | 'sora-2-pro')}
              >
                {MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item">
              <label>时长</label>
              <select
                className="setting-select"
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value)}
              >
                {MODELS.find(m => m.value === selectedModel)?.durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}秒
                  </option>
                ))}
              </select>
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

      {showAddModal && (
        <AddProductModal
          onAdd={handleAddProduct}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showDetailModal && selectedProduct && (
        <VideoDetailModal
          product={selectedProduct}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedProduct(null);
          }}
        />
      )}

      {/* 日志弹窗 */}
      {showLogModal && (
        <div className="log-modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="log-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>任务日志</h3>
              <button className="log-modal-close" onClick={() => setShowLogModal(false)}>×</button>
            </div>
            <div className="log-modal-body">
              {logs.length === 0 ? (
                <div className="log-empty">暂无日志</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className={`log-entry-modal log-${log.level}`}>
                    <span className="log-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ProductList.displayName = 'ProductList';

export default ProductList;

