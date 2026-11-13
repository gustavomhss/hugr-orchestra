"""Exact CAS delta boundary; kernel identity itself is checked by the pinned native audit."""
import re
HEX=re.compile(r'^[0-9a-f]{64}$')
def cas_path(h):
 if not isinstance(h,str) or HEX.fullmatch(h) is None:raise RuntimeError('CAS_ID_FORMAT')
 return '.atlas/cas/'+h[:2]+'/'+h
def validate(before,after,allowed_ids,audit):
 allowed={cas_path(h) for h in allowed_ids};prefix='.atlas/cas/'
 old={p for p,v in before.items() if p.startswith(prefix) and v['type']=='file'}
 current={p for p,v in after.items() if p.startswith(prefix) and v['type']=='file'}
 for p in old:
  if after.get(p)!=before[p]:raise RuntimeError('CAS_BASELINE_CHANGED')
 if current-old!=allowed-old:raise RuntimeError('CAS_EXACT_DELTA')
 if set(audit)!=current:raise RuntimeError('CAS_AUDIT_COVERAGE')
 for p in current:
  h=p.rsplit('/',1)[-1]
  if cas_path(h)!=p or audit[p]!={'id':h,'sha256':after[p]['sha256']}:raise RuntimeError('CAS_KERNEL_AUDIT_BINDING')
 wanted_dirs={'.atlas/cas'}|{str(p.rsplit('/',1)[0]) for p in current}
 actual_dirs={p for p,v in after.items() if (p=='.atlas/cas' or p.startswith(prefix)) and v['type']=='directory'}
 if actual_dirs!=wanted_dirs:raise RuntimeError('CAS_DIRECTORY_SET')
 if any(v['type'] not in ['file','directory'] for p,v in after.items() if p.startswith(prefix)):raise RuntimeError('CAS_OBJECT_TYPE')
 return {'new_cas_files':len(current-old),'kernel_audited_files':len(current),'allowed_unique_ids':len(allowed)}
