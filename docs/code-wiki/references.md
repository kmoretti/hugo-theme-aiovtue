# 证据索引与待确认事项

## 分析元数据

- 目标路径：`blog/`
- 分析时间：2026-08-02（GMT+8）
- Git 提交：`fa50224`（工作树在分析时存在未提交修改）
- 扫描方式：读取 README、Hugo/Node/部署配置、内容 Markdown、主题 HTML/partial、JS/SCSS 清单和构建脚本；使用相对路径记录证据。
- 未执行：Hugo 开发服务器、生产构建、外部 API 请求、部署、数据库或破坏性命令。

## 按章节的证据

### 项目概览/运行方式

- `README.md:1-220+`：项目定位、Hugo Extended 要求、内容编辑方式、本地开发和云端部署说明。
- `package.json:1-19`：脚本、Node 依赖和 pnpm 原生构建声明。
- `netlify.toml:1-8`：Hugo 0.163.3、Extended、Node 22、构建输出。
- `vercel.json:1-13`：Vercel 构建命令、输出目录和 Hugo 环境变量。
- `wrangler.toml:1-10`：Cloudflare Pages 输出目录与构建注释。
- `themes/aiovtue/theme.toml:1-6`：主题名称、MIT 许可证、最低 Hugo 版本。

### 架构/页面路由

- `themes/aiovtue/layouts/_default/baseof.html:1-19`：公共页面壳和 partial 装配顺序。
- `themes/aiovtue/layouts/index.html:1-111`：首页内容合并、分页和布局池。
- `themes/aiovtue/layouts/_default/single.html:1-29`：普通文章渲染和评论条件。
- `themes/aiovtue/layouts/_default/links.html:1-18`：友链/RSS/评论组合。
- `themes/aiovtue/layouts/_default/moments.html:1-48`：动态排序和分批输出。
- `themes/aiovtue/layouts/_default/bangumi.html:1-8`：追番 partial 入口。
- `themes/aiovtue/layouts/_default/comment.html:1-33`：留言信封和评论。
- `themes/aiovtue/layouts/gallery/list.html:1-30`：albums slug 到 Page 的关系。
- `themes/aiovtue/layouts/gallery/single.html:1-89`：相册锁定属性和查看器入口。
- `hugo.toml:31-85`：站点、输出、taxonomy、Goldmark、Excalidraw 媒体类型。

### 模块/数据

- `content/posts/*.md`：文章 Front Matter 和正文模型。
- `content/gallery/_index.md`、`content/gallery/bizhi/index.md`、`content/gallery/jiamio/index.md`：相册索引、Page Bundle 和照片/加密字段。
- `content/moments/_index.md`、`content/moments/*.md`：动态页 cascade 和条目。
- `data/links.yaml`：友链分组、卡片和 RSS 字段。
- `scripts/build.mjs:1-110`：构建编排、锁文件、Bundled Hugo 和动态 baseURL。
- `scripts/fetch-missing-static.mjs:1-70`：缺失资源下载。
- `scripts/fetch-links-rss.mjs:1-249`：RSS 解析、筛选、写入。
- `scripts/fetch-bangumi.mjs:1-150`：Bilibili 请求、分页、规范化、写入。
- `scripts/compress-mouse-assets.mjs:1-228`：ANI 解码、WebP 生成和 manifest 验证。

## 扫描范围与忽略项

默认跳过：`.git/`、`node_modules/`、`public/`、`resources/`、二进制/缓存/生成资源，以及大于 1 MiB 的单个文件。共统计到 923 个忽略目录外文件，917 个小于 1 MiB；6 个大视频文件未读取内容。主题源代码、Markdown、TOML/YAML/JSON、Node 脚本和小型静态资源已纳入分析。

## 待确认事项

1. README 在当前命令行读取时出现疑似 UTF-8 到终端编码的乱码；文件逻辑结构可读，但中文原文是否完整应由编辑器确认。
2. `package-lock.json` 和 `pnpm-lock.yaml` 同时存在；需确认正式 CI/部署使用哪个包管理器。
3. 仓库没有发现 `.github/workflows/`、测试脚本或 lint 配置；需确认是否有仓库外部 CI。
4. `data/links_rss.json`、`data/bangumi.json`、`public/` 是否应提交 Git，需以团队发布流程确认。
5. `hugo.toml` 中评论、音乐、Live2D 等外部 URL 是否为当前生产地址，需部署者人工检查；本文档未复制敏感值。
6. `wrangler.toml`、`netlify.toml`、`vercel.json` 同时存在，正式平台和唯一发布入口待确认。
7. 动态模板与浏览器脚本存在条件加载，静态扫描可能遗漏事件绑定、PJAX 重载和第三方脚本时序问题。

## 建议人工核验步骤

1. 在干净环境安装 Hugo Extended 0.163.3、Node 22 和项目指定包管理器。
2. 运行 `pnpm install` 与 `pnpm build`，记录三类外部数据脚本是否成功。
3. 对 `public/` 做链接/资源存在性检查，并用浏览器检查首页、文章、友链、相册、动态、留言、追番和搜索。
4. 在不泄露服务凭据的前提下验证 Twikoo/Waline、Meting 和 Bilibili 的真实配置。
5. 确认部署平台、包管理器、派生 JSON 的提交策略后补充 CI/发布文档。
