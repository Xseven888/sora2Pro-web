# 宝塔面板部署指南

## 作者：沐七
## 日期：2025/12/11

本文档详细说明如何将 Sora2 视频生成工具部署到服务器上的宝塔面板。

---

## 一、准备工作

### 1.1 本地构建项目

在本地开发环境中，执行以下命令构建生产版本：

```bash
# 安装依赖（如果还没安装）
npm install

# 构建生产版本
npm run build
```

构建完成后，会在项目根目录生成 `dist` 文件夹，这就是需要上传到服务器的文件。

### 1.2 检查构建文件

构建完成后，确认 `dist` 文件夹中包含以下内容：
- `index.html` - 入口文件
- `assets/` - 静态资源文件夹（JS、CSS、图片等）

---

## 二、宝塔面板配置

### 2.1 登录宝塔面板

1. 访问服务器IP地址:8888（或您的宝塔面板端口）
2. 使用管理员账号登录

### 2.2 创建网站

1. 点击左侧菜单 **"网站"**
2. 点击 **"添加站点"**
3. 填写以下信息：
   - **域名**：填写您的域名（如：`video.example.com`）或IP地址
   - **备注**：Sora2视频生成工具
   - **根目录**：选择或创建网站目录（如：`/www/wwwroot/video.example.com`）
   - **PHP版本**：选择"纯静态"（因为这是前端项目，不需要PHP）
   - **FTP**：根据需要选择（可选）
   - **数据库**：不需要（前端项目）

4. 点击 **"提交"** 创建网站

### 2.3 上传文件

#### 方法一：通过宝塔面板文件管理器上传

1. 点击左侧菜单 **"文件"**
2. 进入网站根目录（如：`/www/wwwroot/video.example.com`）
3. 删除默认的 `index.html` 文件（如果存在）
4. 点击 **"上传"** 按钮
5. 选择本地构建好的 `dist` 文件夹中的所有文件
6. 上传完成后，确保文件结构如下：
   ```
   /www/wwwroot/video.example.com/
   ├── index.html
   └── assets/
       ├── index-xxxxx.js
       ├── index-xxxxx.css
       └── ...
   ```

#### 方法二：通过FTP上传

1. 在宝塔面板中创建FTP账号（如果需要）
2. 使用FTP客户端（如FileZilla）连接服务器
3. 将 `dist` 文件夹中的所有文件上传到网站根目录

#### 方法三：通过SSH上传（推荐）

1. 在本地压缩 `dist` 文件夹：
   ```bash
   # Windows: 右键 dist 文件夹 -> 发送到 -> 压缩(zipped)文件夹
   # Linux/Mac:
   cd 项目目录
   zip -r dist.zip dist/*
   ```

2. 使用SCP或SFTP上传到服务器：
   ```bash
   scp dist.zip root@服务器IP:/www/wwwroot/video.example.com/
   ```

3. 通过SSH登录服务器解压：
   ```bash
   ssh root@服务器IP
   cd /www/wwwroot/video.example.com/
   unzip dist.zip
   mv dist/* .
   rm -rf dist dist.zip
   ```

---

## 三、Nginx配置

### 3.1 配置网站

1. 在宝塔面板中，点击 **"网站"** -> 找到您创建的网站 -> 点击 **"设置"**
2. 进入 **"网站设置"** 标签页
3. 点击 **"配置文件"** 标签

### 3.2 修改Nginx配置

**重要提示**：不要完全替换配置文件！请在原有配置的基础上添加API代理配置。

#### 方法一：在原有配置中添加（推荐）

在宝塔面板中，进入网站设置 → 配置文件，找到以下位置：

在 `location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$` 这一行**之前**，添加以下API代理配置：

```nginx
    # API代理配置 - 解决CORS问题
    # 创建角色API代理
    location /sora/v1/characters {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS头处理
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        # 处理预检请求
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 视频生成API代理
    location /v1/video {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 聊天API代理
    location /v1/chat {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 处理前端路由（SPA应用）- 如果原配置中没有，需要添加
    location / {
        try_files $uri $uri/ /index.html;
    }
```

#### 方法二：完整配置示例（如果必须替换）

如果必须替换整个配置，请使用以下完整配置（基于您的原配置）：

```nginx
server {
    listen 80;
    server_name video.example.com;  # 修改为您的域名
    index index.html;
    root /www/wwwroot/video.example.com;  # 修改为您的网站根目录

    # 启用gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # API代理配置 - 解决CORS问题
    # 创建角色API代理
    location /sora/v1/characters {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS头处理
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        # 处理预检请求
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 视频生成API代理
    location /v1/video {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 聊天API代理
    location /v1/chat {
        proxy_pass https://api.sora2.email;
        proxy_set_header Host api.sora2.email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # 处理前端路由（SPA应用）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }
}
```

### 3.3 保存并重启Nginx

1. 点击 **"保存"** 按钮
2. 点击左侧菜单 **"软件商店"** -> **"已安装"** -> 找到 **"Nginx"** -> 点击 **"设置"** -> **"重启"**

---

## 四、配置HTTPS（可选但推荐）

### 4.1 申请SSL证书

1. 在宝塔面板中，点击 **"网站"** -> 找到您的网站 -> 点击 **"设置"**
2. 进入 **"SSL"** 标签页
3. 选择 **"Let's Encrypt"** 免费证书
4. 填写域名（确保域名已解析到服务器IP）
5. 点击 **"申请"** 按钮
6. 申请成功后，点击 **"强制HTTPS"** 按钮

### 4.2 自动续期

Let's Encrypt证书会自动续期，无需手动操作。

---

## 五、环境变量配置（如果需要）

如果您的项目使用了环境变量，需要在构建时配置，或者在服务器上通过其他方式设置。

### 5.1 创建 .env.production 文件

在项目根目录创建 `.env.production` 文件：

```env
VITE_API_BASE_URL=https://api.sora2.email
```

### 5.2 重新构建

```bash
npm run build
```

然后重新上传 `dist` 文件夹。

---

## 六、常见问题

### 6.1 页面显示404

**原因**：Nginx配置不正确，没有正确处理前端路由。

**解决方法**：确保Nginx配置中有以下规则：
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### 6.2 静态资源加载失败

**原因**：文件路径不正确或文件未上传完整。

**解决方法**：
1. 检查 `dist/assets` 文件夹是否完整上传
2. 检查文件权限（建议设置为755）
3. 清除浏览器缓存

### 6.3 API请求失败

**原因**：跨域问题或API地址配置错误。

**解决方法**：
1. 检查 `src/config.ts` 中的API地址配置
2. **重要**：确保Nginx配置中已添加API代理配置（见3.2节）
3. 如果使用HTTPS，确保代理配置中的 `proxy_pass` 也使用 `https://`
4. 检查浏览器控制台的错误信息
5. 检查Nginx错误日志：`/www/server/nginx/logs/error.log`

**特别注意**：创建角色功能需要Nginx代理配置才能正常工作，否则会遇到CORS错误。

### 6.4 文件上传功能不工作

**原因**：File System Access API在服务器环境下可能有限制。

**解决方法**：
- 这是正常的，File System Access API主要用于本地文件访问
- 批量导入功能中的本地文件路径功能在服务器环境下需要用户手动选择文件

---

## 七、更新部署

当需要更新网站时：

1. 在本地重新构建：
   ```bash
   npm run build
   ```

2. 备份服务器上的旧文件（可选但推荐）

3. 删除服务器上 `dist` 文件夹中的旧文件

4. 上传新的 `dist` 文件夹内容到服务器

5. 清除浏览器缓存或使用无痕模式测试

---

## 八、性能优化建议

### 8.1 启用CDN

如果您的服务器带宽有限，建议使用CDN加速：
- 阿里云CDN
- 腾讯云CDN
- Cloudflare（免费）

### 8.2 压缩静态资源

Nginx配置中已包含gzip压缩，确保已启用。

### 8.3 浏览器缓存

静态资源已配置1年缓存，减少服务器压力。

---

## 九、安全建议

1. **定期更新**：定期更新依赖包和系统
2. **防火墙**：在宝塔面板中配置防火墙规则
3. **SSL证书**：使用HTTPS加密传输
4. **备份**：定期备份网站文件
5. **访问限制**：如果需要，可以设置IP白名单

---

## 十、联系支持

如果遇到问题，请检查：
1. 浏览器控制台的错误信息
2. 服务器日志（宝塔面板 -> 网站 -> 日志）
3. Nginx错误日志

---

## 部署检查清单

- [ ] 本地构建成功，生成 `dist` 文件夹
- [ ] 在宝塔面板创建网站
- [ ] 上传所有文件到网站根目录
- [ ] 配置Nginx（包含SPA路由支持）
- [ ] 重启Nginx服务
- [ ] 测试网站访问
- [ ] 配置SSL证书（可选）
- [ ] 测试所有功能
- [ ] 配置防火墙规则
- [ ] 设置定期备份

---

**部署完成后，您的网站应该可以通过域名或IP地址正常访问了！**

