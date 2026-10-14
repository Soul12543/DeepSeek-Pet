# dsh-holdem（本地补丁版）

**这不是我写的代码**，是官方 `dsh-holdem@0.4.0` 加上一份**已审阅的上游修复**。

## 为什么需要它

`dsh-holdem@0.4.0` 在 DSH Desktop（Electron 外壳）上**完全不可用**：

- Electron 外壳加载同一个 Web GUI，但**不回传插件的会话 Cookie**；
- 插件只认 Cookie，于是客户端每 280ms 轮询 `get-state` 都会**新建一张牌桌 + 一个新会话**；
- 几十秒内打满 `MAX_SESSIONS = 32`，`createSession()` 抛 `HttpError(503)`，
  于是 API **永久**返回 `{"error":"internal server error"}`，Tab 一直报错，直到插件被重新加载。

原生「德州扑克」Tab 和「一条鱼」里的扑克窗是同一个故障。

## 补丁来源

- 上游 PR：<https://github.com/bubbleptr/dsh-holdem/pull/10>
- 分支：`dingchenhui0618-arch/dsh-holdem` → `fix/cookie-less-session`
- 提交：`5d92dc6b0345c95ee52471ea2001564227aaa3ce`
- 基线：官方 `0.4.0`（`package.json` 未改，仍是 `dsh-holdem@0.4.0`）

## 改动内容（已逐行审阅，全量 diff）

宿主 `lib/index.js`（71 行）：

- 新增 `SESSION_HEADER = "x-holdem-sid"`、`SESSION_QUERY = "sid"`、
  `SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/`；
- 新增 `urlParam()` / `clientSessionId()`：优先用请求头，其次 `?sid=`，**Cookie 路径保持原样**；
- `findSession()`：`clientSessionId(req) || cookieValue(req)`；
- `createSession()`：拿得到 client id 就复用它做会话键（已存在则直接复用），
  否则落回原来的随机 id；`MAX_SESSIONS` 到顶时**淘汰最久未使用**而不是拒绝服务；
- `avatarView()` 带上 `&sid=`，使头像 `<img>` 在无 Cookie 宿主下也能命中自己的会话。

浏览器 `lib/client.js`（33 行）：

- 新增 `dsh-holdem.sid`（localStorage）里的稳定 client id（随机 12 字节 hex）；
- 每个请求都带 `x-holdem-sid`。

**没有其它改动**：把 `lib/*.js` 与官方 0.4.0 对比即得上述 diff；
官方原文件同时留档在 `lib/*.js.upstream-0.4.0.bak`。

## 上游合并后怎么退回官方版

```bash
dsh plugin --profile desktop add dsh-holdem      # 换回 npm 官方版
```

（当前 profile 里这一条是 `file:${USER_HOME}/Desktop/Code/DeepSeek-Pet/dsh-holdem-patched`。）

## 目录

- `lib/index.js` / `lib/client.js` — 打了补丁（= 0.4.0 + PR #10）
- `lib/*.js.upstream-0.4.0.bak` — 官方 0.4.0 原文件，便于随时比对/回退
- `package.json` / `cordis.patch.yml` / `README.md` / `LICENSE` — 与官方一致

## 2026-10-09 整理备注

本地路径已迁入 `Code/DeepSeek-Pet`；本次保留 0.4.0 兼容版代码与上游原文件。GitHub PR #10 本次检查时仍为 Open。当前目录是构建产物，未包含 package.json 的构建与测试命令所引用的 scripts/、test/ 和完整源码。
