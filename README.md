# Sora2 视频生成器

一个基于 Sora2 API 的视频生成网站，支持文生视频、图生视频以及一键带货功能。

## 功能特性

### 视频生成
- **文生视频**：使用文本提示词生成视频
- **图生视频**：上传图片并配合提示词生成视频
- **多模型支持**：支持 Sora-2 和 Sora-2-Pro 模型
- **实时进度**：显示生成进度和状态
- **日志记录**：记录所有操作日志

### 一键带货
- **商品管理**：添加、查看商品列表
- **提示词设置**：自定义主图处理和场景生成提示词
- **自动化流程**：
  1. 上传商品主图
  2. 使用 Gemini 生成白底图
  3. 使用 ChatGPT 生成视频脚本提示词
  4. 使用 Sora2 生成商品视频

## 技术栈

- React 18
- TypeScript
- Vite
- Axios

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
复制 `.env.example` 为 `.env`，并填入你的 API 配置：
```
VITE_API_BASE_URL=你的API基础URL
VITE_API_KEY=你的API密钥
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 构建生产版本：
```bash
npm run build
```

## API 配置

项目需要以下 API 端点：

- **视频生成 API**：`POST /v1/video/create`
- **任务查询 API**：`GET /v1/video/query`
- **图片上传 API**：`POST https://imageproxy.zhongzhuan.chat/api/upload`
- **Gemini API**：`POST /v1/chat/completions` (model: gemini-2.5-flash-image)
- **ChatGPT API**：`POST /v1/chat/completions` (model: gpt-5-chat-latest)

## 使用说明

### 视频生成
1. 选择模型（Sora-2 或 Sora-2-Pro）
2. 选择功能（文生视频或图生视频）
3. 输入提示词
4. 如果是图生视频，上传图片
5. 设置生成视频数量
6. 点击"生成视频"按钮

### 一键带货
1. 点击"添加"按钮添加商品
2. 输入商品标题并上传主图
3. 点击"提示词设置"配置提示词（可选）
4. 在商品列表中点击"生成视频"开始自动化流程

## 注意事项

- 确保 API 密钥配置正确
- 图片上传需要网络连接
- 视频生成可能需要较长时间，请耐心等待
- 所有数据存储在浏览器本地存储中

## 获取API地址说明

- 获取API地址：https://api.sora2.email/register?aff=J0Aw


![alt text](1.png)![alt text](2.png)![alt text](3.png)![alt text](wx1.jpg) ![alt text](wx.jpg) ![alt text](3-1.png)