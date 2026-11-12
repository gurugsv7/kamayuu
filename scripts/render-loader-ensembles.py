"""Choreograph the ImageGen card/compass art into transparent HD loader loops.
Retains the earlier exports. PNG intermediates go only to --work, not public.
Requires Pillow, numpy, FFmpeg. No network or API calls.
"""
import argparse, json, math, shutil, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--ffmpeg');args=p.parse_args()
ffmpeg=args.ffmpeg or shutil.which('ffmpeg')
if not ffmpeg:
 import imageio_ffmpeg
 ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
OUT=ROOT/'public/loaders';OUT.mkdir(exist_ok=True);args.work.mkdir(parents=True,exist_ok=True)
W,H,S,FPS=480,400,2,24
SIZE=(384,320)
LANCZOS=Image.Resampling.LANCZOS
def clean(path):
 im=Image.open(path).convert('RGBA');a=np.array(im);a[a[:,:,3]<12]=0;return Image.fromarray(a)
compass=clean(ROOT/'assets-src/loaders/compass-source.png')
yy,xx=np.ogrid[:compass.height,:compass.width]
mask=Image.fromarray((np.hypot(xx-compass.width/2,yy-compass.height/2)<compass.width*.316).astype('uint8')*255)
ring=compass.copy();ring.putalpha(ImageChops.multiply(compass.getchannel('A'),ImageChops.invert(mask)))
needle=compass.copy();needle.putalpha(ImageChops.multiply(compass.getchannel('A'),mask))
card=clean(ROOT/'assets-src/loaders/card-source.png');card=card.crop(card.getchannel('A').point(lambda a:255 if a>80 else 0).getbbox())
def canvas():return Image.new('RGBA',(W*S,H*S))
def place(frame,art,x,y,w,h=None,angle=0,alpha=1):
 h=h or w*art.height/art.width
 layer=art.resize((max(1,round(w*S)),max(1,round(h*S))),LANCZOS)
 if angle:layer=layer.rotate(angle,Image.Resampling.BICUBIC,expand=True)
 if alpha!=1:layer.putalpha(layer.getchannel('A').point(lambda a:round(a*alpha)))
 frame.alpha_composite(layer,(round(x*S-layer.width/2),round(y*S-layer.height/2)))
def shine(frame,x,y,power=1,size=6):
 if power<=0:return
 d=ImageDraw.Draw(frame);x*=S;y*=S;size*=S
 d.polygon([(x,y-size),(x+size*.18,y-size*.18),(x+size,y),(x+size*.18,y+size*.18),(x,y+size),(x-size*.18,y+size*.18),(x-size,y),(x-size*.18,y-size*.18)],fill=(255,225,165,round(235*power)))
def glow(frame,x,y,w,h,alpha):
 layer=canvas();d=ImageDraw.Draw(layer);d.ellipse(((x-w/2)*S,(y-h/2)*S,(x+w/2)*S,(y+h/2)*S),fill=(232,165,65,alpha));frame.alpha_composite(layer.filter(ImageFilter.GaussianBlur(18*S)))
def ease(t):return t*t*(3-2*t)
def path(t,knots):
 for (a,x),(b,y) in zip(knots,knots[1:]):
  if a<=t<=b:return x+(y-x)*ease((t-a)/(b-a))
 return knots[-1][1]
def opening(t):
 f=canvas();phase=math.tau*t
 glow(f,240,180,220,205,22);glow(f,240,316,230,20,30)
 place(f,ring,240,163,316,angle=6*math.sin(phase))
 place(f,needle,240,163,316,angle=-path(t,[(0,0),(.28,96),(.45,88),(.57,90),(.88,362),(1,360)]))
 # A genuine five-card fan: staggered lift, spread, hold, then gather.
 for j in [0,-1,1,-2,2]:
  q=(t-abs(j)*.025)%1
  spread=path(q,[(0,.18),(.28,1),(.57,1),(.86,.18),(1,.18)])
  x=240+j*43*spread;y=291+abs(j)*6*spread-18*spread
  place(f,card,x,y,74,108,angle=-j*13*spread)
  shine(f,x-23,y-46,max(0,math.cos(phase-j*.55))**14*.75,4)
 for j in range(3):
  a=phase+j*math.tau/3
  shine(f,240+148*math.cos(a),163+148*math.sin(a),.3+.45*math.sin(a)**2,5)
 shine(f,240,163,.4+.5*math.sin(phase)**4,8)
 return f
def matchmaking(t):
 # Two seats around a readable compass, with a deal / hold / gather rhythm.
 f=canvas();phase=math.tau*t
 spread=path(t,[(0,0),(.12,0),(.36,1),(.72,1),(.96,0),(1,0)])
 glow(f,240,214,300,230,18)
 place(f,ring,240,210,355,320,alpha=.8)
 place(f,needle,240,210,355,320,angle=-90*ease(t),alpha=.65)
 # A quiet arc of light links the seats; the compass never spins as a spinner.
 d=ImageDraw.Draw(f)
 for side in [-1,1]:
  x=240+side*(13+111*spread);y=210+side*21*spread
  glow(f,x,y+70,90,16,round(12+15*spread))
  place(f,card,x,y,86,132,angle=-side*(3+9*spread))
  sparkle=max(0,math.cos(phase-2.8-side*.3))**18*spread
  shine(f,x-side*32,y-54,sparkle,5)
 shine(f,240,210,.25+.6*spread,9)
 for side in [-1,1]:
  shine(f,240+side*170,210,.35+.3*spread,5)
 return f

def export(name,render,count,poster):
 folder=args.work/name;folder.mkdir(exist_ok=True);frames=[]
 for i in range(count):
  f=render(i/count).resize(SIZE,LANCZOS);f.save(folder/f'{i:03d}.png');frames.append(f)
 frames[poster].save(OUT/f'{name}-still.png',optimize=True)
 def run(*a):subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y',*map(str,a)],check=True)
 run('-framerate',FPS,'-i',folder/'%03d.png','-filter_complex','[0:v]split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=90','-frames:v',count,'-loop','0',OUT/f'{name}.gif')
 run('-framerate',FPS,'-i',folder/'%03d.png','-frames:v',count,'-c:v','libwebp_anim','-lossless','0','-q:v','68','-compression_level','4','-loop','0',OUT/f'{name}.webp')
 sheet=Image.new('RGB',(SIZE[0]*4,SIZE[1]),'#071423')
 for col,i in enumerate([0,count//4,count//2,count*3//4]):
  bg=Image.new('RGBA',SIZE,'#071423');bg.alpha_composite(frames[i]);sheet.paste(bg.convert('RGB'),(SIZE[0]*col,0))
 sheet.save(args.work/f'{name}-contact.png')
 for ext in ['gif','webp']:
  im=Image.open(OUT/f'{name}.{ext}');assert im.n_frames==count
  for i in range(count):im.seek(i);im.load()
 return dict(name=name,frames=count,fps=FPS,durationMs=round(count/FPS*1000),width=SIZE[0],height=SIZE[1],transparent=True,gifBytes=(OUT/f'{name}.gif').stat().st_size,webpBytes=(OUT/f'{name}.webp').stat().st_size)
result=[export('matchmaking-table-v4',matchmaking,96,48)]
(OUT/'duel-manifest.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
