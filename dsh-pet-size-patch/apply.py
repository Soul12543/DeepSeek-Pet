#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dsh-pet 右键菜单「大小」补丁 —— 幂等，可重复运行。

只改一个文件：dsh-pet/runtime/electron-helper/sprite.js
  A. 右键菜单里插入一个「大小 · 当前Npx」分支
  B. onMenuAction 里派发 size-add / size-set
  C. 新增 buildSizeMenu() / applyPetSize() / petSizeBounds() 三个方法

为什么不需要改 preload.js / main.js：
  宿主既有的 `PUT /dsh-pet-7340/config` 在写完用户配置后会直接调用 syncDesktop()，
  按最新配置重建桌面窗口。所以"改尺寸"= 写一次配置，窗口自然就以新尺寸回来，
  不必自己算窗口几何、也不必自己 setBounds。

用法：
  python3 apply.py [--revert]      # 默认套用；--revert 从 .orig 备份还原
"""

import argparse
import os
import shutil
import sys

TARGET = os.path.expanduser(
    "~/.dsh/profiles/desktop/node_modules/dsh-pet/runtime/electron-helper/sprite.js"
)
BACKUP = TARGET + ".orig-before-size-patch"
MARKER = "dsh-pet-size-patch-v2"

ANCHOR_MENU = "    const tree = tools.concat(S.buildMenuTree(this.animations));"
ANCHOR_DISPATCH = "    if (!leaf.anim) return;"
ANCHOR_METHODS = "  onMenuAction(leaf) {"

INSERT_MENU = """    // ↓↓↓ {marker}：把「大小」插在「重载配置」之前（后者按作者约定留在最后）
    const sizeMenu = this.buildSizeMenu();
    if (sizeMenu) tools.splice(Math.max(0, tools.length - 1), 0, sizeMenu);
    // ↑↑↑ {marker}
""".format(marker=MARKER)

INSERT_DISPATCH = """    // ↓↓↓ {marker}
    if (leaf.action === 'size-add') {{
      this.applyPetSize((Number(this.pet && this.pet.size) || 462) + Number(leaf.delta || 0));
      return;
    }}
    if (leaf.action === 'size-set') {{
      this.applyPetSize(leaf.size);
      return;
    }}
    // ↑↑↑ {marker}
""".format(marker=MARKER)

INSERT_METHODS = """  // ↓↓↓ {marker} —— 右键菜单「大小」：连续可调，下限 = 屏幕宽度的 1/20
  /** 取"屏幕尺寸"基准：优先主屏工作区宽度，退回 screen.width / innerWidth。 */
  sizeBasisPx() {{
    const w = (typeof PRIMARY_AREA !== 'undefined' && PRIMARY_AREA && PRIMARY_AREA.width) ||
      (window.screen && window.screen.width) || window.innerWidth || 1280;
    return Math.round(w) || 1280;
  }}

  /** 尺寸边界：min = 屏宽 1/20（用户要求的下限），step = 屏宽 1/50（连续微调） */
  petSizeBounds() {{
    const basis = this.sizeBasisPx();
    const min = Math.max(48, Math.round(basis / 20));
    const max = Math.max(min + 40, Math.round(basis * 0.6));
    return {{ basis: basis, min: min, max: max, step: Math.max(8, Math.round(basis / 50)) }};
  }}

  /** 菜单分支：标题里带当前尺寸，子项 = 连续微调 + 几个直达比例 + 下限 + 默认 */
  buildSizeMenu() {{
    const b = this.petSizeBounds();
    const current = Math.round(Number(this.pet && this.pet.size) || 462);
    const at = (f) => Math.min(9999, Math.max(b.min, Math.round(b.basis * f)));
    return {{
      label: '大小 · ' + current + 'px',
      children: [
        {{ label: '变小（−' + b.step + 'px）', action: 'size-add', delta: -b.step }},
        {{ label: '变大（+' + b.step + 'px）', action: 'size-add', delta: b.step }},
        {{ label: '最小 · 屏宽 1/20（' + b.min + 'px）', action: 'size-set', size: b.min }},
        {{ label: '屏宽 1/12（' + at(1 / 12) + 'px）', action: 'size-set', size: at(1 / 12) }},
        {{ label: '屏宽 1/8（' + at(1 / 8) + 'px）', action: 'size-set', size: at(1 / 8) }},
        {{ label: '屏宽 1/6（' + at(1 / 6) + 'px）', action: 'size-set', size: at(1 / 6) }},
        {{ label: '默认（462px）', action: 'size-set', size: 462 }},
      ],
    }};
  }}

  /** 改尺寸：读回整份配置 → 只改自己那只的 size → PUT 写回。
   *  宿主写完会 syncDesktop()，桌面窗口按新尺寸重建（旧窗口会短暂并存，这是该插件既有行为）。 */
  applyPetSize(next) {{
    const b = this.petSizeBounds();
    const size = Math.min(b.max, Math.max(b.min, Math.round(Number(next) || 0)));
    const petId = (this.pet && this.pet.id) || 'main';
    console.info('[dsh-pet] 菜单改大小 pet=' + petId + ' -> ' + size + 'px');
    fetch(BASE + '/config', {{ cache: 'no-store' }})
      .then((res) => {{
        if (!res.ok) throw new Error('读取配置失败：HTTP ' + res.status);
        return res.json();
      }})
      .then((cfg) => {{
        // /config 返回按种类聚合的配置：主宠物在 main.pets。
        const main = (cfg && cfg.main) || cfg;
        if (!main || !Array.isArray(main.pets) || !main.pets.some((p) => p.id === petId)) {{
          throw new Error('主宠物配置不存在，未写入任何更改');
        }}
        const pets = main.pets.map((p) => ({{
          id: p.id,
          name: p.name,
          size: p.id === petId ? size : p.size,
          balanceEnabled: p.balanceEnabled,
          display: p.display,
          position: p.position,
          whisperEnabled: p.whisperEnabled,
          workStatusEnabled: p.workStatusEnabled,
          fixedEnabled: p.fixedEnabled,
        }}));
        return fetch(BASE + '/config', {{
          method: 'PUT',
          headers: {{ 'content-type': 'application/json' }},
          body: JSON.stringify({{ pets: pets }}),
        }});
      }})
      .then((res) => {{
        if (!res || !res.ok) throw new Error('保存配置失败：HTTP ' + (res && res.status));
      }})
      .catch((e) => {{
        console.error('[dsh-pet] 菜单改大小异常', e);
        if (typeof this.showWhisper === 'function') this.showWhisper('大小调整失败，请查看配置', '');
      }});
  }}
  // ↑↑↑ {marker}

""".format(marker=MARKER)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(TARGET):
        print("找不到目标文件: " + TARGET, file=sys.stderr)
        return 1

    if args.revert:
        if not os.path.exists(BACKUP):
            print("没有备份可还原", file=sys.stderr)
            return 1
        shutil.copyfile(BACKUP, TARGET)
        print("已还原: " + TARGET)
        return 0

    src = open(TARGET, encoding="utf-8").read()
    if MARKER in src:
        print("已经打过补丁，跳过")
        return 0

    # Upgrade the previously installed v1 safely from its clean original backup.
    if "dsh-pet-size-patch" in src:
        if not os.path.exists(BACKUP):
            print("旧补丁没有原始备份，放弃自动升级", file=sys.stderr)
            return 1
        original = open(BACKUP, encoding="utf-8").read()
        if "dsh-pet-size-patch" in original:
            print("备份不是原始文件，放弃自动升级", file=sys.stderr)
            return 1
        upgrade_backup = TARGET + ".before-v2.bak"
        if not os.path.exists(upgrade_backup):
            shutil.copyfile(TARGET, upgrade_backup)
        src = original

    for anchor in (ANCHOR_MENU, ANCHOR_DISPATCH, ANCHOR_METHODS):
        if src.count(anchor) != 1:
            print("锚点不唯一或缺失，放弃: " + repr(anchor), file=sys.stderr)
            return 1

    if not os.path.exists(BACKUP):
        shutil.copyfile(TARGET, BACKUP)
        print("已备份: " + BACKUP)

    src = src.replace(ANCHOR_MENU, INSERT_MENU + ANCHOR_MENU, 1)
    src = src.replace(ANCHOR_DISPATCH, INSERT_DISPATCH + ANCHOR_DISPATCH, 1)
    src = src.replace(ANCHOR_METHODS, INSERT_METHODS + ANCHOR_METHODS, 1)

    open(TARGET, "w", encoding="utf-8").write(src)
    print("补丁已套用: " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
