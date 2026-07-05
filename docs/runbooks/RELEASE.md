# 发布运行手册

本文说明如何为 7 Days to Die 服务器管理工具创建和发布新版本。

## 发布前检查清单

- [ ] `main` 分支上的所有 CI 检查通过。
- [ ] `package.json` 和 `src-tauri/tauri.conf.json` 中的版本号已更新。
- [ ] `CHANGELOG.md`（如存在）或 GitHub Release Notes 已记录主要变更。
- [ ] 本地至少运行过 `npm run check`（包含 TypeScript 类型检查、Rust fmt/clippy、Jest 和 Rust 测试）。
- [ ] 已在目标平台（Windows / macOS / Linux）上执行过 `npm run tauri:build` 并确认安装包可正常启动。

## 版本号规范

本项目采用 `主版本.次版本.修订号` 的语义化版本号：

- **修订号**：bug 修复和小幅优化。
- **次版本**：新增功能、UI 改进或命令支持扩展。
- **主版本**：重大架构变更或不兼容改动。

更新版本号时，请同时修改以下文件：

1. `package.json` 中的 `"version"` 字段。
2. `src-tauri/tauri.conf.json` 中的 `"version"` 字段。

## 创建发布

1. 在本地切换到最新 `main` 分支：

   ```bash
   git checkout main
   git pull origin main
   ```

2. 打一个符合版本号的标签：

   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

3. GitHub Actions 的 `release.yml` 工作流会在推送标签后自动构建并创建 Release。

4. 如果没有自动化，也可手动在 GitHub 上创建 Release：
   - 选择刚刚推送的标签。
   - 标题使用 `v1.0.0`。
   - 正文使用 "Generate release notes" 或手工整理变更列表。
   - 上传 `src-tauri/target/release/bundle/` 中的安装包。

## 手动构建安装包

```bash
# 当前平台
npm run dist

# Linux 交叉构建 Windows 安装包
npm run dist:win
```

构建产物位于：

- `src-tauri/target/release/bundle/`
- Windows: `.msi`、`.nsis.exe`
- macOS: `.app`、`.dmg`
- Linux: `.AppImage`、`.deb`、`.rpm`

## 发布后

- 验证 Release 中的安装包可以正常下载和安装。
- 在 README 顶部更新版本徽章（如使用 shields.io）。
- 如有安全相关修复，请在发布说明中明确标注，并参考 `SECURITY.md` 进行披露。

## 回滚

如果发布存在严重问题：

1. 删除或编辑有问题的 GitHub Release。
2. 撤回有问题的标签（谨慎操作，会影响已克隆的用户）：

   ```bash
   git push --delete origin v1.0.0
   git tag --delete v1.0.0
   ```

3. 修复问题后重新打标签并发布。
