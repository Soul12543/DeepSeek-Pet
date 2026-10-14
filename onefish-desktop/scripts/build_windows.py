#!/usr/bin/env python3
"""Bundle a portable Windows x64 app from the official Electron runtime."""
from pathlib import Path
import argparse,hashlib,json,shutil,urllib.request,zipfile
ROOT=Path(__file__).resolve().parents[1]
ELECTRON='43.3.0'
def download(url,dest):
 req=urllib.request.Request(url,headers={'User-Agent':'OneFish-build/0.10.1'})
 with urllib.request.urlopen(req,timeout=90) as response, dest.open('wb') as f:shutil.copyfileobj(response,f)
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT.parent/'dist/releases/吃白饭的大肥鱼-Windows-x64-0.10.1');a=p.parse_args()
 cache=ROOT.parent/'dist/runtime-cache';cache.mkdir(parents=True,exist_ok=True)
 name=f'electron-v{ELECTRON}-win32-x64.zip';base=f'https://github.com/electron/electron/releases/download/v{ELECTRON}/';checks=cache/f'SHASUMS256-v{ELECTRON}.txt'
 if not checks.exists():download(base+'SHASUMS256.txt',checks)
 expected=next(line.split()[0] for line in checks.read_text().splitlines() if line.split()[-1].lstrip('*')==name)
 archive=cache/name
 if not archive.exists():download(base+name,archive)
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise SystemExit('Electron download checksum failed')
 output=a.output.resolve()
 if output.exists():
  previous=output/'resources/app/package.json'
  if not previous.exists() or json.loads(previous.read_text()).get('name')!='onefish-desktop':raise SystemExit('Refusing to overwrite another application')
  shutil.rmtree(output)
 output.mkdir(parents=True);zipfile.ZipFile(archive).extractall(output)
 (output/'electron.exe').rename(output/'吃白饭的大肥鱼.exe')
 app=output/'resources/app';app.mkdir(parents=True,exist_ok=True)
 for name in ['main.cjs','preload.cjs','package.json','pet-config.json','README.md','THIRD_PARTY_NOTICES.md','core','ui','vendor','assets']:
  source=ROOT/name
  if source.is_dir():shutil.copytree(source,app/name)
  else:shutil.copyfile(source,app/name)
 (output/'打开前请读.txt').write_text('吃白饭的大肥鱼 0.10.1 · Windows 64 位便携版\n\n先把整个 ZIP 解压到同一个文件夹，再双击“吃白饭的大肥鱼.exe”。旁边的 resources 等文件夹必须一并保留。\n\n右键鱼 → 德州扑克 → 朋友联机。服务器地址默认为空，请填写自己或朋友提供的 HTTPS 牌桌地址；完整邀请链接可以自动带入地址。\n任何人都可以创建私人房间，并成为该房间的房主；朋友用邀请链接或房间码，填写昵称后等待房主确认。\n\n德州扑克里新增“astra · 单人练习”和“AI 机器人 · API 设置”。支持 OpenAI 兼容和 Anthropic；多真人不允许练习改牌。\n\n首次运行 Windows 可能提示这是未签名应用；本包未使用商业代码签名证书。\n键盘背光功能仅在支持的 Mac 内置键盘上可用。\n',encoding='utf-8-sig')
 zip_path=Path(str(output)+'.zip')
 with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for file in sorted(output.rglob('*')):
   if file.is_file():z.write(file,Path(output.name)/file.relative_to(output))
 (zip_path.with_suffix('.zip.sha256')).write_text(hashlib.sha256(zip_path.read_bytes()).hexdigest()+'  '+zip_path.name+'\n')
 print(zip_path)
if __name__=='__main__':main()
