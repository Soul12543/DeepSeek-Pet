# 吃白饭的大肥鱼 · DeepSeek-Pet

独立桌面宠物，显示 Codex、Claude Code Desktop 与 DSH 的任务状态，带桌面动画、离线德州扑克、塔罗和私人朋友牌桌。当前公开版本：**0.10.1**。

> **基于已有开源项目二次开发。** 宠物角色、主要动画和引擎来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，扑克规则来自 [dsh-holdem](https://github.com/BubblePtr/dsh-holdem)，塔罗数据与卡面来自 [Lumina Tarot](https://github.com/shetengteng/dsh-lumina-tarot)。这些素材和代码并非本项目全部原创。请先阅读 [第三方来源与许可](THIRD_PARTY_NOTICES.md)：代码、动画、卡面和商标的许可不同，完整发行包仅按非商业用途分发。

## 下载与运行

在本仓库 Releases 下载对应平台 ZIP：macOS Apple Silicon、macOS Intel 或 Windows x64。完整解压后打开应用；Windows 的运行文件与 resources 等目录必须保留在一起。运行时内置 Electron 和动画，不要求安装 DSH、Node.js 或 npm。

macOS 发行包使用本地临时签名，没有 Apple 商业发行签名和公证；Windows 包未做商业代码签名。Windows 包结构已检查，但没有在真实 Windows 主机完成桌面验收。

## 功能

- 分别显示三个助手的状态和任务摘要，点击打开应用；本地状态读取不自动上传助手会话。
- 透明桌面动画、拖动和右键菜单、连续尺寸调节、四向漫游、固定位置，以及任务完成动画。
- 支持可检测到的 Mac 内置背光键盘灯效。
- 离线德州扑克和塔罗；私人联机支持 Mac 与 Windows 同桌，最多十二席，房主逐一确认好友申请。
- 0.10.1 提供可见的单人练习模式和可选 API 机器人；多真人对局不启用练习改牌。API 服务可能按使用量收费。

联机默认服务地址及房主授权方法见 [桌面应用说明](onefish-desktop/README.md) 和 [服务器说明](multiplayer-server/README.md)。下载应用不附送房主密钥；自行部署服务器时必须自行配置授权文件。

## 开发与验证

```sh
cd onefish-desktop
node --test test/*.test.cjs
python3 scripts/build_macos.py --electron /path/to/Electron.app
python3 scripts/build_windows.py
```

服务器需要 Node.js 22 或更新版本；在 multiplayer-server 中执行 npm ci 和 npm test。打包脚本复用官方 Electron。源码保留所有必要第三方许可；用户配置、API 密钥、房主密钥、历史构建、验证日志和私人归档不入库。

## 目录

- `onefish-desktop/`：主应用源码、素材、第三方引擎、打包脚本和测试。
- `multiplayer-server/`：私人房间服务器、网页客户端、部署脚本和测试。
- `dsh-onefish/`、`dsh-deskfish/`、`dsh-holdem-patched/`、`dsh-pet-size-patch/`：历史 DSH 插件与兼容补丁；不是运行主应用的前置条件。

来源、版权和本项目增加的部分均列于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。不得把第三方角色、动画或卡面标为本项目原创，也不得将包含非商业素材的整包当作可商用资源。

## 0.10.1

修复添加角色后下拉选择框和设置列表的反复重建。任何客户端都可建桌，由该房间当前房主审核入桌；不需要专用设备授权。软件出厂服务器地址留空，邀请链接可带入服务器。支持 OpenAI 兼容与 Anthropic API 机器人，API 密钥保存在个人设置，不能随源码或发布包分享。

发布内容不包含作者的个人域名、邮箱或机器路径。第三方素材和代码署名仍保留，详见 THIRD_PARTY_NOTICES.md。
