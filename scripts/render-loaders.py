"""Render Kamayuu loader loops from generated compass/card artwork.

Requires Pillow, numpy and FFmpeg (or imageio-ffmpeg). No network calls.
Generated PNGs already contain alpha; preserve it instead of chroma-keying gold.
Intermediate PNG sequences stay outside public/ and never ship in the app.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg')
parser.add_argument('--work', type=Path, required=True)
args = parser.parse_args()
ffmpeg = args.ffmpeg or shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
OUT = ROOT / 'public/loaders'
OUT.mkdir(exist_ok=True)
args.work.mkdir(parents=True, exist_ok=True)
SCALE = 2
W, H = 320, 280
FPS = 20
OUTPUT_SIZE = (256, 224)
RESAMPLE = Image.Resampling.LANCZOS


def clean(path):
    img = Image.open(path).convert('RGBA')
    data = np.array(img)
    # Discard nearly invisible isolated generation specks, preserve edge alpha.
    data[data[:, :, 3] < 12] = 0
    return Image.fromarray(data)


compass = clean(ROOT / 'assets-src/loaders/compass-source.png')
size = compass.width
yy, xx = np.ogrid[:size, :size]
radius = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2)
inner_mask = Image.fromarray((radius < size * .316).astype('uint8') * 255)
needle = compass.copy()
needle.putalpha(ImageChops.multiply(compass.getchannel('A'), inner_mask))
ring = compass.copy()
ring.putalpha(ImageChops.multiply(compass.getchannel('A'), ImageChops.invert(inner_mask)))
card = clean(ROOT / 'assets-src/loaders/card-source.png')
box = card.getchannel('A').point(lambda a: 255 if a > 100 else 0).getbbox()
card = card.crop(box)


def canvas():
    return Image.new('RGBA', (W * SCALE, H * SCALE))


def place(frame, asset, x, y, width, height=None, angle=0, opacity=1):
    height = height or width * asset.height / asset.width
    layer = asset.resize((max(1, round(width * SCALE)), max(1, round(height * SCALE))), RESAMPLE)
    if angle:
        layer = layer.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    if opacity != 1:
        layer.putalpha(layer.getchannel('A').point(lambda a: round(a * opacity)))
    frame.alpha_composite(layer, (round(x*SCALE-layer.width/2), round(y*SCALE-layer.height/2)))


def sparkle(frame, x, y, strength, length=7):
    if strength <= .01:
        return
    draw = ImageDraw.Draw(frame)
    x, y, length = x*SCALE, y*SCALE, length*SCALE*strength
    draw.polygon([(x,y-length),(x+length*.2,y-length*.2),(x+length,y),
                  (x+length*.2,y+length*.2),(x,y+length),(x-length*.2,y+length*.2),
                  (x-length,y),(x-length*.2,y-length*.2)], fill=(255,225,160,round(230*strength)))


def opening(t):
    frame = canvas()
    phase = 2 * math.pi * t
    # Needle hunts, overshoots, settles; ring counter-rocks rather than spinning.
    knots = [(0,0),(.16,-24),(.43,190),(.56,174),(.67,180),(.87,370),(1,360)]
    for (a, va), (b, vb) in zip(knots, knots[1:]):
        if a <= t <= b:
            u = (t-a)/(b-a); eased = u*u*(3-2*u)
            angle = va+(vb-va)*eased
            break
    diameter = 232 + 3*math.sin(phase)**2
    place(frame, ring, 160, 140, diameter, angle=7*math.sin(phase))
    place(frame, needle, 160, 140, diameter, angle=-angle)
    for i in range(4):
        a = phase+i*math.pi/2
        strength = max(0, math.sin(phase-i*math.pi/2))**8
        sparkle(frame,160+116*math.sin(a),140-116*math.cos(a),strength,6)
    sparkle(frame,160,140,.25+.5*math.sin(phase)**2,6)
    return frame


def matchmaking(t):
    frame = canvas()
    phase = math.tau*t
    # A cut and counter-cut: both cards cross depth, yaw and tilt on a closed path.
    place(frame,ring,160,177,248,67,angle=0,opacity=.7)
    draw=ImageDraw.Draw(frame)
    for i in range(2):
        a=phase+i*math.pi
        x=160+116*math.cos(a); y=177+28*math.sin(a)
        sparkle(frame,x,y,.5+.4*math.sin(a)**2,6)
    cards=[]
    for i in range(2):
        a=phase+i*math.pi
        x=160+67*math.sin(a)
        y=127+17*math.cos(a)
        # At the widest cut, card approaches edge-on then opens again.
        yaw=.3+.7*abs(math.cos(a))
        cards.append((math.cos(a),x,y,yaw,-20*math.sin(a)))
    for depth,x,y,yaw,tilt in sorted(cards):
        place(frame,card,x,y,90*yaw,135,angle=tilt,opacity=.85+.15*(depth+1)/2)
    sparkle(frame,160,120,max(0,1-abs(math.sin(phase))*7)*.8,10)
    return frame


def run(*cmd):
    subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y',*map(str,cmd)],check=True)


def export(name, render, count):
    folder=args.work/name
    folder.mkdir(exist_ok=True)
    frames=[]
    for i in range(count):
        frame=render(i/count).resize(OUTPUT_SIZE,RESAMPLE)
        frame.save(folder/f'{i:03d}.png')
        frames.append(frame)
    frames[0].save(OUT/f'{name}-still.png',optimize=True)
    # GIF uses one reserved transparent palette entry; WebP preserves soft alpha.
    sequence=folder/'%03d.png'
    run('-framerate',FPS,'-i',sequence,'-filter_complex',
        '[0:v]split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=90',
        '-frames:v',count,'-loop','0',OUT/f'{name}.gif')
    run('-framerate',FPS,'-i',sequence,'-frames:v',count,'-c:v','libwebp_anim',
        '-lossless','0','-q:v','65','-compression_level','3','-loop','0',OUT/f'{name}.webp')
    # Review representative frames on the actual dark and parchment backgrounds.
    ow,oh=OUTPUT_SIZE
    sheet=Image.new('RGB',(ow*4,oh*2))
    for row,color in enumerate(['#090f15','#efdfbd']):
        for col,index in enumerate([0,count//4,count//2,count*3//4]):
            bg=Image.new('RGBA',OUTPUT_SIZE,color);bg.alpha_composite(frames[index])
            sheet.paste(bg.convert('RGB'),(col*ow,row*oh))
    sheet.save(args.work/f'{name}-contact.png')
    gif=Image.open(OUT/f'{name}.gif');webp=Image.open(OUT/f'{name}.webp')
    assert gif.n_frames == count and webp.n_frames == count
    assert frames[0].getchannel('A').getextrema()==(0,255)
    return {'name':name,'frames':count,'fps':FPS,'durationMs':count*1000//FPS,
            'width':ow,'height':oh,'gifBytes':(OUT/f'{name}.gif').stat().st_size,
            'webpBytes':(OUT/f'{name}.webp').stat().st_size,'transparent':True}


result=[export('opening-compass',opening,40),export('matchmaking-cut',matchmaking,60)]
(OUT/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
