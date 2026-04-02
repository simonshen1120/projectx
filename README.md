# AI 面试教练 MVP

极简单页应用：录音 -> 语音转写（浏览器）-> DeepSeek 评分建议。

## 本地运行

1. 创建 `.env`（参考 `env.example`）：

```env
PORT=8787
DEEPSEEK_API_KEY=sk-xxxxx
```

2. 安装并启动：

```bash
npm install
npm run dev
```

3. 打开 `http://localhost:5173`

## 部署（方案 A：Vercel）

### 你需要申请什么

- 一个 [Vercel](https://vercel.com/) 账号（可用 GitHub 登录）
- 一个 DeepSeek API Key（你已经有）
- （可选）自定义域名，后续可在 Vercel 绑定

### 上线步骤

1. 把项目放到 GitHub 仓库（推荐单独仓库）
2. 在 Vercel 点击 `Add New Project`，导入该仓库
3. 在 Vercel 项目设置里配置环境变量：
   - `DEEPSEEK_API_KEY=sk-xxxxx`
4. 直接 Deploy（无需额外服务器）
5. 部署完成后，把 Vercel 给你的 URL 发给别人即可访问

### 说明

- 前端页面和 `/api/evaluate` 接口都在同一域名下运行
- 本项目已内置 `api/` Serverless Functions，Vercel 会自动识别
- 如果你将来改成“前后端分离部署”，再配置 `VITE_API_BASE_URL`
