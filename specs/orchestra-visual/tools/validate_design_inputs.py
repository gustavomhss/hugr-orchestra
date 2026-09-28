#!/usr/bin/env python3
"""Check separated design inputs. Never approves a product implementation."""
from pathlib import Path
import argparse,hashlib,json,re,sys,xml.etree.ElementTree as ET
from png_check import decode_png
ROOT=Path(__file__).resolve().parents[1]
MASTER='e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d'

def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def path(root,value):
    if not isinstance(value,str) or not value or '\\' in value or '..' in value.split('/') or Path(value).is_absolute():raise ValueError('unsafe asset path')
    p=root/value
    if p.is_symlink():raise ValueError('asset symlink refused')
    p.resolve().relative_to(root.resolve())
    if not p.is_file():raise ValueError('missing asset: '+value)
    return p

def check_states(data,surfaces):
    errors=[];rows=data.get('states',[]);valid={x['id'] for x in surfaces['surfaces']}
    if not isinstance(rows,list) or {s.get('id') for s in rows if isinstance(s,dict)}!={f'DS{i:02}' for i in range(1,23)} or len(rows)!=22:return ['Expected 22 distinct design states']
    files=[]
    for s in rows:
        files.append(s.get('file'))
        if s.get('synthetic') is not True or s.get('is_product_evidence') is not False or s.get('evidence_origin')!='design-reference':errors.append(s['id']+': design origin must not imply product proof')
        if s.get('viewport')!=[1672,941] or s.get('dpr')!=1 or s.get('zoom')!=100:errors.append(s['id']+': reference viewport mismatch')
        if not s.get('consumer_hints') or not set(s['consumer_hints'])<=valid:errors.append(s['id']+': unknown/missing consumer')
    if len(files)!=len(set(files)):errors.append('Duplicate state file')
    return errors

def check_copy(data):
    errors=[];seen=set()
    if data.get('owner')!='S22':errors.append('Copy needs the existing S22 owner')
    for row in data.get('entries',[]):
        key=row.get('key')
        if not isinstance(key,str) or not key.startswith('orchestra.') or key in seen:errors.append('Invalid/duplicate copy key')
        seen.add(key)
        expected=set(row.get('placeholders',[]))
        for lang in ('en','pt-BR'):
            v=row.get(lang)
            if not isinstance(v,str) or not v.strip():errors.append(str(key)+': empty '+lang);continue
            actual=set(re.findall(r'\{([A-Za-z][A-Za-z0-9_]*)\}',v))
            if expected!=actual:errors.append(str(key)+': placeholder mismatch '+lang)
        if row.get('owner')!='S22':errors.append(str(key)+': wrong owner')
    if not seen:errors.append('Empty copy')
    return errors

def verify(root=ROOT,decode=True):
    errors=[];D=root/'design';counts={}
    try:
        if sha(path(root,'reference/approved.png'))!=MASTER:errors.append('Approved master changed')
        states=load(D/'STATES.json');errors+=check_states(states,load(root/'SURFACES.json'))
        for s in states['states']:
            p=path(root,s['file'])
            if decode:
                shape=decode_png(p)
                if (shape['width'],shape['height'])!=(1672,941):errors.append(s['id']+': PNG dimensions mismatch')
        if decode:
            compact=decode_png(path(root,'design/states/DS20-native-1152x768.png'))
            if (compact['width'],compact['height'])!=(1152,768):errors.append('Compact native viewport mismatch')
        copy=load(root/'copy.json');errors+=check_copy(copy)
        for a in load(D/'ASSETS.json')['assets']:
            p=path(root,a['file'])
            if sha(p)!=a['sha256'] or p.stat().st_size!=a['bytes']:errors.append(a['id']+': bytes/hash mismatch')
            if a.get('immutable') and p.read_bytes()!=path(root,a['source']).read_bytes():errors.append(a['id']+': official source bytes changed')
        icons=load(D/'icons/catalog.json')['icons'];seen=set()
        for a in icons:
            if a['role'] in seen:errors.append('Duplicate icon role')
            seen.add(a['role']);svg=ET.parse(path(root,a['file'])).getroot()
            if svg.attrib.get('viewBox')!=a['viewBox'] or a['viewBox'] not in ('0 0 16 16','0 0 20 20'):errors.append(a['role']+': icon viewBox mismatch')
            if '<script' in ET.tostring(svg,encoding='unicode'):errors.append(a['role']+': script in SVG')
        elements=load(D/'elements/catalog.json')['elements']
        if len(elements)!=19:errors.append('Expected 19 isolated element references')
        for a in elements:
            if a.get('synthetic') is not True or sha(path(root,a['file']))!=a['sha256']:errors.append(a['id']+': element provenance mismatch')
        tokens=load(D/'zen/tokens.json');measure=load(D/'zen/MEASUREMENTS.json')
        if measure['master_sha256']!=MASTER:errors.append('Measurements belong to another master')
        for key in ('canvas','shell','surface'):
            if tokens['colors'][key]['value']!=measure['samples'][key]['median_hex']:errors.append('Measured token mismatch: '+key)
        texts=(D/'EXECUTOR-DECISIONS.md').read_text()
        if re.findall(r'^<a id="(a\d{2})"></a>',texts,re.M)!=[f'a{i:02}' for i in range(1,12)]:errors.append('Missing/duplicate A decision anchor')
        for f in D.rglob('*'):
            if f.suffix.lower() in ('.ttf','.otf','.woff','.woff2'):errors.append('Font file redistributed: '+str(f.relative_to(D)))
            if f.suffix in ('.html','.js','.css') and 'data:font/' in f.read_text():errors.append('Embedded font redistributed')
        for name in ('gallery.html','reference.html','reference.css','reference.js','zen/README.md','zen/token-bindings.json','landscape/PROVENANCE.json','REQUESTS.md','REQUESTS-SOURCE.md'):path(D,name)
        for f in ('zen/chrome.css','zen/controls.css','zen/states.css','zen/tokens.css'):
            if 'backdrop-filter:' in (D/f).read_text() or '@import' in (D/f).read_text():errors.append('Forbidden remote/heavy skin dependency: '+f)
        counts={'states':len(states['states']),'elements':len(elements),'icons':len(icons),'copy_keys':len(copy['entries']),'measured_roles':3,'runtime_assets':len(load(D/'ASSETS.json')['assets'])}
    except (OSError,ValueError,KeyError,TypeError,ET.ParseError) as exc:errors.append(str(exc))
    return {'kind':'design-input-verification-not-product-approval','status':'FAIL' if errors else 'PASS','errors':errors,'counts':counts,'product_implementation_tested':False,'product_tasks_accepted':0}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=ROOT);args=p.parse_args()
    result=verify(args.root);print(json.dumps(result,ensure_ascii=False,indent=2));return int(bool(result['errors']))
if __name__=='__main__':sys.exit(main())
