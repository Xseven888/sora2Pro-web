/**
 * 作者：沐七
 * 日期：2025/12/11
 */
// 商品类型
export interface Product {
  id: string;
  title: string;
  mainImage: string;
  whiteBgImage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  taskId?: string; // 任务ID，用于查询详情
  model?: string; // 使用的模型
  prompt?: string; // 提示词
  duration?: number; // 时长（秒）
  orientation?: 'portrait' | 'landscape'; // 比例
  size?: 'small' | 'large'; // 尺寸
  createdAt: number;
}

// 提示词设置
export interface PromptSettings {
  mainImagePrompt: string;
  scenePrompt: string;
}

// 日志条目
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

// 进度信息
export interface ProgressInfo {
  currentStep: string;
  progress: number;
  model?: string;
  prompt?: string;
  status?: string;
}


