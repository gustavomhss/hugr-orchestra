# Qualification handoff mutation evidence

## Baseline and scope

Source: `594820460e8f8073a3665c98efa01f605a816417`; product tree: `3eea61b50e6a3e082ac6bcc557ed5cca18585802`.
Positive control: [38072958337](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38072958337), **43 pass, 0 fail on each of Linux, Windows and macOS**, including all three qualification-handoff tests. Snapshot source: `adaba2122a88a4207196ce65605dc2476d21eea3`; tree: `07e460b3d81593605378f6be74fa29ce566b7ec2`.

The remote snapshot was queried through `gh`. Its complete recursive path/mode/type/SHA map, excluding `.ci-run.json`, matched the local baseline product tree exactly. An isolated Git index reconstructed each whole snapshot. GitHub's returned tree SHA matched the local tree SHA. Each upload changed exactly one runtime blob and `.ci-run.json`; no broad source reupload or gate edits occurred.

Both probes used Linux only, one test job each, sequentially, with this exact request:

```json
{"package":"orchestra","runner":"bun","args":["./test/research/qualification-handoff.test.ts","--timeout","120000"]}
```

## Probe 1: remove model-visible qualification packet

Mutation: `packages/orchestra/src/maestro/discovery-result.ts`, `DiscoveryResult.report` returns raw worker text. Structured work-result assembly remained intact.

- Run: [38073805111](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38073805111); job: `114276471600`; **0 pass, 3 fail**.
- Snapshot source: `eb623e88ccbcaa55be1a1375710b653bdc2ad1f1`; tree: `a5bd1a1cd096e7db1409440d39e89dc0fe0df7d9`.
- Mutated blob: `98263a73a84a9b4231993ce23cf2973005bde008`.
- Detecting tests: `native qualified Task output survives vague card; background=false` and `native qualified Task output survives vague card; background=true`.
- Both fail at `qualification-handoff.test.ts:155`, `expect(output).toContain(...)`: independently persisted native parent return lacks the quoted qualification packet despite valid metadata.
- The third test, `own exact refs reject foreign/nonfinding; lookup and UTF-8 bounds explicitly omit whole records`, also fails at line 359 because the same report bypass removes the unavailable-qualification framing.
- Full job log SHA-256: `8fcada060bc51432cd9ae688ef6a01d91a0695ea125fdebb8dd228a47c019f83`.

## Probe 2: delay document preflight until after publication

Probe 1 was restored and its baseline blob verified before Probe 2. Single boundary mutation: move `ResearchQualifications.collect` after `execution.captureBytes(... records.record(...))` in `packages/orchestra/src/tool/research-record.ts`. Collection validation and returned own-document packets remained intact.

- Run: [38074557456](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38074557456); job: `114278694152`; **2 pass, 1 fail**. Both native foreground/background handoff tests pass.
- Snapshot source: `ac5f56038c33a12578eb4626d5a345dda76ff639`; tree: `a511cbcded08b75892975e018bd251826eb76f20`.
- Mutated blob: `cfb86131d1b9c4731700b82586f8eeb8abf5ab57`.
- Detecting test: `own exact refs reject foreign/nonfinding; lookup and UTF-8 bounds explicitly omit whole records`, line 341, `expect(after).toEqual(before)`.
- The same-project foreign document attempt and exact retry still produce the expected persisted rejection, but the ledger gains a durable `research.document.published` event: title `Foreign document-linked finding`, 16 bytes, document `rdoc_a501b0552e26bde2ffaf570b2c`, durable sequence 197. Event ID: `evt_research_ee4302913c352805e2795a866d0831b5b64134476ce1a0b0de454923b60e0fcb`.
- This is direct durable-publication detection, not a missing packet, timeout, or unrelated cascade. Later filesystem assertions are not reached after the ledger assertion fails.
- Full job log SHA-256: `bcfa6ae345ae0751a2dcfc3cfc7ddcc5173e06d84c51fc11472306dbb57f69af`.

## Restoration and evidence limits

Both runtime mutations were restored before staging this document. Actual `git diff --exit-code 594820460e8f8073a3665c98efa01f605a816417 -- packages/orchestra/src packages/orchestra/test` returned zero with empty output. Direct reads confirmed packet framing, prepublication collection, exact-own ledger validation, and the unchanged public fixture. Final blob identities:

| Path under `packages/orchestra` | Restored/baseline Git blob |
| --- | --- |
| `src/maestro/discovery-result.ts` | `4bf375fa5df2ff2f4f57dd976fbc6a25092a34d1` |
| `src/tool/research-record.ts` | `352eb5f8bf7e95749692f39d9c688db7bae23535` |
| `src/research/qualifications.ts` | `9ebafb8f85716b35a754c2677c9d75c2b1c54e61` |
| `test/research/qualification-handoff.test.ts` | `557378bd0246bcbd8c45c23bafbe7eca8195bd09` |
| `test/research/fixtures/native-task.ts` | `397322d30fee04fd456f9e51a079decc39d30d58` |

Only this document is committed on `jimmy-qualification-probes`. CI cleanup deleted both temporary snapshot branches. Full failure logs and snapshot receipts are retained as untracked evidence in the isolated worktree. Exactly two detecting CI runs were submitted; no local tests, restored rerun, full suite, typecheck, live server access, private evaluator access, feature push or PR was used. These public scripted fixtures prove handoff and admission mechanics; they do not measure semantic correctness or model quality. Existing positive UTF-8/JSON-bound checks were reused without another mutation.
