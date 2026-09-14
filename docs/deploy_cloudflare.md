# 部署到 Cloudflare Pages

## 推荐方式：GitHub Actions 自动部署

仓库已经包含：

```text
.github/workflows/deploy-cloudflare-pages.yml
wrangler.jsonc
```

默认 Pages 项目名：

```text
dnsflare-tionmon
```

生产地址通常为：

```text
https://dnsflare-tionmon.pages.dev
```

### 1. 在 GitHub Actions Secrets 添加 4 个 Secret

路径：

```text
GitHub 仓库
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

需要：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CF_API_TOKEN
DNSFLARE_API_KEY
```

说明：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
- `CLOUDFLARE_API_TOKEN`：用于创建/部署 Pages，给 Account / Cloudflare Pages / Edit 权限即可。
- `CF_API_TOKEN`：Dnsflare Remote API 运行时使用，给 Zone / Zone / Read 和 Zone / DNS / Edit 权限。
- `DNSFLARE_API_KEY`：调用 `/command` 时使用的自定义密钥，可使用 `openssl rand -hex 32` 生成。

建议把部署 Token 和 DNS Token 分开，避免运行时 DNS Token 拥有 Pages 管理权限。

### 2. 执行部署

打开：

```text
GitHub 仓库
→ Actions
→ Deploy Cloudflare Pages
→ Run workflow
```

工作流会自动：

1. 安装 Node.js 20。
2. 安装项目依赖。
3. 执行 `npm run build`。
4. 检查 `dnsflare-tionmon` Pages 项目是否存在。
5. 不存在则自动创建。
6. 把 `CF_API_TOKEN` 和 `DNSFLARE_API_KEY` 写入 Cloudflare Pages Secrets。
7. 部署 `dist` 和根目录的 `functions/` Pages Functions。

以后 `master` 有新的提交时也会自动重新部署。

## 方式二：Cloudflare Pages 连接 GitHub

也可以直接在 Cloudflare Dashboard 中创建 Pages 项目并连接本仓库。

构建配置：

```text
Framework preset: Vue / Vite
Production branch: master
Build command: npm run build
Build output directory: dist
```

部署完成后，`functions/` 目录中的 Pages Functions 会自动提供：

```text
/api/*
/command
```

然后在：

```text
Cloudflare Dashboard
→ Workers & Pages
→ 你的 Pages 项目
→ Settings
→ Variables and Secrets
```

添加两个 Secret：

```text
CF_API_TOKEN=你的 Cloudflare API Token
DNSFLARE_API_KEY=你的 Dnsflare Remote API Key
```

`CF_API_TOKEN` 至少需要：

```text
Zone / Zone / Read
Zone / DNS / Edit
```

生产环境和 Preview 环境的 Secrets 是分开的，需要按实际情况分别配置。

## 方式三：Wrangler CLI

安装依赖并构建：

```bash
npm install
npm run build
```

创建 Pages 项目：

```bash
npx wrangler@4 pages project create dnsflare-tionmon --production-branch master
```

写入运行时 Secrets：

```bash
npx wrangler@4 pages secret put CF_API_TOKEN --project-name dnsflare-tionmon
npx wrangler@4 pages secret put DNSFLARE_API_KEY --project-name dnsflare-tionmon
```

部署：

```bash
npx wrangler@4 pages deploy dist --project-name dnsflare-tionmon --branch master
```

## 验证 Remote API

打开：

```text
https://dnsflare-tionmon.pages.dev/command
```

应该能看到 API 使用说明 JSON。

然后测试：

```bash
curl -X POST https://dnsflare-tionmon.pages.dev/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "1.1.1.1 a test.example.com"
```

成功时返回：

```json
{
  "success": true,
  "action": "created"
}
```

如果同类型记录已存在，则 `action` 为：

```text
updated
```
