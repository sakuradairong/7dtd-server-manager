# 7 Days to Die 服务器管理工具

基于 Electron + TypeScript 的 7 Days to Die 专用服务器桌面管理工具，通过 Telnet 协议连接服务器进行管理。

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

## 安装依赖

```bash
npm install
```

## 构建

```bash
npm run build
```

## 运行

```bash
npm start
```

## 测试

```bash
npm test
```

## 打包发布

```bash
# 打包当前平台
npm run dist

# 打包指定平台
npm run dist:win
npm run dist:mac
npm run dist:linux
```

打包结果位于 `release/` 目录。

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
│   ├── common/          # 共享类型和常量
│   ├── main/            # Electron 主进程 + Telnet 客户端 + 业务逻辑
│   └── renderer/        # 渲染进程 UI
├── tests/               # 测试文件
├── assets/              # 应用资源（图标等）
└── dist/                # 构建输出
```

## 安全提示

- 不要将服务器密码硬编码在代码中
- 仅在受信任的网络环境中使用 Telnet 连接
- 建议通过 VPN 或本地网络管理服务器

## 许可证

MIT
