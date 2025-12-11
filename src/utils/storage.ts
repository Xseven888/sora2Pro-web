/**
 * 作者：沐七
 * 日期：2025/12/11
 */
// 本地存储工具
export const storage = {
  // 保存商品列表
  saveProducts: (products: any[]) => {
    localStorage.setItem('products', JSON.stringify(products));
  },
  
  // 获取商品列表
  getProducts: (): any[] => {
    const data = localStorage.getItem('products');
    return data ? JSON.parse(data) : [];
  },
  
  // 保存提示词设置
  savePromptSettings: (settings: any) => {
    localStorage.setItem('promptSettings', JSON.stringify(settings));
  },
  
  // 获取提示词设置
  getPromptSettings: () => {
    const data = localStorage.getItem('promptSettings');
    return data ? JSON.parse(data) : {
      mainImagePrompt: `背景：纯白色（#FFFFFF），干净，无纹理。
主体：保持原样外观和质感，不改变颜色和结构。移除所有人像，只保留服装。
抠图：边缘干净无锯齿，无残留背景。
光线：均匀柔和，无明显阴影和色偏。
构图：产品居中，留白适中，画面整洁。
分辨率：最低2048x2048。
输出：PNG（透明背景）或JPEG（白底），适合电商展示。`,
      scenePrompt: `请基于产品图与商品标题生成一个用于sora生成 15 秒的产品介绍视频脚本与镜头计划。要求：
1）TIKTOK热门短视频风格
2) 产品简短描述与核心卖点(英文)。
3)不能出现任何字幕和屏幕文字
4) 时间轴划分为4-5个镜头，每个镜头标注
5)需要有美国真人出镜展示
6)镜头画面是人物手持手机拍镜子里的画面
总时长严格控制在 15 秒。
请按如下格式输出：
Shot 1（0-1s）：画面内容…｜镜头运动…｜人物说话…｜
Shot 2（1-2s）：…
Shot 3（2-3s）：…`
    };
  },
  
  // 保存视频生成任务列表
  saveVideoTasks: (tasks: any[]) => {
    localStorage.setItem('videoGeneratorTasks', JSON.stringify(tasks));
  },
  
  // 获取视频生成任务列表
  getVideoTasks: (): any[] => {
    const data = localStorage.getItem('videoGeneratorTasks');
    return data ? JSON.parse(data) : [];
  },
};

