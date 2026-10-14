# 第三方来源与许可

本项目是基于已有开源项目的二次开发与集成。宠物角色、主要动画、宠物引擎、扑克规则及塔罗素材并非本项目从零原创。请保留原作者署名和各组件许可。

| 组件／素材 | 原项目／作者 | 许可与使用范围 |
| --- | --- | --- |
| 宠物引擎及主要角色动画 | [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，基于 0.3.6 | 引擎代码 MIT，原文保留于 `onefish-desktop/vendor/dsh-pet/LICENSE`；动画沿用已取得素材包的非商业使用与署名范围，不宣称原创 |
| 德州扑克规则引擎 | [BubblePtr/dsh-holdem](https://github.com/BubblePtr/dsh-holdem)，基于 0.4.0 | MIT，保留 `onefish-desktop/vendor/holdem/LICENSE`；本项目增加独立界面、联机和私人练习适配 |
| 塔罗数据、牌阵与抽牌逻辑 | [shetengteng/dsh-lumina-tarot](https://github.com/shetengteng/dsh-lumina-tarot)，基于 0.1.3 | 代码 MIT，保留 `onefish-desktop/vendor/lumina-tarot/LICENSE` 与 `NOTICE` |
| 韦特塔罗卡面 | Pamela Colman Smith／Arthur Edward Waite，1909 | 公共领域；来源说明保留于上述 NOTICE |
| Aquatic Tarot 水彩卡面 | [Andreas Schröter](https://www.aquatictarot.de/) | CC BY-NC-SA 3.0，保留署名、非商业与相同方式共享要求；不适用 MIT |
| 四方向新增动画 | 参考上游角色，经 imagegen 生成并组装 | 生成提示词与记录随源码保留；角色来源仍归上游，不扩大其素材许可范围 |
| macOS 键盘背光桥接 | [Dim Keys](https://github.com/dmartoon/MacBook-Keyboard-Backlight-Limiter) | MIT，保留 `onefish-desktop/native/DimKeys-LICENSE` |
| 网络通信 | Socket.IO／socket.io-client | MIT，客户端与服务器依赖许可随代码和发行包保留 |
| 桌面运行环境 | Electron／Chromium | 许可随各平台发行包保留 |
| Codex、Claude、DSH 图标及商标 | 对应应用权利人 | 仅用于识别对应应用；不适用项目其他组件的许可，来源见 `onefish-desktop/ui/icons/SOURCES.json` |

## 本项目增加的内容

独立桌面应用、Codex／Claude／DSH 状态适配、窗口交互、任务动画调度、四向移动组装、跨平台打包、键盘灯效调度、私人联机房间及可选 API 机器人适配。第三方原始版权声明与本地修改记录均予保留。

## 分发范围

本仓库没有将整个项目统一重新授权为 MIT。代码、图像、动画、卡面与商标分别遵守各自许可；完整发行包包含非商业素材，按非商业用途分发。新增原创部分未另行授予统一许可，使用前请联系维护者确认。

没有独立再分发授权的“上首软糖体”已从本公开副本和发行包移除，使用原有系统字体回退。详细来源和改动见 [桌面模块第三方声明](onefish-desktop/THIRD_PARTY_NOTICES.md)。
