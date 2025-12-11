/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '../config';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 300000, // 5分钟超时，视频创建可能需要很长时间
});

// 请求拦截器 - 动态添加API Key
apiClient.interceptors.request.use((config) => {
  // 检查是否是sora-2-pro相关的请求
  let isSora2Pro = false;
  let detectedModel = '';
  
  // 检查URL中是否包含sora-2-pro
  if (config.url?.includes('sora-2-pro')) {
    isSora2Pro = true;
    detectedModel = 'sora-2-pro (from URL)';
  }
  
  // 如果请求头中已经设置了 Authorization（说明在 createVideo 中已经手动设置），跳过拦截器的处理
  const authHeader = config.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.includes('Bearer')) {
    const existingKey = authHeader.replace('Bearer ', '');
    const sora2ProKey = localStorage.getItem('sora2_pro_api_key');
    if (sora2ProKey && existingKey === sora2ProKey) {
      isSora2Pro = true;
      detectedModel = 'sora-2-pro (from manual header)';
      console.log('检测到手动设置的 Sora-2-Pro API Key，跳过拦截器处理');
      return config;
    }
  }
  
  // 检查请求数据中的model字段
  if (config.data && typeof config.data === 'object') {
    // 尝试从不同位置获取model
    const model = config.data.model || config.data.input?.model;
    if (model === 'sora-2-pro') {
      isSora2Pro = true;
      detectedModel = 'sora-2-pro (from data.model)';
    } else if (model) {
      detectedModel = `${model} (from data.model)`;
    }
    
    // 详细日志
    console.log('Request interceptor - checking model:', {
      url: config.url,
      dataKeys: Object.keys(config.data),
      model: config.data.model,
      metadata: (config as any).metadata,
      fullData: JSON.stringify(config.data).substring(0, 200),
    });
  }
  
  // 根据模型选择不同的API Key
  let apiKey = '';
  if (isSora2Pro) {
    apiKey = localStorage.getItem('sora2_pro_api_key') || '';
    if (!apiKey) {
      console.warn('警告: Sora-2-Pro API Key 未设置，尝试使用默认API Key');
      apiKey = localStorage.getItem('sora2_api_key') || API_CONFIG.API_KEY || '';
    } else {
      console.log('使用 Sora-2-Pro API Key');
    }
  } else {
    apiKey = localStorage.getItem('sora2_api_key') || API_CONFIG.API_KEY || '';
    console.log('使用默认 API Key');
  }
  
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  } else {
    console.error('错误: API Key 未设置！请在header中输入并保存API Key');
    // 不抛出错误，让请求继续，这样可以看到具体的401错误
  }
  
  // 调试日志
  console.log('API Request:', {
    url: `${config.baseURL}${config.url}`,
    method: config.method,
    detectedModel: detectedModel || (isSora2Pro ? 'sora-2-pro' : 'default'),
    isSora2Pro: isSora2Pro,
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey ? apiKey.length : 0,
    apiKeyType: isSora2Pro ? 'sora2_pro_api_key' : 'sora2_api_key',
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}` : '未设置',
  });
  
  return config;
});

// 响应拦截器 - 错误处理
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        data: error.config?.data,
      },
    });
    return Promise.reject(error);
  }
);

// 视频生成API
export interface CreateVideoParams {
  model: string;
  prompt: string;
  images?: string[];
  orientation: 'portrait' | 'landscape';
  size: 'small' | 'large';
  duration: number; // API 实际需要的是整数类型
}

export interface CreateVideoResponse {
  id: string;
  object?: string;
  created?: number;
  status?: string;
  status_update_time?: number;
  choices?: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 创建视频
export const createVideo = async (params: CreateVideoParams): Promise<CreateVideoResponse> => {
  // 按照文档中的参数顺序：images, model, orientation, prompt, size, duration
  // 确保 images 始终是数组（即使是空数组）
  // duration 必须是整数类型（虽然文档写的是string，但实际API需要int）
  const requestData = {
    images: Array.isArray(params.images) ? params.images : (params.images ? [params.images] : []),
    model: params.model,
    orientation: params.orientation,
    prompt: params.prompt,
    size: params.size,
    duration: Number(params.duration), // API 需要整数类型
  };
  
  console.log('Creating video with params:', requestData);
  console.log('Model in requestData:', requestData.model);
  console.log('API Base URL:', API_CONFIG.BASE_URL);
  console.log('Video API Path:', `${API_CONFIG.VIDEO_API_BASE}/create`);
  console.log('Full URL:', `${API_CONFIG.BASE_URL}${API_CONFIG.VIDEO_API_BASE}/create`);
  
  // 如果是 sora-2-pro，在请求前手动设置 API Key
  // 因为请求拦截器可能无法正确识别模型，所以在这里直接设置
  const isSora2Pro = requestData.model === 'sora-2-pro';
  let customConfig: any = {};
  
  if (isSora2Pro) {
    const sora2ProKey = localStorage.getItem('sora2_pro_api_key');
    console.log('Sora-2-Pro API Key check:', {
      hasKey: !!sora2ProKey,
      keyLength: sora2ProKey ? sora2ProKey.length : 0,
    });
    if (sora2ProKey) {
      // 直接在请求配置中设置 API Key，这样拦截器就不会覆盖
      customConfig.headers = {
        Authorization: `Bearer ${sora2ProKey}`,
      };
      console.log('手动设置 Sora-2-Pro API Key 到请求头');
    } else {
      console.warn('警告: 使用 Sora-2-Pro 模型但未设置 Sora-2-Pro API Key，将使用默认 API Key');
    }
  }
  
  // 重试机制：如果是500错误（服务器负载饱和），自动重试
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // 重试前等待，每次等待时间递增
        const waitTime = attempt * 2000; // 2秒、4秒、6秒
        console.log(`第 ${attempt} 次重试，等待 ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // 视频创建请求使用更长的超时时间
      const videoCreateConfig = {
        ...customConfig,
        timeout: 300000, // 5分钟超时
      };
      
      const response = await apiClient.post<CreateVideoResponse>(
        `${API_CONFIG.VIDEO_API_BASE}/create`,
        requestData,
        videoCreateConfig
      );
      console.log('Video creation response:', response.data);
      return response.data;
    } catch (error: any) {
      lastError = error;
      
      // 如果是500错误且还有重试次数，继续重试
      if (error.response?.status === 500 && attempt < maxRetries) {
        const errorMessage = error.response?.data?.message || error.message || '';
        if (errorMessage.includes('负载已饱和') || errorMessage.includes('saturated')) {
          console.warn(`服务器负载饱和，将在 ${(attempt + 1) * 2} 秒后重试 (${attempt + 1}/${maxRetries})...`);
          continue;
        }
      }
      
      // 其他错误或重试次数用完，抛出错误
      break;
    }
  }
  
  // 所有重试都失败，抛出最后的错误
  const errorDetails = {
    message: lastError.message,
    status: lastError.response?.status,
    statusText: lastError.response?.statusText,
    responseData: lastError.response?.data,
    requestData: requestData,
    requestUrl: `${API_CONFIG.BASE_URL}${API_CONFIG.VIDEO_API_BASE}/create`,
    retries: maxRetries,
  };
  console.error('Video creation error details (after retries):', errorDetails);
  
  // 抛出更详细的错误信息
  const errorMessage = lastError.response?.data?.message || 
                      lastError.response?.data?.error || 
                      lastError.message || 
                      '未知错误';
  
  // 如果是500错误且包含负载饱和信息，提供更友好的提示
  if (lastError.response?.status === 500 && 
      (errorMessage.includes('负载已饱和') || errorMessage.includes('saturated'))) {
    const detailedError = new Error(`服务器负载饱和，已重试 ${maxRetries} 次，请稍后再试或减少并发请求`);
    (detailedError as any).details = errorDetails;
    (detailedError as any).retryable = true;
    throw detailedError;
  }
  
  const detailedError = new Error(`视频创建失败: ${errorMessage} (状态码: ${lastError.response?.status || 'N/A'})`);
  (detailedError as any).details = errorDetails;
  throw detailedError;
};

// 查询任务
export interface QueryTaskResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string | null;
  enhanced_prompt?: string;
  status_update_time: number;
  detail?: any;
  width?: number;
  height?: number;
  thumbnail_url?: string;
}

export const queryTask = async (taskId: string): Promise<QueryTaskResponse> => {
  const response = await apiClient.get<QueryTaskResponse>(
    `${API_CONFIG.VIDEO_API_BASE}/query`,
    {
      params: { id: taskId },
    }
  );
  return response.data;
};

// 上传图片到图床
export interface UploadImageResponse {
  url: string;
  created: number;
}

export const uploadImage = async (file: File): Promise<UploadImageResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post<UploadImageResponse>(
    API_CONFIG.IMAGE_UPLOAD_URL,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

// 上传视频到图床（复用图片上传接口）
export interface UploadVideoResponse {
  url: string;
  created: number;
}

export const uploadVideo = async (file: File): Promise<UploadVideoResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post<UploadVideoResponse>(
    API_CONFIG.IMAGE_UPLOAD_URL,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

// 创建角色API
export interface CreateCharacterParams {
  url: string; // 视频URL
  timestamps: string; // 时间戳，格式如 "1,2" 表示1-2秒
}

export interface CreateCharacterResponse {
  id: string; // 角色id
  username: string; // 角色名称，用于放在提示词中 @{username}
  permalink: string; // 角色主页，跳转到 openai 角色主页
  profile_picture_url: string; // 角色头像
}

export const createCharacter = async (params: CreateCharacterParams): Promise<CreateCharacterResponse> => {
  // 根据API文档，创建角色API使用 https://api.sora2.email
  // 在开发环境中，使用相对路径通过Vite代理绕过CORS问题
  // 在生产环境中，使用完整的URL
  const isDevelopment = import.meta.env.DEV;
  
  console.log('Creating character with params:', params);
  console.log('Environment:', isDevelopment ? 'Development' : 'Production');
  
  let response;
  if (isDevelopment) {
    // 开发环境：使用相对路径，通过Vite代理
    // Vite代理会将 /sora/v1/characters 代理到 https://api.sora2.email/sora/v1/characters
    console.log('Using Vite proxy for CORS bypass');
    
    // 创建一个临时的axios实例，使用相对路径（不设置baseURL）
    const proxyClient = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 300000,
    });
    
    // 添加API Key到请求头
    proxyClient.interceptors.request.use((config) => {
      const apiKey = localStorage.getItem('sora2_api_key') || API_CONFIG.API_KEY || '';
      if (apiKey) {
        config.headers.Authorization = `Bearer ${apiKey}`;
      }
      return config;
    });
    
    // 添加错误处理
    proxyClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Character API Error (via proxy):', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
    
    response = await proxyClient.post<CreateCharacterResponse>(
      '/sora/v1/characters',
      params
    );
  } else {
    // 生产环境：使用相对路径，通过Nginx代理绕过CORS问题
    // 需要在Nginx配置中添加代理规则（见DEPLOY.md）
    console.log('Production environment: Using relative path via Nginx proxy');
    console.log('Character API Path: /sora/v1/characters');
    console.log('Note: Ensure Nginx proxy is configured (see DEPLOY.md)');
    
    // 创建一个临时的axios实例，使用相对路径（不设置baseURL）
    // 这样请求会发送到当前域名，由Nginx代理转发
    const proxyClient = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 300000,
    });
    
    // 添加API Key到请求头
    proxyClient.interceptors.request.use((config) => {
      const apiKey = localStorage.getItem('sora2_api_key') || API_CONFIG.API_KEY || '';
      if (apiKey) {
        config.headers.Authorization = `Bearer ${apiKey}`;
      }
      return config;
    });
    
    // 添加错误处理
    proxyClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Character API Error (via Nginx proxy):', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
    
    response = await proxyClient.post<CreateCharacterResponse>(
      '/sora/v1/characters',
      params
    );
  }
  
  console.log('Character creation response:', response.data);
  return response.data;
};

// Gemini图片创作API
export interface GeminiImageParams {
  model: string;
  messages: Array<{
    role: string;
    content: string | Array<{
      type: string;
      text?: string;
      image_url?: {
        url: string;
      };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
}

export interface GeminiImageResponse {
  id: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const generateImageWithGemini = async (params: GeminiImageParams): Promise<GeminiImageResponse> => {
  // 根据文档，Gemini 使用 chat 兼容格式接口 /v1/chat/completions
  // 但用户提到应该使用 /v1beta/models/gemini-2.5-flash-image:generateContent
  // 先尝试使用 chat 兼容格式，如果失败再尝试专用接口
  console.log('调用 Gemini API');
  console.log('请求URL:', `${API_CONFIG.BASE_URL}${API_CONFIG.CHAT_API_BASE}`);
  console.log('请求参数:', params);
  
  const requestData = {
    ...params,
    model: 'gemini-2.5-flash-image', // 确保模型名称正确
  };
  
  try {
    // 使用 chat 兼容格式接口（文档中的方式）
    const response = await apiClient.post<GeminiImageResponse>(
      API_CONFIG.CHAT_API_BASE,
      requestData
    );
    console.log('Gemini API 响应:', response.data);
    return response.data;
  } catch (error: any) {
    // 如果是 503 错误，可能是服务器暂时不可用，等待后重试
    if (error.response?.status === 503) {
      console.warn('Gemini API 返回 503，等待 2 秒后重试...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const retryResponse = await apiClient.post<GeminiImageResponse>(
          API_CONFIG.CHAT_API_BASE,
          requestData
        );
        console.log('Gemini API 重试成功:', retryResponse.data);
        return retryResponse.data;
      } catch (retryError: any) {
        console.error('Gemini API 重试失败:', {
          message: retryError.message,
          status: retryError.response?.status,
          statusText: retryError.response?.statusText,
          data: retryError.response?.data,
        });
        throw retryError;
      }
    }
    
    console.error('Gemini API 调用失败:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      requestUrl: `${API_CONFIG.BASE_URL}${API_CONFIG.CHAT_API_BASE}`,
    });
    throw error;
  }
};

// ChatGPT识图API
export interface ChatGPTImageParams {
  model: string;
  messages: Array<{
    role: string;
    content: string | Array<{
      type: string;
      text?: string;
      image_url?: {
        url: string;
      };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatGPTImageResponse {
  id: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const generatePromptWithChatGPT = async (params: ChatGPTImageParams): Promise<ChatGPTImageResponse> => {
  const response = await apiClient.post<ChatGPTImageResponse>(
    API_CONFIG.CHAT_API_BASE,
    params
  );
  return response.data;
};

