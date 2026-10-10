# Page Inspector

用于查看页面的 Nuxt payload、SEO 数据和 DevTools 网络响应。扩展提供数据查看、筛选、复制和下载，功能范围及改动记录见 [轻量化实现](docs/lightweight-implementation.md) 与 [SEO 查看功能实现](docs/seo-viewer-implementation.md)。

## 功能

| 入口 | 可查看的数据                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------ |
| 数据 | `data`、`state`、`_errors`、元信息、全部字段、内嵌与外部原文                                     |
| SEO  | 概览、H1–H6、链接、图片、JSON-LD／Microdata／hreflang、社交分享及外部工具；DOM 与 HTML 独立查看  |
| 网络 | DevTools 请求的 URL、方法、状态、耗时、大小与响应正文；支持将合法 Nuxt 响应作为独立 payload 查看 |

数据支持树形展开、关键词搜索、字段详情、复制值／属性名／路径／带类型数据。普通对象复制为 JSON，特殊类型和循环引用复制为 JavaScript 表达式文本。扩展不执行这些表达式。

侧边栏不提供网络入口。SEO 两个来源分别展示实际读取的字段，保留重复标签、空值和 JSON 解析错误。HTML 只在 DevTools 点击「读取 HTML」时取得，无法确认本次文档来源时显示原因。

SEO 概览提供标题、描述、规范地址、收录标签、语言及元素数量。链接按同主机名区分内外链，支持去重；图片展示地址、alt、尺寸与缩略图，空 alt 与没有 alt 属性分别显示。列表每次显示 50 项，地址 TXT 和明细 CSV 导出覆盖所有已采集匹配项。结构化数据导出保留原始 JSON 文本，避免大整数被重新序列化。

DevTools 优先使用唯一关联的已观察响应头；未取得时可手动执行 HEAD，并标明它是独立请求。hreflang 状态与回链检查也需点击后请求，使用 5 MiB 正文上限和独立 HTML Worker，不携带登录凭据。图片和社交分享预览会在对应分类按需加载可见图片。外部工具只提供新标签页链接。

界面保留浅色、深色和系统主题，使用静态弥散背景和简单 CSS 过渡。宽屏左右分栏，窄侧栏上下排列，树和字段详情分别滚动。切换页面会清理旧结果，手动重读失败时保留上次成功结果并提示采样范围。

## 开发与加载

在 WSL 的项目目录中先显式加载 nvm；安装依赖前按项目约定查询最新版本，具体安装仍使用锁文件固定版本。

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

扩展使用 WXT、Vue 和 TypeScript；Nuxt 数据通过 devalue 解码，HTML 通过 parse5 在独立 Worker 中解析。两个 Nuxt 应用用于兼容性验收，不作为扩展运行时依赖。

在 Chrome／Edge 扩展管理页开启开发者模式，加载 `apps/extension/.output/chrome-mv3-dev`。生产构建加载 `apps/extension/.output/chrome-mv3-prod`。点击扩展图标或使用 `Ctrl+M`（macOS 为 `Command+M`）打开侧边栏；DevTools 面板提供网络查看。

## 常用命令

所有 Node 相关命令都应在显式加载 nvm 后运行。

| 命令                                | 用途                                 |
| ----------------------------------- | ------------------------------------ |
| `pnpm dev`                          | 扩展开发构建与监听                   |
| `pnpm dev:nuxt3` / `pnpm dev:nuxt4` | 启动真实 Nuxt 样例                   |
| `pnpm build` / `pnpm build:dev`     | 扩展生产／开发构建                   |
| `pnpm typecheck`                    | 三个应用的类型检查                   |
| `pnpm test`                         | 扩展单元测试                         |
| `pnpm lint`                         | 代码与文档规范检查                   |
| `pnpm fixtures:build`               | 构建六组真实 Nuxt 产物               |
| `pnpm zip`                          | 打包生产扩展                         |
| `pnpm icons:generate`               | 从矢量原稿生成图标                   |
| `pnpm test:e2e`                     | 固定协议样例验收，运行前需用户确认   |
| `pnpm test:e2e:nuxt`                | 真实 Nuxt 验收，运行前需用户确认     |
| `pnpm test:e2e:devtools`            | 真实 DevTools 验收，运行前需用户确认 |

真实应用的 SSR、内嵌预渲染与外部 payload 预渲染配置、服务端口及产物说明见 [真实 Nuxt 验证方案](docs/real-nuxt-validation-plan.md)。

## 查看范围与预算

- 当前标签页主文档；最多 16 个 Nuxt 应用，单次原文消息预算 12 MiB。
- 内嵌先解析，外部字段按 Nuxt 浅合并顺序覆盖；各份原文分别保留。
- 数据树每个分类最多 10,000 个节点、60 层；每次展开 100 个子节点；关键词搜索最多展示 100 条结果。
- 字段详情从已解码数据按路径读取，独立分配局部树预算，支持特殊集合和循环引用。
- 原文超过 100 KB 时使用纯文本，预览最多 100,000 个字符；下载保留完整已采集原文。
- SEO DOM 与 HTML 均有节点、文本和单项预算；HTML 解析上限 5 MiB，超时直接终止 Worker。Microdata 限制嵌套、循环引用和展开体积；字数按正文空白分隔计数，不统计脚本、样式、模板与 hidden 正文。
- 网络最多 500 条记录、2 MiB 元信息、12 MiB 正文缓存；导航清空旧记录，正文按需读取。
- 请求取消、超时和文档身份检查防止迟到结果覆盖当前页面。

Nuxt 数据是文档初始 payload，不代表运行时响应式状态。SPA 地址变化时会说明数据可能属于初始文档。外部 payload 为本次重新获取，可能与浏览器最初收到的版本不同；网络响应作为独立来源保存。

视图下载与「带类型数据」复制使用 `page-inspector/v1` 格式，包含类型和引用信息。达到显示预算时，搜索、复制和视图下载仅覆盖已展示内容，完整采集文本请下载原文。

## 架构与权限

`features/nuxt/` 负责采集、解码、路径、展示和复制；`features/inspector/` 负责数据界面；`features/seo/` 负责 DOM／HTML 字段；`features/network/` 持有 DevTools 会话。后台仅协调 Nuxt 采集和取消，主题设置使用本地存储。交互组件基于 Ark UI，状态约定见 [组件与数据流](docs/component-patterns.md)。

扩展申请 `storage`、`scripting`、`sidePanel` 及 HTTP／HTTPS 主机权限。不读取 cookies API，不使用 debugger，不上传采集内容。网络元信息只在打开的 DevTools 面板会话中观察。

旧分析、检索、关注、SEO 差异与报告的文档保留为历史记录，不代表当前功能。现行验证范围见 [轻量化实现](docs/lightweight-implementation.md)。
