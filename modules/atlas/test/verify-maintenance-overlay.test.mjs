import {afterEach,describe,it} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile} from "node:fs/promises";
import os from "node:os";import path from "node:path";import {createHash} from "node:crypto";
import {verify} from "../scripts/verify-maintenance-overlay.mjs";
const O=["packages/adapter-io/dist/src/evaluation-maintenance-host.js","packages/adapter-io/dist/src/evaluation-maintenance-host.d.ts","packages/adapter-io/dist/src/evaluation-maintenance-caller.js","packages/adapter-io/dist/src/evaluation-maintenance-caller.d.ts"];
const S=["packages/adapter-io/src/evaluation-maintenance-host.ts","packages/adapter-io/src/evaluation-maintenance-caller.ts","packages/adapter-io/src/evaluation-rebuild.ts","packages/adapter-io/src/ownership-rebuild.ts","package.json","package-lock.json"];
const hash=b=>createHash("sha256").update(b).digest("hex");let roots=[];
afterEach(async()=>Promise.all(roots.map(p=>rm(p,{recursive:true,force:true}))));
async function fx(){const r=await mkdtemp(path.join(os.tmpdir(),"ov-"));roots.push(r);const o=path.join(r,"ov"),b=path.join(r,"base");await mkdir(o);await mkdir(b);const rows=[];
for(const p of S){const x=Buffer.from("base:"+p);await mkdir(path.dirname(path.join(b,p)),{recursive:true});await writeFile(path.join(b,p),x);rows.push([hash(x),p]);}
for(const p of O){const x=Buffer.from("built:"+p);await mkdir(path.dirname(path.join(o,p)),{recursive:true});await writeFile(path.join(o,p),x);rows.push([hash(x),p]);}
const m=["schema=maintenance-caller-overlay/v1","kind=overlay-not-standalone","base_commit="+"a".repeat(40),"repository=gustavomhss/hugr-orchestra","requires=complete-built-modules-atlas-tree-at-base_commit","source_family=host-v3-plus-evaluation-implementation-v6","host_source_commit=3aa3bd492f852cbf3711b7b6fb4647316560d0ec","","[sha256-relative-to-modules-atlas]",...rows.sort((a,b)=>a[1].localeCompare(b[1])).map(x=>x[0]+"  "+x[1]),""].join("\n");await writeFile(path.join(o,"maintenance-caller-overlay-manifest.txt"),m);return {o,b,m:path.join(o,"maintenance-caller-overlay-manifest.txt")};}
const args=f=>({overlayDir:f.o,baseTree:f.b,baseCommit:"a".repeat(40),repository:"gustavomhss/hugr-orchestra",sourcePins:{}});
describe("offline overlay verifier",()=>{
it("accepts four verified outputs against explicitly supplied source tree",async()=>{const f=await fx();assert.equal((await verify(args(f))).outputs,4);});
it("rejects wrong base and repository",async()=>{const f=await fx();await assert.rejects(verify({...args(f),baseCommit:"b".repeat(40)}),/wrong base/);await assert.rejects(verify({...args(f),repository:"wrong/repo"}),/wrong repository/);});
it("rejects missing and extra files",async()=>{const f=await fx();await rm(path.join(f.o,O[0]));await assert.rejects(verify(args(f)),/exactly four/);await writeFile(path.join(f.o,"extra"),"x");await assert.rejects(verify(args(f)),/exactly four/);});
it("rejects traversal and duplicate manifest paths",async()=>{const f=await fx(),s=await readFile(f.m,"utf8"),row=s.split("\n").find(x=>/^[a-f0-9]{64}  /.test(x));await writeFile(f.m,s.replace(row,"0".repeat(64)+"  ../escape"));await assert.rejects(verify(args(f)),/unsafe path/);await writeFile(f.m,s.replace(/\n$/,"\n"+row+"\n"));await assert.rejects(verify(args(f)),/duplicate path/);});
it("rejects symlink and tampered output",async()=>{const f=await fx();await writeFile(path.join(f.o,O[0]),"tamper");await assert.rejects(verify(args(f)),/output tamper/);await rm(path.join(f.o,O[0]));await symlink(O[1],path.join(f.o,O[0]));await assert.rejects(verify(args(f)),/symlink/);});
it("rejects duplicate manifest identity fields",async()=>{const f=await fx(),s=await readFile(f.m,"utf8");await writeFile(f.m,s.replace("kind=overlay-not-standalone","kind=overlay-not-standalone\nkind=overlay-not-standalone"));await assert.rejects(verify(args(f)),/duplicate field/);});
it("rejects a mismatched base source hash",async()=>{const f=await fx();await writeFile(path.join(f.b,S[1]),"changed");await assert.rejects(verify(args(f)),/base source mismatch/);});
it("enforces immutable source SHA pins independently of the manifest",async()=>{const f=await fx();const a={...args(f),sourcePins:{"packages/adapter-io/src/evaluation-maintenance-host.ts":"f".repeat(64)}};await assert.rejects(verify(a),/source pin mismatch/);});
});
