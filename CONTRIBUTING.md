# 贡献指南

感谢你愿意为 7 Days to Die 服务器管理工具做贡献。本文说明本仓库期望的本地开发、测试和提交流程。

## 开发环境

- Node.js 18+
- npm
- Rust stable + Cargo
- Tauri 2 所需系统依赖
  - Linux 通常需要 `webkit2gtk-4.1`、`librsvg2`、`libxdo`、`libayatana-appindicator3` 等开发包。

## 本地启动

```bash
npm install
npm run build
npm start
```

## 常用验证命令

提交前请至少运行：

```bash
npm run build
npm test -- --runInBand
npm run test:rust
```

如果修改了 Rust 代码，请额外运行：

```bash
cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## 代码规范

- 用户界面文本和主 README 使用中文。
- TypeScript 使用严格模式、双引号、分号和 tab 缩进。
- 前端保持 vanilla TypeScript/DOM，不引入框架，除非先讨论迁移方案。
- Rust 代码必须通过 `cargo fmt` 和 `cargo clippy -- -D warnings`。
- `src/renderer/telnet-commands.gen.ts` 是生成文件，不要手动提交。
- `dist/`、`src-tauri/target/`、`coverage/` 等构建产物不要提交。

## 提交流程

1. 从最新 `main` 创建功能分支。
2. 保持变更聚焦，避免把无关重构混入同一个 PR。
3. 为修复和新行为添加测试。
4. 确认本地验证通过。
5. 提交 PR，并填写 PR 模板。

推荐提交信息格式：

```text
<type>: <description>
```

常用 type：`feat`、`fix`、`docs`、`test`、`refactor`、`chore`、`ci`。

## 安全相关贡献

请不要在公开 issue 中披露可利用的安全细节。安全问题请按 `SECURITY.md` 的方式报告。
