# 大肥鱼朋友牌桌

自部署的私人免费练习牌桌，支持 Mac、Windows 和网页同桌，最多 12 席。任何客户端均可创建房间，创建者成为房主；朋友通过邀请链接填写昵称申请，由当前房主确认后入桌。未批准者看不到牌局、不能下注，不能自行审批或继承房主权限。没有公开房间列表。

服务器复用 MIT 的 dsh-holdem 规则、牌型与分池引擎，使用 Socket.IO 4.8.4。发牌、合法行动、时限和结算由服务器控制，只给各玩家发送自己的底牌。多人真人每次 20 秒，超时能过牌就过牌，否则弃牌；单真人加机器人不限时。规则人机默认 0.5 秒。房主离开后，下一位已批准玩家继承房主。

## 启动与部署

需要 Node.js 22 或更新版本，在本目录运行：

```sh
npm ci
npm test
npm run build-web
npm start
```

默认只监听本机 `127.0.0.1:3078`，路径 `/onefish-poker`。使用自己的 HTTPS 域名，通过 Nginx 代理到上述本机服务；代理要支持 WebSocket Upgrade。网站允许的浏览器来源由 `PUBLIC_ORIGIN` 设置，只写 HTTPS 来源，不含路径。客户端地址需要加 `/onefish-poker`。发布文件不带作者的服务器地址。

Ubuntu 用户服务：

```sh
ONEFISH_PUBLIC_ORIGIN=https://your-domain.invalid bash deploy/install-user.sh
systemctl --user status onefish-poker.service
```

将 `your-domain.invalid` 换成自己的域名。无需 `owner-access.json`、专用设备授权或预先申请。现有证书和 Nginx 可以继续用；需要自动加入代理时明确传入要修改的配置：

```sh
ONEFISH_PUBLIC_ORIGIN=https://your-domain.invalid bash deploy/finish-admin.sh /etc/nginx/sites-available/your-site
```

代理脚本会校验指定 HTTPS 虚拟主机、备份、测试配置后重载；不猜测用户或证书路径。证书更新工具也必须显式传入域名、输入和目标文件，不含作者的证书、私钥或部署记录。

## 可选 API AI

当前房主可以从软件配置并添加 OpenAI 兼容或 Anthropic Messages 机器人。密钥只经所选服务器的 HTTPS/WSS 传输，保存在该房间内存，不写入日志、静态文件或广播快照；移除机器人、关闭或过期房间会清理。只能连接公网 HTTPS API；DNS 每次校验，拒绝私网、元数据地址和重定向，回复最多 128 KiB。默认等待 15 秒，可选 5–60 秒。

模型只看到自己底牌和公共牌、下注与行动。合法动作由原引擎校验，失败或超时回退规则人机。重新开桌和关闭房间会取消请求，迟到回复不能影响新牌局。API 服务可能收费，由自行配置并添加机器人者承担。

## astra 单人练习

通过可见菜单为下一手安排优势牌型，仅生效一次。联机必须恰好一位未离桌真人（含待确认或断线玩家）并有机器人；第二位真人申请即清除设置，实际发牌前复查。多真人局由服务器拒绝练习设置。旧 astra 按键命令和客户端任意改牌接口继续拒绝。

## 数据与使用范围

房间与练习分仅存在服务内存，重启会结束所有房间，全部离线 30 分钟后过期。座位凭证保存在个人软件设置或浏览器 sessionStorage，邀请链接只含房间码。软件出厂牌桌地址为空，用户填写自己的部署地址或粘贴邀请链接。

完全免费，不提供入场费、筹码购买、兑换、奖品、抽成或按输赢转账；也不应把练习分与现实财物输赢关联。私人、免费和虚拟分数并不构成公开运营游戏的法律豁免；公开或商业运营前需另行核对适用的出版、网站、实名及防沉迷要求，昵称和房主确认不属于法律规定的实名认证。

## 实现来源

复用 [dsh-holdem](https://github.com/bubbleptr/dsh-holdem) 和 [Socket.IO](https://github.com/socketio/socket.io)。房主审核与十二人房间实现前核对 [hokus-pokers](https://github.com/zihanlei/hokus-pokers)；未复制其规则代码。完整第三方许可见 `SERVER_LICENSES.txt` 和 `onefish-desktop/THIRD_PARTY_NOTICES.md`。
