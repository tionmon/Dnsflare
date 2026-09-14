# Dnsflare Remote DNS API

Remote API 用于从 VPS、脚本、Bot、GitHub Actions 或 AI Agent 远程创建 / 更新 Cloudflare DNS。

## Endpoint

```text
POST /command
```

查看帮助：

```text
GET /command
```

## 认证

支持两种方式。

### X-Dnsflare-Key

```http
X-Dnsflare-Key: YOUR_SECRET
```

### Bearer Token

```http
Authorization: Bearer YOUR_SECRET
```

这里使用的是你自己配置的 `DNSFLARE_API_KEY`，不是 Cloudflare Token。

## 文本命令

格式：

```text
<content> <A|AAAA|CNAME> <name> [cf]
```

### A

```bash
curl -X POST https://your-domain.example/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "1.1.1.1 a test.example.com"
```

### A + Cloudflare Proxy

```bash
curl -X POST https://your-domain.example/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "1.1.1.1 a test.example.com cf"
```

`cf` 对应：

```json
{
  "proxied": true
}
```

没有 `cf` 时为：

```json
{
  "proxied": false
}
```

### AAAA

```bash
curl -X POST https://your-domain.example/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "2606:4700:4700::1111 aaaa ipv6.example.com"
```

### CNAME

```bash
curl -X POST https://your-domain.example/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "origin.example.net cname www.example.com cf"
```

记录类型大小写不敏感。

## JSON 请求

也支持：

```bash
curl -X POST https://your-domain.example/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "1.1.1.1",
    "type": "A",
    "name": "test.example.com",
    "proxied": true
  }'
```

也可以使用：

```json
{
  "value": "1.1.1.1",
  "type": "a",
  "hostname": "test.example.com",
  "cf": true
}
```

## Upsert 行为

接口不是单纯 Create，而是 Upsert。

例如第一次：

```text
1.1.1.1 a test.example.com
```

会创建记录。

之后执行：

```text
8.8.8.8 a test.example.com
```

如果只有一条同名 A 记录，则直接更新为 `8.8.8.8`。

## Zone 自动识别

你不需要提供 Zone ID。

例如：

```text
www.dev.example.com
```

Remote API 会依次尝试：

```text
www.dev.example.com
dev.example.com
example.com
```

直到找到你 Cloudflare 账号中实际存在的 Zone。

因此也支持 Cloudflare 中以子域名本身作为 Zone 的场景。

## 冲突保护

### CNAME 与 A / AAAA

如果：

```text
test.example.com A 1.1.1.1
```

已经存在，再执行：

```text
origin.example.net cname test.example.com
```

Remote API 不会自动删除 A 记录，而是返回：

```json
{
  "success": false,
  "error": "RECORD_CONFLICT"
}
```

### 同类型多记录

如果某个名称存在多条 A：

```text
test.example.com A 1.1.1.1
test.example.com A 8.8.8.8
```

接口不会擅自选择其中一条进行覆盖，而是返回：

```json
{
  "success": false,
  "error": "MULTIPLE_RECORDS"
}
```

这样可以避免破坏 DNS 轮询 / 多源配置。

## 成功响应

创建：

```json
{
  "success": true,
  "action": "created",
  "zone": {
    "id": "...",
    "name": "example.com"
  },
  "record": {
    "id": "...",
    "type": "A",
    "name": "test.example.com",
    "content": "1.1.1.1",
    "ttl": 1,
    "proxied": true
  }
}
```

更新时：

```json
{
  "success": true,
  "action": "updated"
}
```

## 环境变量

Cloudflare Pages 中配置：

```text
CF_API_TOKEN
DNSFLARE_API_KEY
```

也兼容：

```text
CLOUDFLARE_API_TOKEN
```

作为 `CF_API_TOKEN` 的备用变量名。

## Cloudflare API Token 权限

建议单独创建一个 API Token，仅授予：

```text
Zone / Zone / Read
Zone / DNS / Edit
```

资源范围可以进一步限制到指定 Zone。

不要使用 Global API Key 作为 Remote API 服务端凭证。

## 安全建议

建议：

1. `DNSFLARE_API_KEY` 至少使用 32 字节随机值。
2. API Token 只给需要管理的 Zone。
3. 不要把任何 Secret 放进仓库。
4. 对公网部署建议增加 Cloudflare WAF / Rate Limiting。
5. 如果仅固定几台服务器调用，可以进一步使用 Cloudflare Access 或 IP 规则限制来源。
