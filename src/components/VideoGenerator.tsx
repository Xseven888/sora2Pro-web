/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { createVideo, queryTask, uploadImage, CreateVideoParams } from '../services/api';
import { LogEntry } from '../types';
import { API_CONFIG } from '../config';
import { storage } from '../utils/storage';
import { downloadFiles } from '../utils/download';
import { downloadTemplate, readExcelFile, parseTemplateRow, ParsedVideoParams } from '../utils/batchTemplate';
import './VideoGenerator.css';

const MODELS = [
  { value: 'sora-2', label: 'Sora-2', durations: ['10', '15'], sizes: ['small', 'large'] },
  { value: 'sora-2-pro', label: 'Sora-2-Pro', durations: ['15', '25'], sizes: ['large'] },
];

const ORIENTATIONS = [
  { value: 'portrait', label: '竖屏' },
  { value: 'landscape', label: '横屏' },
];

export interface VideoGeneratorRef {
  showLogModal: () => void;
  clearAllTasks: () => void;
  hasTasks: () => boolean;
  downloadAllVideos: (directoryHandle: FileSystemDirectoryHandle | null) => Promise<void>;
}

const VideoGenerator = forwardRef<VideoGeneratorRef>((_, ref) => {
  const [selectedModel, setSelectedModel] = useState('sora-2');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('10');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [size, setSize] = useState<'small' | 'large'>('small');
  const [videoCount, setVideoCount] = useState<number>(1);
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<Array<{ id: string; url?: string; status: string; progress?: number }>>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState<Set<string>>(new Set()); // 正在创建的任务ID集合
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const queryIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map()); // 每个任务一个定时器
  const logsEndRef = useRef<HTMLDivElement>(null);
  const imageDirectoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null); // 图片目录句柄

  // 更新视频列表并保存到本地存储
  const updateGeneratedVideos = (updater: (prev: Array<{ id: string; url?: string; status: string; progress?: number }>) => Array<{ id: string; url?: string; status: string; progress?: number }>) => {
    setGeneratedVideos((prev) => {
      const updated = updater(prev);
      storage.saveVideoTasks(updated);
      return updated;
    });
  };

  // 组件加载时从本地存储读取视频任务
  React.useEffect(() => {
    const savedTasks = storage.getVideoTasks();
    if (savedTasks && savedTasks.length > 0) {
      setGeneratedVideos(savedTasks);
    }
  }, []);

  // 定期检查未完成任务的状态（类似ProductList的处理）
  React.useEffect(() => {
    const checkTaskStatuses = async () => {
      const currentVideos = storage.getVideoTasks();
      // 对于没有url或状态不是completed的任务，主动查询一次状态
      const tasksToCheck = currentVideos.filter(
        (v) => v.id && (!v.url || v.status !== 'completed')
      );
      
      if (tasksToCheck.length > 0) {
        // 并行查询所有未完成任务的状态
        const checkPromises = tasksToCheck.map(async (video) => {
          // 跳过临时ID（以temp_开头的）
          if (video.id.startsWith('temp_')) {
            return false;
          }
          
          try {
            const taskStatus = await queryTask(video.id);
            
            // 使用函数式更新，避免并发更新冲突
            updateGeneratedVideos((prev) => {
              const videoIndex = prev.findIndex((v) => v.id === video.id);
              if (videoIndex === -1) return prev;
              
              const currentVideo = prev[videoIndex];
              
              // 如果任务已完成，更新视频状态（即使没有video_url也要更新状态）
              if (taskStatus.status === 'completed') {
                const progressValue = taskStatus.detail?.progress_pct ? taskStatus.detail.progress_pct * 100 : 100;
                const updatedVideo = {
                  ...currentVideo,
                  status: 'completed',
                  progress: progressValue,
                  // 如果有video_url就更新，没有就保持原样
                  url: taskStatus.video_url || currentVideo.url,
                };
                const updated = [...prev];
                updated[videoIndex] = updatedVideo;
                return updated;
              } else if (taskStatus.status === 'failed') {
                const updated = [...prev];
                updated[videoIndex] = { ...currentVideo, status: 'failed' };
                return updated;
              } else {
                // 更新状态和进度（即使未完成）
                const progressValue = taskStatus.detail?.progress_pct ? taskStatus.detail.progress_pct * 100 : 0;
                const updated = [...prev];
                updated[videoIndex] = {
                  ...currentVideo,
                  status: taskStatus.status,
                  progress: progressValue,
                };
                return updated;
              }
            });
            
            return taskStatus.status === 'completed' || taskStatus.status === 'failed';
          } catch (error) {
            console.error(`查询任务 ${video.id} 状态失败:`, error);
          }
          return false;
        });
        
        // 等待所有查询完成（不阻塞UI）
        Promise.all(checkPromises).catch((error) => {
          console.error('批量查询任务状态失败:', error);
        });
      }
    };

    // 每3秒检查一次未完成任务的状态
    const interval = setInterval(() => {
      checkTaskStatuses();
    }, 3000);

    // 立即检查一次
    checkTaskStatuses();

    return () => clearInterval(interval);
  }, []);

  // 当模型改变时，更新默认的时长和尺寸
  React.useEffect(() => {
    const modelConfig = MODELS.find((m) => m.value === selectedModel);
    if (modelConfig) {
      setDuration(modelConfig.durations[0]);
      setSize(modelConfig.sizes[0] as 'small' | 'large');
    }
  }, [selectedModel]);

  // 删除单个任务
  const handleDeleteTask = (taskId: string) => {
    if (window.confirm('确定要删除这个任务吗？')) {
      // 清除该任务的定时器
      const interval = queryIntervalsRef.current.get(taskId);
      if (interval) {
        clearInterval(interval);
        queryIntervalsRef.current.delete(taskId);
      }
      // 从任务集合中移除
      setCreatingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
      // 从视频列表中移除
      updateGeneratedVideos((prev) => prev.filter((v) => v.id !== taskId));
      addLog('info', `已删除任务: ${taskId}`);
    }
  };

  // 清除所有任务
  const handleClearAllTasks = () => {
    if (window.confirm('确定要清除所有任务吗？此操作不可恢复！')) {
      // 清除所有定时器
      queryIntervalsRef.current.forEach((interval) => {
        clearInterval(interval);
      });
      queryIntervalsRef.current.clear();
      // 清空任务集合
      setCreatingTasks(new Set());
      // 清空视频列表
      updateGeneratedVideos(() => []);
      addLog('info', '已清除所有任务');
    }
  };

  const addLog = (level: LogEntry['level'], message: string, details?: any) => {
    const log: LogEntry = {
      id: `${Date.now()}-${Math.random()}`, // 确保唯一性
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    setLogs((prev) => [...prev, log]);
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // 只取第一张图片
    const file = files[0];
    setImages([file]);
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      const target = e.target;
      if (target && target.result) {
        setImageUrls([target.result as string]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleImageUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = () => {
    setImages([]);
    setImageUrls([]);
  };

  // 将状态转换为中文
  const getStatusText = (status: string): string => {
    const statusMap: Record<string, string> = {
      'pending': '等待中',
      'queued': '排队中',
      'processing': '处理中',
      'completed': '已完成',
      'failed': '失败',
    };
    return statusMap[status] || status;
  };

  const uploadImagesToServer = async (imagesToUpload: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    for (const image of imagesToUpload) {
      try {
        addLog('info', `正在上传图片: ${image.name}...`);
        const result = await uploadImage(image);
        uploadedUrls.push(result.url);
        addLog('success', `图片上传成功: ${result.url}`);
      } catch (error: any) {
        addLog('error', `图片上传失败: ${error.message}`);
        throw error;
      }
    }
    return uploadedUrls;
  };

  const pollTaskStatus = async (taskId: string, taskPrompt: string, taskModel: string, taskDuration: string, taskOrientation: string, taskSize: string) => {
    // 如果已有定时器，先清除
    const existingInterval = queryIntervalsRef.current.get(taskId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const result = await queryTask(taskId);
        
        const progressValue = result.detail?.progress_pct ? result.detail.progress_pct * 100 : 0;
        
        // 如果任务已完成，更新状态（即使没有video_url也要更新）
        if (result.status === 'completed') {
          addLog('success', `视频生成完成！任务ID: ${taskId}`);
          updateGeneratedVideos((prev) =>
            prev.map((v) => 
              v.id === taskId 
                ? { 
                    ...v, 
                    status: 'completed', 
                    progress: 100,
                    // 如果有video_url就更新，没有就保持原样
                    url: result.video_url || v.url
                  }
                : v
            )
          );
          
          // 如果有video_url，保存到视频库
          if (result.video_url) {
            const currentApiKey = localStorage.getItem('sora2_api_key') || '';
            const videoItem = {
              id: taskId,
              title: taskPrompt.substring(0, 50) || '未命名视频',
              model: taskModel,
              prompt: taskPrompt,
              duration: parseInt(taskDuration, 10),
              orientation: taskOrientation,
              size: taskSize,
              videoUrl: result.video_url,
              thumbnailUrl: result.thumbnail_url,
              createdAt: Date.now(),
              apiKey: currentApiKey,
            };
            const savedVideos = JSON.parse(localStorage.getItem('generatedVideos') || '[]');
            savedVideos.push(videoItem);
            localStorage.setItem('generatedVideos', JSON.stringify(savedVideos));
            
            // 保存任务ID列表
            if (currentApiKey) {
              const taskIdsKey = `taskIds_${currentApiKey}`;
              const savedTaskIds = JSON.parse(localStorage.getItem(taskIdsKey) || '[]');
              if (!savedTaskIds.includes(taskId)) {
                savedTaskIds.push(taskId);
                localStorage.setItem(taskIdsKey, JSON.stringify(savedTaskIds));
              }
            }
          }
          
          // 清理定时器
          const taskInterval = queryIntervalsRef.current.get(taskId);
          if (taskInterval) {
            clearInterval(taskInterval);
            queryIntervalsRef.current.delete(taskId);
          }
        } else if (result.status === 'failed') {
          addLog('error', `视频生成失败，任务ID: ${taskId}`);
          updateGeneratedVideos((prev) =>
            prev.map((v) => 
              v.id === taskId 
                ? { ...v, status: 'failed', progress: progressValue }
                : v
            )
          );
          // 清理定时器
          const taskInterval = queryIntervalsRef.current.get(taskId);
          if (taskInterval) {
            clearInterval(taskInterval);
            queryIntervalsRef.current.delete(taskId);
          }
        } else {
          // 更新进度（任务进行中）
          updateGeneratedVideos((prev) =>
            prev.map((v) => 
              v.id === taskId 
                ? { ...v, status: result.status, progress: progressValue }
                : v
            )
          );
        }
      } catch (error: any) {
        addLog('error', `查询任务状态失败 (${taskId}): ${error.message}`);
      }
    }, 2000);
    
    queryIntervalsRef.current.set(taskId, interval);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addLog('error', '请输入提示词');
      return;
    }

    // 根据是否有图片自动判断功能类型
    const functionType = images.length > 0 ? 'image-to-video' : 'text-to-video';
    
    if (functionType === 'image-to-video' && images.length === 0) {
      addLog('error', '请上传至少一张图片');
      return;
    }

    // 保存当前任务的参数
    const currentPrompt = prompt.trim();
    const currentModel = selectedModel;
    const currentDuration = duration;
    const currentOrientation = orientation;
    const currentSize = size;
    const currentImages = [...images]; // 复制图片数组
    const currentVideoCount = videoCount;

    addLog('info', `开始生成 ${currentVideoCount} 条视频... (模型: ${currentModel}, 时长: ${currentDuration}秒, 比例: ${currentOrientation === 'portrait' ? '竖屏' : '横屏'}, 尺寸: ${currentSize === 'small' ? '720p' : '1080p'})`);

    // 先创建所有临时任务，一次性添加到列表，避免状态更新冲突
    const baseTimestamp = Date.now();
    const tempTasks: Array<{ id: string; status: string; progress: number }> = [];
    const tempTaskIds: string[] = [];
    
    for (let i = 0; i < currentVideoCount; i++) {
      const tempTaskId = `temp_${baseTimestamp}_${i}_${Math.random().toString(36).substr(2, 9)}`;
      tempTaskIds.push(tempTaskId);
      tempTasks.push({
        id: tempTaskId,
        status: 'pending',
        progress: 0
      });
    }
    
    // 一次性添加所有临时任务到列表
    updateGeneratedVideos((prev) => [...prev, ...tempTasks]);
    
    // 添加到正在创建的任务集合
    setCreatingTasks((prev) => {
      const newSet = new Set(prev);
      tempTaskIds.forEach(id => newSet.add(id));
      return newSet;
    });

    // 根据次数循环生成多条视频
    for (let i = 0; i < currentVideoCount; i++) {
      const tempTaskId = tempTaskIds[i];

      try {
        let imageUrlsToUse: string[] = [];

        // 如果是图生视频，先上传图片
        if (functionType === 'image-to-video' && currentImages.length > 0) {
          if (i === 0) {
            addLog('info', '正在上传图片到服务器...');
          }
          // 直接传递图片数组，不依赖状态
          imageUrlsToUse = await uploadImagesToServer(currentImages);
        }

        // 创建视频任务
        const params: CreateVideoParams = {
          model: currentModel,
          prompt: currentPrompt,
          images: imageUrlsToUse,
          orientation: currentOrientation as 'portrait' | 'landscape',
          size: currentSize as 'small' | 'large',
          duration: parseInt(currentDuration, 10),
        };

        if (i === 0) {
          addLog('info', `正在创建视频任务 (模型: ${currentModel})...`);
          addLog('info', `请求URL: ${API_CONFIG.BASE_URL}${API_CONFIG.VIDEO_API_BASE}/create`);
        }
        addLog('info', `正在创建第 ${i + 1}/${currentVideoCount} 条视频任务...`);
        
        const result = await createVideo(params);

        // 处理不同的响应格式，尝试多种方式提取taskId
        let taskId: string | undefined;
        
        // 方式1: 直接有id字段
        if (result.id && typeof result.id === 'string' && result.id.trim()) {
          taskId = result.id.trim();
        }
        // 方式2: choices数组中的content
        else if (result.choices && Array.isArray(result.choices) && result.choices.length > 0) {
          const content = result.choices[0]?.message?.content;
          if (content && typeof content === 'string' && content.trim()) {
            taskId = content.trim();
          }
        }
        // 方式3: 尝试从响应对象中查找可能的id字段
        else if (typeof result === 'object' && result !== null) {
          // 检查常见的id字段名
          const possibleIdFields = ['id', 'task_id', 'taskId', 'video_id', 'videoId'];
          for (const field of possibleIdFields) {
            if ((result as any)[field] && typeof (result as any)[field] === 'string') {
              taskId = String((result as any)[field]).trim();
              if (taskId) break;
            }
          }
        }
        
        if (!taskId) {
          addLog('error', `第 ${i + 1} 条视频无法从响应中提取任务ID`);
          addLog('error', `完整响应数据: ${JSON.stringify(result, null, 2)}`);
          
          // 尝试延迟重试：等待1秒后再次尝试创建（可能是API响应延迟）
          addLog('warning', `第 ${i + 1} 条视频将延迟1秒后重试获取任务ID...`);
          
          // 延迟重试一次
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            // 重新创建任务（只重试一次）
            const retryResult = await createVideo(params);
            addLog('info', `第 ${i + 1} 条视频重试响应: ${JSON.stringify(retryResult, null, 2)}`);
            
            // 再次尝试提取taskId
            if (retryResult.id && typeof retryResult.id === 'string' && retryResult.id.trim()) {
              taskId = retryResult.id.trim();
            } else if (retryResult.choices && Array.isArray(retryResult.choices) && retryResult.choices.length > 0) {
              const content = retryResult.choices[0]?.message?.content;
              if (content && typeof content === 'string' && content.trim()) {
                taskId = content.trim();
              }
            }
            
            if (taskId) {
              addLog('success', `第 ${i + 1} 条视频重试成功，获取到任务ID: ${taskId}`);
            } else {
              addLog('error', `第 ${i + 1} 条视频重试后仍无法获取任务ID，将保留临时ID`);
              // 保留临时任务，但标记为需要手动处理
              updateGeneratedVideos((prev) =>
                prev.map((v) => 
                  v.id === tempTaskId 
                    ? { ...v, status: 'pending', progress: 0 }
                    : v
                )
              );
              continue;
            }
          } catch (retryError: any) {
            addLog('error', `第 ${i + 1} 条视频重试失败: ${retryError.message}`);
            // 保留临时任务
            updateGeneratedVideos((prev) =>
              prev.map((v) => 
                v.id === tempTaskId 
                  ? { ...v, status: 'pending', progress: 0 }
                  : v
                )
            );
            continue;
          }
        }

        addLog('success', `第 ${i + 1}/${currentVideoCount} 条视频任务创建成功，任务ID: ${taskId}`);
        
        // 用真实任务ID替换临时ID
        updateGeneratedVideos((prev) =>
          prev.map((v) => 
            v.id === tempTaskId 
              ? { id: taskId!, status: 'pending', progress: 0 }
              : v
          )
        );

        // 开始轮询任务状态（传递任务参数）
        // 不等待完成，让所有任务并行处理
        pollTaskStatus(taskId, currentPrompt, currentModel, currentDuration, currentOrientation, currentSize).catch((error) => {
          addLog('error', `第 ${i + 1} 条视频任务轮询失败: ${error.message}`);
        });
      } catch (error: any) {
        let errorMessage = error.message || '未知错误';
        
        addLog('error', `第 ${i + 1}/${currentVideoCount} 条视频生成失败: ${errorMessage}`);
        
        if (error.response?.status === 400) {
          addLog('warning', '400 错误通常表示请求参数不正确，请检查参数格式');
        }
        
        // 更新临时任务为失败状态
        updateGeneratedVideos((prev) =>
          prev.map((v) => 
            v.id === tempTaskId 
              ? { ...v, status: 'failed' }
              : v
          )
        );
      } finally {
        // 从正在创建的任务集合中移除
        setCreatingTasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(tempTaskId);
          return newSet;
        });
      }
    }
  };

  React.useEffect(() => {
    return () => {
      // 清理所有定时器
      queryIntervalsRef.current.forEach((interval) => {
        clearInterval(interval);
      });
      queryIntervalsRef.current.clear();
    };
  }, []);

  // 自动滚动到日志底部
  React.useEffect(() => {
    if (showLogModal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogModal]);

  // 下载全部视频
  const handleDownloadAllVideos = async (directoryHandle: FileSystemDirectoryHandle | null) => {
    const completedVideos = generatedVideos.filter(v => v.status === 'completed' && v.url);
    
    if (completedVideos.length === 0) {
      addLog('warning', '没有已完成的视频可下载');
      alert('没有已完成的视频可下载');
      return;
    }

    addLog('info', `开始下载 ${completedVideos.length} 个视频...`);
    
    const files = completedVideos.map((video) => {
      const extension = video.url?.split('.').pop() || 'mp4';
      const filename = `video_${video.id}.${extension}`;
      return {
        url: video.url!,
        filename: filename
      };
    });

    try {
      await downloadFiles(
        files,
        directoryHandle,
        (current: number, total: number) => {
          addLog('info', `下载进度: ${current}/${total}`);
        }
      );
      addLog('success', `成功下载 ${completedVideos.length} 个视频`);
      alert(`成功下载 ${completedVideos.length} 个视频`);
    } catch (error: any) {
      addLog('error', `下载失败: ${error.message}`);
      alert(`下载失败: ${error.message}`);
    }
  };

  // 下载模版
  const handleDownloadTemplate = () => {
    try {
      downloadTemplate();
      addLog('success', '模版文件已下载');
    } catch (error: any) {
      addLog('error', `下载模版失败: ${error.message}`);
      alert(`下载模版失败: ${error.message}`);
    }
  };

  // 导入模版并批量生成
  const handleImportTemplate = async () => {
    templateInputRef.current?.click();
  };

  // 从本地路径读取文件（使用File System Access API）
  const readFileFromLocalPath = async (localPath: string): Promise<File | null> => {
    try {
      // 从路径中提取文件名（支持Windows和Unix路径格式）
      let fileName = localPath.trim();
      
      // 移除路径分隔符
      const pathParts = fileName.split(/[/\\]/).filter(part => part.length > 0);
      if (pathParts.length > 0) {
        fileName = pathParts[pathParts.length - 1];
      }
      
      // 移除可能的引号
      fileName = fileName.replace(/^["']|["']$/g, '');
      
      if (!fileName || fileName.length === 0) {
        addLog('error', `无法从路径中提取文件名: ${localPath}`);
        return null;
      }

      // 如果没有目录句柄，让用户选择目录
      if (!imageDirectoryHandleRef.current) {
        addLog('info', `首次检测到本地图片路径，请选择图片所在的目录...`);
        addLog('info', `提示：选择的目录应包含所有需要的图片文件`);
        
        try {
          // 检查浏览器是否支持 File System Access API
          if (!('showDirectoryPicker' in window)) {
            const errorMsg = '您的浏览器不支持文件系统访问API，请使用Chrome、Edge等现代浏览器，或使用网络URL格式的图片地址';
            addLog('error', errorMsg);
            throw new Error(errorMsg);
          }
          
          const directoryHandle = await (window as any).showDirectoryPicker({
            mode: 'read'
          });
          
          imageDirectoryHandleRef.current = directoryHandle;
          addLog('success', `已选择图片目录，将自动读取文件`);
        } catch (error: any) {
          if (error.name === 'AbortError') {
            addLog('error', '用户取消了目录选择');
            return null;
          }
          throw error;
        }
      }

      // 从目录句柄中读取文件
      const directoryHandle = imageDirectoryHandleRef.current;
      if (!directoryHandle) {
        addLog('error', `目录句柄不存在，无法读取文件: ${fileName}`);
        return null;
      }
      
      addLog('info', `正在读取文件: ${fileName}...`);
      
      const fileHandle = await directoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      
      addLog('success', `成功读取文件: ${fileName} (${(file.size / 1024).toFixed(2)} KB)`);
      return file;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        addLog('error', `文件未找到: ${localPath}，请确保文件存在于选择的目录中`);
      } else if (error.name === 'TypeMismatchError') {
        addLog('error', `路径指向的不是文件: ${localPath}，请确保路径指向的是图片文件`);
      } else {
        addLog('error', `读取本地文件失败: ${error.message || error.name || '未知错误'}`);
      }
      return null;
    }
  };

  // 处理模版文件上传
  const handleTemplateFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('请选择Excel格式的文件（.xlsx 或 .xls）');
      return;
    }

    try {
      addLog('info', `开始导入模版文件: ${file.name}`);
      const rows = await readExcelFile(file);
      
      if (rows.length === 0) {
        alert('模版文件中没有有效的数据行');
        return;
      }

      addLog('info', `成功解析 ${rows.length} 行数据，开始批量生成视频...`);
      addLog('info', `注意：表格中每一行将生成一个独立的视频任务`);

      // 解析所有行
      const validParams: ParsedVideoParams[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const parsed = parseTemplateRow(rows[i]);
        if (parsed) {
          validParams.push(parsed);
          addLog('info', `第 ${i + 2} 行（表头为第1行）：解析成功，将生成1个视频任务`);
        } else {
          errors.push(`第 ${i + 2} 行数据格式不正确`);
          addLog('warning', `第 ${i + 2} 行：数据格式不正确，将跳过此行`);
        }
      }

      if (errors.length > 0) {
        addLog('warning', `共有 ${errors.length} 行数据格式不正确，已跳过这些行`);
        errors.forEach(err => addLog('warning', `  - ${err}`));
      }

      if (validParams.length === 0) {
        alert('没有有效的数据可以生成视频');
        return;
      }

      // 检查是否有本地文件路径，需要用户选择图片文件
      const localImagePaths: Array<{ index: number; path: string }> = [];
      validParams.forEach((params, index) => {
        if (params.imageUrl && params.imageUrl.trim()) {
          const isUrl = params.imageUrl.trim().startsWith('http://') || params.imageUrl.trim().startsWith('https://');
          if (!isUrl) {
            localImagePaths.push({ index, path: params.imageUrl });
          }
        }
      });

      // 如果有本地文件路径，自动从目录中读取文件
      let localImageMap: Map<number, File> = new Map();
      if (localImagePaths.length > 0) {
        addLog('info', `检测到 ${localImagePaths.length} 个本地图片路径，将自动读取文件...`);
        
        // 自动读取所有本地文件
        for (const { index, path } of localImagePaths) {
          addLog('info', `正在读取第 ${index + 1} 行的本地图片: ${path}...`);
          const file = await readFileFromLocalPath(path);
          
          if (file) {
            localImageMap.set(index, file);
            addLog('success', `成功读取第 ${index + 1} 行的图片文件: ${file.name}`);
          } else {
            addLog('error', `读取第 ${index + 1} 行的图片文件失败: ${path}`);
            // 如果读取失败，可以选择跳过这一行或者标记为失败
            // 这里我们选择跳过，让批量生成时处理
          }
        }

        // 检查是否有文件读取失败
        if (localImageMap.size < localImagePaths.length) {
          const failedCount = localImagePaths.length - localImageMap.size;
          addLog('warning', `有 ${failedCount} 个本地图片文件读取失败，这些任务将无法生成视频`);
        }
      }

      addLog('info', `准备生成 ${validParams.length} 个视频任务（每行1个任务）...`);

      // 批量生成视频，传递本地图片映射
      await handleBatchGenerate(validParams, localImageMap);

    } catch (error: any) {
      const errorMessage = error.message || '未知错误';
      addLog('error', `导入模版失败: ${errorMessage}`);
      console.error('导入模版详细错误:', error);
      alert(`导入模版失败:\n\n${errorMessage}`);
    }

    // 清空文件输入
    if (templateInputRef.current) {
      templateInputRef.current.value = '';
    }
  };

  // 批量生成视频
  const handleBatchGenerate = async (paramsList: ParsedVideoParams[], localImageMap: Map<number, File> = new Map()) => {
    addLog('info', `开始批量生成 ${paramsList.length} 个视频任务（表格中的每一行对应一个视频任务）`);
    
    // 先创建所有临时任务
    const baseTimestamp = Date.now();
    const tempTasks: Array<{ id: string; status: string; progress: number }> = [];
    const tempTaskIds: string[] = [];
    
    for (let i = 0; i < paramsList.length; i++) {
      const tempTaskId = `temp_${baseTimestamp}_${i}_${Math.random().toString(36).substr(2, 9)}`;
      tempTaskIds.push(tempTaskId);
      tempTasks.push({
        id: tempTaskId,
        status: 'pending',
        progress: 0
      });
    }
    
    // 一次性添加所有临时任务到列表
    updateGeneratedVideos((prev) => [...prev, ...tempTasks]);
    addLog('info', `已创建 ${paramsList.length} 个临时任务卡片，开始提交到服务器...`);
    
    // 添加到正在创建的任务集合
    setCreatingTasks((prev) => {
      const newSet = new Set(prev);
      tempTaskIds.forEach(id => newSet.add(id));
      return newSet;
    });

    // 批量生成（每一行生成一个视频任务）
    for (let i = 0; i < paramsList.length; i++) {
      const params = paramsList[i];
      const tempTaskId = tempTaskIds[i];

      try {
        let imageUrlsToUse: string[] = [];
        const isImageToVideo = params.imageUrl && params.imageUrl.trim();

        // 根据是否有图片地址决定生成方式
        // 检查图片地址是否是有效的URL格式（http:// 或 https://）
        const isUrl = params.imageUrl && params.imageUrl.trim() && 
                     (params.imageUrl.trim().startsWith('http://') || params.imageUrl.trim().startsWith('https://'));
        
        if (isUrl) {
          // 图生视频：下载并上传图片（网络URL）
          try {
            addLog('info', `第 ${i + 1}/${paramsList.length} 条：图生视频模式，正在处理图片 ${params.imageUrl}...`);
            
            // 下载图片（仅支持URL）
            const imageResponse = await fetch(params.imageUrl);
            if (!imageResponse.ok) {
              throw new Error(`下载图片失败: ${imageResponse.statusText} (状态码: ${imageResponse.status})`);
            }
            const imageBlob = await imageResponse.blob();
            const imageFile = new File([imageBlob], `image_${i}.jpg`, { type: imageBlob.type || 'image/jpeg' });
            
            // 上传图片
            imageUrlsToUse = await uploadImagesToServer([imageFile]);
            addLog('success', `第 ${i + 1}/${paramsList.length} 条：图片上传成功`);
          } catch (error: any) {
            addLog('error', `第 ${i + 1}/${paramsList.length} 条：图片处理失败: ${error.message}`);
            // 图片处理失败，标记任务为失败
            updateGeneratedVideos((prev) =>
              prev.map((v) => 
                v.id === tempTaskId 
                  ? { ...v, status: 'failed' }
                  : v
              )
            );
            continue;
          }
        } else if (params.imageUrl && params.imageUrl.trim()) {
          // 本地文件路径：使用用户选择的文件上传
          const localImageFile = localImageMap.get(i);
          if (localImageFile) {
            try {
              addLog('info', `第 ${i + 1}/${paramsList.length} 条：图生视频模式，正在处理本地图片 ${params.imageUrl}...`);
              
              // 直接上传用户选择的图片文件
              imageUrlsToUse = await uploadImagesToServer([localImageFile]);
              addLog('success', `第 ${i + 1}/${paramsList.length} 条：本地图片上传成功`);
            } catch (error: any) {
              addLog('error', `第 ${i + 1}/${paramsList.length} 条：图片处理失败: ${error.message}`);
              // 图片处理失败，标记任务为失败
              updateGeneratedVideos((prev) =>
                prev.map((v) => 
                  v.id === tempTaskId 
                    ? { ...v, status: 'failed' }
                    : v
                )
              );
              continue;
            }
          } else {
            // 本地路径但没有对应的文件，标记为失败
            addLog('error', `第 ${i + 1}/${paramsList.length} 条：本地图片路径 "${params.imageUrl}" 没有对应的文件，任务失败`);
            updateGeneratedVideos((prev) =>
              prev.map((v) => 
                v.id === tempTaskId 
                  ? { ...v, status: 'failed' }
                  : v
              )
            );
            continue;
          }
        } else {
          // 文生视频：不需要图片
          addLog('info', `第 ${i + 1}/${paramsList.length} 条：文生视频模式（无图片）`);
        }

        // 创建视频任务
        const videoParams: CreateVideoParams = {
          model: params.model,
          prompt: params.prompt,
          images: imageUrlsToUse, // 图生视频有图片，文生视频为空数组
          orientation: params.orientation,
          size: params.size,
          duration: params.duration,
        };

        addLog('info', `第 ${i + 1}/${paramsList.length} 条：正在创建${isImageToVideo ? '图生' : '文生'}视频任务...`);
        
        const result = await createVideo(videoParams);

        // 处理不同的响应格式
        let taskId: string | undefined;
        if (result.id && typeof result.id === 'string' && result.id.trim()) {
          taskId = result.id.trim();
        } else if (result.choices && Array.isArray(result.choices) && result.choices.length > 0) {
          const content = result.choices[0]?.message?.content;
          if (content && typeof content === 'string' && content.trim()) {
            taskId = content.trim();
          }
        }

        if (!taskId) {
          addLog('error', `第 ${i + 1}/${paramsList.length} 条：无法获取任务ID`);
          updateGeneratedVideos((prev) =>
            prev.map((v) => 
              v.id === tempTaskId 
                ? { ...v, status: 'failed' }
                : v
            )
          );
          continue;
        }

        addLog('success', `第 ${i + 1}/${paramsList.length} 条：任务创建成功，任务ID: ${taskId}`);
        
        // 用真实任务ID替换临时ID
        updateGeneratedVideos((prev) =>
          prev.map((v) => 
            v.id === tempTaskId 
              ? { id: taskId!, status: 'pending', progress: 0 }
              : v
          )
        );

        // 开始轮询任务状态
        pollTaskStatus(taskId, params.prompt, params.model, params.duration.toString(), params.orientation, params.size).catch((error) => {
          addLog('error', `第 ${i + 1} 条视频任务轮询失败: ${error.message}`);
        });

        // 添加延迟，避免请求过快
        if (i < paramsList.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error: any) {
        addLog('error', `第 ${i + 1}/${paramsList.length} 条：生成失败: ${error.message}`);
        updateGeneratedVideos((prev) =>
          prev.map((v) => 
            v.id === tempTaskId 
              ? { ...v, status: 'failed' }
              : v
          )
        );
      } finally {
        // 从正在创建的任务集合中移除
        setCreatingTasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(tempTaskId);
          return newSet;
        });
      }
    }

    addLog('success', `批量生成完成！共提交 ${paramsList.length} 个视频任务（表格中的每一行都已生成一个独立的视频任务）`);
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    showLogModal: () => setShowLogModal(true),
    clearAllTasks: handleClearAllTasks,
    hasTasks: () => generatedVideos.length > 0,
    downloadAllVideos: handleDownloadAllVideos
  }));

  return (
    <div className="video-generator">
      <div className="generator-display-area">
        {generatedVideos.length === 0 ? (
          <div className="empty-video-state">
            <div className="empty-icon">🎬</div>
            <p className="empty-title">还没有生成的视频</p>
            <p className="empty-hint">在下方输入提示词开始生成</p>
          </div>
        ) : (
          <div className="videos-display-table">
            {Array.from({ length: Math.ceil(generatedVideos.length / 6) }).map((_, rowIndex) => (
              <div key={rowIndex} className="videos-table-row">
                {generatedVideos.slice(rowIndex * 6, (rowIndex + 1) * 6).map((video) => (
                  <div key={video.id} className="video-display-item">
                    <button
                      className="delete-task-button"
                      onClick={() => handleDeleteTask(video.id)}
                      title="删除任务"
                    >
                      ×
                    </button>
                    {video.url ? (
                      <video controls src={video.url} />
                    ) : (
                      <div className="video-placeholder">
                        <div className="loading-spinner"></div>
                        <p>生成中...</p>
                        {video.progress !== undefined && (
                          <div className="progress-info">
                            <div className="progress-bar-inline">
                              <div
                                className="progress-fill-inline"
                                style={{ width: `${video.progress}%` }}
                              />
                            </div>
                            <span>{video.progress}%</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="video-display-info">
                      <p className="video-id">任务ID: {video.id}</p>
                      <p className="video-status">状态: {getStatusText(video.status)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="generator-input-area">
        <div 
          className="input-main-section"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="reference-image-container">
            {imageUrls.length > 0 ? (
              <div 
                className="reference-image-preview"
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={imageUrls[0]} alt="参考图" />
                <button 
                  className="reference-image-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage();
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                className="reference-image-button"
                onClick={() => fileInputRef.current?.click()}
              >
                📷 参考图
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
          <textarea
            className="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要生成的视频内容..."
          />
        </div>

        <div className="input-settings-section">
          <div className="settings-row">
            <div className="setting-item">
              <label>模型</label>
              <select
                className="setting-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
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
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                {(() => {
                  const modelConfig = MODELS.find((m) => m.value === selectedModel);
                  return modelConfig?.durations.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur}秒
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div className="setting-item">
              <label>比例</label>
              <select
                className="setting-select"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
              >
                {ORIENTATIONS.map((orient) => (
                  <option key={orient.value} value={orient.value}>
                    {orient.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item">
              <label>尺寸</label>
              <select
                className="setting-select"
                value={size}
                onChange={(e) => setSize(e.target.value as 'small' | 'large')}
              >
                {(() => {
                  const modelConfig = MODELS.find((m) => m.value === selectedModel);
                  return modelConfig?.sizes.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz === 'small' ? '720p (标清)' : '1080p (高清)'}
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div className="setting-item">
              <label>次数</label>
              <div className="count-input-container">
                <button
                  className="count-button"
                  onClick={() => setVideoCount((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  −
                </button>
                <input
                  type="number"
                  className="count-input"
                  value={videoCount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value >= 1) {
                      setVideoCount(value);
                    }
                  }}
                  min="1"
                />
                <button
                  className="count-button"
                  onClick={() => setVideoCount((prev) => prev + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
            <div className="setting-item">
              <label>批量生成</label>
              <div className="batch-template-buttons">
                <button
                  className="template-button"
                  onClick={handleDownloadTemplate}
                  type="button"
                  title="下载批量生成模版"
                >
                  📥 下载模版
                </button>
                <button
                  className="template-button"
                  onClick={handleImportTemplate}
                  type="button"
                  title="导入模版并批量生成"
                >
                  📤 导入模版
                </button>
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleTemplateFileUpload(e.target.files)}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>


        <div className="input-actions-section">
          <button
            className="generate-button-main"
            onClick={handleGenerate}
            disabled={creatingTasks.size > 0}
          >
            ▶️ {creatingTasks.size > 0 ? `创建中(${creatingTasks.size})...` : `生成${videoCount}条`}
          </button>
        </div>
      </div>

      {showLogModal && (
        <div className="log-modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="log-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>生成日志</h3>
              <button
                className="log-modal-close"
                onClick={() => setShowLogModal(false)}
              >
                ×
              </button>
            </div>
            <div className="log-modal-body">
              {logs.length === 0 ? (
                <div className="log-empty">暂无日志</div>
              ) : (
                <div className="log-modal-list">
                  {logs.map((log) => (
                    <div key={log.id} className={`log-modal-entry log-${log.level}`}>
                      <span className="log-modal-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="log-modal-message">{log.message}</span>
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
});

VideoGenerator.displayName = 'VideoGenerator';

export default VideoGenerator;

