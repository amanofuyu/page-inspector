## 下载与安装

1. 下载附件中以 `page-inspector-` 开头、以 `-chrome.zip` 结尾的生产压缩包；`Source code` 是源码归档。
2. 解压到一个长期保留的目录，确认该目录直接包含 `manifest.json`。
3. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`，开启「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的目录。
5. 点击扩展图标，或按 `Ctrl+M`（macOS 为 `Command+M`）打开侧边栏。

产物面向 Chrome／Edge 116+，使用者无需安装 Node 或自行构建。开发者模式安装的扩展需要手动更新：用新版文件替换原目录内容，再到扩展管理页点击「重新加载」。

## 完整性校验

同时下载 `SHA256SUMS.txt`，将两个附件放在同一目录。在 Linux／WSL 中执行：

```bash
sha256sum -c SHA256SUMS.txt
```

发布前自动执行代码规范、类型检查、单元测试、生产构建及压缩包完整性检查。此工作流不包含 E2E 测试。
