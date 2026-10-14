#!/usr/bin/env python3
"""Slice imagegen walking sheets into aligned RGBA frames, GIFs and alpha WebM.
The character artwork and generated transparency are preserved. Uses Pillow + ffmpeg.
"""
from pathlib import Path
import json, statistics, subprocess, hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets/generated-movement'
NAMES={'left':'四向移动-向左走','right':'四向移动-向右走','up':'四向移动-向上走','down':'四向移动-向下走'}
FFMPEG='/opt/homebrew/bin/ffmpeg'
def main():
    cells={}; bounds={}; heights=[]
    for direction in NAMES:
        sheet=Image.open(ASSETS/(direction+'-sheet.png')).convert('RGBA')
        cells[direction]=[]; rects=[]
        for row in range(2):
            for col in range(4):
                cell=sheet.crop((round(col*sheet.width/4),round(row*sheet.height/2),round((col+1)*sheet.width/4),round((row+1)*sheet.height/2)))
                bbox=cell.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
                if not bbox: raise ValueError('生成帧没有角色: '+direction)
                cells[direction].append(cell); rects.append(bbox);heights.append(bbox[3]-bbox[1])
        bounds[direction]=(min(b[0] for b in rects),min(b[1] for b in rects),max(b[2] for b in rects),max(b[3] for b in rects))
    # One shared scale across all four cycles, matching the original 270px character.
    scale=270/statistics.median(heights); report={'frameSize':[640,360],'fps':10,'cycleFrames':8,'videoCycles':3,'commonScale':scale,'directions':{}}
    for direction,name in NAMES.items():
        frame_dir=ASSETS/'frames'/direction;frame_dir.mkdir(parents=True,exist_ok=True)
        b=bounds[direction];x=round(320-(b[0]+b[2])/2*scale);y=round(330-b[3]*scale)
        metrics=[]
        for i,cell in enumerate(cells[direction]):
            frame=Image.new('RGBA',(640,360))
            tile=cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.LANCZOS)
            frame.paste(tile,(x,y));target=frame_dir/('frame-%02d.png'%i);frame.save(target)
            bbox=frame.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
            metrics.append({'file':str(target.relative_to(ASSETS)),'bounds':bbox,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        base=[FFMPEG,'-y','-v','error','-framerate','10','-i',str(frame_dir/'frame-%02d.png')]
        subprocess.run(base+['-filter_complex','[0:v]split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=32','-loop','0',str(ASSETS/(direction+'.gif'))],check=True)
        subprocess.run([FFMPEG,'-y','-v','error','-stream_loop','2','-framerate','10','-i',str(frame_dir/'frame-%02d.png'),'-c:v','libvpx-vp9','-lossless','1','-pix_fmt','yuva420p','-auto-alt-ref','0','-an',str(ROOT/'assets/webm'/(name+'.webm'))],check=True)
        unique=len(set(m['sha256'] for m in metrics))
        if unique!=8:raise ValueError('出现重复帧: '+direction)
        if any(m['bounds'][0]<4 or m['bounds'][1]<4 or m['bounds'][2]>636 or m['bounds'][3]>356 for m in metrics):raise ValueError('动作帧发生裁切: '+direction)
        gif=Image.open(ASSETS/(direction+'.gif'))
        if gif.n_frames!=8:raise ValueError('GIF 帧数不符: '+direction)
        report['directions'][direction]={'animation':name,'gif':direction+'.gif','sheet':direction+'-sheet.png','uniqueFrames':unique,'frames':metrics}
    (ASSETS/'assembled.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('已组装四方向 GIF 和透明 WebM，共 32 张独立生成动作帧。')
if __name__=='__main__':main()
