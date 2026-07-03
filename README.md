# 7 Days to Die 服务器管理工具

基于 Tauri + TypeScript 的 7 Days to Die 专用服务器桌面管理工具，通过 Telnet 协议连接服务器进行管理。

> 当前项目以 Tauri 版本为准：`src-tauri/` 是桌面后端入口，`src/renderer/` 是前端 UI。旧 Electron 启动、打包脚本和依赖已移除。

## 功能特性

- ✅ Telnet 连接与自动认证
- ✅ 多服务器连接配置保存与快速切换
- ✅ 在线玩家列表（自动解析 `listplayers`）
- ✅ 玩家管理：踢出、击杀、封禁、白名单、管理员权限
- ✅ 世界管理：保存世界、关服、时间控制、天气控制
- ✅ 实体控制：列出实体、生成尸群/空投/补给箱
- ✅ 自定义命令输入
- ✅ 实时日志输出，日志文件自动按日期归档
- ✅ 可视化编辑 `serverconfig.xml`
- ✅ 跨平台（Windows / macOS / Linux）

## 开发环境

- Node.js 18+
- npm 或 yarn
- Rust/Cargo（运行或打包 Tauri 版本需要）
- Linux 打包还需要安装 Tauri 系统依赖，例如 `webkit2gtk-4.1` 和 `librsvg2`。

## 安装依赖

```bash
npm install
```

## 构建

```bash
# 构建 Tauri 前端资源到 dist/renderer
npm run build
```

## 运行

```bash
# 启动 Tauri 开发模式
npm start
# 或
npm run tauri:dev
```

## 测试

```bash
# TypeScript/Jest 测试
npm test

# Rust/Tauri 后端测试
npm run test:rust

# 全部测试
npm run test:all
```

## 打包发布

```bash
# Tauri 打包当前平台
npm run dist
# 或
npm run tauri:build

# 在 Linux 上交叉构建 Windows x64 NSIS 安装包
npm run dist:win
# 或
npm run tauri:build:win
```

Tauri 打包结果位于 `src-tauri/target/`。Windows 交叉构建需要 Rust `x86_64-pc-windows-gnu` target、`mingw-w64` 和 `nsis`。

## 使用说明

1. 启动应用后，在左侧输入服务器地址、Telnet 端口和密码
2. 点击"连接"按钮连接到服务器
3. 可以将当前连接保存为配置文件，方便下次快速切换
4. 连接成功后，可以在"在线玩家"面板查看玩家列表
5. 使用"常用操作"按钮执行快捷命令
6. 在"自定义命令"输入框中输入任意 Telnet 命令并执行
7. 在"服务器配置"面板选择并编辑 `serverconfig.xml`
8. 点击"打开日志目录"查看操作日志

## 项目结构

```text
7dtd-server-manager/
├── src/
│   ├── common/          # 前端共享类型和常量
│   ├── main/            # 迁移期保留的 TypeScript Telnet/配置模块与测试基线
│   └── renderer/        # Tauri 前端 UI
├── src-tauri/           # Tauri Rust 后端、配置和权限（桌面运行时权威入口）
├── tests/               # TypeScript/Jest 测试文件
└── dist/                # 前端构建输出
```

## 安全提示

- 不要将服务器密码硬编码在代码中
- 仅在受信任的网络环境中使用 Telnet 连接
- 建议通过 VPN 或本地网络管理服务器

## 许可证

MIT
