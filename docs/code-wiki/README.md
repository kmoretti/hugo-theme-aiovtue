# AIOVTUE Hugo Blog Code Wiki

> 基于 Hugo Extended 的静态个人博客，使用本地 `aiovtue` 主题渲染文章、相册、动态、友链、追番、评论和互动组件。

## 技术栈与适用读者

- **核心**：Hugo Extended 0.163.3、Go Template、Markdown/TOML/YAML。
- **前端**：主题自带 HTML、SCSS/CSS、原生 JavaScript；KaTeX、Fuse.js、ECharts、APlayer/Meting、Twikoo/Waline、Live2D 等通过模板或外部资源接入。
- **构建辅助**：Node.js 22（云端配置已声明）、pnpm/npm、`sharp`、`decode-ico`。
- **读者**：维护文章和页面的作者、调整主题的前端开发者、配置部署的运维/平台使用者。

## 推荐阅读顺序

1. [项目概览](project-overview.md)：先了解目录、入口和规模。
2. [整体架构](architecture.md)：理解 Hugo 内容—模板—资源—发布链路。
3. [模块说明](modules.md)：按内容、主题、脚本和部署边界阅读。
4. [运行方式](runtime.md)：安装、开发、构建及部署。
5. [配置说明](configuration.md)：站点参数、页面 Front Matter 和环境变量类别。
6. [数据与流程](data-and-flows.md)、[测试](testing.md)：了解动态数据和质量边界。
7. [代码索引](code-reference.md)、[依赖](dependencies.md)、[证据索引](references.md)：需要定位源码时查阅。

## 快速运行

- 安装依赖：`pnpm install`
- 开发预览：`pnpm dev`
- 生产构建：`pnpm build`
- 预览地址：`http://localhost:1313`

命令的实际脚本来源见 [runtime.md](runtime.md)。

## 架构图入口

- [整体组件图与渲染链路](architecture.md#整体组件图)
- [构建与部署流程](architecture.md#构建流程)
- [内容发布流程](data-and-flows.md#文章与页面渲染流程)

## 关键模块

- [内容模型](modules.md#内容与页面模块)：`content/`、`data/`、文章 Front Matter 和 Page Bundle。
- [主题渲染层](modules.md#aiovtue-主题模块)：`themes/aiovtue/layouts/`、partials 与资产。
- [构建与外部数据脚本](modules.md#构建脚本模块)：`scripts/build.mjs`、RSS、Bilibili 和静态资源准备。
- [部署适配](modules.md#部署适配模块)：Cloudflare Pages、Vercel、Netlify 配置。

## 分析元数据

| 项目 | 值 |
|---|---|
| 目标 | `blog/`（相对项目根） |
| 分析时间 | 2026-08-02（GMT+8） |
| 提交版本 | `fa50224` |
| 覆盖 | 内容、配置、构建脚本、主题模板/资产、部署配置、现有文档 |
| 规模 | 忽略目录外共 923 个文件；917 个小于 1 MiB；6 个视频文件单独计入但未读取内容 |
| 忽略 | `.git/`、`node_modules/`、`public/`、`resources/`、二进制/生成资源和大于 1 MiB 的媒体 |
| 局限 | 未启动 Hugo、未访问外部 API、未执行部署；动态模板行为以静态分析为依据 |

> 文档中的“事实”来自源码/配置；“推断”或“待确认”会明确标注。敏感配置只记录用途和结构，不记录实际密钥或完整凭据。
