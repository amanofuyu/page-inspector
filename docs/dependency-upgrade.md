# 依赖升级记录

日期：2026-09-28。范围：根工具链、浏览器扩展和两个 Nuxt 验证应用。

## 版本选择

安装前已联网读取 npm registry 的最新稳定版本、Node 约束与 peer 依赖。本次采用以下策略：

- 支持现有运行环境的直接依赖升级到查询到的最新稳定版本，锁定完整依赖图。
- TypeScript 从 5.9.3 升至 6.0.3，并在四个 package.json 中精确固定。查询时最新主线为 7.0.2，但当前 typescript-eslint 8.70.1 支持范围为 `>=4.8.4 <6.1.0`，因此暂不采用 7.x。[官方兼容范围](https://typescript-eslint.io/users/dependency-versions/)
- Nuxt 3 应用保持 3.21.11、Vue Router 4.6.4；Nuxt 4 应用保持 4.5.2、Vue Router 5.3.1。这些已是各自验证基线的最新稳定版本，不将 Nuxt 3 样例改成 Nuxt 4。
- devalue 6.0.2、Vitest 5.0.2、Playwright 1.63.0 已是查询到的最新版本，继续使用。
- lint-staged 17.6.0 要求 Node 至少 22.22.1，因此根项目与各应用的 engines 统一调整为 `^22.22.1`；`.nvmrc` 的 22.23.3 保持不变。
- 包管理器继续使用项目固定的 pnpm 10.19.0，共享锁文件结构保持不变；本次升级对象为项目 dependencies／devDependencies。

## 直接依赖变更

| 应用                        | 依赖                      | 升级前声明                 | 升级后声明 |
| --------------------------- | ------------------------- | -------------------------- | ---------- |
| `page-inspector`            | `@antfu/eslint-config`    | `^6.7.3`                   | `^9.5.1`   |
| `page-inspector`            | `eslint`                  | `^9.39.2`                  | `^10.11.0` |
| `page-inspector`            | `eslint-plugin-format`    | `^1.2.0`                   | `^2.0.1`   |
| `page-inspector`            | `lint-staged`             | `^16.2.7`                  | `^17.6.0`  |
| `page-inspector`            | `simple-git-hooks`        | `^2.13.1`                  | `^2.14.0`  |
| `page-inspector`            | `taze`                    | `^19.9.2`                  | `^21.2.0`  |
| `page-inspector`            | `typescript`              | `^5.9.3`                   | `6.0.3`    |
| `@page-inspector/extension` | `@unhead/vue`             | `^2.1.2`                   | `^3.4.1`   |
| `@page-inspector/extension` | `@webext-core/messaging`  | `^2.3.0`                   | `^4.0.0`   |
| `@page-inspector/extension` | `@lucide/vue`             | `lucide-vue-next ^0.562.0` | `^1.48.0`  |
| `@page-inspector/extension` | `@shikijs/langs`          | `^3.21.0`                  | `^4.4.3`   |
| `@page-inspector/extension` | `@shikijs/themes`         | `^3.21.0`                  | `^4.4.3`   |
| `@page-inspector/extension` | `@tailwindcss/typography` | `^0.5.19`                  | `^0.5.20`  |
| `@page-inspector/extension` | `@tailwindcss/vite`       | `^4.1.18`                  | `^4.3.3`   |
| `@page-inspector/extension` | `@types/chrome`           | `^0.1.33`                  | `^0.3.0`   |
| `@page-inspector/extension` | `@vueuse/core`            | `^14.1.0`                  | `^15.0.0`  |
| `@page-inspector/extension` | `daisyui`                 | `^5.5.14`                  | `^5.7.46`  |
| `@page-inspector/extension` | `pinia`                   | `^3.0.4`                   | `^4.0.3`   |
| `@page-inspector/extension` | `shiki`                   | `^3.21.0`                  | `^4.4.3`   |
| `@page-inspector/extension` | `tailwind-merge`          | `^3.4.0`                   | `^3.7.0`   |
| `@page-inspector/extension` | `tailwindcss`             | `^4.1.18`                  | `^4.3.3`   |
| `@page-inspector/extension` | `typescript`              | `^5.9.3`                   | `6.0.3`    |
| `@page-inspector/extension` | `unplugin-vue-components` | `^30.0.0`                  | `^32.1.0`  |
| `@page-inspector/extension` | `vite`                    | `^7.3.1`                   | `^8.3.1`   |
| `@page-inspector/extension` | `vue`                     | `^3.5.26`                  | `^3.5.43`  |
| `@page-inspector/extension` | `vue-tsc`                 | `^3.2.2`                   | `^3.3.11`  |
| `@page-inspector/extension` | `wxt`                     | `^0.20.13`                 | `^0.21.4`  |
| `@page-inspector/nuxt3`     | `typescript`              | `5.9.3`                    | `6.0.3`    |
| `@page-inspector/nuxt4`     | `typescript`              | `5.9.3`                    | `6.0.3`    |

## 迁移适配

WXT 升至 0.21.4，扩展 Vite 升至 8.3.1。WXT 新版将浏览器启动工具改为可选依赖；项目未安装该工具，移除旧的 `webExt.disabled` 配置后继续手动加载开发扩展。开发和生产产物路径沿用既有约定。[WXT 升级说明](https://wxt.dev/guide/resources/upgrading)

保留 WXT 新增的 `noUncheckedIndexedAccess` 检查：测试断言改用安全索引访问，测试中已知存在的请求与样本明确标注；扩展 tsconfig 显式包含 Chrome API 类型。没有关闭严格类型检查，也没有排除测试文件。

图标库从已弃用的 `lucide-vue-next` 迁至官方替代包 `@lucide/vue`，同步调整侧栏导入，图标用途保持一致。[Lucide 迁移说明](https://lucide.dev/guide/vue/migration)

Shiki 及语言／主题包同步升至 4.4.3，继续按需加载 JavaScript 正则引擎；Vue、VueUse、Pinia、Unhead、消息库与样式依赖完成同步升级。ESLint 升至 10.11.0，配置升至 9.5.1，只需修正导入排序和 workspace 配置排序。

## 已知上游提示

Nuxt 3.21.11 的 CLI 对 schema 4 的 peer 声明与实际 schema 3 不一致，沿用迁移前已记录的上游警告，未用 overrides 强制更换框架依赖。安装仍会提示少量间接依赖已弃用。

simple-git-hooks 的依赖安装脚本保持不自动执行；需要启用本仓库的提交钩子时，使用已有的 `pnpm prepare:hooks` 命令。

## 验证结果

验证环境为 WSL、Node 22.23.3、pnpm 10.19.0、Playwright 1.63.0 与 Chromium 153.0.8010.12。

| 检查                                       | 结果                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` | 通过，锁文件无需重新解析                           |
| `pnpm lint`                                | 通过                                               |
| `pnpm typecheck`                           | 三个应用全部通过                                   |
| `pnpm test`                                | 8 个文件、48 项全部通过                            |
| `pnpm build` / `pnpm build:dev`            | 扩展生产／开发构建通过                             |
| WXT 开发服务器                             | 端口 3418 启动并完成预构建；短时检查结束后主动停止 |
| `pnpm fixtures:build`                      | 六组 Nuxt 生产构建全部通过                         |
| 协议样例浏览器验收                         | 5 项通过，约 13.4 秒                               |
| 真实 Nuxt 应用浏览器验收                   | 18 项通过，约 37.5 秒，无跳过／重试                |

浏览器验收沿用会话中已有授权，实际加载生产扩展并打开真实侧栏。覆盖类型展示、搜索、剪贴板、下载、主题、高亮、标签切换、异常降级及真实 Nuxt 导航／外部 payload。生产 manifest 仍只申请 storage、scripting、sidePanel 和 HTTP／HTTPS 主机访问权限。

测试报告和下载文件位于 `apps/extension/test-results/`。六组构建清单重新记录本次根锁文件摘要；旧版协议样本保持原文与摘要不变。完整真实应用验证方案中尚未实施的边界场景，仍按 [验证记录](validation.md) 所列范围保留。
