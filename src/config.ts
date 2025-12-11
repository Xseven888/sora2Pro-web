/**
 * 作者：沐七
 * 日期：2025/12/11
 */
// API配置
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://api.sora2.email',
  API_KEY: import.meta.env.VITE_API_KEY || '',
  IMAGE_UPLOAD_URL: 'https://imageproxy.zhongzhuan.chat/api/upload',
  VIDEO_API_BASE: '/v1/video',
  CHAT_API_BASE: '/v1/chat/completions',
  GEMINI_API_BASE: '/v1beta/models/gemini-2.5-flash-image:generateContent',
  GEMINI_CHAT_API_BASE: '/v1/chat/completions' // chat 兼容格式
};

// 动态更新API Key的函数
export const updateApiKey = (apiKey: string) => {
  API_CONFIG.API_KEY = apiKey;
  localStorage.setItem('sora2_api_key', apiKey);
  console.log('API Key 已更新，长度:', apiKey.length);
};

// 从localStorage加载API Key
export const loadApiKey = (): string => {
  const savedKey = localStorage.getItem('sora2_api_key');
  if (savedKey) {
    API_CONFIG.API_KEY = savedKey;
    console.log('API Key 已加载，长度:', savedKey.length);
  } else {
    console.warn('未找到保存的 API Key');
  }
  return API_CONFIG.API_KEY;
};

// 获取当前API Key（实时获取）
export const getCurrentApiKey = (): string => {
  return API_CONFIG.API_KEY || localStorage.getItem('sora2_api_key') || '';
};

// Sora-2-Pro API Key 管理
export const updateSora2ProApiKey = (apiKey: string) => {
  localStorage.setItem('sora2_pro_api_key', apiKey);
  console.log('Sora-2-Pro API Key 已更新，长度:', apiKey.length);
};

export const loadSora2ProApiKey = (): string => {
  const savedKey = localStorage.getItem('sora2_pro_api_key');
  if (savedKey) {
    console.log('Sora-2-Pro API Key 已加载，长度:', savedKey.length);
  } else {
    console.warn('未找到保存的 Sora-2-Pro API Key');
  }
  return savedKey || '';
};

export const getSora2ProApiKey = (): string => {
  return localStorage.getItem('sora2_pro_api_key') || '';
};

