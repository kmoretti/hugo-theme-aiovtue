# 首页说说摘要条

首页 Hero 下方的“说说”是完整动态页 `/moments/` 的轻量预览。它只显示摘要、时间、来源、标签和扩展类型提示；点击条目进入本地 `/moments/` 或对应的 Ech0 `/echo/<UUID>` 详情，点击“查看全部”进入 `/moments/`。

## 配置

首页配置位于 `params.home.momentsTicker`，数据源继续复用 `params.moments`：

```toml
[params.moments]
source = "both"                         # local / remote / both
provider = "ech0"                       # ech0 / blog_api
remoteURL = "https://m.081531.xyz"
remoteEndpoint = "/api/echo/query"

[params.home.momentsTicker]
enable = true
maxItems = 5
remoteMaxItems = 20
interval = 5000
autoPlay = true
showSourceBadge = true
showResourceIcons = true
showTags = true
showTime = true
showAds = true
showAdBadge = true
```

- `local`：只使用 `content/moments/`，浏览器不会请求远程 API。
- `remote`：浏览器实时请求远程 provider，最多显示 `maxItems` 条。
- `both`：最多请求 `remoteMaxItems` 条远程数据，与本地动态统一排序后显示前 `maxItems` 条。
- `provider = "ech0"` 时使用 `POST /api/echo/query`；`blog_api` 仅用于兼容旧 GET 协议。

首页默认最多显示 5 条数据，每次只显示其中 1 条并循环切换。首页不会加载完整媒体、评论、点赞、地图或第三方 embed。

## 本地动态字段

旧的动态 Markdown 不需要修改，未设置 `ticker` 时默认出现在首页。可选字段：

```yaml
---
date: 2026-08-03T10:00:00+08:00
ticker: true
tickerText: "首页使用的简短摘要"
tags:
  - 日常
extensions:
  - type: location
    payload:
      name: 重庆
---
正文仍然显示在 /moments/ 完整动态页。
```

- `ticker: false`：从首页摘要条隐藏，但不会从 `/moments/` 隐藏。
- `tickerText`：只覆盖首页摘要，不改变完整动态正文。
- 没有 `tickerText`：从正文生成安全纯文本摘要。
- 推荐使用 `extensions` 数组，同时兼容单数 `extension`。
- 首页最多显示一个标签和两个扩展提示。
- 位置只显示作者提供的名称，不显示精确坐标。

## Ech0 摘要协议

Ech0 请求：

```http
POST https://m.081531.xyz/api/echo/query
Content-Type: application/json
```

请求体：

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

浏览器端读取 `data.items`，并使用 `id`、`content`、`created_at`、`tags[].name`、`echo_files` 和 `extension`。Ech0 UUID 不会转换成整数；时间按 Unix 秒处理。

远程摘要会删除 HTML、图片、危险协议和 Markdown 装饰，最终使用 `textContent` 渲染。未知字段、未知扩展、坏日期和损坏条目只影响单条数据。

Ech0 没有旧 `blog_api` 的置顶/推广字段，因此首页不会伪造这些状态。旧 provider 仍保留旧字段兼容。

## 排序、缓存与降级

混合模式按本地与 Ech0 创建时间统一倒序；时间相同时按 `source:sourceId` 稳定排序；只按来源和 ID 去重，不做正文相似度去重。

完整动态页的 Ech0 远程数据可使用 `cacheMinutes = 30` 做 localStorage stale-while-revalidate：先显示缓存，后台刷新；缓存过期且刷新失败时仍保留缓存并提示。首页 ticker 当前请求实时数据，不加载完整页缓存内容。

如果 CORS、网络、超时或业务协议失败：

- `remote` 显示错误和重试按钮；
- `both` 保留本地内容并显示降级提示；
- 空数组显示“暂时没有说说”，不会把失败伪装为空数据。

## 扩展提示

首页只显示轻量文字提示，不展开完整卡片：

- 图片：图片
- 视频：视频
- GitHub：GitHub
- Website：链接
- Location：位置或位置名称
- Music：音乐
- Tweet：Tweet

首页不请求 Meting、GitHub API、Twitter widgets、地图瓦片、图片、视频或音频。

## 播放与可访问性

- 默认每 5000ms 切换一次，间隔可由 `interval` 调整。
- 上一条、暂停/继续、下一条按钮使用真实 `<button>`。
- 鼠标悬停、键盘聚焦和页面进入后台时暂停。
- 手动点击暂停后不会被悬停离开或页面恢复自动取消。
- `prefers-reduced-motion: reduce` 时停止自动播放，只保留手动切换。
- 桌面摘要最多约 120 字符，移动端约 80 字符并允许两行显示。
- 首页组件保留稳定高度，远程请求不会阻塞 Hero、公告或文章列表。
- PJAX 离开首页时清理 timer、fetch、事件监听和媒体查询监听。

## 验证清单

```text
[ ] local 模式首页无 Ech0/blog_api 请求
[ ] Ech0 POST 成功、空数组、HTTP 错误、业务错误和超时均有正确状态
[ ] both 远程失败仍显示本地内容
[ ] 首页只有一个 ticker，位置在 Hero 后、公告/文章前
[ ] Ech0 UUID、Unix 秒、对象 tags 和扩展提示正确
[ ] 来源 badge 显示 Ech0 / 本地
[ ] ticker=false 和 tickerText 正确工作
[ ] 首页不请求媒体、Meting、Twitter、地图或评论
[ ] 320px 宽度无水平溢出
[ ] 键盘控件、focus-visible 和 reduced-motion 正常
[ ] 首页与 /moments/ 之间 PJAX 往返没有重复请求或定时器
```
