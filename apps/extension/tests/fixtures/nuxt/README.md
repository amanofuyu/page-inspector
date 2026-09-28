# Nuxt 固定格式样本

这些是离线协议样本，不是浏览器 E2E 的采集结果。

- 使用 npm 发布包 Nuxt 3.17.5 和 Nuxt 4.0.0 的 `dist/app/plugins/revive-payload.server.js` 中实际 reducer 数组生成。
- 使用两个 Nuxt 版本共同声明的 devalue 5.1.1 与项目已有 Vue 3.5.26 序列化，避免只验证当前解析器自己生成的数据。
- 样本包含响应式包装、空引用、Map、Set、Date、BigInt、正则、特殊数值、重复引用、循环引用及 SSR 元信息。
- `provenance.json` 记录官方 reducer 源文件和样本内容的 SHA-256；样本固定提交，不随测试重新生成。
- NuxtError 与自定义类型另由边界测试覆盖。真实网站的浏览器验收需要用户确认后执行。
