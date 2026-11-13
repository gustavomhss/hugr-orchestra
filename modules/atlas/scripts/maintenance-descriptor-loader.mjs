// Proposed external boundary only. No filesystem, Atlas import, operation, or publication.
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
const fail = message => { throw Error(`descriptor-loader-${message}`) }
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === null
const str = x => { if(typeof x !== 'string' || x.length === 0 || x.length > 1048576)fail('string');return x }
const digest = x => {if(typeof x !== 'string'|| !/^[0-9a-f]{64}$/.test(x))fail('digest')}
const fields = (x, required, optional=[]) => { if(!plain(x))fail('object');for(const k of Object.keys(x))if(!required.includes(k)&&!optional.includes(k))fail('unknown-field');for(const k of required)if(!Object.hasOwn(x,k))fail('missing-field') }
const array = (x,max=4096) => {if(!Array.isArray(x)||x.length>max)fail('array');return x}
const unique = xs => {if(new Set(xs).size!==xs.length)fail('duplicate-key')}
const strings = x => {array(x).forEach(str);unique(x)}
function parse(text){let i=0,nodes=0;const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!'))i++};function string(){const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue}if(text[i]==='"'){i++;return JSON.parse(text.slice(start,i))}}fail('unterminated-string')}
 function value(depth){if(depth>24||++nodes>100000)fail('complexity');ws();const c=text[i];if(c==='"')return string();if(c==='{'){i++;const out=Object.create(null);ws();if(text[i]==='}'){i++;return out}for(;;){ws();if(text[i]!=='"')fail('object-key');const k=string();if(['__proto__','prototype','constructor'].includes(k)||Object.hasOwn(out,k))fail('duplicate-or-unsafe-field');ws();if(text[i++]!==':')fail('colon');out[k]=value(depth+1);ws();const end=text[i++];if(end==='}')return out;if(end!==',')fail('object-separator')}}
 if(c==='['){i++;const out=[];ws();if(text[i]===']'){i++;return out}for(;;){if(out.length>=4096)fail('array');out.push(value(depth+1));ws();const end=text[i++];if(end===']')return out;if(end!==',')fail('array-separator')}}
 for(const [literal,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return result}
 const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(m){i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n))fail('number');return n}fail('json')}
 const result=value(0);ws();if(i!==text.length)fail('trailing');return result}
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
export function loadDescriptor(bytes,expectedSha256){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>8*1024*1024)fail('byte-limit');digest(expectedSha256)
 const copy=new Uint8Array(bytes);if(createHash('sha256').update(copy).digest('hex')!==expectedSha256)fail('pin')
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(copy)}catch{fail('utf8')}
 const d=parse(text);fields(d,['schema','baselineCandidate','baselineManifest','baselineGeneration','targetRoot','targetGeneration','recipes','produced'])
 if(d.schema!=='evaluation-maintenance-caller/v1')fail('schema');for(const k of ['baselineCandidate','baselineManifest','baselineGeneration','targetGeneration'])digest(d[k]);str(d.targetRoot)
 if(!posix.isAbsolute(d.targetRoot)||posix.normalize(d.targetRoot)!==d.targetRoot||d.targetRoot.includes('\0'))fail('target-root')
 const recipes=array(d.recipes,15);if(recipes.length!==15)fail('registry');unique(recipes.map(r=>{fields(r,['key','recipeInputKey','recipeVersion','declaredInputs','required'],['mandatoryInputs']);str(r.key);str(r.recipeInputKey);str(r.recipeVersion);strings(r.declaredInputs);strings(r.required);if(r.mandatoryInputs!==undefined)strings(r.mandatoryInputs);const mandatory=r.mandatoryInputs??r.declaredInputs;if(!mandatory.includes(r.recipeInputKey)||mandatory.some(k=>!r.declaredInputs.includes(k)))fail('mandatory');return r.key}))
 const keys=new Set(recipes.map(r=>r.key));for(const r of recipes)if(r.required.some(k=>!keys.has(k)||k===r.key))fail('edge')
 // Reject cycles in the descriptor topology; baseline equality remains the caller/core gate.
 const done=new Set(),active=new Set();function visit(key){if(active.has(key))fail('cycle');if(done.has(key))return;active.add(key);for(const dep of recipes.find(r=>r.key===key).required)visit(dep);active.delete(key);done.add(key)}for(const key of keys)visit(key)
 unique(array(d.produced,15).map(p=>{fields(p,['key','capturedVersions','dependencies','output']);str(p.key);if(!keys.has(p.key))fail('production-key');for(const [name,valueKey] of [['capturedVersions','version'],['dependencies','result']]){unique(array(p[name]).map(x=>{fields(x,['key',valueKey]);str(x.key);str(x[valueKey]);return x.key}))}if(p.dependencies.some(x=>!keys.has(x.key)))fail('dependency-key');const out=p.output;fields(out,['body'],['authorityBasis','validity','gaps','evidence']);str(out.body);if(out.authorityBasis!==undefined)str(out.authorityBasis);if(out.validity!==undefined&&!['supported','blocked'].includes(out.validity))fail('validity');for(const key of ['gaps','evidence'])if(out[key]!==undefined)array(out[key]).forEach(str);return p.key}))
 return freeze(d)
}
