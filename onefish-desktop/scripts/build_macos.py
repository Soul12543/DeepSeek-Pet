#!/usr/bin/env python3
"""Bundle an independent macOS application, including Electron and every animation."""
from pathlib import Path
import argparse,shutil,plistlib,subprocess,tempfile,json
ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--electron',type=Path,default=Path.home()/'.dsh/electron/Electron.app',help='Electron SDK used only while building; it is copied into the finished app.')
 parser.add_argument('--output',type=Path,default=ROOT.parent/'dist/吃白饭的大肥鱼.app')
 args=parser.parse_args()
 if not (args.electron/'Contents/MacOS/Electron').exists():raise SystemExit('需要 Electron.app SDK；可用 --electron 指定。')
 # A universal, dependency-free helper; no administrator rights at runtime.
 subprocess.run(['/usr/bin/clang','-fobjc-arc','-arch','arm64','-arch','x86_64','-mmacosx-version-min=13.0','-framework','Foundation',str(ROOT/'native/keyboard-backlight.m'),'-o',str(ROOT/'native/keyboard-backlight')],check=True)
 dest=args.output.resolve()
 if dest.exists():
  existing=dest/'Contents/Resources/app/package.json'
  if not existing.exists() or json.loads(existing.read_text()).get('name')!='onefish-desktop':raise SystemExit('目标已有其他应用，不覆盖。')
  shutil.rmtree(dest)
 dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copytree(args.electron,dest,symlinks=True)
 for notice in ['LICENSE','LICENSES.chromium.html']:
  source=args.electron.parent/notice
  if source.exists():shutil.copyfile(source,dest/'Contents/Resources'/notice)
 appdir=dest/'Contents/Resources/app'
 appdir.mkdir(parents=True,exist_ok=True)
 for name in ['main.cjs','preload.cjs','package.json','pet-config.json','README.md','THIRD_PARTY_NOTICES.md','core','ui','vendor','assets','native']:
  source=ROOT/name
  if source.is_dir():shutil.copytree(source,appdir/name,symlinks=True)
  elif source.exists():shutil.copyfile(source,appdir/name)
 info=dest/'Contents/Info.plist'
 with info.open('rb') as f:pl=plistlib.load(f)
 # Build a Finder icon from the bundled upstream logo.
 with tempfile.TemporaryDirectory(prefix='onefish-icon-') as scratch:
  iconset=Path(scratch)/'OneFish.iconset';iconset.mkdir()
  for n in [16,32,128,256,512]:
   for scale in [1,2]:
    target=iconset/('icon_%dx%d%s.png'%(n,n,'@2x' if scale==2 else ''))
    subprocess.run(['/usr/bin/sips','-z',str(n*scale),str(n*scale),str(ROOT/'assets/logo.png'),'--out',str(target)],check=True,stdout=subprocess.DEVNULL)
  subprocess.run(['/usr/bin/iconutil','-c','icns',str(iconset),'-o',str(dest/'Contents/Resources/OneFish.icns')],check=True)
 pl.update(CFBundleIconFile='OneFish.icns',CFBundleIdentifier='local.onefish.desktop',CFBundleName='吃白饭的大肥鱼',CFBundleDisplayName='吃白饭的大肥鱼',CFBundleShortVersionString='0.10.1',CFBundleVersion='18',LSUIElement=True)
 with info.open('wb') as f:plistlib.dump(pl,f)
 # Local ad-hoc signing makes changes to the Electron bundle runnable on this Mac.
 subprocess.run(['/usr/bin/codesign','--force','--deep','--sign','-',str(dest)],check=True)
 print('已生成独立应用：'+str(dest))
 print('无需 DSH / Node / npm；运行程序、110 段动画和宠物引擎已全部内置。')
if __name__=='__main__':main()
