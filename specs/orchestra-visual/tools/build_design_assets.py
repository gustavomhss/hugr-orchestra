#!/usr/bin/env python3
"""Rebuild explicitly derived design assets; NOT runtime code or product proof.

Authoring-only dependencies: Pillow 12.3.0, numpy 2.3.5, opencv-python-headless 4.13.0.92.
No network, no fonts copied, no original or application source modified.
"""
from pathlib import Path
from PIL import Image
import argparse, cv2, numpy as np, json, re, hashlib, shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',required=True,type=Path)
args=parser.parse_args()
ROOT=args.repo.resolve();P=ROOT/'specs/orchestra-visual';D=P/'design'
assert (D/'ASSETS.json').is_file(), 'Read design/README.md before authoring'
for name in ['icons','brand','landscape','reference-crops']:(D/name).mkdir(exist_ok=True)
def js(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(P/'reference/approved.png')=='e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d', 'Wrong approved master'
master=Image.open(P/'reference/approved.png').convert('RGB');assert master.size==(1672,941)
# Official immutable brand copies only, no font distribution.
kit=P/'vendor/HuGR-Brand-Kit-v1.0'; assets=[]
for f in ['hugr-symbol-primary.svg','hugr-symbol-inverse.svg']:
 src=kit/'07-web/brand/logos'/f;dest=D/'brand'/f; shutil.copyfile(src,dest)
 assets.append({'id':f.removesuffix('.svg'),'file':str(dest.relative_to(P)),'source':str(src.relative_to(P)),'sha256':sha(dest),'bytes':dest.stat().st_size,'role':'runtime-copy','owner':'S05','destination':'packages/app/src/assets/orchestra/hugr/'+f,'immutable':True})
src=kit/'02-icons/favicon.svg';shutil.copyfile(src,D/'brand/favicon.svg')
assets.append({'id':'favicon','file':'design/brand/favicon.svg','source':str(src.relative_to(P)),'sha256':sha(src),'bytes':src.stat().st_size,'role':'conditional-runtime-copy','owner':'S05','destination':'confirmed existing favicon consumer only','immutable':True})
# Separate existing icon paths. Native viewBoxes preserved; no claim of a universal 24px Tabler export.
source=ROOT/'packages/ui/src/components/icon.tsx'; s=source.read_text().split('const spriteID')[0]
ic=dict((m[0] or m[1],m[2]) for m in re.findall(r'^  (?:(?:"([^"]+)")|([\w-]+)): `([^`]+)`',s,re.M))
choose={'search':'magnifying-glass','new-session':'new-session','home':'layout-left','chat':'speech-bubble','tasks':'task','agents':'subagent','maestro':'brain','atlas':'glasses','dock':'window-cursor','janitor':'shield','projects':'folder','workspaces':'dot-grid','settings':'settings-gear','chevron':'chevron-down','back':'arrow-left','forward':'arrow-right','reload':'reset','external':'square-arrow-top-right','files':'file-tree','document':'open-file','terminal':'terminal','success':'circle-check','error':'circle-x','warning':'warning','close':'close','more':'menu','send':'arrow-up','stop':'stop','attach':'plus-small','copy':'copy','branch':'branch','help':'help','check':'check-small'}
catalog=[]
for role,name in choose.items():
 v='0 0 16 16' if name in ['magnifying-glass','arrow-undo-down','subagent'] else '0 0 20 20'
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{v}" fill="none" width="20" height="20" color="#B4C0CF">{ic[name]}</svg>\n'
 f=D/'icons'/(role+'.svg'); f.write_text(svg)
 catalog.append({'role':role,'icon_name':name,'viewBox':v,'file':'design/icons/'+f.name,'source':'packages/ui/src/components/icon.tsx','source_sha256':sha(source),'svg_path_sha256':hashlib.sha256(ic[name].encode()).hexdigest(),'runtime_use':'<Icon name="'+name+'" size="small" />','directional':name in ['arrow-left','arrow-right','chevron-left','chevron-right'],'optical_offset_px':[0,0],'offset_policy':'Default 0,0. Optical adjustment only after rendered bbox/baseline proof, maximum 1 CSS px in wrapper; do not mutate shared path.'})
js(D/'icons/catalog.json',{'source_commit':'4fd88201131fcccc64d5c2cc49e9323c042836f8','family':'existing Orchestra icon sprite, mixed stroked/filled paths by design','native_sizes':[16,20],'glyph_css_px':[16,20],'hit_area_css_px':28,'icons':catalog})
# Extract the approved mountain material, masking only original foreground UI. No new landscape generation.
box=(15,480,242,734); crop=np.array(master.crop(box));mask=np.zeros(crop.shape[:2],np.uint8)
# Divider and three navigation labels/icons occupy sky, not the mountain ridge.
for b in [(31,490,225,498),(30,515,133,539),(30,548,154,572),(30,582,124,606)]:
 x0,y0,x1,y1=b;mask[max(0,y0-box[1]):min(crop.shape[0],y1-box[1]),max(0,x0-box[0]):min(crop.shape[1],x1-box[0])]=255
clean=cv2.inpaint(crop,mask,5,cv2.INPAINT_TELEA)
# Retain native pixel density. No enlargement, no invented high-resolution detail.
h,w=clean.shape[:2];alpha=np.ones((h,w),np.float32);alpha[:36]*=np.linspace(0,1,36)[:,None];alpha[-20:]*=np.linspace(1,0,20)[:,None]
rgba=np.dstack([clean,(alpha*255).round().astype(np.uint8)])
land=D/'landscape/sidebar-mountains.png'; Image.fromarray(rgba).save(land,optimize=True)
Image.fromarray(rgba).save(D/'landscape/sidebar-mountains.webp',lossless=True,method=6)
Image.fromarray(mask).save(D/'landscape/reconstruction-mask.png',optimize=True)
js(D/'landscape/PROVENANCE.json',{'kind':'decorative-material-extracted-from-approved-raster','source':'reference/approved.png','source_sha256':sha(P/'reference/approved.png'),'source_crop':list(box),'native_size':[w,h],'mask':'reconstruction-mask.png','method':'OpenCV Telea radius 5 removes only known foreground UI in sky; top36/bottom20 alpha feather. Native mountain pixels outside mask unchanged before alpha. Reconstructed hidden sky is inferred, not recovered original layers.','runtime_file':'sidebar-mountains.webp','png_role':'editable lossless fallback','mirrored_in_rtl':False,'light_mode':'hidden; preserve previous light treatment','collapsed':'hidden','display_width_css_px':230,'display_height_css_px':257,'upscale_policy':'No claimed 2x/4x original; only proportional CSS scaling to the 230px sidebar. Decorative source is native227px.','product_validation':'Requires S05 actual URL/alpha/size render and S24 visual review; this extraction does not approve product.'})
assets.append({'id':'sidebar-mountains','file':'design/landscape/sidebar-mountains.webp','source':'reference/approved.png','sha256':sha(D/'landscape/sidebar-mountains.webp'),'bytes':(D/'landscape/sidebar-mountains.webp').stat().st_size,'role':'runtime-copy','owner':'S05','destination':'packages/app/src/assets/orchestra/sidebar-mountains.webp','immutable':False,'width':w,'height':h,'decoded_rgba_bytes':w*h*4})
# Exact source crops for comparison, never runtime UI sprites.
regions={'sidebar':[14,13,243,928],'topbar':[243,13,1658,58],'session-header':[270,72,1182,143],'checklist':[342,262,1165,381],'changes-list':[345,388,751,598],'diff':[759,388,1175,603],'test-evidence':[345,662,1175,779],'composer':[272,871,1184,917],'dock':[1220,66,1650,519],'tasks':[1220,527,1650,726],'activity':[1220,736,1650,918]}
for name,b in regions.items():master.crop(b).save(D/'reference-crops'/(name+'.png'),optimize=True)
js(D/'reference-crops/catalog.json',{'role':'reference-only-never-runtime','source':'reference/approved.png','source_sha256':sha(P/'reference/approved.png'),'coordinate_system':'full 1672x941 half-open [x0,y0,x1,y1]; display master preserved','regions':regions})
js(D/'ASSETS.json',{'schema_version':1,'source_commit':'4fd88201131fcccc64d5c2cc49e9323c042836f8','approved_master_sha256':sha(P/'reference/approved.png'),'fonts':'No fonts copied or redistributed; refer to existing repo font files.','assets':assets,'ui_images':'design/states and design/elements are synthetic design references, not app evidence or runtime controls.','zen':'design/zen/ has scoped source CSS and measured tokens, not imported Zen browser internals or trademarks.'})
print('Generated official copies, existing icon exports, extracted landscape and exact master crops. No product tasks accepted.')
