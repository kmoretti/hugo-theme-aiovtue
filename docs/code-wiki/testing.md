# 测试与质量

## 当前测试现状

扫描 `blog/` 时未发现名称包含 `test`/`spec` 的源码测试入口，也未发现 `test`、`lint`、`format`、`typecheck` 脚本、GitHub Actions workflow、Dockerfile 或 Makefile。当前项目质量门禁主要是 Hugo 构建本身和人工浏览器检查；这是扫描结论，不代表仓库绝对没有未被命名规则捕获的外部测试。

## 可执行命令

| 检查 | 命令 | 来源 | 能证明什么 |
|---|---|---|---|
| Hugo 版本 | `hugo version` | README 环境要求 | 本机是否安装 Extended 及版本 |
| 依赖安装 | `pnpm install` | README、`package.json` | 依赖能否安装；会涉及 `sharp` 原生构建 |
| 开发预览 | `pnpm dev` | `package.json:5-6` | 准备数据后能否启动 Hugo server；包含草稿 |
| 生产构建 | `pnpm build` | `package.json:8`、`scripts/build.mjs` | 准备脚本和 Hugo 静态生成链路是否完成 |
| Cloudflare 同构构建 | `pnpm build:cf` | `package.json:9` | 当前实际与 build 同一脚本；环境差异由变量决定 |
| 鼠标资源校验 | `pnpm compress-mouse` | `package.json:7` | 给定 ANI 源下能否生成并验证 manifest；会写资源 |

本次 Wiki 生成没有执行上述命令，因此没有声称“测试通过”。

## 人工验证清单

### 构建输出

- [ ] `public/index.html`、文章页、分类、标签、归档和 RSS 是否生成。
- [ ] 删除一篇文章后执行构建，旧页面是否因 `--cleanDestinationDir` 清理。
- [ ] 站点绝对链接、sitemap、robots 和 RSS 的域名是否与部署域名一致。
- [ ] 控制台是否出现模板警告、资源 404 或外部抓取异常。

### 页面与响应式

- [ ] 首页 cards/list/timeline（若配置启用）在桌面和移动端正确显示。
- [ ] 文章 TOC、代码高亮、LaTeX、图片灯箱、上一篇/下一篇和评论。
- [ ] 友链卡片、RSS spotlight、友链申请/更新表单、申请状态列表、相册密码门和图片查看器。
- [ ] 动态的首屏 5 条及后续 IntersectionObserver/加载更多行为。
- [ ] 搜索页面和全局搜索 modal 的结果、空状态和 PJAX 返回。
- [ ] 留言信封展开、弹幕区域和评论加载。
- [ ] 追番数据为空/非空时的页面状态。
- [ ] 禁用 Live2D、音乐、鼠标、背景特效后的降级表现。

### 外部服务

- [ ] 友链 RSS 中非标准 Atom/RSS、超时、无正文 feed 的降级。
- [ ] Bilibili API 分页、限流、UID 不公开和单状态失败。
- [ ] Twikoo/Waline 的生产 URL 和深浅色切换。
- [ ] Meting API 列表回退和音乐平台不可用时的错误提示。
- [ ] 外部图片/CDN 失效时的封面占位和页面布局稳定性。

## 质量盲区与建议

1. **缺少自动化测试**：建议至少增加构建 smoke test，检查关键输出路径和没有明显 Hugo 错误。
2. **外部网络耦合**：构建前抓 RSS、Bilibili 和远端资源，建议为脚本增加 fixture/缓存模式，避免网络波动阻断部署。
3. **模板回归风险**：建议对首页三种布局、文章、相册、友链、留言和搜索建立静态快照或 Playwright 检查（当前仓库未发现该工具配置）。
4. **安全边界**：对相册“加密”增加文档警示或迁移到真正的服务端鉴权；当前只能测试前端密码门，不应测试为机密保护。
5. **包管理器一致性**：确认 pnpm 与 npm 两份 lockfile 的治理方式。

## CI 质量门禁

未发现仓库内 CI workflow，因此没有可引用的自动质量门禁。平台配置只定义构建和输出目录，并不等同于测试配置。
