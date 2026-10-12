# Jimmy desktop Node-sidecar evidence

## Executed result

The desktop v1 production Node-sidecar launcher executed Jimmy's native Task, source capture, finding, document publication, document reopening and verified return report on real Electron. The generated Client fetched the admitted artifact over the sidecar's real HTTP socket. Both required lanes completed the compiled-route mutation control, scoped typecheck, completion-evidence validation and artifact upload.

- Frozen production base: `4df291b7e832385257eca092a475bb1db6d3082f`.
- Executed snapshot: `70aebf7841ff7460b3111332790602e73686c3c8`.
- Snapshot tree: `5a0ad58c16e593f6600e0f06cf785d10270a459b`.
- Execution date: 2026-10-10 UTC.

| Lane | Executed run | Completion artifact | Result |
| --- | --- | --- | --- |
| `macos-15`, native arm64 | [38010270993](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38010270993) | `jimmy-desktop-macos-15-1` | Native proof, mutation, typecheck and evidence gate passed |
| `ubuntu-latest`, x64 | [38010271981](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38010271981) | `jimmy-desktop-ubuntu-latest-1` | Native proof, mutation, typecheck and evidence gate passed |

Each downloaded artifact contains `jimmy-desktop-proof.json` and `jimmy-desktop-typecheck.json`, stamped with the exact snapshot SHA and run ID. These completed records are the authoritative result; a workflow exit code or an intermediate `JIMMY_NATIVE_ASSERTED` log alone is insufficient.

## Production path exercised

```text
Build: orchestra/script/build-node.ts (src/node.ts)
  -> orchestra/dist/node/node.js
  -> electron-vite production main consumer / virtual-server resolver

Runtime:
GitHub Bun test host + scripted localhost SSE provider
  -> installed Electron executable, windowless owned main fixture
  -> desktop/src/main/server.ts: spawnLocalServer(...)
  -> electron.utilityProcess.fork(.../out/main/sidecar.js)
  -> desktop/src/main/sidecar.ts: start command
  -> virtual:orchestra-server
  -> compiled Node server built from orchestra/src/node.ts
  -> native Server.listen(...), real localhost HTTP socket
  -> native Maestro Task -> Jimmy registry/corpus/report
  -> generated Client research.artifact(...) -> retained native publication
```

`jimmy-desktop-proof.vite.ts` imports the actual `electron.vite.config.ts` main configuration. It preserves the production virtual-server resolver, server-asset copier, native-package handling, externalization and CommonJS shim. It substitutes a windowless main harness and adds an identity observer to the original sidecar entry. The main harness calls the same `spawnLocalServer` used by production `src/main/index.ts`, with its default sidecar path.

The Node server is built by the actual production `script/build-node.ts`, then consumed by electron-vite. This is an Electron utility process running the desktop's compiled sidecar, rather than the separately bundled Bun/Node packaged-proof fixture. The existing packaged fixture supplies the corpus scenario and control boundaries; its service layer is not injected into this runtime.

Built output is relocated under an owned temporary installation. Installed external dependency directories are copied, including the platform-native PTY package. Workspace source packages are rejected as unbundled runtime dependencies. Project, HOME, XDG roots, desktop profile, session profile and persistent native DB are new for each positive/control execution. Credential inheritance, external skills, default plugins, model fetching and updates are disabled; project plugin and MCP configuration is empty. The provider is a scripted localhost mechanics fixture.

## Observed process and entry identity

Both utility processes reported Electron `42.3.3`, Node `24.15.0`, `process.type = "utility"`, and the owned `native.db` path. Host assertions checked the executable paths, parent/child PID relationship, Electron's `Orchestra server` utility metrics, actual OS process command lines, exact loaded entry URLs and the absence of a Bun runtime version. Linux additionally checked `/proc/<pid>/exe`.

| Observation | macOS arm64 | Linux x64 |
| --- | --- | --- |
| Electron main PID | `16790` | `3269` |
| Native utility PID / PPID | `16798` / `16790` | `3309` / `3269` |
| Main executable | `electron/dist/Electron.app/Contents/MacOS/Electron` | `electron/dist/electron` |
| Utility executable | `Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper` | `electron/dist/electron` |
| Main entry | `.../install/packages/desktop/out/main/jimmy-desktop-proof.js` | Same relocated entry shape |
| Native utility entry | `.../install/packages/desktop/out/main/sidecar.js` | Same relocated production sidecar entry |
| Native DB | `.../jimmy-desktop-proof-iKUeaE/positive/native.db` | `.../jimmy-desktop-proof-tnC5e8/positive/native.db` |
| BrowserWindow count | `0` | `0` |

Full absolute executable, entry, cache and DB paths are retained in the uploaded records.

## Native API, skills and byte assertions

The host drove the production session API to create a Maestro parent and admit its prompt. Real provider turns invoked native `task`, two native `skill` calls, `read`, two `research_record` calls and `research_view`. Jimmy's advertised child tools included the research/read surfaces and excluded `task`, `bash` and `edit`.

The admitted source retained both the supported condition and contrary branch. The original source file was deleted after capture. Subsequent document creation, reopening and generated-client retrieval used admitted references and retained bytes. Host assertions checked:

- Jimmy execution Session, Maestro authority Session, native logical Task ID and placement binding;
- completed persisted tool calls and the native `discovery-work-result-v1` report;
- parsed final card, `referencesChecked: true`, `terminal.reason: "ended"`, citations and finding/document references;
- generated artifact HTTP `200`, exact artifact-page equality and sibling-placement HTTP `404`;
- raw retained `.body` bytes and independent host SHA-256;
- read-only inspection of the actual native SQLite DB, integrity check, Session projection and exact committed finding/document event data.

Both loaded skill files were native skill-tool loads from freshly extracted, owned cache roots and matched the frozen authored bytes:

| Skill | UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| `jimmy-discovery/SKILL.md` | 5418 | `12a3654c2d857231e19affab890baf154797c8671726ae332841fa262e4c95da` |
| `jimmy-research/SKILL.md` | 5920 | `86ee472947121612ba8372e41dd15d142673bb2e6e309a7bffd828ce5f7d2d47` |

The reopened and generated-client document was exactly:

```markdown
Résumé: Version 1 is supported [source](research:supported); disabled rejects operation [exception](research:disabled).
```

The stored body includes its final newline: **122 UTF-8 bytes**, SHA-256 **`a5f87cba3165e6087ee0495330cb4465014d82eb54ea592a2273ca820fa580a2`**. The tool page, generated-client page, admitted receipt, native event and independently read retained body agreed.

| Native receipt | macOS | Linux |
| --- | --- | --- |
| Document revision 1 | `rdoc_76a6abed191431865cf95d807c` | `rdoc_e594c8132ac23af0cb3ef938d6` |
| Artifact revision 1 | `cart_2f2dbd4eb862aaf24ce791a89d` | `cart_e8a879a246c887a60bcec5a41b` |
| Task | `tsk_1234610da001zmn3MByugpn1xu` | `tsk_123457619001Frbz73iAHxsgPe` |

## Detecting controls and cleanup

The test copies the compiled installation into a separate control installation and changes the actual compiled `/session/:sessionID/research/:artifactID` route to `/session/:sessionID/missing-native-bridge/:artifactID`. It requires at least one changed compiled file, launches that installation through the same Electron launcher with fresh placement/DB, and performs the native Task before the generated Client attempts the original artifact URL.

Both controls observed actual HTTP `404` at that original URL and rejected the generated native bridge. Both completed records contain the exact failure:

```text
Error: generated native artifact bridge failed: [object Object]
```

The changed chunks were `chunks/node-BGjSVt90.js` on macOS and `chunks/node-D1gS6PWN.js` on Linux. A network failure or a successful artifact response cannot satisfy the control's required HTTP `404` assertion.

An earlier green workflow lacked completed proof output. Snapshot CI now requires both current-run completion records and uploads them. Its missing-record failure was exercised by [38008837929](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38008837929): `Missing completed Jimmy desktop proof evidence`. The final lanes passed this strengthened completion gate with downloaded records, including the real route mutation.

Native sidecar shutdown is joined through the production listener and must report exit `0`; independent host polling then confirms OS PID disappearance. The host validates ownership of the private process group and its separation from the test host, reaps the windowless fixture with OS `SIGKILL`, and confirms owned PID disappearance. The control's finalizer checks its owned PIDs too. This establishes owned proof cleanup, not the renderer/application activation or natural desktop quit lifecycle. Build, startup, prompt, HTTP, stop and reap operations have explicit deadlines. Temporary installations/profiles/DBs are removed, and snapshot branches were cleaned by CI.

## Reach and reproduction

This evidence covers the desktop v1 production Electron Node-sidecar launcher, compiled consumer, native Jimmy Task/registry/corpus/report and generated Client HTTP artifact bridge on macOS arm64 and Linux x64. It establishes scripted mechanics. Renderer interaction, installer/archive packaging, natural application quit and real-model research quality are outside this run's reach. The supported desktop consumer proof has no remaining blocker within that scope.

The owned test and configs are `packages/desktop/src/main/jimmy-desktop-proof.{test.ts,fixture.ts,vite.ts,tsconfig.json}`. The package-local typecheck is `bun typecheck src/main/jimmy-desktop-proof.tsconfig.json`, executed by the GitHub test. The build-only V8 heap is set to 5120 MiB; that build setting is not forwarded to the Electron runtime.

Run through the GitHub snapshot harness:

```sh
bun run test:ci desktop src/main/jimmy-desktop-proof.test.ts --os macos --timeout 360000
bun run test:ci desktop src/main/jimmy-desktop-proof.test.ts --os linux --timeout 360000
```

The test rejects local execution and unsupported platforms explicitly. Production source and the live owner application were not changed or restarted.

## Repair after native omni became the default

The runs above predate `d4a32678c6`, which turned omni on by default. On `dev` after #334 the proof then failed: the Electron fixture's allow-listed environment dropped CI's `HUGR_OMNI_ADDON`/`HUGR_OMNI_SUPERVISOR`, so `spawnLocalServer`'s `sidecarEnv` could not locate the addon in the relocated install. A run of the proof file alone also failed the omni positive control (`script/test-omni-control.ts`) because the host made no omni spawn. The proof now forwards those paths and the run's `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` mode to the fixture, and its host build and typecheck children go through `DesktopOmni.execFile` whenever omni is on.

`script/test-ci-desktop.ts` (`desktopProof`) opts in on the proof's platforms (Linux, macOS arm64) for every selection that contains it. On Windows and Intel macOS a directory or whole-package run leaves it skipped. A request that names it alone still opts in there and fails with `Unsupported desktop proof platform`.

| Lane | Run | Result |
| --- | --- | --- |
| Whole-package `desktop --os both` | [38199568299](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38199568299) | Linux ran and passed the proof (artifact `jimmy-desktop-ubuntu-latest-1`); Windows skipped it; both green |
| Proof alone, `ubuntu-latest` | [38199582846](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38199582846) | Proof, typecheck and evidence gate passed |
| Proof alone, `macos-14` arm64 | [38199598119](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38199598119) | Proof, typecheck and evidence gate passed |
| Proof alone, `windows-latest` | [38199613800](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38199613800) | Fails as designed: platform refusal and missing completion record |
