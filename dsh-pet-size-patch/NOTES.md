# dsh-pet 右键菜单「大小」补丁

给**桌面置顶的那只鲸鱼娘**（dsh-pet 的 desktop helper）的右键菜单加一个「大小」子菜单：
**连续可调，下限 = 屏幕宽度的 1/20**。

## 2026-10-09 修复

旧补丁错误地把 `/config` 响应当作顶层 `pets`。实际响应的主宠物位于 `main.pets`，因此旧版会发送空数组，保存被拒绝，表现为点击大小没有变化。

v2 正确读取 `main.pets`、检查目标宠物存在、保留其他宠物并显示读写错误。已应用到本机安装副本；DSH 当前关闭，下一次启动后生效。保留原始备份和 `.before-v2.bak`。

独立软件的尺寸控制见 [onefish-desktop](../onefish-desktop/README.md)，它不使用这里的接口，不重建动画窗口。

## 菜单长什么样

```
右键宠物 →
  ├ 打开网站
  ├ 查看余额（balanceEnabled 时）
  ├ 碎碎念
  ├ 对话
  ├ 回到初始位置
  ├ 大小 · 462px          ▸   ← 新增，标题里带当前尺寸
  │    ├ 变小（−25px）         ← 连续微调，步长 = 屏宽 1/50
  │    ├ 变大（+25px）
  │    ├ 最小 · 屏宽 1/20（64px）  ← 硬下限
  │    ├ 屏宽 1/12（107px）
  │    ├ 屏宽 1/8（160px）
  │    ├ 屏宽 1/6（213px）
  │    └ 默认（462px）
  └ 重载配置
```

## 原理（为什么只改一个文件）

dsh-pet 宿主已有一条现成接口：

- `GET  /dsh-pet-7340/config` → 返回按宠物种类聚合的成品配置，主宠物为 `main.pets`
- `PUT  /dsh-pet-7340/config` → 写回用户配置，**并直接调用 `syncDesktop()`**，
  按最新配置重建桌面 helper 窗口

所以"改大小" = 读回整份配置 → 只改自己那只的 `size` → PUT 写回。
窗口会以新尺寸重建，不需要自己算窗口几何、也不需要给 preload/main.js 加通道。

因此补丁**只动一个文件**：
`dsh-pet/runtime/electron-helper/sprite.js`

三处插入（全部带 `dsh-pet-size-patch` 标记，便于检索/回退）：

1. `onContextMenu` 里把「大小」分支插到「重载配置」之前（后者按作者约定留在最后）
2. `onMenuAction` 里派发 `size-add` / `size-set`
3. 新增 `sizeBasisPx()` / `petSizeBounds()` / `buildSizeMenu()` / `applyPetSize()`

## 套用 / 回退

```bash
python3 apply.py            # 幂等；自动备份为 sprite.js.orig-before-size-patch
python3 apply.py --revert   # 从备份还原
```

## 生效方式

dsh-pet **没有配置文件监听**，`syncDesktop()` 只由 `PUT/POST /config`、`POST /reload` 触发。
所以打完补丁要让它重启一次 helper，任一即可：

- 右键宠物 → **重载配置**（最省事，一次点击）
- 在设置 → 宠物 里点一次「保存」
- 重启 DSH

此次升级没有启动或重载 DSH；不依赖旧网页的一次性重载代码。

## 注意

- `size` 存在用户配置里（`~/.dsh/dsh-pet/main-config.jsonc`），改动会持久化。
- 宿主写盘时会用 `readUserConfig` 里的既有内容做「透传保留」，所以其它字段不会被这次
  PUT 冲掉；补丁里也只回写 `pets` 数组的白名单字段。
- 该插件的既有行为：尺寸变化会先起新窗口再收旧窗口，切换瞬间可能短暂看到两只。
- 本补丁只请求 DSH 宿主的本地配置接口，不读凭据、不访问外部网络。

## 文件

- `apply.py` — 幂等补丁脚本（含三处插入的完整源码）
- `NOTES.md` — 本文件
