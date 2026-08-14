# 项目概览

## 项目定位

`blog/` 是一个以 **Hugo Extended** 为静态站点生成器的中文个人博客。仓库 README 将其描述为参考 Butterfly、Sakura 等风格的 Hugo 静态博客；当前站点标题和主题分别由 `hugo.toml:32-38` 的 `title`、`theme` 定义。主要用户是站点作者和希望维护主题/内容的开发者。

## 主要能力

- 文章、分类、标签、归档、RSS、搜索。
- 首页 Hero、卡片/列表/时间线布局、分页或加载更多。
- 独立关于页、留言页、友链页、动态页、追番页、相册页和 Excalidraw 画板页。
- 评论系统抽象：当前配置为 Twikoo，Waline 保留为可切换配置。
- 数学公式、代码高亮、表格、图片灯箱、PJAX、AI 摘要、赞助和版权声明。
- 音乐播放器、Live2D 看板娘、动态鼠标和背景特效等增强组件。
- 构建前从远端准备缺失的信封/字体资源，并更新友链 RSS 和 Bilibili 追番数据。

## 技术栈

| 层 | 技术/来源 | 证据 |
|---|---|---|
| 生成器 | Hugo Extended，主题最低版本 0.120.0，仓库配置使用 0.163.3 | `themes/aiovtue/theme.toml:1-3`；`netlify.toml:1-8` |
| 内容 | Markdown + Hugo Front Matter | `content/posts/*.md`、`content/*/_index.md` |
| 配置 | TOML、YAML、JSON | `hugo.toml`、`data/links.yaml`、`data/bangumi.json` |
| 模板 | Hugo Go Template、partials | `themes/aiovtue/layouts/_default/baseof.html:1-19` |
| 浏览器层 | 原生 JavaScript、SCSS/CSS | `themes/aiovtue/assets/js/`、`themes/aiovtue/assets/css/` |
| 构建脚本 | Node.js ESM，`sharp`、`decode-ico` | `package.json:4-18`、`scripts/*.mjs` |
| 部署 | 静态 `public/`；Cloudflare Pages、Vercel、Netlify 配置 | `wrangler.toml:1-10`、`vercel.json:1-13`、`netlify.toml:1-8` |

## 顶层目录

| 路径 | 职责 |
|---|---|
| `content/` | 页面、文章、动态、相册和 Excalidraw 内容模型 |
| `data/` | 友链及构建时生成的 RSS/Bilibili 数据 |
| `themes/aiovtue/` | 当前主题的模板、partials、SCSS、JS 和主题元数据 |
| `scripts/` | 构建编排、远端数据抓取、缺失资源准备和鼠标资源压缩 |
| `static/` | 原样复制到站点根路径的图片、视频、字体、KaTeX、组件资源 |
| `assets/` | Hugo Pipes/前端工具配置，目前可见 `jsconfig.json` |
| `archetypes/` | 新文章/相册/Excalidraw 的内容模板 |
| `public/` | Hugo 生成产物；分析时跳过，不作为源码依据 |
| `resources/` | Hugo 资源缓存；分析时跳过 |
| `package.json` | npm/pnpm 脚本和构建依赖 |
| `hugo.toml` | 站点、渲染、菜单和功能参数总入口 |
| `netlify.toml`、`vercel.json`、`wrangler.toml` | 三个平台的构建和产物配置 |

## 入口与规模

- Hugo 入口配置：`hugo.toml`。
- 页面基模板：`themes/aiovtue/layouts/_default/baseof.html:1-19`。
- 首页入口：`themes/aiovtue/layouts/index.html:1-111`。
- 构建入口：`scripts/build.mjs:1-110`，由 `package.json:8-9` 的 `build`/`build:cf` 调用。
- 内容入口：`content/posts/`、`content/gallery/`、`content/moments/` 等目录的 Markdown。
- 静态扫描得到 923 个忽略生成目录后的文件；其中主题模板 144 个 HTML，脚本 10 个 `.mjs`，内容 Markdown 28 个。媒体和字体占主要体积。

## 术语表

| 术语 | 含义 |
|---|---|
| Page Bundle | Hugo 用目录承载 `index.md` 及其资源的页面，例如相册和 Excalidraw |
| Front Matter | Markdown 顶部的 YAML/TOML 元数据，控制模板、日期、封面、分类等 |
| Partial | 可复用的 Hugo 模板片段，位于 `themes/aiovtue/layouts/partials/` |
| RSS Spotlight | 构建阶段从第一组友链 RSS 抓取并写入 `data/links_rss.json` 的展示数据 |
| Bundled Hugo | Cloudflare/Render/Vercel 环境下由脚本下载到临时目录的 Hugo Extended 二进制 |
