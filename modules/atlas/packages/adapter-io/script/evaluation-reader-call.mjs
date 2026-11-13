// Exactly one governed read. Only the operator-configured broker constructs this envelope.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const e=JSON.parse(process.argv[2]), request=e.request;
const {id}=await import(pathToFileURL(join(e.runtime.kernel,'index.js')).href);
const expected=`evaluation-budget-${id({candidate:e.candidate,generation:e.generation,consumer:e.consumer,mode:e.mode})}.json`;
if(e.ledgerName!==expected)throw new Error('ledger-name-binding');
if(process.env.ATLAS_ACTOR!==e.actor||process.env.ATLAS_RATIFY_TOKEN!==undefined)throw new Error('reader-environment');
const {loadEvaluationAccess}=await import(pathToFileURL(join(e.runtime.adapter,'ownership-evaluation-policy.js')).href);
const {composeRuntime}=await import(pathToFileURL(join(e.runtime.adapter,'compose.js')).href);
const access=loadEvaluationAccess(e.root);access.verify();
if(access.context.evaluationCandidate!==e.candidate||access.context.generation!==e.generation||access.scope!==e.scope)throw new Error('reader-binding');
const runtime=composeRuntime(e.root,access);
const result=request.operation==='index'?runtime.ownership.index(e.scope,request.args.need):runtime.ownership.read({scope:e.scope,...request.args});
process.stdout.write(JSON.stringify(result)+'\n');
