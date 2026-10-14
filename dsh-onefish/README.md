# dsh-onefish · 一条鱼

把 DSH Web GUI 里各自独立的 `shell.overlay` 浮层收进**同一只鲸鱼的标签页容器**。

## 它做什么

在当前 profile 里注册一条浮在右下角的鲸鱼，带三个标签：

| 标签 | 接管对象 | 方式 |
|---|---|---|
| 扑克 | `dsh-holdem` 的悬浮小窗 `.hk-mini` | 强制定位到鱼肚子（`position:fixed` + left/top/w/h） |
| 塔罗 | `dsh-lumina-tarot` 的牌背 `.dsh-lumina-float` 与牌阵容器 `.dsh-lumina-spreads` | 牌背定位接管；牌阵用 `transform: translate(差值)` 跟随 |
| 宠物 | `dsh-pet` 的网页浮层 `.dsh-pet-root` | 仅显示/隐藏（是否渲染由它自己的 `display` 配置决定） |

未选中的标签，对应浮层直接 `display:none`。所以界面上只剩这一条鱼。

## 为什么是「CSS 接管」而不是原生嵌入

- DSH 客户端的 slot 系统是 **parent-owned**：插件只能把组件注册进父级已声明的 slot，
  没有 API 能把别的插件注册的座位组件取出来重新渲染 → 原生嵌入做不到。
- 三个插件的 CSS 命名空间互不冲突（`hk-*` / `dsh-lumina-*` / `dsh-pet-*`），
  且都是 `shell.overlay`（list 槽位、scope=root）里的兄弟节点 → CSS 接管安全可行。
- 好处：**不改上游代码**，插件更新照常生效。

## 已知边界

- 塔罗的牌阵坐标来自它自己的 state（渲染时写 inline `left/top`），所以只能靠 transform 平移跟随；
  拖动牌背时差值会重算，视觉上仍收敛到同一位置。
- 扑克小窗自身有「收起/关闭」，若在它内部关掉，鱼肚子上会留空。
- 本插件不做任何网络、文件或凭据访问；只读自己的 `localStorage` 位置记录。

## 位置与偏好

鱼的坐标、当前标签、折叠状态和连续尺寸存在 `localStorage` 的 `dsh-onefish:ui3` 键下。
删掉该键即恢复默认（右下角、扑克标签、展开）。

## 安装

```bash
# 修改源码后重新安装本地插件；当前安装布局是文件副本，不能假定自动同步
dsh plugin --profile desktop add file:${USER_HOME}/Desktop/Code/DeepSeek-Pet/dsh-onefish
```

## 文件

- `lib/index.js` — 宿主半侧（只为拿到一条 bundle 行，零副作用）
- `lib/client.js` — 浏览器半侧：鱼身 UI + 标签条 + 接管引擎
- `cordis.patch.yml` — bundle 挂载声明

## 2026-10-09 整理备注

当前代码已支持连续像素尺寸、滑块和比例快捷项。网页容器下限按视口宽度 1/20 计算，同时至少 56px。它与独立桌面宠物的尺寸配置相互独立。整体工作入口见 [工作总览](../README.md)。
