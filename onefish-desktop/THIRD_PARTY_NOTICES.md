# 第三方来源与许可

宠物的动画、物理交互、共享组件和桌面渲染引擎复用 dsh-pet 0.3.6：
https://github.com/PC2005-cloud/dsh-pet

代码许可见 vendor/dsh-pet/LICENSE。上游对动画素材的声明为允许开源使用、禁止商用；二次展示和分发须注明原作者链接。本软件保留全部来源标记，不将这些素材声明为自己创作。

独立桌宠与状态接入已查阅以下开源项目，本版没有复制它们的代码：
- https://github.com/MerZlin/dsh-pet-indesktop
- https://github.com/yangbuyiya/desktop-pet
- https://github.com/fredruss/agent-paperclip

运行程序是 Electron 43.3.0，许可随应用 Contents/Resources/LICENSE* 保留。

Codex 生命周期参考：https://learn.chatgpt.com/docs/hooks

## 应用识别图标

`ui/icons` 的 Codex、Claude 和 DSH 图标提取自本机已安装应用的原始图标资源，仅用于标识和打开对应应用。图标及相关商标归各自权利人所有，不适用宠物引擎的 MIT 许可；来源见 `ui/icons/SOURCES.json`。

## 小游戏

德州扑克引擎复用 [BubblePtr/dsh-holdem](https://github.com/BubblePtr/dsh-holdem) 0.4.0 的本地兼容包，MIT 许可见 vendor/holdem/LICENSE；支持指定独立头像目录，游戏规则与本地策略沿用上游。

塔罗的 78 张牌、牌义、四种牌阵和抽牌逻辑提取自 [shetengteng/dsh-lumina-tarot](https://github.com/shetengteng/dsh-lumina-tarot) 0.1.3，MIT 许可见 vendor/lumina-tarot/LICENSE。韦特卡面为 Pamela Colman Smith / Arthur Edward Waite 1909 年公共领域图像；水彩卡面为 Andreas Schröter 的 Aquatic Tarot，遵循 CC BY-NC-SA 3.0，仅非商业使用，详情见 vendor/lumina-tarot/NOTICE。

## 新增四方向移动素材

assets/generated-movement 的四方向动作表由内置 imagegen 依据原 dsh-pet 角色参考帧生成，保存完整提示词和生成记录；新 GIF 与透明 WebM 由八帧动作表组装。角色形象沿用上游，保持上游素材的来源标记与非商用使用范围。

方向规划在独立应用中实现；动手前查阅 dsh-pet、akhanreviews/os-pet 与 promptwhisper/sprite-pet-skill 的移动/帧序列方案，没有复制后两个项目的代码。

## 键盘背光

`native/keyboard-backlight.m` 的 CoreBrightness 接口桥接参考并改写自 [Dim Keys](https://github.com/dmartoon/MacBook-Keyboard-Backlight-Limiter) 的 KeyboardBacklight.swift，MIT 许可见 native/DimKeys-LICENSE。任务调度、短生命周期辅助程序、双闪与呼吸、心跳保护、EOF/退出恢复均在本项目实现。还查阅了 MIT 项目 [mac-brightnessctl](https://github.com/rakalex/mac-brightnessctl) 和 [macos-keyboard-backlight](https://github.com/noluyorAbi/macos-keyboard-backlight)，未引入其运行依赖。

德州牌型提示复用该引擎已有的 eval5/evalBest，未引入额外评估库。补牌分析仅使用玩家底牌及公共牌，按更高牌型、最少补牌与剩余公共牌限制列出可组成的方案。动手前查阅 goldfire/pokersolver 的评估和最佳五张牌接口以及当前 dsh-holdem 的亮牌规则，未复制 pokersolver 代码。

点击区域修复前查阅 Electron 官方 Custom Window Interactions 和 dsh-pet / dsh-pet-indesktop 的鼠标穿透方案。沿用已有 pointer capture 拖动，使用 DOM 实际区域及 Electron 的原生光标位置判断，未引入额外库或复制新上游代码。


## Socket.IO 联机通信

复用 Socket.IO / socket.io-client 4.8.4（MIT）处理原生客户端的 WebSocket 连接与重连。桌面客户端已打包到 vendor/socket.io-client/client.cjs，完整依赖版权许可在同目录 LICENSES.txt；服务器完整程序由 Socket.IO 与本项目房间适配代码打包，保留内联许可与 SERVER_LICENSES.txt。

实现前查看了 https://github.com/vampserv/node-poker-stack 、https://github.com/rootsec1/poker 、https://github.com/colyseus/colyseus ，参考 https://socket.io/docs/v4/rooms/ 、https://socket.io/docs/v4/client-options/ 和 https://socket.io/docs/v4/delivery-guarantees/ 。未复制这些扑克项目的源代码，继续扩展已有 dsh-holdem 规则。上游 dsh-holdem 的真人座位、可见底牌、短全下后加注权和机器人状态同步作了适配；底牌评估、筹码与分池算法沿用该引擎。


十二席和出牌计时改造前查看 https://github.com/zihanlei/hokus-pokers 的十二人、二十秒超时弃牌方案，以及 Socket.IO 的连接与确认规范。未复制其源代码，继续使用当前引擎和服务器计时。


## 公开发布副本的字体处理

上游构建包中的“上首软糖体”没有随包提供独立再分发授权，本公开副本不分发该字体，并移除了相应加载代码；界面使用原有的系统字体回退。原项目本地副本不受此发布整理影响。
