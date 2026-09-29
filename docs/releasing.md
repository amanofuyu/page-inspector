# 扩展发布

仓库通过 `.github/workflows/release.yml` 将版本标签对应的生产扩展上传到 [GitHub Releases](https://github.com/amanofuyu/page-inspector/releases)。构建产物保持在 Git 忽略目录中，使用者可以直接下载安装包。

## 发布一个版本

1. 将根目录 `package.json` 和 `apps/extension/package.json` 的 `version` 更新为相同版本。两个 Nuxt 验证应用无需同步版本。
2. 提交版本修改和本次要发布的代码，确保提交中包含发布工作流。
3. 在该提交上创建并推送 `v主版本.次版本.修订版本` 标签。首次发布可以使用项目当前版本 `v0.0.1`：

```bash
git push origin master
git tag -a v0.0.1 -m "发布 Page Inspector 0.0.1"
git push origin v0.0.1
```

示例中的版本需要替换为实际发布版本；标签必须与两个 `package.json` 的版本一致。目前仅支持正式版本，例如 `v0.0.1`，不支持 `v0.0.1-beta.1`。工作流构建标签指向的提交，不会自动选择分支最新代码。

在仓库 Actions 页面查看「发布扩展」运行记录。工作流使用 `.nvmrc` 和根目录 `packageManager` 固定的工具版本，以 `pnpm install --frozen-lockfile` 安装依赖，依次执行 lint、三个应用的类型检查、扩展单元测试和 `pnpm zip`。

通过检查后，Release 包含：

- `page-inspector-0.0.1-chrome.zip`：生产扩展，版本号随标签变化。
- `SHA256SUMS.txt`：该 ZIP 的 SHA-256 校验值。
- 中文安装、更新和校验说明。

工作流会检查 ZIP 完整性，以及包内 `manifest.json` 的版本和 Manifest V3 格式。E2E 仍需按项目约定单独取得用户确认，不在发布工作流中执行。

## 权限与重试

仓库需要启用 GitHub Actions，并允许工作流使用 `contents: write` 权限创建 Release。发布使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需额外配置个人访问令牌。第三方 Action 固定到经核对的提交 SHA。

安装或构建失败后，可以在 Actions 页面重新运行。若上传过程中留下了同名草稿 Release，先删除该草稿再重跑；`gh release create` 会先上传附件，再将 Release 发布。工作流不会覆盖已有 Release，已经成功发布的版本应通过递增版本号和创建新标签更新。

若推送标签后没有生成运行记录，也可以打开 Actions →「发布扩展」→「Run workflow」，选择 `master` 并填入已推送的标签，例如 `v0.0.1`。手动运行会检出该标签对应的代码，同样校验版本并执行全部发布检查。

## 本地检查打包

在依赖已经安装的工作区执行：

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm use
pnpm zip
```

WXT 将生产 ZIP 写入 `apps/extension/.output/`，文件名以 `-chrome-prod.zip` 结尾。CI 上传前将其重命名为上面的下载文件名。本地打包不会创建标签或发布 Release。

下载与安装步骤见 [发布说明模板](../.github/release-notes.md)。安装的目录需长期保留，后续版本需要手动替换文件并重新加载扩展。

参考：[GitHub CLI 发布命令](https://cli.github.com/manual/gh_release_create)、[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。
