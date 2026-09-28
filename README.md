# Page Inspector

用于查看 Nuxt 3/4 页面初始 payload 的 Chromium 浏览器扩展，基于 WXT、Vue 3 和 TypeScript。

## 功能

- 读取当前标签页的 `#__NUXT_DATA__` 和 `[data-nuxt-data]`，支持多个 Nuxt 应用。
- 读取节点 `data-src` 指向的外部 JSON payload；外部读取失败时保留内嵌内容。
- 查看数据、状态、错误、元信息、完整 payload 及各来源原文。
- 树形展开、键／值／类型搜索、字段路径复制、带类型数据复制和导出。
- 正确区分 Map、Set、Date、RegExp、BigInt、特殊数值、数组空洞及循环／重复引用，保留 Nuxt 包装类型标记。
- 标签页切换、页面刷新自动重新采集，过期请求不能覆盖新结果。
- 浅色、深色和跟随系统主题，通过扩展存储同步。
- Payload 来源字节分析、独立字段估算排名与分析报告。
- 高级条件检索、查询收藏、字段关注和相邻成功快照比较；各入口同步显示已关注状态，再次点击可取消。
- 共用 DevTools 面板、请求元信息、按需正文读取及来源证据核对。

## 仓库结构

仓库采用 pnpm workspace，统一安装依赖、共享一个根锁文件，各应用保留自己的依赖图和构建目录：

```text
apps/
  extension/     # WXT 浏览器扩展、单元测试和浏览器验收
  nuxt3/         # Nuxt 3.21.11 真实验证应用
  nuxt4/         # Nuxt 4.5.2 真实验证应用
scripts/         # 六组 Nuxt 构建及生产服务编排
docs/            # 方案与验证记录
pnpm-workspace.yaml
pnpm-lock.yaml
```

根目录负责代码规范、提交钩子和统一命令。扩展与 Nuxt 应用分别进行类型检查；WXT 的自动导入和样式扫描限定在扩展目录。Nuxt 3／4 使用各自的 Vue Router 和构建工具版本，不通过全局 overrides 强制统一。

## 开发

使用 Node 22（最低 22.22.1）和 pnpm 10.19.0；`.nvmrc` 固定开发与验证版本为 22.23.3。项目已启用 `engine-strict`，安装时会拒绝不满足 Node 版本约束的环境。新增或更新依赖前先联网查询最新版本及运行环境要求。

在 WSL／nvm 中先显式加载 nvm：

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

每次进入项目后执行 `nvm use`，使当前终端采用 `.nvmrc` 中的版本。首次安装该 Node 版本且缺少 pnpm 时，执行 `npm install --global pnpm@10.19.0`。

扩展使用 WXT 0.21.4、Vite 8.3.1、Vue 3.5.43；解析库为 devalue 6.0.2，单元测试为 Vitest 5.0.2。TypeScript 固定 6.0.3，以满足当前 ESLint 工具链的兼容范围。旧版 Nuxt 协议样本继续保留，用于检查解析兼容性；完整版本与迁移说明见 [依赖升级记录](docs/dependency-upgrade.md)。

开发命令不自动启动浏览器。在扩展管理页面开启开发者模式，加载 `apps/extension/.output/chrome-mv3-dev`；生产构建则加载 `apps/extension/.output/chrome-mv3-prod`。

点击扩展图标或使用 `Ctrl+M`（macOS 为 `Command+M`）打开侧边栏。快捷键发生冲突时可以在浏览器的扩展快捷键设置中调整。

## 常用命令

| 命令                            | 用途                                        |
| ------------------------------- | ------------------------------------------- |
| `pnpm dev`                      | 扩展开发构建与文件监听                      |
| `pnpm dev:nuxt3`                | 启动 Nuxt 3，地址为 `http://127.0.0.1:3303` |
| `pnpm dev:nuxt4`                | 启动 Nuxt 4，地址为 `http://127.0.0.1:3304` |
| `pnpm build` / `pnpm build:dev` | 扩展生产／开发构建                          |
| `pnpm build:all`                | 构建扩展及两个 Nuxt 应用的默认 SSR 配置     |
| `pnpm fixtures:build`           | 构建 Nuxt 3／4 的六组生产验收配置           |
| `pnpm zip`                      | 打包生产扩展                                |
| `pnpm typecheck`                | 分别检查三个应用的 TypeScript 和 Vue 模板   |
| `pnpm lint`                     | 检查整个仓库的代码与文档规范                |
| `pnpm test` / `pnpm test:watch` | 扩展单元测试／监听模式                      |
| `pnpm test:e2e`                 | 构建扩展后运行固定协议样例验收              |
| `pnpm test:e2e:nuxt`            | 构建扩展和六组真实 Nuxt 产物后验收          |
| `pnpm test:e2e:devtools`        | 构建扩展后运行真实 DevTools 接入与网络探针  |
| `pnpm test:e2e:all`             | 构建后运行协议、真实 Nuxt 和 DevTools 验收  |
| `pnpm prepare:hooks`            | 手动安装提交检查钩子                        |

开发时在不同终端分别运行扩展和所需 Nuxt 应用。两个应用都提供 `/basic`、`/types`、`/state`、`/errors`、`/custom`、`/route-a`、`/route-b`、`/empty`、`/csr` 、`/large` 和 `/features` 页面。

E2E 前按项目约定先取得用户确认。首次使用需安装测试浏览器：

```bash
pnpm --filter @page-inspector/extension exec playwright install chromium
```

测试使用独立临时浏览器配置：协议样例监听 `127.0.0.1:4318`；真实应用使用 `4430`—`4432` 和 `4440`—`4442`，不复用已占用端口上的服务。结果写入 `apps/extension/test-results/`，协议、真实 Nuxt 和 DevTools 产物分别保存在 `protocol/`、`real-nuxt/` 和 `devtools/`，真实应用报告为 `nuxt-results.json`。各套件独立清理自己的产物，避免交叉覆盖。

## 真实 Nuxt 应用构建

两个应用各支持三种配置：动态 SSR、内嵌预渲染、外部 payload 预渲染。外部模式使用 `/inspect/` 部署前缀。产物分别写入各应用的 `.output/ssr`、`.output/static-inline`、`.output/static-external`，构建目录也分别隔离。

按版本和配置构建并手动查看，例如：

```bash
pnpm fixtures:build --major 4 --profile static-external
node scripts/serve-fixture.mjs 4 static-external 4442
```

浏览器访问 `http://127.0.0.1:4442/inspect/basic`。服务读取真实构建文件，缺失资源返回 404；构建目录中的 `fixture-build.json` 记录应用版本、配置、Node 版本与根锁文件摘要。

所有六组产物已构建时，可以跳过重新构建并筛选测试：

```bash
pnpm --filter @page-inspector/extension test:e2e:nuxt --project=nuxt4-static-external
```

当前测试配置会预先启动全部六个服务，因此筛选测试时也需要六组产物。`pnpm fixtures:build` 可一次生成全部产物；重建某个配置无需重建其他配置。

## 支持范围与限制

| 项目       | 当前行为                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| 浏览器     | 目标 Chrome／Edge 116+；自动化验收使用 Playwright Chromium，其他浏览器未承诺兼容              |
| Nuxt 版本  | JSON payload 格式；真实应用验证 Nuxt 3.21.11／4.5.2 的六组配置，另保留 3.17.5／4.0.0 协议样本 |
| 首屏快照   | 读取现有 DOM 文本；初始文档地址取 Navigation Timing，缺失时明确提示                           |
| SPA 导航   | 标明数据可能属于初始文档，不将旧快照宣称为当前路由运行时状态                                  |
| 外部来源   | 按声明地址读取，内嵌先解析、外部字段浅覆盖；同源请求包含凭证，跨域请求省略凭证，不跟随重定向  |
| 来源完整性 | 外部资源为采集时重新获取，不能保证与原始 HTML 属于完全相同的版本；独立运行时配置不在采集范围  |
| 自定义类型 | 展示类型标签和序列化内容，并提示类型语义未还原；无法解码时仍保留原文                          |
| 采集范围   | 当前标签页主文档；最多 16 个 Nuxt 数据节点，单次原文消息预算 12 MiB                           |
| 数据展示   | 每个分类最多 10,000 个节点、60 层；每次展开 100 个子节点；搜索最多 100 条结果                 |
| 原文预览   | 超过 100 KB 不高亮，文本最多预览 100,000 个字符；已采集原文可完整导出                         |
| 超时       | 后台采集 15 秒；侧边栏等待 20 秒，外部请求可取消                                              |

树形分类各自计算展示预算，大 `data` 不会使 `state` 等其他分类消失。达到预算时会标记截断，搜索与视图导出仅覆盖已构建节点。

“视图导出”和字段复制采用 `page-inspector/v1` 格式，以 `type`、`value`、`children`、`reference`、`path` 描述节点。它保留特殊类型与引用关系，但不是原业务对象的普通 JSON；完整序列化内容请使用“原文”视图导出。

## 架构与权限

```mermaid
flowchart LR
    A[页面采集函数] -->|原始文本与来源| B[后台协调请求]
    B -->|可序列化消息| C[侧边栏独立解码]
    C --> D[带类型和引用的展示模型]
    D --> E[分类视图与原文视图]
```

- `apps/extension/features/nuxt/`：采集、外部读取、devalue／Nuxt 解析和展示转换。
- `apps/extension/entrypoints/background/`：请求取消、文档身份核验、侧边栏入口。
- `apps/extension/composables/useInspection.ts`：窗口与标签页归属、刷新、请求失效。
- `apps/extension/features/inspector/`：树形查看和原文高亮。
- `apps/extension/tests/fixtures/nuxt/`：固定协议样本及来源摘要。
- `apps/extension/tests/e2e/`：协议样例与通用侧栏夹具；`tests/real-nuxt/`：真实应用验收。

生成的 manifest 仅申请 `storage`、`scripting`、`sidePanel`，以及 HTTP／HTTPS 主机访问权限。主机权限用于跨标签页自动读取和加载声明的外部 payload；不读取 cookies API、不使用 debugger，不上传采集内容。

## 验证记录

迁移后通过 48 项单元测试、5 项协议页面 E2E、18 项真实 Nuxt E2E，以及三个应用的类型检查和六组 Nuxt 生产构建。真实应用验收覆盖水合就绪、数据、特殊类型、Money 自定义类型、状态初值、NuxtLink 导航、整页刷新及原文导出。

错误／CSR／空数据／大数据页面已经建立，其真实应用自动化断言、外部故障注入、水合前采集和 CI 接入仍待补充；已有协议测试的边界覆盖不等同于这些真实应用场景已经验收。详见 [验证记录](docs/validation.md)、[真实 Nuxt 应用验证方案](docs/real-nuxt-validation-plan.md) 和 [改进方案](docs/improvement-plan.md)。结果不代表所有 Nuxt 小版本和部署形式均已兼容。

界面采用磨砂卡片、弥散渐变与微噪点，并提高文字对比度；配色来源和调整说明见 [界面风格记录](docs/non-fan-style-reference.md)。

Payload 分析、检索关注与 DevTools 首版已接入，详见 [使用与实现记录](docs/analysis-search-devtools-implementation.md) 和 [功能方案](docs/analysis-search-devtools-plan.md)。审查修复后 85 项单元测试、lint、三个应用类型检查及扩展生产构建通过；经用户授权，8 项协议侧栏、24 项真实 Nuxt 和 1 项真实 DevTools E2E 均通过，含慢主文档请求保留回归。
