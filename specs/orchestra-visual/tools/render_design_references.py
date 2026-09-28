#!/usr/bin/env python3
"""Render authored interface references only (not the Orchestra application).

Authoring-only: playwright==1.57.0 plus an installed Chromium/Chrome.
Uses existing repository font bytes only in browser memory. Never writes or
exports font files or a font-embedded HTML. No model/service/network requests.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,hashlib,base64,mimetypes,re,argparse,shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',required=True,type=Path)
parser.add_argument('--browser',help='Installed Chromium/Chrome executable; default discovery. No download.')
args=parser.parse_args();R=args.repo.resolve();D=R/'specs/orchestra-visual/design'
if not (D/'STATES.json').is_file():raise SystemExit('Missing design/STATES.json')
for part in ['states','elements']:(D/part).mkdir(exist_ok=True)
browser=args.browser or shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chromium-browser')
if not browser:raise SystemExit('Provide installed Chromium via --browser; no browser is installed automatically.')
elements=[('sidebar','baseline','sidebar'),('sidebar-collapsed','sidebar-collapsed','sidebar'),('topbar','baseline','topbar'),('brand','baseline','brand'),('workspace-switch','baseline','workspace-switch'),('checklist','baseline','checklist'),('changes','baseline','changes'),('diff','baseline','diff'),('test-evidence','baseline','test-evidence'),('composer','baseline','composer'),('dock','baseline','dock'),('tasks','baseline','tasks'),('activity','baseline','activity'),('tabs','baseline','tabs'),('address-bar','baseline','address-bar'),('dialog','settings-dialog','dialog'),('popover','model-popover','popover'),('tooltip','sidebar-collapsed','tooltip'),('toast','toast-error','toast')]
def template(query):
 h=(D/'reference.html').read_text()
 assets={str(x.relative_to(D)):'data:'+mimetypes.guess_type(str(x))[0]+';base64,'+base64.b64encode(x.read_bytes()).decode() for folder in ['icons','brand','landscape'] for x in (D/folder).glob('*') if x.suffix in ['.svg','.png','.webp']}
 for css in ['zen/tokens.css','zen/chrome.css','zen/controls.css','zen/states.css','reference.css']:
  v=(D/css).read_text()
  for f in ['Inter.ttf','JetBrainsMonoNerdFontMono-Regular.woff2']:
   font=R/'packages/ui/src/assets/fonts'/f
   v=v.replace('../../../packages/ui/src/assets/fonts/'+f,'data:font/'+('ttf' if f.endswith('.ttf') else 'woff2')+';base64,'+base64.b64encode(font.read_bytes()).decode())
  h=h.replace('<link rel="stylesheet" href="'+css+'">','<style>'+v+'</style>')
 h=h.replace('<script src="copy-data.js"></script>','<script>window.ORCHESTRA_DESIGN_QUERY='+json.dumps(query)+';window.ORCHESTRA_DESIGN_ASSETS='+json.dumps(assets)+';'+(D/'copy-data.js').read_text()+'</script>')
 h=h.replace('<script src="reference.js"></script>','<script>'+(D/'reference.js').read_text()+'</script>')
 return h
def check_reference_boundaries(page, state):
    """DOM checks of authored references, never product or Electron approval."""
    r=page.evaluate("""() => {
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
      const bar=document.querySelector('.dock-address'), input=bar?.querySelector('.ov-input'), url=bar?.querySelector('.address-url'), output=document.querySelector('.test-output');
      return {stateRTL:document.querySelector('#app').dir==='rtl',collapsed:document.querySelector('#app').classList.contains('ov-collapsed'),sidebar:box(document.querySelector('.ov-sidebar')),native:box(document.querySelector('.window-controls')),bar:bar?box(bar):null,input:input?box(input):null,url:url?box(url):null,buttons:bar?[...bar.querySelectorAll('button')].map(box):[],outputDirection:output?getComputedStyle(output).direction:null,outputAlign:output?getComputedStyle(output).textAlign:null,searchName:document.querySelector('.ov-nav-search').getAttribute('aria-label'),newName:document.querySelector('.ov-navitem[aria-label]:not(.ov-nav-search)').getAttribute('aria-label')};
    }""")
    if r['bar']:
        assert r['url'] and r['url']['width']>0 and r['url']['x']>=r['input']['x'] and r['url']['right']<=r['input']['right'], (state,'URL overflow',r)
        assert all(b['width']>=28 and b['height']>=28 and b['x']>=r['bar']['x']-1 and b['right']<=r['bar']['right']+1 for b in r['buttons']), (state,'address hitbox',r)
    if r['stateRTL']:assert r['native']['x']==26 and r['native']['y']==25, (state,'native controls mirrored',r)
    if r['collapsed']:assert r['sidebar']['width']==56, (state,'compact width',r)
    if r['outputDirection'] is not None:assert r['outputDirection']=='ltr' and r['outputAlign']=='left', (state,'output direction',r)
    assert r['searchName'] and r['newName'], (state,'missing compact accessible name')
    r['ltr_islands']=page.evaluate("""() => [...document.querySelectorAll('.file-row .add,.file-row .del,.ov-shortcut,.author time')].map(e=>({text:e.textContent,direction:getComputedStyle(e).direction,bidi:getComputedStyle(e).unicodeBidi}))""")
    assert all(x['direction']=='ltr' and x['bidi']=='isolate' for x in r['ltr_islands']), (state,'signed data mirrored',r)
    if r['stateRTL']:assert len(r['ltr_islands'])>=12, (state,'missing RTL signed-data coverage')
    return {'state':state,'geometry':r,'kind':'design-reference-dom-check-not-product-proof'}

with sync_playwright() as p:
 b=p.chromium.launch(executable_path=browser,headless=True,args=['--font-render-hinting=none'])
 page=b.new_page(viewport={'width':1672,'height':941},device_scale_factor=1)
 errors=[];geometry=[];boundaries=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for s in json.loads((D/'STATES.json').read_text())['states']:
  page.set_content(template('?state='+s['slug']));page.wait_for_function('document.documentElement.dataset.ready === "true"');boundaries.append(check_reference_boundaries(page,s['id']));page.screenshot(path=str(R/'specs/orchestra-visual'/s['file']));geometry.append({'id':s['id'],'viewport':[1672,941],'window':page.locator('#app').bounding_box(),'composer':page.locator('[data-element="composer"]').first.bounding_box() if page.locator('[data-element="composer"]').count() else None,'images_loaded':page.evaluate('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')});print(s['id'],flush=True)
 rows=[]
 for name,state,key in elements:
  page.set_content(template('?state='+state));page.wait_for_function('document.documentElement.dataset.ready === "true"');el=page.locator(f'[data-element="{key}"]');box=el.bounding_box();f=D/'elements'/(name+'.png');el.screenshot(path=str(f),omit_background=True)
  rows.append({'id':name,'file':'design/elements/'+f.name,'state':state,'selector':f'[data-element="{key}"]','css_box':box,'kind':'design-reference-not-runtime','synthetic':True,'source':'design/reference.html','sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 page.set_viewport_size({'width':1152,'height':768});page.set_content(template('?state=sidebar-collapsed'));page.wait_for_function('document.documentElement.dataset.ready === "true"');boundaries.append(check_reference_boundaries(page,'DS20-native'));page.screenshot(path=str(D/'states/DS20-native-1152x768.png'))
 # Native compact dimensions are a layout reference, not a resized screenshot.
 (D/'elements/catalog.json').write_text(json.dumps({'schema_version':1,'note':'PNG references to inspect per element. Reuse CSS and existing Solid components; do not put these PNG controls in runtime.','elements':rows},indent=2)+'\n')
 (D/'LOCAL-RENDER.json').write_text(json.dumps({'kind':'design-render-not-product-proof','browser':b.version,'renderer':'Chromium via Playwright 1.57.0; in-memory set_content; no network' ,'states':22,'elements':len(rows),'additional_native_viewport':[1152,768],'page_errors':errors,'geometry':geometry,'reference_boundary_checks':boundaries,'synthetic':True,'font_source':'existing repository assets; no font redistributed','product_execution':'NOT_RUN'},indent=2)+'\n')
 if errors:raise RuntimeError(errors)
 b.close()

