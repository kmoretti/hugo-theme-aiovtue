# 运行方式

## 前置条件

### 已从配置/文档确认

- Hugo Extended：README 建议 0.120+；Netlify/Vercel 配置固定 `0.163.3`。
- Node.js：Netlify 配置声明 `22`。
- pnpm：README 的首次安装和平台配置使用 `pnpm`；Vercel 配置使用 `npm run build`。
- Windows 首次安装在 README 中提示使用管理员 PowerShell；这是仓库文档要求，是否仍因本机权限需要待确认。

验证 Hugo：

```bash
hugo version
```

输出应包含 `extended`。构建脚本在 Cloudflare/Render/Vercel 环境会尝试下载 Linux Hugo Extended，不等同于本地版本。

## 安装依赖

```bash
pnpm install
```

依赖来源为 `package.json:11-18` 和 `pnpm-lock.yaml`。`sharp` 被列入 `onlyBuiltDependencies`，安装时需要允许其原生构建步骤。

## 本地开发

```bash
pnpm dev
```

该命令实际执行：

1. `node scripts/fetch-missing-static.mjs`
2. `node scripts/fetch-links-rss.mjs`
3. `node scripts/fetch-bangumi.mjs`
4. `hugo server -D --disableFastRender`

本地预览默认地址是 `http://localhost:1313`。开发服务器会读取草稿（`-D`），并禁用 Hugo 快速渲染。不要在没有网络或外部 API 访问权限的环境中假定三个准备步骤必然成功。

## 生产构建

```bash
pnpm build
```

`pnpm build` 调用 `node scripts/build.mjs`，先检查 `.hugo_build.lock` 和 Hugo 进程，再执行静态资源、RSS、追番准备，最后运行：

```bash
hugo --cleanDestinationDir --minify
```

实际参数还可能根据 `CF_PAGES_URL`、`RENDER_EXTERNAL_URL`、`GITHUB_PAGES_URL`、`URL` 或 `DEPLOY_PRIME_URL` 追加 `--baseURL`。构建产物位于 `public/`。

`pnpm build:cf` 当前与 `build` 指向同一脚本；区别主要由环境变量决定。

## 专用维护命令

```bash
pnpm fetch-static
pnpm compress-mouse
```

- `fetch-static` 只准备缺失的信封/字体资源。
- `compress-mouse` 需要原始 `.ani` 文件目录；建议设置 `MOUSE_SOURCE_DIR`，否则脚本默认寻找本机固定路径。它会重建 `static/mouse/tuantuanma/`，属于有文件写入副作用的维护命令，不应在普通构建中自动执行。

## 测试与质量检查

仓库没有发现 `test`、`lint`、`format`、CI workflow、Dockerfile 或 Makefile 入口。可执行的最低质量检查是：

```bash
hugo version
pnpm build
```

构建完成并不等同于外部评论、RSS、Bilibili 数据或所有浏览器交互已验证。详见 [testing.md](testing.md)。

## 部署

### Cloudflare Pages

`wrangler.toml` 指定 `pages_build_output_dir = "./public"`，文件注释要求 Dashboard 使用：

- Build command：`pnpm run build`
- Output directory：`public`

`netlify.toml` 也配置了 Hugo 0.163.3、Extended、production 环境和 Node 22。Cloudflare 环境通过 `CF_PAGES=1` 使 `build.mjs` 下载 Linux Hugo。

### Vercel

`vercel.json` 已给出：

- Build command：`npm run build`
- Output directory：`public`
- Hugo version：`0.163.3`
- `framework: null`

### Netlify

`netlify.toml` 给出 pnpm build、`public` 输出、Hugo Extended 0.163.3 和 Node 22。

## 常见故障与排查入口

| 症状 | 首先检查 |
|---|---|
| 构建提示 Hugo 正在运行 | 停止 `pnpm dev`，再检查 `scripts/build.mjs:20-47` 的进程/锁处理 |
| 构建使用了错误站点域名 | 检查 `hugo.toml` 的 `baseURL`，以及平台 URL 环境变量 |
| RSS/追番数据为空 | 查看构建日志；检查外部 URL、超时、API 返回和开关配置 |
| 缺少信封/字体 | 运行 `pnpm fetch-static`，检查远端 GitHub 访问权限 |
| 图片/视频不显示 | 检查 `static/` 路径、Front Matter URL、远端 CDN 可用性 |
| 评论区不工作 | 检查 `params.comment.provider` 与对应 Twikoo/Waline 配置，不要把示例 URL 当作真实服务 |
| Windows 安装 `sharp` 失败 | 检查 Node/pnpm 版本和原生依赖安装权限；不要删除 lockfile 规避问题 |
| 相册“加密”不应视为机密 | 检查 `gallery/single.html`：密码被写进页面属性，只是前端门 |

## 运行状态说明

友链远程模式是浏览器运行时功能：部署后的页面每次加载/刷新都会使用 `fetch(..., { cache: 'no-store' })` 请求 `params.links.remoteURL`；远程源可以是 Blog API 的 JSON，也可以是 Hexo `class_name/class_desc/link_list` YAML，浏览器端会先转换成统一的 `linkGroups[].links[]` 结构。远程 API/CDN 必须通过 CORS 允许站点域名。请求失败时不回退本地友链，而是显示错误状态和“重新加载”按钮。远程 `tags` 会与本地数据一样被标准化为纯文本，桌面端悬停显示标签徽章，移动端在卡片底部常驻显示。

RSS Spotlight 仍属于构建期流程：远程模式下构建脚本会从 JSON 的 `linkGroups[].links[].rss`，或 Hexo YAML 的 `link_list[].feeds`（映射为 `rss`）读取 RSS 地址并生成 `data/links_rss.json`，因此 RSS 内容需要重新构建才能更新；友链卡片本身不需要重新部署。

友链申请区域使用 `params.links.applicationAPI` 配置的 friendlink-verify API：浏览器端按方式四向 `/api/submissions` 提交 JSON，通过 `type: apply/update` 区分申请和更新；申请状态从 `/api/submissions?public=1` 加载，支持 `pending/approved/rejected` 状态筛选、名称搜索和分页。申请表单不会自动重试 POST，失败时保留用户输入；公开接口使用 CORS 允许跨域。

方式四 API 已配置为 `https://verify.081531.xyz`；公开状态接口返回 `pending/approved/rejected` 状态并允许跨域。浏览器 mock 已验证五项条件通过后显示操作选择，点击申请/更新后才展开表单，以及方式四请求体映射。表单字段与远端方式四一致，RSS 使用直接显示的可选订阅地址输入框，不使用额外开关。
