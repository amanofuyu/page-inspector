# 页面 SEO 检查与 SSR／CSR 对比方案

状态：2026-09-29 已交付实施顺序中的第 1、2 步首版闭环，详细范围和与方案的取舍见 [实现记录](seo-inspection-implementation.md)。第 3、4 步持续观察与扩展审计仍为后续计划；以下保留原方案。

## 1. 目标与入口

新增一级「SEO」工作区，检查当前浏览器标签页的元信息，并对比文档 HTML 与运行后 DOM。侧栏跟随当前窗口活动标签页，DevTools 固定被检查标签页。普通 HTML、纯 CSR 页面及没有 Nuxt payload 的页面也能使用。

SEO 数据属于整个主文档，不随 Nuxt 应用下拉框或独立 payload 响应切换。保留现有「检索」用于 payload 查询；SEO 工作区提供自己的字段搜索、差异筛选和问题列表，避免两种数据范围混淆。

核心问题：某个 SEO 标签是否随 HTML 一起送达、运行后是否发生变化、当前页面有哪些需要处理的 SEO 问题。

## 2. SSR／CSR 的判定口径

产品采用「初始 HTML」「当前 DOM」「差异」三个视图。SSR／CSR 用于解释字段来源，不根据一次 DOM 读取给整页强行贴标签。

- 初始 HTML 中存在：证明文档交付时已有该字段，可能来自 SSR、SSG、静态文件、边缘生成或缓存，不能仅凭 HTML 区分服务端实时渲染与预渲染。
- 当前 DOM 中存在：表示采样时的实际值，其中也包含被保留的初始字段，不能全部算作客户端生成。
- 同一文档、同一路由的可靠 HTML 基线与 DOM 存在差异：标记「运行后新增／修改／删除」。能说明结果发生变化，不承诺定位是 hydration、业务脚本还是其他扩展造成的。
- 缺少基线、来源不完整或文档关联不明确：标记「来源未确认」，不把未知当作 HTML 缺失。

| HTML 基线                  | 当前 DOM         | 字段状态           |
| -------------------------- | ---------------- | ------------------ |
| 有，值相同                 | 有               | 初始已有，当前一致 |
| 有，值不同                 | 有               | 运行后修改         |
| 完整扫描后未发现           | 有               | 运行后新增         |
| 有                         | 完整扫描后未发现 | 运行后删除         |
| 未取得或对应范围扫描不完整 | 有／未发现       | 无法确认来源或差异 |

Nuxt 的 `serverRendered` 只保留为框架提示，不代替 SEO 字段的来源证据。`useHead`、`useSeoMeta` 最终输出的标签均通过 HTML／DOM 检查，无需读取 Unhead 私有运行时对象。[Nuxt SEO 与元信息](https://nuxt.com/docs/4.x/getting-started/seo-meta)

## 3. 首版采集范围

| 分组         | 字段与检查                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| 基础信息     | 全部 title、description、html lang、charset、viewport、base URL                    |
| 索引与规范化 | canonical、robots、googlebot；取得响应头时包含 X-Robots-Tag、Link 中的 canonical   |
| 多语言       | hreflang、对应 URL、x-default，保留重复项与语言代码                                |
| 社交分享     | 全部 `og:*`、`twitter:*` 标签，重点展示 title、description、image、url、type、card |
| 结构化数据   | head 与 body 中的 JSON-LD；展示各脚本、@type、@id、@graph、解析错误及完整原文      |
| 正文结构     | H1—H6 列表和层级；不把标题数量直接换算成 SEO 得分                                  |
| 传输信息     | 可取得时展示文档状态码、最终 URL、重定向信息及有关响应头；拿不到时标明未采集       |

保留标签顺序、位置、原始属性和值，不把重复 description 或 canonical 压成一个字段；og:image 等允许多值的字段不能套用单值重复规则。robots 扫描 head 与 body，并按通用爬虫／具体爬虫分别解释。

首版 JSON-LD 做语法和基本结构检查；不把 JSON 解析成功描述为通过全部 Schema.org／Google 富结果要求。Google 支持 JSON-LD 等结构化数据格式，也提供独立的富结果测试工具。[结构化数据说明](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)

图片 alt、链接统计、Microdata／RDFa、站点 robots.txt／sitemap 及跨页面检查放在后续阶段，避免首版混入整站爬虫和页面性能审计。

## 4. 采集通道与可信度

### 当前 DOM：默认立即可用

通过现有 `scripting.executeScript` 读取主文档，记录 documentId、当前 URL、初始导航 URL、采样时间、覆盖范围和扫描状态。SEO 状态独立于 Nuxt payload 的 ready／empty／error；Nuxt 数据为空不能阻止 SEO 检查。

### 当前文档 HTML：优先使用真实 DevTools 响应

复用现有网络会话，读取主文档响应正文与相关响应头。进入 SEO 后按需取得文档正文，不为每个请求自动读取正文。晚打开 DevTools 时请求可能缺失，提供明确操作「刷新页面并捕获 HTML」，由用户点击后再刷新。[Chrome DevTools 网络 API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)

基线关联核对 tabId、documentId、导航起点、HAR 页面关系、文档请求类型、最终 URL 和候选唯一性。先做技术探针确认 HAR 能提供的证据；同 URL iframe、重定向、缓存、缺失 pageref 或歧义候选不能仅凭 URL 认定为当前主文档。证据不足就保留「候选响应」，不用于确定性的客户端新增／删除判断。

响应正文可能来自 HTTP 缓存或 Service Worker，界面保留已知来源。这条证据说明浏览器收到的文档内容，不证明内容一定由源站实时 SSR 生成。

DevTools 会话拥有请求对象；后台只协调和转发有界 SEO 快照。若当前标签页存在已匹配基线，可分享给同一标签页的侧栏；侧栏独立打开时允许只显示当前 DOM。继续使用兼容项目最低浏览器版本的 DevTools 回调接口，不直接依赖新版 Promise 签名。

### 重新请求 HTML：显式的参考模式

侧栏提供「重新请求 HTML 作参考」。向当前 HTTP(S) 文档地址发起受限 GET，记录请求时间、最终 URL、状态、重定向及凭证策略。即使 URL 相同，也始终标为「重新请求」，不冒充这次导航实际加载的响应；登录态、缓存、A/B 实验、语言和请求头都可能使结果不同。

参考响应只生成「参考 HTML 与当前 DOM 不同」，不升级为已确认的 CSR 变化。跨域跳转或登录页作为独立结果呈现，不与原页面自动合并。同源凭证策略需要覆盖 SameSite 与当前标签页登录状态的实际测试，失败时说明读取失败；不能承诺重放当前导航的全部请求上下文。

不使用 `document.documentElement.outerHTML` 冒充原始 HTML。`document_start` 注入发生在 DOM 尚未构建完整时，因此早期观察也不能直接当成完整 SSR 快照。[Chrome 内容脚本时机](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

## 5. 对比与查询

每个快照携带来源类型、关联状态、文档／路由标识、时间、原始记录、标准化记录和分组覆盖状态。来源类型使用 `navigation-response`、`live-dom`、`refetch-reference`，覆盖状态使用完整／部分／失败，避免一个模糊的 SSR 布尔值承担所有含义。

对比规则：

- 根据标签类别、name／property／rel、hreflang、重复项及顺序进行匹配；保留多个候选，不能按值覆盖。
- 文本分别保存原文和用于比较的标准化值；属性名规范化，URL 依据各自文档 URL 与 base 解析。不能随意丢弃 query、尾斜杠或语言信息。
- JSON-LD 同时展示文本变化和可完成时的结构变化；对象键顺序不制造语义差异，数组顺序默认保留意义；不请求远程 @context。
- 超预算和解析失败只产生未知／部分结果，不能产生缺失结论。
- 首版 H1—H6 保留文档序列，重排或重复导致无法稳定匹配时展示列表差异，不虚构逐节点来源。

查询支持字段名／值包含、标签类别、来源状态、变化类型、问题等级、缺失／空值／重复。常见预设包括「仅看运行后新增」「canonical 有变化」「重复 description」「JSON-LD 解析失败」。示例：筛选 description，状态为运行后新增，可直接展开 HTML 未发现的证据与当前标签。

字段详情在当前行下方展开，展示 HTML 值、DOM 值、相关标签、问题原因与建议。提供复制单项、复制差异和导出版本化 JSON／Markdown 报告，操作反馈复用右下角 toast。

## 6. 动态更新与 SPA 导航

第一阶段完成手动采样和可靠基线对比；每次采样前后核对文档身份及 URL。完整导航立即使旧基线失效。同文档路由从 /a 进入 /b 后，原 /a 的 HTML 保留为历史文档，不拿来判定 /b 的字段是 CSR 独有；用户可刷新 /b 取得真实基线，或显式获取 /b 的参考 HTML。

第二阶段增加「跟随页面变化」与暂停采样。使用 MutationObserver 聚合有关节点变化，建议 300ms 防抖、最长 1s 输出一次；首版数值为工程预算，需性能测试调整。只在 SEO 会话启用时观察，退出时断开；DOM 稳定不等于框架 hydration 完成，显示采样时间与“仍在变化”，不宣称取得永久最终值。[MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

自动导航跟踪建议增加 `webNavigation` 权限，监听主框架提交、History API 和 hash 导航，结合 `pageshow`／`pagehide` 处理 BFCache。Chrome 提供 `onHistoryStateUpdated`，且 BFCache 恢复不会重新触发 DOMContentLoaded。路由事件更新独立 routeId，同 URL 再次进入也不能沿用旧的比较会话。[Chrome 导航 API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)

阶段一沿用现有权限并以显式采样为主；阶段二将新增权限及用途写入发布说明。无需新增 debugger、cookies 或通用 webRequest 读取权限。

## 7. 问题规则与解释

采用「明确问题／需要核对／信息」及规则编号，显示证据与适用前提，暂不做缺少依据的百分制 SEO 总分。

- title／description 空值、重复定义、JSON-LD 解析失败：展示实际标签和影响说明；标签“缺失”必须以完整扫描为前提。
- canonical 多个且冲突、同一路由运行后切换到其他 URL：需要核对。跨域 canonical 和有意设置 noindex 不自动视为错误。
- 初始 HTML 为 noindex、运行后被删除或改为 index：展示明显提醒；用户声明该页面应被索引时提高优先级。Google 可能因初始 noindex 跳过后续渲染，客户端移除不能作为可靠补救。[Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- robots 与 X-Robots-Tag 分来源、分目标爬虫解析。Google 规则冲突按更严格的限制解释，不宣称所有搜索引擎行为一致。[robots 规则](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- HTML 没有而 DOM 有的描述或 JSON-LD：首先是来源信息，不自动判定“搜索引擎无法收录”。
- 标题／描述提供长度与预览，不把固定字符数当成收录门槛；多 H1 也只提供结构提示。搜索预览标明模拟结果，实际标题与摘要可能由搜索引擎重新生成。[标题链接](https://developers.google.com/search/docs/appearance/title-link)、[摘要说明](https://developers.google.com/search/docs/appearance/snippet)

## 8. 页面布局

顶部显示当前页面、DOM 采样时间、HTML 来源和是否可可靠对比；操作区包含重新读取、参考 HTML、刷新并捕获、导出，按当前通道能力显示。

下方为「总览／标签／结构化数据／正文结构／问题」，再按需切换「差异／HTML／DOM」及筛选条件。概览采用问题数量、已确认变化数量和未确认数量，不显示没有依据的评分。

宽 DevTools 使用 HTML／DOM 双列；窄侧栏每个字段上下排列，沿用统一折叠卡片和就地详情。导航项随新增 SEO 页签适配窄屏；重新读取保留旧结果和筛选，显示加载状态，失败时保留上次快照但标记已过期。

无基线时仍展示全部当前 DOM 字段，顶部提示「尚未捕获本次文档 HTML」。不能用一整页空状态阻断其他已经可用的信息。

## 9. 与现有代码的衔接

| 模块                                           | 计划变更                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `features/seo/model.ts`                        | 快照、字段、来源证据、覆盖范围、差异、规则与报告类型                      |
| `features/seo/collect-dom.ts`                  | 与 Nuxt payload 独立的主文档采集，返回有界可序列化数据                    |
| `features/seo/parse-html.ts`                   | 纯解析器处理 HTML，复用相同字段提取规范；不执行页面脚本、不加载页面资源   |
| `features/seo/diff.ts`、`rules.ts`、`query.ts` | 对比、可解释规则与 SEO 字段筛选；从业务上与 payload 查询分离              |
| `composables/useSeoInspection.ts`              | 目标标签页、请求竞争、取消、快照状态与实时订阅                            |
| `features/seo/SeoView.vue` 等                  | SEO 工作区、字段卡片、问题详情、JSON-LD 及导出                            |
| `InspectorView.vue`                            | 增加 SEO 入口，解除页面整体状态对 Nuxt 数据存在性的依赖                   |
| 后台消息与 `features/network/session.ts`       | SEO 消息；主文档响应候选、有关响应头、会话分享；保留已有 payload 网络行为 |
| Nuxt 3／4 验证应用与协议样例                   | 真实 SSR／SSG／CSR SEO、延迟变化、冲突与导航用例                          |

HTML 在可终止的 Worker 中用纯 HTML 解析器处理，准确处理实体、重复标签、head／body、noscript 和浏览器解析语义；不在没有 DOM 的后台 service worker 中假设存在 DOMParser，也不使用正则表达式代替完整 HTML 解析。依赖选型在实施时先核对最新版本与兼容性。

初始预算建议：每份 HTML 不超过 5 MiB、最多 2,000 条元信息、10,000 个标题节点、单份 JSON-LD 1 MiB、会话总缓存 12 MiB。保留覆盖状态，扫描和解析支持取消，相关正文超过预算时明确降级。最终预算需用大页面测量校准。

所有标签与原文作为文本显示；不会执行采集到的脚本或自动加载分享图片。快照默认仅留当前会话；持久化只保存筛选偏好，报告由用户主动导出。后台接收采集结果时核对来源标签页、文档和会话，忽略迟到结果。

## 10. 实施顺序与验收

1. **先验证 HTML 来源链路**：真实主文档正文及有关响应头、HAR 关联可靠性、晚打开 DevTools、缓存和同 URL iframe。结果决定哪些情况可显示已确认对比；不满足条件时按候选降级。
2. **完成首版闭环**：独立 SEO 入口、HTML／DOM 采集、全部首版字段、差异与筛选、基础问题规则、就地详情和导出。普通侧栏无 DevTools 时仍可检查 DOM，并提供参考模式。
3. **增强动态排查**：实时观察、SPA 路由会话、暂停与恢复、有限时间线、历史快照对比，补齐导航权限与生命周期验证。
4. **按需要扩展审计**：图片 alt、链接、Microdata／RDFa、更细的结构化数据规则、分享预览以及跨页 hreflang 验证。

验收重点：

- Nuxt 3／4：动态 SSR、两种预渲染配置、`ssr: false`；标签来自真实框架输出。
- 普通非 Nuxt 页面仍可用；SEO 不受独立 payload 响应和多应用选择影响。
- HTML 为空／DOM 新增、修改、删除、重复、同值重建、延迟注入与纯 SSR 标签均准确分类。
- SPA /a→/b、浏览器前进后退、BFCache、同 URL 重载、快速切标签页、采集中导航，不发生跨文档比较。
- DevTools 晚打开、正文不可读、同 URL iframe、重定向、登录页、缓存、参考响应与真实响应不同，均能正确降级。
- 304 无可读正文不解释成空 HTML；字节编码、base URL、noscript、畸形 HTML、重复 JSON-LD 与超大数据覆盖边界都有回归。
- robots／响应头冲突、非法 JSON-LD、canonical 冲突及故意 noindex 有明确证据和条件，不给出无依据的收录保证。
- 320px 侧栏、宽 DevTools、深浅主题、键盘、减少动态效果、长字段和重复刷新通过交互验收。

建议第一批交付第 1、2 步，使“查到 SEO 字段并可靠区分初始 HTML 与运行后变化”成为完整可用的功能，再扩展持续观察和更多审计项。
