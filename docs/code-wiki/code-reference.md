# 代码与符号索引

以下只列影响理解和运行的入口符号，不罗列每个模板函数。行号以分析时提交 `fa50224` 的工作树为准。

## 启动与基础设施

| 符号 | 类型/位置 | 职责与边界 |
|---|---|---|
| `needsBundledHugo` | 函数，`scripts/build.mjs:11-18` | 根据 `CF_PAGES`、`RENDER`、`VERCEL` 判断是否下载临时 Hugo；输出布尔值 |
| `isHugoRunning` | 函数，`scripts/build.mjs:20-35` | Windows 用 `tasklist`、其他系统用 `pgrep` 检查 Hugo；副作用仅是进程查询 |
| `ensureBuildReady` | 函数，`scripts/build.mjs:37-47` | 发现运行中的 Hugo 时终止构建；否则删除陈旧 `.hugo_build.lock` |
| `resolveHugoBin` | 函数，`scripts/build.mjs:49-77` | 返回系统 `hugo` 或下载到 `/tmp/hugo-bin/hugo` 的路径；外部网络依赖 |
| `runStep` | 函数，`scripts/build.mjs:79-87` | 在仓库根目录同步执行子步骤，非零退出码终止构建 |
| `main build sequence` | 顶层流程，`scripts/build.mjs:89-110` | 依次准备静态资源、RSS、追番，再运行 Hugo `--cleanDestinationDir --minify` |

## Hugo 页面入口

| 符号 | 类型/位置 | 输入/输出 |
|---|---|---|
| `baseof` 的 `main` block | 模板，`themes/aiovtue/layouts/_default/baseof.html:1-19` | 读取 Site/Params 和页面 block，输出所有普通页面公共壳 |
| `index` 的 `main` block | 模板，`themes/aiovtue/layouts/index.html:1-111` | 合并 posts/excalidraw、分页、选择首页布局 partial |
| `single` 的 `main` block | 模板，`themes/aiovtue/layouts/_default/single.html:1-29` | 输出文章正文、目录、插件、评论；`comment=false` 时跳过评论 |
| `gallery list` | 模板，`themes/aiovtue/layouts/gallery/list.html:1-30` | 根据 albums slug 调用 `.GetPage`，输出相册卡片 |
| `gallery single` | 模板，`themes/aiovtue/layouts/gallery/single.html:1-89` | 输出相册媒体查看器；加密标记通过 DOM 属性交给浏览器脚本 |
| `moments` | 模板，`themes/aiovtue/layouts/_default/moments.html:1-48` | 以日期倒序输出动态，首屏 5 条，余量放入 template 等前端加载 |
| `links` | 模板，`themes/aiovtue/layouts/_default/links.html:1-18` | 按 RSS 开关选择 spotlight，再渲染友链和评论 |
| `bangumi` | 模板，`themes/aiovtue/layouts/_default/bangumi.html:1-8` | 通过 `bangumi-board` partial 展示构建出的追番数据 |

## 数据处理符号

| 符号 | 类型/位置 | 职责、输入输出与边界 |
|---|---|---|
| `parseRssItems` | 函数，`scripts/fetch-links-rss.mjs:47-86` | 区分 Atom/RSS，解析标题、链接、摘要和封面；正则解析对非标准 XML 可能不完整 |
| `pickArticlesWithMinBody` | 函数，`scripts/fetch-links-rss.mjs:88-96` | 从 feed 条目筛选正文长度至少 80 的最多 4 条 |
| `fetchText` | 函数，`scripts/fetch-links-rss.mjs:98-118` | 15 秒 AbortController 超时并检查 HTTP/HTML 无效响应 |
| `parseFirstGroupRssLinks` | 函数，`scripts/fetch-links-rss.mjs:128-195` | 只解析 YAML 的第一组 links；依赖当前格式的缩进和字段名 |
| `normalizeCoverUrl` | 函数，`scripts/fetch-bangumi.mjs:31-41` | 将 Bilibili 封面规范化为 HTTPS 缩略图 URL |
| `fetchJson` | 函数，`scripts/fetch-bangumi.mjs:64-91` | 带 15 秒超时和最多 3 次重试的 JSON 请求，要求 API code 为 0 |
| `fetchStatusList` | 函数，`scripts/fetch-bangumi.mjs:93-115` | 先读总数再按 24 条分页拉取一个追番状态 |
| `normalizeItem` | 函数，`scripts/fetch-bangumi.mjs:43-62` | 将 Bilibili 条目压缩成主题使用的 title/cover/url/score 等字段 |
| `encodeIconFrame` | 函数，`scripts/compress-mouse-assets.mjs:52-83` | 解码 ICO、缩放、WebP 编码并缩放热点坐标 |
| `buildRuleAssets` | 函数，`scripts/compress-mouse-assets.mjs:133-177` | 根据 ANI 时间线生成去重后的 WebP 关键帧和 manifest 规则 |
| `validateManifest` | 函数，`scripts/compress-mouse-assets.mjs:107-131` | 校验规则数量、关键帧文件和热点；失败抛错 |

## 主题公共 partial

| Partial | 位置 | 作用 |
|---|---|---|
| `post-content` | `themes/aiovtue/layouts/partials/post-content.html` | 文章正文渲染入口，调用 Hugo `.Content` |
| `comment-section` | `themes/aiovtue/layouts/partials/comment-section.html` | 根据 `params.comment.provider` 选择 Twikoo/Waline |
| `post-ai-summary` | `themes/aiovtue/layouts/partials/post-ai-summary.html` | 读取文章摘要相关 Front Matter/内容并输出摘要区 |
| `posts-sorted` | `themes/aiovtue/layouts/partials/posts-sorted.html` | 统一文章排序，供首页和搜索复用 |
| `home-layout-pool` | `themes/aiovtue/layouts/partials/home-layout-pool.html` | 把 `params.home` 配置归一化为布局池 |
| `links-rss-enabled` | `themes/aiovtue/layouts/partials/links-rss-enabled.html` | 判断友链 RSS 展示是否可用 |
| `gallery-post/viewer` | `themes/aiovtue/layouts/partials/gallery-post/viewer.html` | 组织相册查看器及媒体解析 partial |

## 浏览器侧关键脚本

`themes/aiovtue/assets/js/` 中按功能拆分了 `home.js`、`search-page.js`、`comments.js`、`pjax-loader.js`、`gallery-post-init.js`、`excalidraw-init.js`、`moments.js`、`music-player.js`、`live2d-widget.js`、`site-effects.js`、`tuantuanma-mouse.js` 等。它们由 `themes/aiovtue/layouts/partials/scripts.html` 统一/条件加载；实际加载条件依赖页面和 `params`，静态索引无法证明每个组合均被覆盖。
