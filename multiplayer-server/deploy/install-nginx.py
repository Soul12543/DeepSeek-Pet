#!/usr/bin/env python3
"""Add the poker proxy to an explicitly selected HTTPS virtual host."""
from pathlib import Path
from urllib.parse import urlparse
import argparse,datetime,os,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--public-origin',required=True);p.add_argument('--user');p.add_argument('--port',type=int,default=3078);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('需要 sudo 修改指定的 Nginx 配置')
u=urlparse(a.public_origin)
if u.scheme!='https' or not u.hostname or u.path not in ['', '/'] or u.query or u.fragment or u.username or u.password:raise SystemExit('需要完整的 HTTPS 来源')
if not 1<=a.port<=65535:raise SystemExit('无效代理端口')
target=a.config.resolve();original=target.read_text();matches=[]
for m in re.finditer(r'\bserver\s*\{',original):
 depth=1;end=m.end()
 while end<len(original) and depth:
  if original[end]=='{':depth+=1
  elif original[end]=='}':depth-=1
  end+=1
 block=original[m.start():end]
 if depth==0 and re.search(r'listen\s+[^;]*443\b',block) and re.search(r'server_name\s+[^;]*\b'+re.escape(u.hostname)+r'(?=\s|;)',block):matches.append((m.start(),end,block))
if len(matches)!=1:raise SystemExit('指定配置里未找到唯一对应的 HTTPS 虚拟主机，停止修改')
start,end,block=matches[0]
snippet='    # BEGIN ONEFISH POKER\n    location ^~ /onefish-poker/ {\n        proxy_pass http://127.0.0.1:PORT;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_read_timeout 90s;\n        proxy_send_timeout 90s;\n        proxy_buffering off;\n    }\n    location = /onefish-poker { return 301 /onefish-poker/; }\n    # END ONEFISH POKER\n'.replace('PORT',str(a.port))
if '# BEGIN ONEFISH POKER' in block:block=re.sub(r'    # BEGIN ONEFISH POKER.*?    # END ONEFISH POKER\n',snippet,block,flags=re.S)
else:block=block[:-1]+snippet+'}'
changed=original[:start]+block+original[end:];backup=target.with_name(target.name+'.onefish-backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.write_text(original);os.chmod(backup,0o600)
try:
 target.write_text(changed);subprocess.run(['nginx','-t'],check=True)
 if a.user:subprocess.run(['loginctl','enable-linger',a.user],check=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 target.write_text(original);subprocess.run(['nginx','-t'],check=False);subprocess.run(['systemctl','reload','nginx'],check=False);raise
print('代理已更新，原配置备份：'+str(backup))
