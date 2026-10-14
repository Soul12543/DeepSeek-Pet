#!/usr/bin/env python3
"""Replace explicitly selected TLS files with matching validated inputs."""
from pathlib import Path
import argparse,datetime,os,shutil,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--certificate',type=Path,required=True);p.add_argument('--key',type=Path,required=True);p.add_argument('--domain',required=True);p.add_argument('--dest-cert',type=Path,required=True);p.add_argument('--dest-key',type=Path,required=True);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('需要 sudo 写入明确指定的证书位置')
cert=a.certificate.read_bytes();key=a.key.read_bytes();cert_file=a.dest_cert.resolve();key_file=a.dest_key.resolve()
if cert_file==key_file or not cert_file.is_file() or not key_file.is_file():raise SystemExit('需指定两个已存在且不同的证书目标文件')
def openssl(args,data):
 result=subprocess.run(['openssl']+args,input=data,capture_output=True)
 if result.returncode:raise SystemExit('证书校验失败，未更换现有文件')
 return result.stdout
openssl(['x509','-noout','-checkhost',a.domain],cert);openssl(['x509','-noout','-checkend','86400'],cert)
if openssl(['x509','-pubkey','-noout'],cert)!=openssl(['pkey','-pubout'],key):raise SystemExit('证书与私钥不匹配')
backup=cert_file.parent/('onefish-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700);shutil.copy2(cert_file,backup/'certificate');shutil.copy2(key_file,backup/'private-key');os.chmod(backup/'certificate',0o600);os.chmod(backup/'private-key',0o600)
def replace(file,data,mode):
 fd,name=tempfile.mkstemp(prefix='.onefish-cert-',dir=file.parent)
 try:
  os.fchmod(fd,mode)
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(name,file)
 finally:
  if os.path.exists(name):os.unlink(name)
try:
 replace(cert_file,cert,0o644);replace(key_file,key,0o600);subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 replace(cert_file,(backup/'certificate').read_bytes(),0o644);replace(key_file,(backup/'private-key').read_bytes(),0o600);subprocess.run(['nginx','-t'],check=False);subprocess.run(['systemctl','reload','nginx'],check=False);raise
print('证书已更新，原文件备份：'+str(backup))
