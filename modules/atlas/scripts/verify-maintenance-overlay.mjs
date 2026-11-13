import {createHash} from "node:crypto";
import {lstat,readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const OUT=["packages/adapter-io/dist/src/evaluation-maintenance-host.js","packages/adapter-io/dist/src/evaluation-maintenance-host.d.ts","packages/adapter-io/dist/src/evaluation-maintenance-caller.js","packages/adapter-io/dist/src/evaluation-maintenance-caller.d.ts"];
const SRC=["packages/adapter-io/src/evaluation-maintenance-host.ts","packages/adapter-io/src/evaluation-maintenance-caller.ts","packages/adapter-io/src/evaluation-rebuild.ts","packages/adapter-io/src/ownership-rebuild.ts","package.json","package-lock.json"];
const PINS={"packages/adapter-io/src/evaluation-maintenance-host.ts":"1286f756209fa5e5abb6af0ec4794d6a57c979c3ba3dd97aa0d10ee22dd33a3b","packages/adapter-io/src/evaluation-rebuild.ts":"1e511bd090ab303f0ee9cb8c69c1d6289a5a5c5cabbe5cd96c56833ad6a52a9e","packages/adapter-io/src/ownership-rebuild.ts":"4f38223d0d513b38fdd489aa7fea5a3cc818b1cc37a180973167f732f2494a18"};
const MAN="maintenance-caller-overlay-manifest.txt", fail=s=>{throw Error("overlay-verifier: "+s)}, sha=b=>createHash("sha256").update(b).digest("hex");
function safe(p){if(!p||p.startsWith("/")||p.includes("\\")||p.split("/").some(x=>!x||x==="."||x==="..")||!/^[A-Za-z0-9._/-]+$/.test(p))fail("unsafe path: "+p);}
function parse(s){
 const f=new Map(),h=new Map();let section=false;
 for(const line of s.replace(/\r\n/g,"\n").split("\n")){if(!line)continue;if(line==="[sha256-relative-to-modules-atlas]"){if(section)fail("duplicate hash section");section=true;continue;}
 if(!section){const i=line.indexOf("=");if(i<1)fail("malformed field");const k=line.slice(0,i);if(f.has(k))fail("duplicate field: "+k);f.set(k,line.slice(i+1));}
 else{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!m)fail("malformed hash row");safe(m[2]);if(h.has(m[2]))fail("duplicate path: "+m[2]);h.set(m[2],m[1]);}}
 const keys=["schema","kind","base_commit","repository","requires","source_family","host_source_commit"];
 if(f.size!==keys.length||keys.some(k=>!f.has(k)))fail("manifest fields not exact");
 if(f.get("schema")!=="maintenance-caller-overlay/v1"||f.get("kind")!=="overlay-not-standalone"||f.get("requires")!=="complete-built-modules-atlas-tree-at-base_commit"||f.get("source_family")!=="host-v3-plus-evaluation-implementation-v6"||f.get("host_source_commit")!=="3aa3bd492f852cbf3711b7b6fb4647316560d0ec")fail("unsupported manifest identity");
 const expected=[...OUT,...SRC].sort();if(h.size!==expected.length||expected.some(p=>!h.has(p)))fail("manifest path set not exact");return {f,h};
}
async function file(root,rel){safe(rel);let p=root;for(const [i,part] of rel.split("/").entries()){p=path.join(p,part);let st;try{st=await lstat(p)}catch{fail("missing: "+rel)}if(st.isSymbolicLink())fail("symlink: "+rel);if(i<rel.split("/").length-1&&!st.isDirectory())fail("bad parent: "+rel);if(i===rel.split("/").length-1&&!st.isFile())fail("not regular file: "+rel);}const b=await readFile(p);if(!b.length)fail("empty: "+rel);return b;}
async function exact(root,expected){const got=[];async function walk(d,p=""){for(const e of await readdir(d,{withFileTypes:true})){const r=p?p+"/"+e.name:e.name,abs=path.join(d,e.name),st=await lstat(abs);if(st.isSymbolicLink())fail("symlink: "+r);if(st.isDirectory())await walk(abs,r);else if(st.isFile())got.push(r);else fail("special file: "+r);}}await walk(root);const a=got.sort(),b=[...expected].sort();if(a.length!==b.length||a.some((x,i)=>x!==b[i]))fail("overlay must contain exactly four outputs plus manifest");}
export async function verify({overlayDir,baseTree,baseCommit,repository,sourcePins=PINS}){
 if(!overlayDir||!baseTree||!baseCommit||!repository)fail("overlayDir, baseTree, baseCommit and repository required");
 if(!/^[a-f0-9]{40}$/.test(baseCommit))fail("invalid base commit");
 const o=path.resolve(overlayDir),b=path.resolve(baseTree);await exact(o,[...OUT,MAN]);
 const {f,h}=parse((await file(o,MAN)).toString("utf8"));
 if(f.get("base_commit")!==baseCommit)fail("wrong base commit");if(f.get("repository")!==repository)fail("wrong repository");
 for(const p of OUT)if(sha(await file(o,p))!==h.get(p))fail("output tamper: "+p);
 for(const p of SRC){const d=sha(await file(b,p));if(d!==h.get(p))fail("base source mismatch: "+p);if(sourcePins[p]&&d!==sourcePins[p])fail("source pin mismatch: "+p);}
 return {ok:true,outputs:OUT.length,sources:SRC.length,baseCommit,repository};
}
function cli(a){const v={};for(let i=0;i<a.length;i+=2){const k=a[i],x=a[i+1];if(!["--overlay-dir","--base-tree","--base-commit","--repository"].includes(k)||!x||v[k])fail("invalid argument "+k);v[k]=x;}return {overlayDir:v["--overlay-dir"],baseTree:v["--base-tree"],baseCommit:v["--base-commit"],repository:v["--repository"]};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await verify(cli(process.argv.slice(2)))))}catch(e){console.error(e.message);process.exitCode=1}}
