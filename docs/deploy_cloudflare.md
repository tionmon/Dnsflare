# 部署到 Cloudflare Pages

## 方式一：Cloudflare Pages 连接 GitHub

推荐直接在 Cloudflare Dashboard 中创建 Pages 项目并连接本仓库。

构建配置：

```text
Framework preset: Vue / Vite
Build command: npm run build
Build output directory: dist
```

如果使用 pnpm：

```text
Build command: pnpm build
```

部署完成后，`functions/` 目录中的 Pages Functions 会自动提供：

```text
/api/*
/command
```

## Remote API 必需环境变量

如果要使用 `/command`，在：

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

Cloudflare Token 至少需要：

```text
Zone / Zone / Read
Zone / DNS / Edit
```

建议生成远程 API Key：

```bash
openssl rand -hex 32
```

生产环境和 Preview 环境的变量是分开的，需要按实际情况分别配置。

## 方式二：Wrangler CLI

安装：

```bash
npm install -g wrangler
```

安装依赖并构建：

```bash
npm install
npm run build
```

部署：

```bash
wrangler pages deploy dist
```

然后在 Cloudflare Dashboard 中为对应 Pages 项目添加 Secret。

也可以使用 Wrangler 为项目写入 Secret；具体命令以当前 Wrangler Pages 配置为准。

## 验证 Remote API

打开：

```text
https://你的域名/command
```

应该能看到 API 使用说明 JSON。

然后测试：

```bash
curl -X POST https://你的域名/command \
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
