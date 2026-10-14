/**
 * dsh-onefish —— 浏览器半侧（「一条鱼」）。
 *
 * 目标：把 DSH 里各自独立的 shell.overlay 浮层收进同一只鲸鱼的标签页里。
 *
 * 背景（决定了实现方式）：
 *   - slot 系统是 parent-owned：客户端插件只能把组件注册进「父级已声明」的 slot，
 *     没有任何 API 能把别的插件注册的座位组件取出来重新渲染。所以原生嵌入别人的 UI
 *     在这个客户端里做不到。
 *   - 三个插件（dsh-holdem / dsh-lumina-tarot / dsh-pet）都注册进同一个
 *     `shell.overlay`（list 槽位，scope=root），彼此是 AppFrame 根节点下的兄弟节点，
 *     且 CSS 命名空间互不冲突（hk-* / dsh-lumina-* / dsh-pet-*）。
 *
 * 因此这里用「CSS 接管（docking）」：本插件渲染鱼身与标签条，并用一张动态样式表把
 * 目标浮层摆到鱼肚子的位置；未选中的标签对应浮层直接隐藏。不改别人的代码，
 * 上游更新照常生效。
 *
 * 尺寸策略：
 *   1. 鱼肚子的大小是**连续可调**的一个宽度值（不做 S/M/L 分档）：
 *      - 右键鱼身 → 弹出尺寸面板（滑块 + 常用比例快捷键）
 *      - 在鱼身上滚轮 → 直接缩放
 *      - 下限 = 屏幕宽度的 1/20，上限 = 屏幕宽度的 3/5
 *   2. 被接管的浮层**保持原生布局尺寸**，只用 `transform: scale()` 等比缩放到鱼肚子里。
 *      早期版本直接改写它的 width/height，既压不住（内部按 360×520 排版会溢出）又难看。
 *      scale 是自校正的：无论鱼肚子多大，内容都精确装进去、不溢出。
 *      `offsetWidth/offsetHeight` 不受 transform 影响，所以能稳定读到原生尺寸。
 *
 * 踩过的坑（务必保留这两条约束）：
 *   - `sync()` **绝不能** setState。它改写 head 里的 <style>，而 setState 引起的重渲染
 *     会被 MutationObserver 观察到，形成 sync → render → mutate → sync 的死循环，
 *     直接把渲染进程打崩（界面变白）。
 *   - MutationObserver 必须过滤掉鱼身自己造成的变更，否则同样自触发。
 */

window.__ModuleLoader__.load({
  id: 'dsh-onefish',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require('react');
    var h = React.createElement;

    var STYLE_ID = 'dsh-onefish-style';
    var DOCK_STYLE_ID = 'dsh-onefish-dock';
    // 存储键带版本号：改动默认行为时升位，让旧偏好自然作废（不写迁移代码）。
    // v2→v3：尺寸从「S/M/L 三档索引」改成「连续像素宽度」，并且下限收紧到屏宽的 1/20。
    var LS_KEY = 'dsh-onefish:ui3';

    // 尺寸下限/上限与默认值，都是「屏幕宽度的几分之一」。
    var MIN_FRACTION = 1 / 20;   // 下限：屏宽的 1/20（用户明确要求）
    var MAX_FRACTION = 3 / 5;
    var DEFAULT_FRACTION = 1 / 10;

    // 鱼肚子的宽高比跟随扑克窗的原生比例，这样扑克在任意尺寸下都能铺满且不变形。
    var POKER_NATURAL = { w: 360, h: 520 };

    var QUICK_FRACTIONS = [1 / 20, 1 / 14, 1 / 10, 1 / 6, 1 / 4];

    function clampSize(px) {
      var screenW = window.innerWidth || 1280;
      var min = Math.max(56, Math.round(screenW * MIN_FRACTION));
      var max = Math.max(min + 60, Math.round(screenW * MAX_FRACTION));
      var value = Math.round(px);
      if (!isFinite(value)) value = Math.round(screenW * DEFAULT_FRACTION);
      return Math.min(max, Math.max(min, value));
    }

    function bodyHeight(width) {
      return Math.round((width * POKER_NATURAL.h) / POKER_NATURAL.w);
    }

    // ---------------------------------------------------------------- 样式

    var CSS = [
      // 刻意不依赖 --dsw-alias-* 的颜色令牌：皮肤（如 maid-atelier）会把这些令牌
      // 覆盖成高透明度/浅色值，鱼身会变得几乎透明、文字不可读。这里用固定深色底 + 浅色字。
      '.of-frame{position:fixed;z-index:2147482400;display:flex;flex-direction:column;',
      '  box-sizing:border-box;',
      '  font-family:"PingFang SC","Microsoft YaHei UI",ui-sans-serif,system-ui,sans-serif;',
      '  color:#e9eefb;',
      '  background:rgba(13,17,26,.95);',
      '  -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);',
      '  border:1px solid rgba(255,255,255,.14);',
      '  border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.42);',
      '  overflow:hidden;pointer-events:auto;}',
      '.of-frame.is-collapsed{width:auto!important;border-radius:999px;}',

      '.of-bar{flex:none;display:flex;align-items:center;gap:5px;',
      '  height:32px;padding:0 5px 0 9px;cursor:grab;touch-action:none;user-select:none;',
      '  background:rgba(255,255,255,.05);',
      '  border-bottom:1px solid rgba(255,255,255,.10);overflow:hidden;}',
      '.of-bar.is-dragging{cursor:grabbing;}',
      '.of-frame.is-collapsed .of-bar{border-bottom:none;}',

      '.of-mark{flex:none;display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;',
      '  white-space:nowrap;color:#e9eefb;cursor:grab;}',
      '.of-mark span{display:inline;}',
      '.of-frame.is-compact .of-mark span{display:none;}',
      '.of-mark svg{display:block;}',

      '.of-tabs{display:flex;align-items:center;gap:2px;margin-left:auto;flex:none;min-width:0;}',
      '.of-tab{appearance:none;border:1px solid transparent;background:transparent;cursor:pointer;',
      '  color:rgba(233,238,251,.62);',
      '  font:inherit;font-size:11px;line-height:1;padding:5px 6px;border-radius:999px;white-space:nowrap;}',
      '.of-tab:hover{background:rgba(255,255,255,.09);}',
      '.of-tab[data-on="1"]{color:#fff;background:rgba(255,255,255,.16);',
      '  border-color:rgba(255,255,255,.20);}',
      // 极窄时只留当前标签，保证标题/按钮不被挤掉
      '.of-frame.is-tiny .of-tab[data-on="0"]{display:none;}',
      '.of-frame.is-tiny .of-tab{font-size:10.5px;padding:4px 5px;}',

      '.of-icon{flex:none;appearance:none;border:none;background:transparent;cursor:pointer;',
      '  color:rgba(233,238,251,.60);',
      '  font:inherit;font-size:11px;line-height:1;min-width:20px;height:22px;border-radius:6px;',
      '  padding:0 3px;}',
      '.of-icon:hover{background:rgba(255,255,255,.09);color:#fff;}',
      '.of-icon[data-on="1"]{color:#fff;background:rgba(255,255,255,.14);}',

      // 鱼肚子：透明区域，被接管的浮层按它的矩形定位/缩放
      '.of-body{position:relative;flex:none;margin:8px;',
      '  border:1px dashed rgba(255,255,255,.10);border-radius:10px;}',
      '.of-body.is-empty{display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;overflow:hidden;}',
      '.of-empty{max-width:100%;text-align:center;font-size:11px;line-height:1.6;',
      '  color:rgba(233,238,251,.66);}',
      '.of-empty code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;',
      '  background:rgba(255,255,255,.10);padding:1px 4px;border-radius:4px;color:#fff;}',
      '.of-hint{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);',
      '  font-size:10px;color:rgba(233,238,251,.42);white-space:nowrap;}',

      // ---- 右键尺寸面板
      '.of-panel{flex:none;padding:9px 11px 11px;border-top:1px solid rgba(255,255,255,.10);',
      '  background:rgba(255,255,255,.045);}',
      '.of-panel-head{display:flex;align-items:center;gap:8px;font-size:11.5px;',
      '  color:rgba(233,238,251,.75);margin-bottom:8px;}',
      '.of-panel-head b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;}',
      '.of-panel-head .of-close{margin-left:auto;appearance:none;border:none;background:transparent;',
      '  color:rgba(233,238,251,.55);font:inherit;font-size:12px;cursor:pointer;padding:0 4px;}',
      '.of-panel-head .of-close:hover{color:#fff;}',
      '.of-range{width:100%;appearance:none;-webkit-appearance:none;height:4px;border-radius:3px;',
      '  background:rgba(255,255,255,.20);outline:none;cursor:pointer;margin:2px 0 4px;}',
      '.of-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;',
      '  background:#7ea6ff;border:none;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4);}',
      '.of-scale{display:flex;justify-content:space-between;font-size:10px;',
      '  color:rgba(233,238,251,.42);margin-bottom:8px;font-variant-numeric:tabular-nums;}',
      '.of-pills{display:flex;flex-wrap:wrap;gap:4px;}',
      '.of-pill{appearance:none;border:1px solid rgba(255,255,255,.16);background:transparent;',
      '  color:rgba(233,238,251,.72);font:inherit;font-size:10.5px;line-height:1;',
      '  padding:4px 6px;border-radius:999px;cursor:pointer;white-space:nowrap;}',
      '.of-pill:hover{background:rgba(255,255,255,.10);color:#fff;}',
      '.of-pill[data-on="1"]{background:rgba(126,166,255,.22);border-color:rgba(126,166,255,.5);color:#fff;}'
    ].join('\n');

    function ensureStyle(id, css) {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        el.setAttribute('data-dsh-onefish', '1');
        document.head.appendChild(el);
      }
      if (css !== undefined) el.textContent = css;
      return el;
    }

    // ------------------------------------------------------------ 接管引擎

    var TARGETS = {
      poker: '.hk-mini',
      tarotRoot: '.dsh-lumina-dock',
      tarotFloat: '.dsh-lumina-float',
      tarotSpreads: '.dsh-lumina-spreads',
      pet: '.dsh-pet-root'
    };

    function num(v) {
      var n = parseFloat(v);
      return isFinite(n) ? n : 0;
    }

    /** 生成把目标浮层摆进 rect 的规则；active 为 null 时全部隐藏。 */
    function dockRules(tab, collapsed, rect) {
      var rules = [];
      var hide = function (sel) { rules.push(sel + '{display:none!important}'); };
      var active = collapsed ? null : tab;

      // ---- 扑克：原生尺寸 + transform scale 塞进鱼肚子
      if (active === 'poker') {
        var el = document.querySelector(TARGETS.poker);
        var natW = (el && el.offsetWidth) || POKER_NATURAL.w;
        var natH = (el && el.offsetHeight) || POKER_NATURAL.h;
        if (!natW || !natH) { natW = POKER_NATURAL.w; natH = POKER_NATURAL.h; }

        var z = Math.min(rect.width / natW, rect.height / natH);
        if (!isFinite(z) || z <= 0) z = 1;
        if (z > 1) z = 1; // 只缩不放

        var left = Math.round(rect.left + (rect.width - natW * z) / 2);
        var top = Math.round(rect.top + (rect.height - natH * z) / 2);

        rules.push(TARGETS.poker + '{display:flex!important;position:fixed!important;' +
          'left:' + left + 'px!important;top:' + top + 'px!important;' +
          'right:auto!important;bottom:auto!important;' +
          'width:' + natW + 'px!important;height:' + natH + 'px!important;' +
          'margin:0!important;border-radius:10px!important;overflow:hidden!important;' +
          'transform:scale(' + z.toFixed(4) + ')!important;transform-origin:top left!important;' +
          'z-index:2147482500!important;}');
      } else {
        hide(TARGETS.poker);
      }

      // ---- 塔罗：牌背居中摆放（尺寸小于鱼肚子时按比例放大，免得小得看不见）
      if (active === 'tarot') {
        var floatEl = document.querySelector(TARGETS.tarotFloat);
        var origLeft = floatEl ? num(floatEl.style.left) : 0;
        var origTop = floatEl ? num(floatEl.style.top) : 0;
        var cardW = (floatEl && floatEl.offsetWidth) || 48;
        var cardH = (floatEl && floatEl.offsetHeight) || 83;

        var zt = Math.min(rect.width / (cardW * 2.2), rect.height / (cardH * 2.2));
        if (!isFinite(zt) || zt <= 0) zt = 1;
        zt = Math.min(2.2, Math.max(0.6, zt));

        var cx = Math.round(rect.left + rect.width / 2 - (cardW * zt) / 2);
        var cy = Math.round(rect.top + rect.height / 2 - (cardH * zt) / 2);

        rules.push(TARGETS.tarotRoot + '{display:block!important;pointer-events:none!important}');
        rules.push(TARGETS.tarotFloat + '{left:' + cx + 'px!important;top:' + cy + 'px!important;' +
          'right:auto!important;bottom:auto!important;' +
          'transform:scale(' + zt.toFixed(4) + ')!important;transform-origin:top left!important;}');
        rules.push(TARGETS.tarotSpreads + '{transform:translate(' +
          (cx + (cardW * zt) / 2 - cardW / 2 - origLeft) + 'px,' +
          (cy + (cardH * zt) / 2 - cardH / 2 - origTop) + 'px)!important}');
      } else {
        hide(TARGETS.tarotRoot);
      }

      // ---- 宠物：网页浮层由它自己的 display 配置决定是否渲染
      if (active === 'pet') {
        rules.push(TARGETS.pet + '{display:block!important}');
      } else {
        hide(TARGETS.pet);
      }

      return rules.join('\n');
    }

    // -------------------------------------------------------------- 组件

    var TABS = [
      { id: 'poker', label: '扑克' },
      { id: 'tarot', label: '塔罗' },
      { id: 'pet', label: '宠物' }
    ];

    function readPref() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function writePref(patch) {
      try {
        var next = readPref();
        for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch (e) { /* 隐私模式等：静默降级为不持久化 */ }
    }

    function WhaleMark() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        h('path', {
          fill: 'currentColor',
          d: 'M2.6 13.4c0-3.6 3.1-6.5 7-6.5.9 0 1.8.2 2.6.5.7-1.4 2.2-2.4 3.9-2.4v2.1c-.8 0-1.5.4-1.9 1 .5.4 1 .9 1.4 1.5 1-.6 2.2-.9 3.4-.9 1.6 0 3 .5 4 1.3-.6 1.6-2.2 2.7-4 2.7-.4 0-.8 0-1.1-.1-.3.5-.7 1-1.2 1.4 1 .5 1.7 1.4 2 2.5-2.6.6-5-.5-6.3-2.5-.9.3-1.9.4-2.9.4-3.9 0-7-2.4-7-5z'
        }),
        h('circle', { cx: 8.4, cy: 12.1, r: 0.85, fill: 'rgba(13,17,26,.9)' })
      );
    }

    function OneFish() {
      var initial = React.useRef(readPref()).current;
      var initialSize = clampSize(
        typeof initial.sizeW === 'number' ? initial.sizeW : (window.innerWidth || 1280) * DEFAULT_FRACTION
      );

      var [tab, setTab] = React.useState(initial.tab || 'poker');
      var [collapsed, setCollapsed] = React.useState(initial.collapsed === true);
      var [sizeW, setSizeW] = React.useState(initialSize);
      var [panel, setPanel] = React.useState(false);
      var [pos, setPos] = React.useState(function () {
        if (typeof initial.left === 'number' && typeof initial.top === 'number') {
          return { left: initial.left, top: initial.top };
        }
        return null; // null = 默认贴右下角
      });
      var [dragging, setDragging] = React.useState(false);

      var frameRef = React.useRef(null);
      var bodyRef = React.useRef(null);
      var dragRef = React.useRef(null);
      var lastSyncAt = React.useRef(0);
      var skipClickAway = React.useRef(false);

      React.useEffect(function () { writePref({ tab: tab }); }, [tab]);
      React.useEffect(function () { writePref({ collapsed: collapsed }); }, [collapsed]);
      React.useEffect(function () { writePref({ sizeW: sizeW }); }, [sizeW]);

      var bodyH = bodyHeight(sizeW);

      // 把鱼肚子矩形的变化同步给接管样式表。
      // 注意：这里**绝不能** setState —— sync 会改写 head 里的 <style>，而 setState 引起的
      // 重渲染又会被下面的 MutationObserver 观察到，形成 sync → render → mutate → sync 的
      // 死循环，把渲染进程打崩（界面变白）。所以 sync 只做副作用，且带最小节流。
      var sync = React.useCallback(function (force) {
        var now = Date.now();
        if (!force && now - lastSyncAt.current < 100) return;
        lastSyncAt.current = now;
        var bodyEl = bodyRef.current;
        if (!bodyEl) return;
        var r = bodyEl.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        ensureStyle(DOCK_STYLE_ID, dockRules(tab, collapsed, r));
      }, [tab, collapsed, sizeW]);

      React.useEffect(function () {
        ensureStyle(STYLE_ID, CSS);
        return function () {
          var s = document.getElementById(STYLE_ID);
          if (s) s.remove();
        };
      }, []);

      // 一次性工具：让桌面宠物 Helper 重启一次，好加载改写过的 sprite.js。
      // dsh-pet 只在 PUT/POST /dsh-pet-7340/config 或 POST /dsh-pet-7340/reload 时重建 helper，
      // 没有文件监听；而 GUI 渲染进程是有权限的那个客户端，所以由这里代发一次最省事。
      // 用 localStorage 标记保证只跑一次；不需要时可以整段删掉。
      React.useEffect(function () {
        var KEY = 'dsh-onefish:petHelperReload';
        try {
          if (localStorage.getItem(KEY) === 'v1') return;
          localStorage.setItem(KEY, 'v1');
        } catch (e) { return; }
        fetch('/dsh-pet-7340/reload', { method: 'POST' })
          .then(function (res) { console.info('[onefish] 宠物 Helper 重载 ->', res.status); })
          .catch(function (e) { console.warn('[onefish] 宠物 Helper 重载失败', e); });
      }, []);

      React.useEffect(function () {
        sync(true);
        var raf = requestAnimationFrame(function () { sync(true); });
        var late = setTimeout(function () { sync(true); }, 260);
        window.addEventListener('resize', sync);
        var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
        if (ro && frameRef.current) ro.observe(frameRef.current);
        return function () {
          cancelAnimationFrame(raf);
          clearTimeout(late);
          window.removeEventListener('resize', sync);
          if (ro) ro.disconnect();
        };
      }, [sync]);

      // 别的浮层是懒挂载/条件渲染的，出现或消失时重新接管一次。
      // 必须过滤掉本插件自己造成的变更，否则会自己触发自己。
      React.useEffect(function () {
        if (typeof MutationObserver !== 'function') return;
        var scheduled = false;
        var obs = new MutationObserver(function (records) {
          var mine = frameRef.current;
          var external = false;
          for (var i = 0; i < records.length; i++) {
            var target = records[i].target;
            if (mine && target && target.nodeType === 1 && mine.contains(target)) continue;
            external = true;
            break;
          }
          if (!external || scheduled) return;
          scheduled = true;
          requestAnimationFrame(function () { scheduled = false; sync(); });
        });
        obs.observe(document.body, { childList: true, subtree: true });
        return function () { obs.disconnect(); };
      }, [sync]);

      // 滚轮缩放：必须用原生监听才能 preventDefault（React 的 onWheel 是被动的）
      React.useEffect(function () {
        var frame = frameRef.current;
        if (!frame) return;
        var onWheel = function (e) {
          if (!e.deltaY) return;
          e.preventDefault();
          e.stopPropagation();
          var step = e.deltaY > 0 ? -Math.max(4, Math.round(sizeW * 0.06))
                                  : Math.max(4, Math.round(sizeW * 0.06));
          setSizeW(function (current) { return clampSize(current + step); });
        };
        frame.addEventListener('wheel', onWheel, { passive: false });
        return function () { frame.removeEventListener('wheel', onWheel); };
      }, [sizeW]);

      // 右键面板打开时，点面板外面就收起
      React.useEffect(function () {
        if (!panel) return;
        var onDown = function (e) {
          if (skipClickAway.current) { skipClickAway.current = false; return; }
          var frame = frameRef.current;
          if (frame && e.target && frame.contains(e.target)) return;
          setPanel(false);
        };
        document.addEventListener('mousedown', onDown, true);
        return function () { document.removeEventListener('mousedown', onDown, true); };
      }, [panel]);

      // 卸载时清掉接管样式，把浮层还给各自的插件
      React.useEffect(function () {
        return function () {
          var s = document.getElementById(DOCK_STYLE_ID);
          if (s) s.textContent = '';
        };
      }, []);

      // ------------------------------------------------------------ 拖拽
      var onPointerDown = React.useCallback(function (e) {
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('.of-tab,.of-icon,.of-panel')) return;
        var frame = frameRef.current;
        if (!frame) return;
        var r = frame.getBoundingClientRect();
        dragRef.current = { pointerId: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
        setDragging(true);
        setPos({ left: r.left, top: r.top });
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        e.preventDefault();
      }, []);

      var onPointerMove = React.useCallback(function (e) {
        var d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        var frame = frameRef.current;
        var w = frame ? frame.offsetWidth : 200;
        var hgt = frame ? frame.offsetHeight : 300;
        var maxLeft = Math.max(0, window.innerWidth - w);
        var maxTop = Math.max(0, window.innerHeight - hgt);
        setPos({
          left: Math.min(maxLeft, Math.max(0, e.clientX - d.dx)),
          top: Math.min(maxTop, Math.max(0, e.clientY - d.dy))
        });
        sync();
      }, [sync]);

      var onPointerUp = React.useCallback(function (e) {
        var d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        setPos(function (p) {
          if (p) writePref({ left: Math.round(p.left), top: Math.round(p.top) });
          return p;
        });
        sync(true);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }, [sync]);

      // 右键：打开/切换尺寸面板（替代浏览器原生菜单）
      var onContextMenu = React.useCallback(function (e) {
        e.preventDefault();
        e.stopPropagation();
        skipClickAway.current = true;
        setPanel(function (open) { return !open; });
        setCollapsed(false);
      }, []);

      // ------------------------------------------------------------ 渲染
      var screenW = window.innerWidth || 1280;
      var minW = clampSize(Math.round(screenW * MIN_FRACTION));
      var maxW = clampSize(Math.round(screenW * MAX_FRACTION));

      var frameStyle = pos
        ? { left: Math.round(pos.left) + 'px', top: Math.round(pos.top) + 'px', right: 'auto', bottom: 'auto' }
        : { right: '18px', bottom: '18px' };
      // 面板打开时给一个最小宽度，否则滑块两端的刻度会挤成两行
      frameStyle.width = collapsed ? 'auto' : Math.max(sizeW + 16, panel ? 252 : 0) + 'px';

      var compact = !collapsed && sizeW < 260;
      var tiny = !collapsed && sizeW < 176;
      var frameClass = 'of-frame' +
        (collapsed ? ' is-collapsed' : '') +
        (compact ? ' is-compact' : '') +
        (tiny ? ' is-tiny' : '');

      var bar = h('div', {
        className: 'of-bar' + (dragging ? ' is-dragging' : ''),
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerUp
      },
        h('div', { className: 'of-mark', title: '拖我移动；右键我调大小；滚轮也能缩放' },
          h(WhaleMark), h('span', null, '一条鱼')),
        h('div', { className: 'of-tabs' }, TABS.map(function (t) {
          return h('button', {
            key: t.id,
            type: 'button',
            className: 'of-tab',
            'data-on': tab === t.id ? '1' : '0',
            onClick: function (e) { e.stopPropagation(); setTab(t.id); setPanel(false); },
            title: '切到「' + t.label + '」'
          }, t.label);
        })),
        h('button', {
          type: 'button',
          className: 'of-icon',
          'data-on': panel ? '1' : '0',
          title: '调整大小（右键鱼身同样是这个）',
          onClick: function (e) {
            e.stopPropagation();
            skipClickAway.current = true;
            setPanel(function (open) { return !open; });
            setCollapsed(false);
          }
        }, '⤢'),
        h('button', {
          type: 'button',
          className: 'of-icon',
          title: collapsed ? '展开' : '收起成一颗鲸鱼球',
          onClick: function (e) {
            e.stopPropagation();
            setCollapsed(function (c) { return !c; });
          }
        }, collapsed ? '▸' : '▾')
      );

      var children = [bar];

      if (!collapsed) {
        var inner = null;
        if (tab === 'pet') {
          inner = h('div', { className: 'of-empty' }, [
            h('div', { key: 'a' }, 'dsh-pet 的网页浮层当前没有渲染。'),
            h('div', { key: 'b' }, '宠物设成了「只在桌面显示」，所以鱼肚子里是空的。')
          ]);
        } else if (tab === 'tarot') {
          inner = h('div', { className: 'of-hint' }, '点牌背抽牌');
        }

        children.push(h('div', {
          key: 'body',
          ref: bodyRef,
          className: 'of-body' + (inner ? ' is-empty' : ''),
          style: { width: sizeW + 'px', height: bodyH + 'px' }
        }, inner));
      }

      if (panel) {
        var ratio = screenW / sizeW;
        children.push(h('div', {
          key: 'panel',
          className: 'of-panel',
          style: collapsed ? { width: Math.max(230, sizeW) + 'px' } : null
        },
          h('div', { className: 'of-panel-head' },
            h('span', null, '大小'),
            h('b', null, sizeW + ' × ' + bodyH + ' px'),
            h('button', {
              type: 'button',
              className: 'of-close',
              onClick: function (e) { e.stopPropagation(); setPanel(false); }
            }, '✕')
          ),
          h('div', { className: 'of-scale', style: { marginBottom: '7px' } },
            h('span', null, '当前约等于屏宽的 1/' + (Math.round(ratio * 10) / 10))
          ),
          h('input', {
            type: 'range',
            className: 'of-range',
            min: minW,
            max: maxW,
            step: 1,
            value: sizeW,
            onChange: function (e) { setSizeW(clampSize(Number(e.target.value))); }
          }),
          h('div', { className: 'of-scale' },
            h('span', null, minW + ' px（屏宽 1/20）'),
            h('span', null, maxW + ' px')
          ),
          h('div', { className: 'of-pills' }, QUICK_FRACTIONS.map(function (f) {
            var target = clampSize(Math.round(screenW * f));
            return h('button', {
              key: String(f),
              type: 'button',
              className: 'of-pill',
              'data-on': sizeW === target ? '1' : '0',
              onClick: function (e) {
                e.stopPropagation();
                setSizeW(target);
              }
            }, '1/' + Math.round(1 / f));
          }))
        ));
      }

      return h('div', {
        ref: frameRef,
        className: frameClass,
        style: frameStyle,
        onContextMenu: onContextMenu,
        'data-dsh-onefish': 'frame'
      }, children);
    }

    // -------------------------------------------------------------- 插件

    function apply(ctx) {
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-onefish',
          order: 900,
          registrant: 'dsh-onefish'
        }, OneFish);
      });
    }

    module.exports = {
      name: 'dsh-onefish',
      inject: ['slots'],
      apply: apply
    };

    return module.exports;
  }
});
