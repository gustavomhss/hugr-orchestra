const { test } = await import(globalThis.Bun ? 'bun:test' : 'node:test')
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadDescriptor } from './maintenance-descriptor-loader.mjs'
const pin=b=>createHash('sha256').update(b).digest('hex')
const input=()=>({schema:'evaluation-maintenance-caller/v1',baselineCandidate:'a'.repeat(64),baselineManifest:'b'.repeat(64),baselineGeneration:'c'.repeat(64),targetRoot:'/synthetic-target',targetGeneration:'d'.repeat(64),recipes:Array.from({length:15},(_,i)=>({key:`key-${i}`,recipeInputKey:'file:recipe',recipeVersion:'v1',declaredInputs:['file:recipe'],required:[]})),produced:[{key:'key-0',capturedVersions:[{key:'file:recipe',version:'v1'}],dependencies:[],output:{body:'synthetic body',gaps:['synthetic'],evidence:['synthetic']}}]})
const encode=s=>new TextEncoder().encode(s)
const load=x=>{const b=encode(typeof x==='string'?x:JSON.stringify(x));return loadDescriptor(b,pin(b))}
const rejects=(fn,reason)=>assert.throws(fn,error=>error instanceof Error&&error.message===`descriptor-loader-${reason}`)
const raw=()=>JSON.stringify(input())
test('valid descriptor recursively frozen, detached and null-prototype',()=>{const b=encode(raw()),d=loadDescriptor(b,pin(b));b.fill(0);assert.equal(d.produced[0].output.body,'synthetic body');for(const o of [d,d.recipes,d.recipes[0],d.recipes[0].declaredInputs,d.produced[0].output,d.produced[0].output.gaps])assert(Object.isFrozen(o));assert.throws(()=>d.produced[0].output.gaps.push('x'),TypeError);assert.equal(Object.getPrototypeOf(d),null)})
test('raw-byte pin mismatch rejects a valid descriptor',()=>rejects(()=>loadDescriptor(encode(raw()),'0'.repeat(64)),'pin'))
test('malformed expected digest rejects before parsing valid descriptor',()=>rejects(()=>loadDescriptor(encode(raw()),'not-a-digest'),'digest'))
for(const [name,reason,change] of [
 ['unknown top-level','unknown-field',d=>d.extra=true],['unknown nested','unknown-field',d=>d.recipes[0].run='code'],['wrong schema','schema',d=>d.schema='other'],['wrong digest','digest',d=>d.baselineManifest='not-hash'],['missing field','missing-field',d=>delete d.produced],['bad root','target-root',d=>d.targetRoot='/x/../y'],['missing recipe','registry',d=>d.recipes.pop()],['duplicate recipe','duplicate-key',d=>d.recipes[14]=d.recipes[0]],['unknown production','production-key',d=>d.produced[0].key='unknown'],['duplicate production','duplicate-key',d=>d.produced.push(d.produced[0])],['duplicate capture','duplicate-key',d=>d.produced[0].capturedVersions.push(d.produced[0].capturedVersions[0])],['bad output type','string',d=>d.produced[0].output.body=9],['bad validity','validity',d=>d.produced[0].output.validity='approved'],['bad mandatory','mandatory',d=>d.recipes[0].mandatoryInputs=[]],['cycle','cycle',d=>{d.recipes[0].required=['key-1'];d.recipes[1].required=['key-0']}],['unknown edge','edge',d=>d.recipes[0].required=['missing']]
])test(name,()=>{const d=input();change(d);rejects(()=>load(d),reason)})
// Every parser-negative begins with an otherwise valid complete descriptor.
for(const [name,reason,mutate] of [
 ['duplicate schema','duplicate-or-unsafe-field',s=>s.replace('"schema":','"schema":"evaluation-maintenance-caller/v1","schema":')],
 ['escaped duplicate schema','duplicate-or-unsafe-field',s=>s.replace('"schema":','"\\u0073chema":"evaluation-maintenance-caller/v1","schema":')],
 ['nested duplicate body','duplicate-or-unsafe-field',s=>s.replace('"body":','"body":"synthetic body","body":')],
 ['unsafe prototype','duplicate-or-unsafe-field',s=>s.replace('{','{"__proto__":{},')],
 ['unsafe escaped prototype','duplicate-or-unsafe-field',s=>s.replace('{','{"\\u005f_proto__":{},')],
 ['unsafe constructor','duplicate-or-unsafe-field',s=>s.replace('{','{"constructor":{},')],
 ['unsafe nested prototype','duplicate-or-unsafe-field',s=>s.replace('"output":{','"output":{"prototype":{},')],
 ['trailing garbage','trailing',s=>s+' trailing'],
 ['object trailing comma','object-key',s=>s.slice(0,-1)+',}'],
 ['array trailing comma','json',s=>s.replace('"required":[]','"required":["key-1",]')],
 ['Infinity token','json',s=>s.replace('"body":"synthetic body"','"body":Infinity')],
 ['overflow number','number',s=>s.replace('"body":"synthetic body"','"body":1e999')],
 ['unsafe integer body','string',s=>s.replace('"body":"synthetic body"','"body":9007199254740993')],
 ['fraction body','string',s=>s.replace('"body":"synthetic body"','"body":0.5')],
 ['missing colon','colon',s=>s.replace('"schema":','"schema" ')],
 ['depth budget','complexity',s=>s.replace('"body":"synthetic body"','"body":'+'['.repeat(26)+'0'+']'.repeat(26))]
])test(name,()=>rejects(()=>load(mutate(raw())),reason))
test('invalid UTF8 in otherwise valid descriptor rejects specifically',()=>{const b=encode(raw()),at=raw().indexOf('synthetic body');b[at]=0xff;rejects(()=>loadDescriptor(b,pin(b)),'utf8')})
test('oversized bytes rejected before pin/parse',()=>{const b=new Uint8Array(8*1024*1024+1);rejects(()=>loadDescriptor(b,pin(b)),'byte-limit')})
test('array budget rejects otherwise valid descriptor shape',()=>{const d=input();d.recipes[0].declaredInputs=Array.from({length:4097},(_,i)=>`file:${i}`);rejects(()=>load(d),'array')})
test('leading UTF8 BOM accepted with pin of exact BOM-inclusive bytes',()=>{const b=encode('\uFEFF'+raw());assert.equal(loadDescriptor(b,pin(b)).schema,'evaluation-maintenance-caller/v1');rejects(()=>loadDescriptor(b,pin(encode(raw()))),'pin')})
test('second leading BOM rejected as JSON, not silently stripped',()=>rejects(()=>load('\uFEFF\uFEFF'+raw()),'json'))
test('embedded BOM in string preserved',()=>{const d=input();d.produced[0].output.body='a\uFEFFb';assert.equal(load(d).produced[0].output.body,'a\uFEFFb')})
test('numeric-looking string is preserved exactly',()=>{const d=input();d.produced[0].output.body='9007199254740993';assert.equal(load(d).produced[0].output.body,'9007199254740993')})
test('empty production allowed and optional output properties remain omitted',()=>{const d=input();delete d.produced[0].output.gaps;delete d.produced[0].output.evidence;const result=load(d);assert.equal(Object.hasOwn(result.produced[0].output,'gaps'),false);assert.equal(Object.hasOwn(result.produced[0].output,'evidence'),false);d.produced=[];assert.deepEqual(load(d).produced,[])})
