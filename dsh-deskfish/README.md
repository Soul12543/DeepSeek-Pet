# dsh-deskfish · 独立桌面浮窗原型

这是把真实牌桌状态显示在 DSH 主窗口外的只读验证原型，当前未登记到 desktop profile。

## 现有实现

- 宿主 `lib/index.js` 复用 `dsh-holdem` 导出的 `createTable()` 建立独立牌桌。
- 通过上下文屏蔽 LLM 服务，使用扑克模块的启发式机器人。
- 复用 `~/.dsh/electron` 的 Electron 二进制，启动 `electron-app/` 的透明置顶窗口。
- 每 500ms 向子进程 stdin 推送快照或心跳；子进程把状态交给渲染页。
- 宿主退出或长时间收不到心跳时关闭窗口。

## 文件

| 文件 | 用途 |
| --- | --- |
| `lib/index.js` | 宿主入口、牌桌与子进程管理 |
| `electron-app/main.js` | Electron 窗口、stdin 与心跳处理 |
| `electron-app/preload.js` | 向渲染页暴露受控通道 |
| `electron-app/index.html` | 牌桌展示页面 |
| `cordis.patch.yml` | DSH 插件挂载声明 |

## 尚未完成

跟注、加注等操作回传尚未实现。它不等同于 `dsh-onefish` 的网页标签容器，也不是桌面宠物尺寸补丁。

启用前需要让 DSH 插件环境能够解析 `dsh-holdem`，并确保本机 Electron 二进制存在。归档目录中的源码不宜直接当独立 Electron 程序启动；其数据来自 DSH 宿主。
