# Dnsflare

一个可视化管理 Cloudflare DNS 的轻量面板，并在原项目基础上增加了 **Remote DNS API**。

本仓库基于 [5aaee9/Dnsflare](https://github.com/5aaee9/Dnsflare) 继续维护。

## 新增：Remote DNS API

可以直接通过一条命令远程创建或更新 Cloudflare DNS 记录，目前支持：

- `A`
- `AAAA`
- `CNAME`
- `cf` 参数：开启 Cloudflare Proxy / CDN（橙色云朵）

命令格式：

```text
<目标值> <记录类型> <完整域名> [cf]
```

示例：

```text
1.1.1.1 a test.example.com
1.1.1.1 a test.example.com cf
2606:4700:4700::1111 aaaa ipv6.example.com
origin.example.net cname www.example.com cf
```

调用：

```bash
curl -X POST https://your-dnsflare.pages.dev/command \
  -H "X-Dnsflare-Key: YOUR_SECRET" \
  --data "1.1.1.1 a test.example.com cf"
```

也可以使用 Bearer：

```bash
curl -X POST https://your-dnsflare.pages.dev/command \
  -H "Authorization: Bearer YOUR_SECRET" \
  --data "1.1.1.1 a test.example.com cf"
```

Remote API 会自动：

1. 根据完整域名寻找对应的 Cloudflare Zone。
2. 查询当前同名 DNS 记录。
3. 同类型记录只有一条时自动更新。
4. 不存在同类型记录时自动创建。
5. 检测 CNAME 与 A/AAAA 冲突，避免误删记录。
6. 同类型存在多条记录时拒绝自动选择，避免破坏轮询配置。

详细说明见 [Remote API 文档](docs/remote_api.md)。

## Remote API 环境变量

在 Cloudflare Pages 项目的环境变量 / Secret 中添加：

```text
CF_API_TOKEN=你的 Cloudflare API Token
DNSFLARE_API_KEY=你自定义的远程调用密钥
```

`CF_API_TOKEN` 至少需要：

- Zone / Zone / Read
- Zone / DNS / Edit

建议生成一个足够长的 `DNSFLARE_API_KEY`：

```bash
openssl rand -hex 32
```

> 不要把这两个值写进 Git 仓库。

## 原有 Web 面板

原项目的 Web DNS 管理界面保持不变。

浏览器登录模式仍然支持 Cloudflare API Token，以及原项目已有的 Global API Key + Email 模式。

如果只使用 Web 面板，可以继续按照原来的方式使用；如果要启用 `/command` Remote API，再配置上面的两个服务端 Secret 即可。

## Cloudflare Token 权限

Web 管理界面的完整功能可按需要配置：

- Zone.DNS 写权限
- Zone.Zone 读权限
- Zone.SSL and Certificates 读写权限（如果要使用证书相关功能）

Remote API 本身只需要：

- Zone.Zone Read
- Zone.DNS Edit

## 部署

见 [Cloudflare Pages 部署说明](docs/deploy_cloudflare.md)。

## 安全建议

Remote API 会直接修改 DNS，请至少做到：

- 使用随机长密钥作为 `DNSFLARE_API_KEY`。
- Cloudflare API Token 使用最小权限，不要使用 Global API Key。
- 不要把 Token 或 API Key 提交到仓库。
- 如果 API 暴露在公网，建议再配合 Cloudflare WAF / Rate Limiting / Access 使用。

## License

Open sourced under the MIT license.
