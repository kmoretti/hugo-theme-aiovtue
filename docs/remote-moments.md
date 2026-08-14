# 远程说说：Ech0 provider

动态页支持本地 Markdown、Ech0 远程 Echo，或两者混合展示。远程数据始终由浏览器实时读取；Ech0 的匿名接口只返回公开动态，不在 Hugo 前端保存管理员 token。

## 配置

```toml
[params.moments]
  layout = "ech0"                         # ech0 / memos / cards
  cardMaxWidth = "720px"
  source = "both"                         # local / remote / both
  provider = "ech0"                       # ech0 / blog_api
  remoteURL = "https://m.081531.xyz"      # Ech0 站点根地址
  remoteEndpoint = "/api/echo/query"
  remoteMaxItems = 40
  batchSize = 5
  cacheMinutes = 30
  mediaOrigins = ["https://m.081531.xyz", "https://mifun.081531.xyz"]
  metingAPI = "https://meting.081531.xyz/api"
  enableTwitterWidgets = true
  enableRemoteLikes = true
  enableRemoteComments = true
  showSourceBadge = true
  showRemoteTags = true
  showRemoteMessageLink = true
  showRemoteAdBadge = true
```

- `local`：仅显示 `content/moments/*.md`，不请求远程 API。
- `remote`：仅显示远程公开 Echo。
- `both`：加载远程后，与本地动态按创建时间统一排序；远程失败时保留本地内容。
- `provider = "ech0"` 使用 `POST /api/echo/query`；`provider = "blog_api"` 保留旧 GET moments 协议兼容。
- Ech0 请求体使用 `page`、`pageSize`、`search`、`tagIds`、`sortBy`、`sortOrder`。
- `cacheMinutes` 仅用于 Ech0 只读数据的 localStorage stale-while-revalidate；不缓存评论写入、点赞令牌或隐私字段。

## Ech0 API 协议

```http
POST https://m.081531.xyz/api/echo/query
Content-Type: application/json
```

```json
{
  "page": 1,
  "pageSize": 20,
  "search": "",
  "tagIds": [],
  "sortBy": "created_at",
  "sortOrder": "desc"
}
```

```json
{
  "code": 1,
  "msg": "查询Echos成功",
  "data": {
    "total": 18,
    "items": []
  }
}
```

Ech0 字段映射：

| Ech0 字段 | Hugo 用途 |
|---|---|
| `id` | UUID 形式的稳定远程 ID |
| `content` | 安全 Markdown 正文 |
| `created_at` | Unix 秒，转换为页面时间 |
| `fav_count` | 单向点赞数 |
| `tags[].name` | 标签名称 |
| `echo_files[].file` | 图片、音频、视频和普通文件 |
| `extension` | 扩展卡片对象 |
| `layout` | 图片布局提示；当前映射到 Hugo 媒体网格/灯箱 |

Ech0 没有旧 `blog_api` 的 `pinned_order`、广告字段或五种 emoji reactions，因此 Ech0 动态按时间倒序，不伪造置顶和推广状态。

## 混合排序、去重与降级

- 远程 Ech0 与本地 Markdown 统一按创建时间倒序。
- 时间相同按 `${source}:${sourceId}` 稳定排序。
- 只按来源和 ID 去重，不做正文相似度去重。
- `remoteMaxItems` 控制远程最多读取数量，页面支持分批插入；首页 ticker 单独限制为最多 20 条远程数据。
- 网络、CORS、HTTP、业务 envelope 或字段错误不会伪装成空数据。
- `both` 失败时显示本地内容；若存在过期 Ech0 缓存，则显示缓存和本地内容，并提示正在使用降级内容。

## Ech0 风格卡片

`layout = "ech0"` 使用 Hugo 原生 partial、原生 DOM 和 SCSS 重做 Ech0 的视觉语言：

- 统一的 surface、边框、8px 圆角和轻量阴影；
- 顶部作者、等宽时间和来源 badge；
- 正文、媒体、扩展卡片、标签和底部操作区；
- 桌面和移动端使用 `min-width: 0`、可换行外链和响应式内边距；
- 保留 `memos` 和 `cards` 布局，不覆盖现有本地页面协议。

远程与本地动态都统一显示 Hugo 的站点作者名；Ech0 的 `username` 作为数据字段读取但不直接展示。

## 媒体

- `echo_files[].file.category` 优先于 MIME 判断类型；这是因为 Ech0 可能返回 `category = image` 但 MIME 为 `application/octet-stream`。
- 只加载 `mediaOrigins` 中的 HTTPS 媒体来源；未知来源跳过。
- 图片使用现有 Hugo 灯箱和懒加载，最多 9 个。
- 直链视频使用原生 `<video controls playsinline preload="metadata">`，不自动播放并懒加载。
- 音频使用原生 `<audio controls preload="none">`，不自动播放。
- 普通文件只生成安全下载链接。
- 首页 ticker 只显示资源提示，不加载这些媒体。

## 扩展卡片

支持 Ech0 大写类型并映射为统一 Hugo 卡片：

```text
MUSIC       音乐
VIDEO       Bilibili / YouTube 外链
GITHUBPROJ  GitHub 仓库
WEBSITE     网站标题、域名和链接
LOCATION    地点、两位小数坐标和 OpenStreetMap 外链
TWEET       X / Twitter 静态卡片，按配置尝试 widgets.js，失败降级
```

### MUSIC

Ech0 音乐扩展会优先使用自部署 Meting API：

```text
https://meting.081531.xyz/api
```

仅在完整动态卡片中加载曲目信息/播放资源；音频仍需要用户主动点击播放。Meting 失败时保留音乐标题和原始链接。首页不会请求 Meting。

### TWEET

如果 `enableTwitterWidgets = true`，完整卡片在需要时尝试加载官方：

```text
https://platform.twitter.com/widgets.js
```

脚本被拦截、超时或不可用时应保留静态 Tweet 链接。首页 ticker 永不加载 Twitter 脚本。

### LOCATION

不嵌入 Leaflet 或地图瓦片。地点卡片显示作者提供的名称、四舍五入到两位的坐标，并提供：

```text
https://www.openstreetmap.org/?mlat=...&mlon=...
```

使用 OpenStreetMap 链接时应保留 `© OpenStreetMap contributors` 归属。OSM 数据开放，但公共瓦片服务有使用政策和访问限制；当前实现不直接抓取瓦片，因此不会产生高频瓦片请求。

未知扩展、损坏 JSON、危险 URL 或缺少必需字段的扩展只跳过卡片，不影响整条动态。

## 评论与点赞

### Ech0 评论

Ech0 远程评论默认折叠，点击评论后才读取：

```http
GET https://m.081531.xyz/api/comments?echo_id=<UUID>
```

仅显示公开已审核评论，只读，不在 Hugo 前端提交评论。失败只影响该评论面板。`blog_api` provider 和本地动态继续兼容站点配置的 Twikoo/Waline。

### Ech0 点赞

Ech0 只有单一点赞接口：

```http
PUT https://m.081531.xyz/api/echo/like/<UUID>
```

完整卡片显示 `fav_count` 和单向点赞按钮；首页 ticker 不显示点赞按钮。点击后只增加当前页面计数，不提供取消操作。浏览器会话内阻止重复提交，但最终去重和限流由 Ech0 服务端负责。

旧 `blog_api` provider 仍保留原五种 reactions 和原有验证流程；两套协议不会混用。

## CORS、媒体和安全

部署站点的 origin 必须被 Ech0 CORS 策略允许。博客端无法绕过服务端 CORS；生产部署后应在真实域名用浏览器 Network/Console 验证 `POST /api/echo/query`。

远程正文不直接 `innerHTML` 注入，使用安全 Markdown 子集；危险 HTML、脚本、iframe、事件属性和 `javascript:`、`data:`、`vbscript:` 协议不会执行。扩展外链统一要求安全 HTTP(S)，媒体还必须命中配置的 HTTPS origin。

## 首页 ticker

首页复用 `params.moments.source`、`provider`、`remoteURL` 和 `remoteEndpoint`。ticker 默认最多轮换 5 条，`both` 最多读取 20 条远程 Echo；只显示摘要、时间、来源、标签和资源提示，不加载图片、视频、音频、评论、点赞、地图或第三方 embed。

支持自动切换、上一条、下一条、暂停/继续；悬停、聚焦、后台页面和 `prefers-reduced-motion` 会暂停自动播放。远程失败时保留本地内容，local 模式不会发起远程请求。

## 验证清单

```text
node --check themes/aiovtue/assets/js/remote-moments.js
node --check themes/aiovtue/assets/js/home-moments-ticker.js
hugo --renderToMemory --noBuildLock --minify
git diff --check
```

浏览器中还应验证：local/remote/both、Ech0 UUID、Unix 秒、图片/音频/视频、六种扩展、OSM 外链、评论按需加载、点赞失败降级、过期缓存、CORS 错误、320px 移动端、深浅色和 PJAX 重复进入页面。
