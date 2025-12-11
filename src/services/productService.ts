/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import { Product, PromptSettings } from '../types';
import {
  uploadImage,
  generateImageWithGemini,
  generatePromptWithChatGPT,
  createVideo,
  queryTask,
} from './api';
import { storage } from '../utils/storage';
import { API_CONFIG } from '../config';

// 一键带货流程：上传图片 -> Gemini生成白底图 -> ChatGPT生成提示词 -> 图生视频
export const generateVideoForProduct = async (
  product: Product,
  promptSettings: PromptSettings,
  model: 'sora-2' | 'sora-2-pro' = 'sora-2',
  duration: number = 10,
  onProgress?: (step: string, progress: number) => void
) => {
  // 声明 whiteBgImageUrl 在外部作用域
  let whiteBgImageUrl = '';
  
  try {
    // 步骤1: 使用Gemini根据主图处理提示词生成白底图
    onProgress?.('使用Gemini生成白底图...', 10);
    
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
                url: product.mainImage,
              },
            },
          ],
        },
      ];

      console.log('调用Gemini API，检查API Key:', {
        hasApiKey: !!(API_CONFIG.API_KEY || localStorage.getItem('sora2_api_key')),
        apiKeyLength: (API_CONFIG.API_KEY || localStorage.getItem('sora2_api_key') || '').length,
      });
      
      const geminiResponse = await generateImageWithGemini({
        model: 'gemini-2.5-flash-image',
        messages: geminiMessages as any,
        temperature: 0.7,
        max_tokens: 1000,
      });

      console.log('Gemini响应:', geminiResponse);

      // 从响应中提取图片URL或base64
      const geminiContent = geminiResponse.choices[0]?.message?.content || '';
      
      console.log('Gemini返回内容:', geminiContent);
      
      // 尝试从响应中提取图片URL
      const urlMatch = geminiContent.match(/https?:\/\/[^\s\)]+/);
      if (urlMatch) {
        whiteBgImageUrl = urlMatch[0];
      } else {
        // 尝试提取 base64 图片数据
        const base64Match = geminiContent.match(/data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)/);
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
          console.log('上传 Gemini 生成的图片到图床...');
          const uploadResult = await uploadImage(file);
          whiteBgImageUrl = uploadResult.url;
          console.log('图片上传成功，URL:', whiteBgImageUrl);
        } else {
          // 如果都没有找到，抛出错误
          (Error as any).step = 'Gemini生成白底图';
          throw new Error(`未能从Gemini响应中提取图片。响应内容: ${geminiContent.substring(0, 500)}`);
        }
      }
    } catch (error: any) {
      (error as any).step = 'Gemini生成白底图';
      // 提供更详细的错误信息
      if (error.response?.status === 503) {
        throw new Error('Gemini API 服务暂时不可用 (503)，请稍后重试');
      } else if (error.response?.status === 401) {
        throw new Error('API Key 认证失败，请检查API Key是否正确');
      } else if (error.response?.status) {
        throw new Error(`Gemini API 调用失败 (${error.response.status}): ${error.response.statusText || error.message}`);
      }
      throw error;
    }
    
    if (!whiteBgImageUrl) {
      throw new Error('未能获取白底图URL');
    }
    
    onProgress?.('白底图生成完成', 30);

    // 更新产品的白底图
    const products = storage.getProducts();
    const updatedProducts = products.map((p) =>
      p.id === product.id ? { ...p, whiteBgImage: whiteBgImageUrl } : p
    );
    storage.saveProducts(updatedProducts);

    // 步骤2: 使用ChatGPT根据产品标题和场景提示词生成视频提示词
    onProgress?.('使用ChatGPT生成视频提示词...', 40);
    
    let videoPrompt = '';
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
              text: `产品标题：${product.title}\n\n请根据上述要求生成视频脚本提示词。`,
            },
            {
              type: 'image_url',
              image_url: {
                url: whiteBgImageUrl,
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

      videoPrompt = chatgptResponse.choices[0]?.message?.content || '';
      console.log('ChatGPT生成的提示词:', videoPrompt);
      
      if (!videoPrompt) {
        throw new Error('ChatGPT未返回有效的提示词');
      }
      
      onProgress?.('视频提示词生成完成', 50);
    } catch (error: any) {
      (error as any).step = 'ChatGPT生成提示词';
      throw error;
    }

    // 步骤3: 使用生成的提示词和白底图创建视频
    onProgress?.('创建视频任务...', 60);
    
    const videoResult = await createVideo({
      model: model,
      prompt: videoPrompt,
      images: [whiteBgImageUrl],
      orientation: 'portrait', // 一键带货默认使用竖屏
      size: model === 'sora-2-pro' ? 'large' : 'small', // sora-2-pro默认使用1080p，sora-2使用720p
      duration: duration, // 使用传入的时长参数，必须是整数
    });

    const taskId = videoResult.id || videoResult.choices?.[0]?.message?.content;
    if (!taskId) {
      throw new Error('未获取到视频任务ID');
    }

    // 提交任务后立即保存任务ID和生成参数，这样详情就能立即显示
    const productsAfterSubmit = storage.getProducts();
    const updatedProductsAfterSubmit = productsAfterSubmit.map((p) =>
      p.id === product.id
        ? { 
            ...p, 
            whiteBgImage: whiteBgImageUrl, // 同时保存白底图
            taskId: taskId,
            model: model,
            prompt: videoPrompt, // 立即保存ChatGPT生成的提示词
            duration: duration,
            orientation: 'portrait',
            size: model === 'sora-2-pro' ? 'large' : 'small',
          }
        : p
    );
    storage.saveProducts(updatedProductsAfterSubmit);

    onProgress?.('视频生成中，请等待...', 70);

    // 根据模型动态计算超时时间
    // sora-2-pro：基础超时 60分钟
    // sora-2：基础超时 30分钟
    const baseTimeoutMinutes = model === 'sora-2-pro' ? 60 : 30;
    const maxAttempts = Math.ceil((baseTimeoutMinutes * 60) / 2); // 每2秒轮询一次
    
    console.log(`视频生成超时设置: 模型=${model}, 时长=${duration}秒, 超时=${baseTimeoutMinutes}分钟, 最多轮询${maxAttempts}次`);

    // 轮询任务状态直到完成
    let videoUrl = '';
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待2秒
      
      const taskStatus = await queryTask(taskId);
      const progress = taskStatus.detail?.progress_pct ? taskStatus.detail.progress_pct * 100 : 70;
      onProgress?.(`视频生成中... (${Math.round(progress)}%)`, Math.min(70 + progress * 0.3, 95));
      
      if (taskStatus.status === 'completed' && taskStatus.video_url) {
        videoUrl = taskStatus.video_url;
        break;
      } else if (taskStatus.status === 'failed') {
        throw new Error('视频生成失败');
      }
      
      attempts++;
    }

    if (!videoUrl) {
      throw new Error(`视频生成超时（已等待 ${baseTimeoutMinutes} 分钟）。任务可能仍在处理中，请稍后在视频库中查看。`);
    }

    onProgress?.('视频生成完成！', 100);

    // 获取最后一次查询的任务状态，以获取完整的生成参数
    const finalTaskStatus = await queryTask(taskId);
    
    // 更新产品状态，保存视频URL，如果API返回了enhanced_prompt则更新（否则保持之前保存的videoPrompt）
    const finalProducts = storage.getProducts();
    const finalUpdatedProducts = finalProducts.map((p) =>
      p.id === product.id
        ? { 
            ...p, 
            whiteBgImage: whiteBgImageUrl, 
            status: 'completed' as const, 
            videoUrl,
            // 如果API返回了enhanced_prompt，使用它；否则保持之前保存的videoPrompt
            prompt: finalTaskStatus.enhanced_prompt || p.prompt || videoPrompt,
            // 其他参数已经在提交任务时保存，这里不需要重复保存
          }
        : p
    );
    storage.saveProducts(finalUpdatedProducts);

    return {
      ...product,
      whiteBgImage: whiteBgImageUrl,
      status: 'completed' as const,
      videoUrl,
      taskId: taskId,
      model: model,
      prompt: finalTaskStatus.enhanced_prompt || videoPrompt,
      duration: duration,
      orientation: 'portrait',
      size: model === 'sora-2-pro' ? 'large' : 'small',
    };
  } catch (error: any) {
    console.error('生成视频流程失败:', error);
    // 提供更详细的错误信息
    let errorMessage = '生成视频失败';
    if (error.message) {
      errorMessage = error.message;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    }
    console.error('错误详情:', {
      message: errorMessage,
      response: error.response?.data,
      status: error.response?.status,
      step: error.step || '未知步骤',
    });
    const detailedError = new Error(errorMessage);
    (detailedError as any).details = {
      response: error.response?.data,
      status: error.response?.status,
      originalError: error,
    };
    throw detailedError;
  }
};

