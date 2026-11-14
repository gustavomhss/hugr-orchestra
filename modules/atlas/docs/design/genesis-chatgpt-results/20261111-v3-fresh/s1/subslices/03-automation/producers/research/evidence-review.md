# Projeção literal por necessidade — RESEARCH-L1

**Uso:** acompanhar o corpo integral `body.md`. Esta projeção seleciona precondições, estados, falhas, identidade e freshness que decidem os limites principais. Não é arquivo de todos os contratos. Para aprofundar qualquer claim, pedir **REQUEST_EVIDENCE <ID> <path/intervalo>** à principal, usando `evidence-index.json`; ela fornece o trecho literal do archive, sem exigir ferramentas do juiz. Nenhum teste foi executado e esta projeção não emite aceite.

**Identidade:** fontes no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`; E01 é histórico em `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Archive `evidence.md`, SHA-256 `e8cc0b447e48f26b3a059dc70c7ad7e607ec9b60a9af3d605e76f4c10b1da05b`. Cada bloco informa path, blob Git, SHA-256 integral e linhas originais. Prefixos de linha são apresentação; o archive contém também SHA-256 de cada intervalo original. Cortes ocorrem somente entre intervalos identificados.

**Navegação por necessidade:** aquisição/readiness E02–E10; manifests/runtimes/locks E11–E13 no archive; planejamento/store E14–E18; parser/consulta E19–E27 (adapters/resolução E22–E23 no archive); liveness E28; probes E29–E33 (runners/processo/typecheck no archive); autoridade E34–E43; contratos de teste, somente intenção, E44–E46 no archive. Pins repetitivos, fixtures e listas completas não substituem os ramos decisivos abaixo.

## E01 — Reúso histórico e lacunas originais

`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/research.md`

Blob `d7c550b41f36ba6ae001ef5f7d8c041b26854f2f` · SHA-256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`.

Linhas 1–5:

```text
1: # Pinned toolkits and retained research evidence
2: 
3: Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
4: Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
5: 
```

## E02 — Ownership, gerado e tipos de manifesto

`packages/core/src/backend-toolkit/README.md`

Blob `a7efc8b49f165ad767f51cb49ad9bdbb220215d1` · SHA-256 `c121de28e34b278db6e4868eeea3b09ab793c1aca1cdf0b5c304cc9d8a12529d`.

Linhas 5–18:

```text
5: - Engine (core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `runtimes/`.
6: - Packs (`packs/`, `entry-skills.gen.ts`) describe each pinned engine: how to acquire it and which entry skills it exposes.
7: 
8: ## Public entry points and consumers
9: 
10: - Consumers include `apps/cli/src/commands/handlers/toolkit/` and `modules/maestro/coordination/src/v2/tools/atlas-memory.ts`.
11: 
12: ## Dependencies and boundaries
13: 
14: - The engine must not import product code.
15: 
16: ## Assets, schemas and generated files
17: 
18: - `packages/core/src/backend-toolkit/entry-skills.gen.ts` is generated from `modules/specialists/backend/skills` by `packages/core/script/toolkit-pack.ts`; never edit it by hand. The `*.package-lock.json` files under `packs/` are pinned inputs.
```

## E03 — Dependências, preparo e readiness

`packages/core/src/backend-toolkit/index.ts`

Blob `e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` · SHA-256 `d420651f26050d31c924b078a59fff12081be914cb8cb94685aad720a9275d9a`.

Linhas 137–146:

```text
137: export function dependencyOrder(manifest: Readonly<Record<string, Engine>>, id: string): string[] | string {
138:   const active = new Set<string>()
139:   const done = new Set<string>()
140:   const ordered: string[] = []
141:   const visit = (current: string): string | undefined => {
142:     const engine = Object.entries(manifest).find(([key]) => key === current)?.[1]
143:     if (!engine) return `toolkit-dependency-missing:${current}`
144:     if (active.has(current)) return `toolkit-dependency-cycle:${[...active, current].join("->")}`
145:     if (done.has(current)) return
146:     active.add(current)
```

Linhas 246–279:

```text
246:         const item = manifest[dependency]
247:         const install = path.join(root, "engines", dependency, `${item.version}-${target}`)
248:         const excluded = "runtime" in item ? item.unsupported?.[target] : undefined
249:         if (excluded) return { ...base, status: "unsupported", reason: excluded } satisfies State<Id>
250:         for (const key of [requestKey(install, local), install]) {
251:           const attempt = attempts.get(key)
252:           if (attempt && "running" in attempt) return { ...base, status: "fetching", at: attempt.at, budgetMs: INSTALL_MS } satisfies State<Id>
253:           if (attempt && "failed" in attempt) {
254:             const prefix = `toolkit-not-ready:failed:${id}:`
255:             return { ...base, status: "failed", cause: dependency !== id ? `dependency:${dependency}:${attempt.failed}`
256:               : attempt.failed.startsWith(prefix) ? attempt.failed.slice(prefix.length) : attempt.failed, at: attempt.at } satisfies State<Id>
257:           }
258:         }
259:         if (yield* readiness(root, item, runtimes, install, target, local)) return { ...base, status: "absent" } satisfies State<Id>
260:       }
261:       return { ...base, status: "ready", directory, executable: executable(engine, directory, target) } satisfies State<Id>
262:     }),
263:   )
264: })
265: 
266: /** Cache markers alone are not executable readiness. Status observes; acquisition repairs launchers before success. */
267: const readiness = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId, host: boolean) {
268:   if (!(yield* PinnedArtifact.installed(directory))) return "install-incomplete"
269:   if (!(yield* fileReady(executable(engine, directory, target), target))) return "executable-missing"
270:   if ("runtime" in engine) {
271:     const runtime = runtimes[engine.runtime]
272:     const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
273:     if (!(yield* PinnedArtifact.installed(home)) || !(yield* fileReady(path.join(home, runtime.targets[target].executable), target))) return "runtime-executable-missing"
274:   }
275:   if (!host) return
276:   const file = path.join(root, "bin", target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
277:   if (!(yield* fileReady(file, target))) return "host-shim-missing"
278:   if ((yield* Effect.promise(() => readFile(file, "utf8").catch(() => undefined))) !== launchText(root, engine, runtimes, directory, target)) return "host-shim-stale"
279: })
```

## E04 — Aquisição compartilhada e cooldown

`packages/core/src/backend-toolkit/acquisition.ts`

Blob `9d55862001f9a206018a288d9847ca7d1811b2c9` · SHA-256 `11b7834f6537e1d2556136dc50306dc3bda0a3381cca07f640b5c93e2f8c54d8`.

Linhas 14–33:

```text
14:     if (attempt && "running" in attempt) return yield* Effect.promise(() => attempt.running)
15:     if (attempt && Date.now() - attempt.at < retryMs) return attempt.failed
16:     const running = Promise.withResolvers<string | undefined>()
17:     attempts.set(key, { running: running.promise, at: Date.now() })
18:     const settle = (failed?: string) => {
19:       if (failed === undefined) attempts.delete(key)
20:       if (failed !== undefined) attempts.set(key, { failed, at: Date.now() })
21:       running.resolve(failed)
22:     }
23:     // Even a runner rejection or a throwing diagnostic formatter must resolve the shared promise. Neither exposes
24:     // uninspected exception text. Effect captures finalizer rejection, defects and interruption in the Exit.
25:     void Promise.resolve().then(() => Effect.runPromiseExit(work)).then((exit) => {
26:       if (Exit.isSuccess(exit)) return settle()
27:       const formatted = Effect.runSyncExit(Effect.sync(() => describe(exit.cause)))
28:       settle(Exit.isSuccess(formatted) && formatted.value ? formatted.value : "acquisition-diagnostics-unavailable")
29:     }, () => settle("acquisition-runtime-rejected"))
30:     return yield* Effect.promise(() => running.promise)
31:   })
32:   return { once, get: (key: string) => attempts.get(key) }
33: }
```

`packages/core/src/backend-toolkit/attempts.ts`

Blob `320456d5837420999da0034870cedf86b5b8dc05` · SHA-256 `75382ae48fcc113ed71ea4a61d4122dc24b5ad5c6e4f3d5af52d3938688290eb`.

Linhas 20–25:

```text
20: // A failed fetch is retried by a later need after this window, not by every command.
21: const RETRY_MS = 5 * 60_000
22: // A cold cargo build of a CLI with its whole dependency graph takes minutes.
23: export const INSTALL_MS = 30 * 60_000
24: 
25: // Install keys coalesce shared dependencies; request keys own continuation through the entire dependency chain.
```

## E05 — Targets, pisos e detecção permissiva

`packages/core/src/backend-toolkit/target.ts`

Blob `38c19f508bf3c5ab49fdfb0e10b60d762cf9a457` · SHA-256 `fc76f5c887936816fc46826cacb01a4f19d04fe823ca16a82fac83f9337bffd7`.

Linhas 31–38:

```text
31: export function detect(host: Host = current()): { readonly target: TargetId } | { readonly unsupported: string } {
32:   if (host.platform === "linux" && host.musl) return { unsupported: "libc-musl" }
33:   if (host.platform === "win32" && host.arch === "arm64") return { unsupported: "cpu-arm64-windows" }
34:   if (host.platform === "darwin" && host.arch === "x64" && host.rosetta) return { target: "darwin-arm64" }
35:   const target = TARGETS.find((id) => id === `${host.platform}-${host.arch}`)
36:   if (!target) return { unsupported: `platform-${host.platform}-${host.arch}` }
37:   const below = floor(host)
38:   return below ? { unsupported: below } : { target }
```

Linhas 46–52:

```text
46: function floor(host: Host) {
47:   if (host.arch === "x64" && !host.avx2) return "cpu-baseline"
48:   const kernel = Number.parseInt(host.kernel, 10)
49:   if (host.platform === "darwin" && kernel < 20) return "macos-below-11"
50:   if (host.platform === "win32" && kernel < 10) return "windows-below-10"
51:   // An unreadable glibc applies no floor.
52:   if (host.platform === "linux" && host.glibc && compareVersions(host.glibc, "2.28") < 0) return "glibc-below-2.28"
```

Linhas 81–88:

```text
81: export function below(host: Host, target: TargetId, floor: Floor | undefined) {
82:   if (!floor || !target.startsWith(host.platform)) return
83:   if (host.platform === "linux" && floor.glibc && host.glibc && compareVersions(host.glibc, floor.glibc) < 0)
84:     return `glibc-below-${floor.glibc}`
85:   const major = Number.parseInt(floor.macos ?? "", 10)
86:   if (host.platform === "darwin" && major >= 11 && Number.parseInt(host.kernel, 10) < (major >= 26 ? major - 1 : major + 9)) return `macos-below-${major}`
87:   if (host.platform === "win32" && floor.windows && compareVersions(host.kernel, floor.windows) < 0)
88:     return `windows-below-${floor.windows}`
```

Linhas 129–130:

```text
129:     // bun:ffi exists only under Bun. Anywhere else there is no cheap probe, so the floor is skipped rather than guessed.
130:     if (!process.versions.bun) return true
```

## E06 — PinnedArtifact: integridade, staging e limites

`packages/core/src/pinned-artifact.ts`

Blob `360018d80541459f1a6caab9d8b2de5653411fb6` · SHA-256 `896dbe5b74a60a2bcae81e9d7b4634aad178debddfeeeb452734552cd0aa504f`.

Linhas 46–75:

```text
46: export const install = Effect.fn("PinnedArtifact.install")(function* (
47:   directory: string,
48:   artifacts: ReadonlyArray<Artifact>,
49:   populate?: (staging: string) => Effect.Effect<void, Failed>,
50: ) {
51:   if (yield* installed(directory)) return directory
52:   const parent = path.dirname(directory)
53:   yield* step("filesystem", () => mkdir(parent, { recursive: true }))
54:   const staging = yield* step("filesystem", () => mkdtemp(path.join(parent, ".staging-")))
55:   yield* Effect.gen(function* () {
56:     yield* Effect.forEach(artifacts, (artifact) => unpack(staging, artifact), { discard: true })
57:     if (populate) yield* populate(staging)
58:     yield* step("filesystem", () => writeFile(path.join(staging, ".complete"), ""))
59:     // A concurrent install may have renamed its staging dir first; its complete install wins.
60:     yield* step("filesystem", () => rename(staging, directory)).pipe(
61:       Effect.catch((error) =>
62:         installed(directory).pipe(Effect.flatMap((done) => (done ? Effect.void : Effect.fail(error)))),
63:       ),
64:     )
65:   }).pipe(Effect.ensuring(Effect.promise(() => rm(staging, { recursive: true, force: true }))))
66:   return directory
67: })
68: 
69: export const installed = (directory: string) =>
70:   Effect.promise(() =>
71:     access(path.join(directory, ".complete")).then(
72:       () => true,
73:       () => false,
74:     ),
75:   )
```

Linhas 77–95:

```text
77: const unpack = Effect.fnUntraced(function* (staging: string, artifact: Artifact) {
78:   const separator = artifact.integrity.indexOf("-")
79:   const algorithm = artifact.integrity.slice(0, separator)
80:   if (algorithm !== "sha256" && algorithm !== "sha512") return yield* new Failed({ cause: "integrity-unsupported" })
81:   if (!artifact.entries.every((entry) => contained(entry.from) && contained(entry.to)))
82:     return yield* new Failed({ cause: "layout" })
83:   const extractor = artifact.format === "raw" ? undefined : command(artifact.format)
84:   if (extractor && !(yield* Effect.promise(() => which(extractor[0], { nothrow: true }))))
85:     return yield* new Failed({ cause: `extractor-missing:${extractor[0]}` })
86: 
87:   const response = yield* Effect.tryPromise({
88:     try: () => fetch(artifact.url, { redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_MS) }),
89:     catch: () => new Failed({ cause: "download:network" }),
90:   })
91:   if (!response.ok) return yield* new Failed({ cause: `download:${response.status}` })
92:   const bytes = yield* step("download:network", async () => new Uint8Array(await response.arrayBuffer()))
93:   // Nothing from the download reaches the disk before its digest matches the pin.
94:   if (createHash(algorithm).update(bytes).digest("base64") !== artifact.integrity.slice(separator + 1))
95:     return yield* new Failed({ cause: "integrity-mismatch" })
```

## E07 — Hosted: npm/pip/source e encerramento

`packages/core/src/backend-toolkit/hosted.ts`

Blob `987657dcb1ce8d9cc9f623713673f99dd376e86c` · SHA-256 `6d3ea35691832eddb90ce8563679390a1030b71d636a01a4c5cd59ad78ebeb34`.

Linhas 39–46:

```text
39:     if (install.kind !== "jar" && !host)
40:       return yield* new PinnedArtifact.Failed({ cause: `cross-target:${install.kind}` })
41:     // The common runtime primitive owns the attempt, so capability callers and hosted engines share one download.
42:     yield* ToolkitRuntime.ensure({ root, runtime, target }).pipe(
43:       Effect.mapError((error) => new PinnedArtifact.Failed({ cause: `runtime-${error.cause}` })),
44:     )
45:     if (install.kind === "source" && install.compatibility && (engine.id !== "gocqlx-schemagen" || install.build !== "go"))
46:       return yield* new PinnedArtifact.Failed({ cause: "compatibility:cassandra-metadata:unsupported-engine" })
```

Linhas 68–70:

```text
68:                   await run(
69:                     interpreter,
70:                     [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"],
```

Linhas 87–91:

```text
87:                       "install",
88:                       "--require-hashes",
89:                       "--no-deps",
90:                       "--only-binary=:all:",
91:                       "--target",
```

Linhas 142–146:

```text
142:                 if (install.kind === "source") {
143:                   // Reject invalid builder output before PinnedArtifact publishes its complete cache.
144:                   if (!(await Effect.runPromise(fileReady(executable(engine, staging, target), target))))
145:                     throw new Error("source-executable-not-ready")
146:                   return
```

Linhas 158–166:

```text
158:             // tryPromise aborts before its Promise settles. Join the nested root's process finalizers before install()
159:             // removes staging, including interruption during the async filesystem work preceding the spawn.
160:             Effect.onInterrupt(() =>
161:               Effect.promise(
162:                 () =>
163:                   pending.work?.then(
164:                     () => undefined,
165:                     () => undefined,
166:                   ) ?? Promise.resolve(),
```

## E08 — Launchers, shims e diagnóstico

`packages/core/src/backend-toolkit/launcher.ts`

Blob `79c8f7643e6aa23fe628a597422f63d7a033aace` · SHA-256 `12a6f931b7e080fc25722c966b88822d572fd5ebec86ca52e9e8710ac59d7c36`.

Linhas 41–47:

```text
41: function launcher(windows: boolean, command: ReadonlyArray<string>, env: Readonly<Record<string, string>>, bin?: string) {
42:   const vars = Object.entries(env)
43:   if (windows)
44:     return ["@echo off", "setlocal", ...vars.map(([key, value]) => `set "${key}=${value}"`), ...(bin ? [`set "PATH=${bin};%PATH%"`] : []), `${command.map((part) => `"${part}"`).join(" ")} %*`, "exit /b %errorlevel%", ""].join("\r\n")
45:   return ["#!/bin/sh", ...vars.map(([key, value]) => `export ${key}=${quote(value)}`), ...(bin ? [`export PATH=${quote(bin)}:"$PATH"`] : []), `exec ${command.map(quote).join(" ")} "$@"`, ""].join("\n")
46: }
47: 
```

`packages/core/src/backend-toolkit/diagnostics.ts`

Blob `82c79df31ad65365a2945d516a2e890e2da0d9af` · SHA-256 `d556fb8a95fdaff9ca4ec23b8ff137f37c3a7547c8ceb4d2d83810e7c2c86814`.

Linhas 7–14:

```text
7: export function details(text: string, env: NodeJS.ProcessEnv = process.env) {
8:   const normalized = stripVTControlCharacters(text)
9:   if (OutputInspector.reason(text) || OutputInspector.reason(normalized)) return
10:   // These repository settings are boolean policy switches, not credential material (tests set the value to "0").
11:   if (Object.entries(env).some(([key, value]) => value && !/^ORCHESTRA_INHERIT_CREDENTIALS$/i.test(key) &&
12:     /(?:^|_)(?:SECRET|TOKEN|PASSWORD|CREDENTIALS?|AUTH|(?:API|ACCESS|PRIVATE|CLIENT)_KEY)$/i.test(key) &&
13:     (text.includes(value) || normalized.includes(stripVTControlCharacters(value))))) return
14:   return normalized.slice(-4096).trim()
```

## E09 — Guard de versão e parser de config

`packages/core/src/backend-toolkit/project-version.ts`

Blob `00be68470409c48e585aa1ab764e6d8872ddd44e` · SHA-256 `c82bf83182a6d03b13755e5c97eed67bf4dd8298226bd9f79277c94bff94e263`.

Linhas 33–49:

```text
33: export const checkProjectVersion = Effect.fn("BackendToolkitProject.checkProjectVersion")(function* (input: {
34:   engine: "openapi-generator"
35:   argv: readonly string[]
36:   cwd: string
37:   projectDirectory: string
38: }) {
39:   if (["validate", "version", "help", "list", "config-help"].includes(input.argv[0])) return
40:   if (input.argv[0] !== "generate") return yield* blocked("unsupported-owned-call")
41:   const options = yield* Effect.try({ try: () => generationOptions(input.argv), catch: (error) =>
42:     error instanceof Blocked ? error : blocked("unsupported-owned-call") })
43:   const root = yield* Effect.tryPromise({
44:     try: () => realpath(input.projectDirectory),
45:     catch: () => blocked("unreadable-project"),
46:   })
47:   if (input.cwd.split(/[\\/]/).includes("..")) return yield* blocked("unbound-cwd")
48:   const cwd = yield* Effect.tryPromise({ try: () => realpath(input.cwd), catch: () => blocked("unreadable-cwd") })
49:   yield* physical(root, cwd, "cwd")
```

Linhas 61–76:

```text
61:   const tools = yield* readMetadata(root, path.join(root, "openapitools.json"), "project-metadata")
62:   const project = tools === undefined ? undefined : yield* document(tools, "project-metadata", true)
63:   const cli = project?.["generator-cli"]
64:   if (cli !== undefined && (typeof cli !== "object" || cli === null || Array.isArray(cli)))
65:     return yield* blocked("malformed-project-metadata")
66:   const declared = cli !== undefined && "version" in cli ? cli.version : undefined
67:   const directory = path.resolve(cwd, output, ".openapi-generator")
68:   const metadata = yield* physical(root, directory, "output-metadata")
69:   const generated = yield* readMetadata(root, path.join(directory, "VERSION"), "output-metadata", metadata !== undefined)
70:   const pins = [declared, generated?.trim()].filter((pin) => pin !== undefined)
71:   if (pins.some((pin) => typeof pin !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pin)))
72:     return yield* blocked("malformed-version")
73:   const mismatch = pins.find((pin) => pin !== openapiGenerator.version)
74:   if (mismatch !== undefined)
75:     return yield* new Blocked({ reason: `engine-version-mismatch(project=${mismatch}, bundled=${openapiGenerator.version})` })
76: })
```

## E10 — Compatibilidade Cassandra e dialer fechado

`packages/core/src/backend-toolkit/cassandra-metadata.ts`

Blob `be309cc1fe2edeeefe82c5c042987a26622d964a` · SHA-256 `adffa5bbb4e9ab695e7879cf4db83d4982562e69aa74b60b7a016072079428cb`.

Linhas 31–45:

```text
31:   '\tif err := iter.Close(); err != nil {\n' +
32:   '\t\treturn nil, fmt.Errorf("error querying scylla table schema availability: %v", err)\n' +
33:   '\t}\n' +
34:   '\tif !hasScyllaTables {\n' +
35:   '\t\treturn tables, nil\n' +
36:   '\t}\n'
37: 
38: export function patch(source: Uint8Array) {
39:   requireHash(source, BEFORE, "driver-source")
40:   const anchor = '\n\tstmt = `SELECT * FROM system_schema.scylla_tables WHERE keyspace_name = ? AND table_name = ?`'
41:   const patched = Buffer.from(Buffer.from(source).toString("utf8").replace(anchor, `${GUARD}${anchor}`))
42:   requireHash(patched, AFTER, "patched-driver-source")
43:   return patched
44: }
45: 
```

`packages/core/src/backend-toolkit/cassandra-dialer.ts`

Blob `94282bf8f1c851b477f80a57b006df309c243c67` · SHA-256 `3943c718ce59b671dcbd21085bd1907ad5d91de0f0e2fc34e5b2d7f85dc1e2da`.

Linhas 49–69:

```text
49: func newOrchestraGeneratorDialer(text string, timeout time.Duration) (*orchestraGeneratorDialer, error) {
50: 	entries := strings.Split(text, ";")
51: 	if len(text) == 0 || len(text) > 32*213 || len(entries) > 32 {
52: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
53: 	}
54: 	routes := make(map[string]string, len(entries))
55: 	paths := make(map[string]bool, len(entries))
56: 	for _, entry := range entries {
57: 		port, encoded, ok := strings.Cut(entry, ":")
58: 		n, err := strconv.Atoi(port)
59: 		if !ok || err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port || len(encoded) == 0 || len(encoded) > 206 {
60: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
61: 		}
62: 		decoded, err := hex.DecodeString(encoded)
63: 		socket := string(decoded)
64: 		if err != nil || !utf8.Valid(decoded) || strings.ContainsRune(socket, 0) || !orchestraAbsolute(socket) || len(decoded) >= 104 {
65: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
66: 		}
67: 		if _, duplicate := routes[port]; duplicate || paths[socket] {
68: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
69: 		}
```

Linhas 99–126:

```text
99: 	parsed, err := url.Parse(proxy)
100: 	if err != nil || parsed.Scheme != "http" || parsed.Opaque != "" || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" ||
101: 		(parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1") {
102: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
103: 	}
104: 	n, err := strconv.Atoi(parsed.Port())
105: 	if err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != parsed.Port() {
106: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
107: 	}
108: 	auth := ""
109: 	if parsed.User != nil {
110: 		password, _ := parsed.User.Password()
111: 		auth = "Proxy-Authorization: Basic " + base64.StdEncoding.EncodeToString([]byte(parsed.User.Username()+":"+password)) + "\r\n"
112: 	}
113: 	return &orchestraGeneratorDialer{routes: routes, proxy: "127.0.0.1:" + parsed.Port(), auth: auth, dialer: net.Dialer{Timeout: timeout}}, nil
114: }
115: 
116: func (d *orchestraGeneratorDialer) address(network, addr string) (string, int, error) {
117: 	host, port, err := net.SplitHostPort(addr)
118: 	n, numberErr := strconv.Atoi(port)
119: 	if network != "tcp" || err != nil || host != "127.0.0.1" || numberErr != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port {
120: 		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:invalid-address")
121: 	}
122: 	socket, declared := d.routes[port]
123: 	if !declared {
124: 		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:undeclared-port")
125: 	}
126: 	return socket, n, nil
```

## E14 — Caps, default adapter, packs ausentes e warm

`packages/core/src/research-toolkit/index.ts`

Blob `a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` · SHA-256 `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c`.

Linhas 31–38:

```text
31: export const Limits = Object.freeze({
32:   indexerBytes: 2 * 1024 * 1024 * 1024,
33:   probeBytes: 1024 * 1024 * 1024,
34:   scratchBytes: 2 * 1024 * 1024 * 1024,
35:   indexBytes: 4 * 1024 * 1024 * 1024,
36:   indexCommits: 8,
37:   shardTimeoutMs: 15 * 60_000,
38: })
```

Linhas 103–108:

```text
103: }>("@orchestra/ResearchToolkit/Index", {
104:   defaultValue: () => ({
105:     plan: () => Effect.succeed([]),
106:     build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
107:   }),
108: })
```

Linhas 164–178:

```text
164: export const warm = Effect.fn("ResearchToolkit.warm")(function* (worktree: string) {
165:   const index = yield* Index
166:   const caps = yield* Caps
167:   const root = yield* Root
168:   const plan = yield* index.plan(worktree).pipe(Effect.orElseSucceed((): ReadonlyArray<Shard> => []))
169:   const pending = plan.filter((shard) => shard.state !== "ready").toSorted((a, b) => b.rank - a.rank)
170:   const engines = new Map(
171:     yield* Effect.forEach([...new Set(pending.map((shard) => shard.engine))], (engine) =>
172:       ensure(engine).pipe(
173:         Effect.match({ onSuccess: (ready) => ready, onFailure: (error) => ({ reason: error.reason }) }),
174:         Effect.map((ready) => [engine, ready] as const),
175:       ),
176:     ),
177:   )
178:   const flock = yield* EffectFlock.Service
```

## E15 — Prewarm detached, status de shard e lock

`packages/core/src/research-toolkit/index.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 149–158:

```text
149: export const prewarm: (worktree: string) => Effect.Effect<void> = (worktree) =>
150:   Effect.gen(function* () {
151:     if (warming.has(worktree)) return
152:     warming.add(worktree)
153:     yield* warm(worktree).pipe(
154:       Effect.ensuring(Effect.sync(() => warming.delete(worktree))),
155:       Effect.forkDetach,
156:     )
157:   })
158: 
```

Linhas 191–201:

```text
191:               yield* record(root, worktree, shard.id, { status: "building" })
192:               return yield* index
193:                 .build(shard, { worktree, executable: ready.executable, memoryBytes: caps.indexerBytes })
194:                 .pipe(
195:                   Effect.timeoutOrElse({
196:                     duration: caps.shardTimeoutMs,
197:                     orElse: () => Effect.fail(new ShardFailed({ reason: `timeout:${caps.shardTimeoutMs}ms` })),
198:                   }),
199:                 )
200:             }),
201:             "research-toolkit:indexer",
```

Linhas 276–281:

```text
276: const read = (root: string, worktree: string) =>
277:   Effect.promise(() => readFile(recordFile(root, worktree), "utf8").catch(() => "{}")).pipe(
278:     Effect.map((text) => Option.getOrElse(decodeRecords(text), (): typeof Records.Type => ({}))),
279:   )
280: 
281: /** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
```

Linhas 293–300:

```text
293:           const temp = `${file}.${randomUUID()}`
294:           await writeFile(temp, JSON.stringify(next))
295:           await rename(temp, file).catch(() => rm(temp, { force: true }))
296:         },
297:         catch: () => new ShardFailed({ reason: "record-write" }),
298:       }).pipe(Effect.ignore),
299:     ),
300:   )
```

## E16 — Git, descoberta e identidade de shards

`packages/core/src/research-toolkit/code-index/shard.ts`

Blob `2065d1521347762a7ea3599f97ff9c2f96d9036c` · SHA-256 `5177e7c28ec2351c637e199497126c1cf5ee19eba364705b2feedc84d27fb7f0`.

Linhas 181–204:

```text
181: export function key(shard: Shard, indexer: Indexer, tree: Tree, configs: ReadonlyMap<string, string>) {
182:   const blob = (file: string) => [file, tree.blobs.get(file)] as const
183:   const lockfiles = [...new Set([".", shard.project])].flatMap((dir) =>
184:     LOCKFILES.map((name) => path.posix.join(dir, name)).filter((file) => tree.blobs.has(file)))
185:   return createHash("sha256")
186:     .update(JSON.stringify([
187:       indexer.id, indexer.version, shard.id,
188:       shard.files.map(blob), lockfiles.map(blob), chain(shard.config, configs).map(blob),
189:     ]))
190:     .digest("hex")
191: }
192: 
193: // The config and its relative `extends` chain; package extends are pinned by the lockfiles.
194: function chain(config: string | undefined, configs: ReadonlyMap<string, string>, seen: ReadonlyArray<string> = []): string[] {
195:   if (config === undefined || seen.includes(config) || seen.length > 16) return []
196:   const text = configs.get(config)
197:   if (text === undefined || !config.endsWith(".json")) return [config]
198:   const parsed = parse(text)
199:   const extended = parsed && typeof parsed === "object" ? [parsed.extends].flat() : []
200:   return [config, ...extended
201:     .filter((entry): entry is string => typeof entry === "string" && entry.startsWith("."))
202:     .map((entry) => path.posix.normalize(path.posix.join(path.posix.dirname(config), entry.endsWith(".json") ? entry : `${entry}.json`)))
203:     .flatMap((next) => chain(next, configs, [...seen, config]))]
204: }
```

## E17 — Build, singleFlight, SQLite e retenção

`packages/core/src/research-toolkit/code-index/store.ts`

Blob `f71cdf0ae1979f002fce68b53eae445647682d73` · SHA-256 `570a81a04360d060a7c67a436e531b4c079ba7a9951130a2648ca986846b5e11`.

Linhas 75–77:

```text
75: export const file = (dir: string, shardKey: string) => path.join(dir, `${shardKey}.sqlite`)
76: 
77: export const exists = (dir: string, shardKey: string) => Effect.promise(() => Bun.file(file(dir, shardKey)).exists())
```

Linhas 184–191:

```text
184:   const sizes = new Map(yield* Effect.promise(() => readdir(dir).then((names) => Promise.all(names
185:     .filter((name) => name.endsWith(".sqlite"))
186:     .map((name) => stat(path.join(dir, name)).then((info) => [name.slice(0, -".sqlite".length), info.size] as const, () => [name.slice(0, -".sqlite".length), 0] as const))))))
187:   const kept = fit(ordered, sizes, limits.bytes)
188:   const live = new Set(kept.flatMap((entry) => entry.shards.map((shard) => shard.key)))
189:   const removed = [...sizes.keys()].filter((key) => !live.has(key))
190:   yield* Effect.promise(() => Promise.all(removed.map((key) => rm(file(dir, key), { force: true }))))
191:   yield* save(dir, kept)
```

Linhas 203–208:

```text
203: function fit(ordered: ReadonlyArray<Entry>, sizes: ReadonlyMap<string, number>, bytes: number): ReadonlyArray<Entry> {
204:   const total = [...new Set(ordered.flatMap((entry) => entry.shards.map((shard) => shard.key)))]
205:     .reduce((sum, key) => sum + (sizes.get(key) ?? 0), 0)
206:   if (total <= bytes || ordered.length <= 1) return ordered
207:   return fit(ordered.slice(0, -1), sizes, bytes)
208: }
```

## E18 — Adapter real, source worktree, estrutural e opacidade

`packages/core/src/research-toolkit/code-index/extract.ts`

Blob `ccd710035774d754490d00f36eb16c0103355175` · SHA-256 `80b2e9c6091bb6c342bfefa9582bd164fc5dffc239cdf67417dba4c0e79747af`.

Linhas 87–100:

```text
87: export function structural(
88:   indexers: Partial<Record<Language, CodeIndexShard.Indexer>>,
89:   which: (command: string) => string | null,
90:   blocked: (language: Language) => string,
91: ): Partial<Record<Language, CodeIndexShard.Indexer>> {
92:   const toolchains = { go: CodeIndexGo.TOOLCHAIN, rust: CodeIndexRust.TOOLCHAIN }
93:   return {
94:     ...indexers,
95:     ...Object.fromEntries((["go", "rust"] as const).flatMap((language) => {
96:       const missing = !indexers[language] ? blocked(language) : which(toolchains[language]) ? undefined : `toolchain-missing:${toolchains[language]}`
97:       return missing ? [[language, { id: STRUCTURAL, version: missing }] as const] : []
98:     })),
99:   }
100: }
```

Linhas 118–128:

```text
118:         ? pack.fit.languages.map((language) => [language, { id: pack.id, version: pack.version }] as const) : [])),
119:       Bun.which, () => "toolkit-not-ready:unsupported:pack-not-shipped"),
120:     }).pipe(Effect.mapError(failed))
121:     return { root, plan }
122:   }).pipe(Effect.provideService(AppProcess.Service, proc))
123:   return {
124:     plan: (worktree: string) => prepared(worktree).pipe(Effect.flatMap(({ plan }) => Effect.forEach(plan.shards, (planned) =>
125:       CodeIndexStore.exists(plan.dir, planned.key).pipe(Effect.map((ready) => {
126:         const engine = IDS.find((id) => id === planned.indexer.id)
127:         // An unbuilt shard has no file_rank yet; its file count stands in for the project's aggregated rank.
128:         return engine ? [{ id: planned.key, language: planned.shard.language, project: planned.shard.project,
```

Linhas 151–166:

```text
151: const extract = Effect.fn("CodeIndexExtract.extract")(function* (
152:   input: Parameters<CodeIndexBuild.Extract>[0],
153:   launch?: { readonly executable: string; readonly memoryBytes: number },
154: ) {
155:   const selected = CodeIndexFilter.select(input.shard.files)
156:   const read = yield* Effect.forEach(selected.files, (file) =>
157:     text(input.root, file.path).pipe(Effect.map((content) => ({ ...file, text: content }))), { concurrency: 16 })
158:   const sources = read.flatMap((file) => file.text === undefined ? [] : [{ path: file.path, grammar: file.grammar, text: file.text }])
159:   const outlines = yield* Effect.forEach(sources, (file) => CodeIndexTreeSitter.extract(file.path, file.text, file.grammar), { concurrency: 8 })
160:   const dump: Scip.Index = input.indexer.id === STRUCTURAL ? { indexer: undefined, documents: [], malformed: 0 } : yield* scip(input, launch, new Map(sources.map((file) => [file.path, file.text])))
161:   const resolver = yield* CodeIndexResolve.make(input.root)
162:   return assemble({
163:     sources, outlines, dump,
164:     resolve: resolver.resolve,
165:     skipped: [
166:       ...selected.skipped,
```

Linhas 286–295:

```text
286:   const occurrences = docs.flatMap((doc) => doc.occurrences.flatMap((occ, index): CodeIndexStore.Content["occurrences"] => {
287:     if (!indexable(occ.symbol)) return []
288:     const resolution = view.resolution(occ)
289:     const container = enclosing(doc, index)
290:     return [{
291:       symbolId: row(resolution?.kind === "resolved" ? resolution.symbol : occ.symbol),
292:       path: doc.path, line: occ.startLine, col: occ.startCol - 1, endLine: occ.endLine, endCol: occ.endCol, role: occ.role,
293:       ...(container && ids.has(container) ? { enclosingId: ids.get(container)! } : {}),
294:       opaque: false,
295:     }]
```

## E19 — Filtro e parser estrutural

`packages/core/src/research-toolkit/code-index/tree-sitter.ts`

Blob `b470c5e20ba95693296a1ac4d2520ac4bc1a10d5` · SHA-256 `b0e13b1436402cd34060218f8845de757486769df22824a357bbc05dfc39d8e2`.

Linhas 54–79:

```text
54: export const extract = Effect.fn("CodeIndexTreeSitter.extract")(function* (path: string, source: string, grammar: Grammar) {
55:   const lines = source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0)
56:   if (Buffer.byteLength(source) > MAX_BYTES)
57:     return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "too-large" } } satisfies Extract
58:   // The wasm runtime and grammar load are the genuinely fallible boundary; the pipeline survives them with a reason.
59:   const loaded = yield* Effect.promise(() => grammars().then(
60:     (value) => ({ value }),
61:     (cause: unknown) => ({ detail: cause instanceof Error ? cause.message : String(cause) }),
62:   ))
63:   if (!("value" in loaded))
64:     return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "parser-unavailable", detail: loaded.detail } } satisfies Extract
65:   const entry = loaded.value[grammar]
66:   const tree = entry.parser.parse(source)
67:   if (!tree) return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "partial-parse" } } satisfies Extract
68:   const result = {
69:     path,
70:     lines,
71:     definitions: definitions(entry.tags, tree.rootNode, grammar),
72:     imports: entry.calls ? scriptImports(entry.calls, tree.rootNode)
73:       : grammar === "go" ? CodeIndexGo.imports(tree.rootNode)
74:       : grammar === "rust" ? CodeIndexRust.imports(tree.rootNode)
75:       : pythonImports(tree.rootNode),
76:     coverage: tree.rootNode.hasError ? { complete: false, reason: "partial-parse" } : { complete: true },
77:   } satisfies Extract
78:   tree.delete()
79:   return result
```

## E20 — SCIP: arquivo regular, memo, encoding e empty helper

`packages/core/src/research-toolkit/code-index/scip.ts`

Blob `2e8f9fa18bf6661bc7510dae3106010ef0babf81` · SHA-256 `fa1f6dee8938ca64e416758acedf759e44904e1a8d6a44c0778ae610ee9f9947`.

Linhas 97–105:

```text
97:   const stat = statSync(file)
98:   if (!stat.isFile()) throw new Error(`scip: '${file}' is not a regular file, so it is not an indexer dump`)
99:   const cached = memo.get(file)
100:   if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
101:     // Map keeps insertion order: re-insert so the entry evicted below is the least recently used.
102:     memo.delete(file)
103:     memo.set(file, cached)
104:     return cached.raw
105:   }
```

Linhas 124–133:

```text
124:   const documents = raw.documents.map((doc) => {
125:     const relative = path.posix.join(prefix, doc.relativePath.replaceAll("\\", "/"))
126:     const encoding = doc.positionEncoding || DEFAULT_ENCODING[tool?.name ?? ""] || PositionEncoding.UTF16CodeUnitOffsetFromLineStart
127:     const text = encoding === PositionEncoding.UTF16CodeUnitOffsetFromLineStart ? undefined : doc.text || options?.source?.(relative)
128:     const convert = text === undefined ? (range: ReadonlyArray<number>) => range : utf16(text.split("\n"), encoding)
129:     const occurrences = doc.occurrences.flatMap((occ) => {
130:       const range = span(convert(occ.range))
131:       if (!range) return []
132:       const enclosingRange = span(convert(occ.enclosingRange))
133:       return [{ ...range, symbol: occ.symbol, role: role(occ.symbolRoles), ...(enclosingRange ? { enclosingRange } : {}) }]
```

Linhas 163–171:

```text
163:     return readScip(file, options)
164:   } catch {
165:     return { indexer: undefined, documents: [], malformed: 0 }
166:   }
167: }
168: 
169: /** The indexer name in the dump's metadata, or undefined on the same failures `readScipOrEmpty` absorbs. */
170: export function readScipIndexerName(file: string) {
171:   try {
```

## E21 — Callers, canonicalização e enclosing

`packages/core/src/research-toolkit/code-index/callers.ts`

Blob `dbfb863c0f57df3b85f33456188a1532e9cffe6c` · SHA-256 `c5f23cb31a51945af79347ffe03db97c1ff7f184abc22d99c13c852bb48ed39c`.

Linhas 111–135:

```text
111:       return Scip.isLocalSymbol(symbol) ? undefined : defs.get(symbol)
112:     },
113:     /** How a reference occurrence resolved; undefined for a definition occurrence or one from another view. */
114:     resolution(occ: Scip.Occurrence) {
115:       return resolutions.get(occ)
116:     },
117:     /** Sites of references to global symbols no shard defines. */
118:     holes: () => sorted(holes),
119:     /** Sites of collapsed local references: `coverage.opaqueSites` and `occurrence.opaque`. */
120:     opaque: () => sorted(opaque),
121:   }
122: }
123: 
124: type Group = { path: string; enclosing: string | undefined; range: Scip.Span | undefined; sites: Set<number> }
125: 
126: /** Code-unit order, so output does not depend on the host locale. */
127: function byPath(a: string, b: string) {
128:   return a < b ? -1 : a > b ? 1 : 0
129: }
130: 
131: function sorted(sites: ReadonlyArray<Site>) {
132:   return [...new Map(sites.map((site) => [`${site.path}\0${site.line}`, site])).values()].toSorted(
133:     (a, b) => byPath(a.path, b.path) || a.line - b.line,
134:   )
135: }
```

## E24 — Query: basis, stale e dirty overlay

`packages/core/src/research-toolkit/code-index/query.ts`

Blob `25d652ee0ce78d327427837466b5d7fe5886013f` · SHA-256 `ec1dd4a297e6e798c497d67ac5ed21cd4c6484e2aba3c2bed60dbd8f174f05e8`.

Linhas 119–135:

```text
119:       coverage: {
120:         documents,
121:         skipped: skipped.length > SKIPPED_LIMIT
122:           ? [...skipped.slice(0, SKIPPED_LIMIT), { path: "*", reason: `${skipped.length - SKIPPED_LIMIT} more skipped paths` }]
123:           : skipped,
124:         languagesMissing,
125:         opaqueSites: findings.hits.filter((hit) => hit.opaque).reduce((sum, hit) => sum + (hit.sites?.length ?? 1), 0),
126:         complete: skipped.length === 0 && languagesMissing.length === 0,
127:       },
128:       freshness: scope.ready.some((ready) => ready.stale) ? "stale"
129:         : paths.some((file) => file !== undefined && scope.dirty.has(file)) ? "dirty-overlay" : "fresh",
130:       bounds: { limit, truncated: offset + limit < findings.hits.length },
131:     },
132:   }
133:   return result
134: })
135: 
```

Linhas 187–226:

```text
187:     const choices = yield* Effect.forEach(shards, (planned) => Effect.gen(function* () {
188:       if (yield* CodeIndexStore.exists(plan.dir, planned.key)) return { planned, key: planned.key } satisfies Ready
189:       const previous = records.flatMap((record) => record.shards
190:         .filter((shard) => shard.id === planned.shard.id && shard.key !== planned.key)
191:         .map((shard) => ({ commit: record.commit, key: shard.key })))
192:       const present = yield* Effect.forEach(previous, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
193:       const fallback = previous.find((_, index) => present[index])
194:       const reason = failed.get(planned.key)
195:       if (reason !== undefined) skipped.push({ path: planned.shard.project, reason: `index-failed: ${reason}` })
196:       if (fallback) return { planned, key: fallback.key, stale: fallback.commit } satisfies Ready
197:       if (reason === undefined) skipped.push({ path: planned.shard.project, reason: "index-building" })
198:       return undefined
199:     }))
200:     const missing = choices.some((choice) => choice === undefined || choice.stale)
201:     const progress = CodeIndexBuild.building(plan.dir)
202:     const building = progress !== undefined || shards.some((planned) => CodeIndexStore.building(ctx.storeRoot, planned.key))
203:     // A failed build is retried by the next query that finds the shard still missing; the build is single-flight.
204:     if (missing && !building && ctx.extract)
205:       yield* Effect.forkDetach(CodeIndexBuild.build({ ...ctx, extract: ctx.extract }).pipe(Effect.ignore))
206:     const ready = choices.filter((choice): choice is NonNullable<typeof choice> => choice !== undefined)
207:     if (ready.length === 0) {
208:       const cause = [...failed.values()][0]
209:       if (cause !== undefined && !building)
210:         return yield* new Research.Error({ code: "index_unavailable", message:
211:           `Index build failed${ctx.extract ? " (retrying)" : ""}: ${cause}` })
212:       if (building || ctx.extract)
213:         return yield* new Research.Error({ code: "index_building", message:
214:           `Index is building: shardsDone ${progress?.shardsDone ?? 0} of shardsTotal ${progress?.shardsTotal ?? shards.length}` +
215:           (cause === undefined ? "" : `; last attempt failed: ${cause}`) })
216:       return yield* new Research.Error({ code: "index_unavailable", message: "Index has not been built for this commit" })
217:     }
218:     if (!missing) yield* CodeIndexStore.touch(plan.dir, plan.commit)
219:     const stale = [...new Set(ready.flatMap((choice) => choice.stale ? [choice.stale] : []))]
220:     const changes = new Set((yield* Effect.forEach(stale, (from) => CodeIndexShard.changed(ctx.git, from, plan.commit))).flat())
221:     ready.filter((choice) => choice.stale).forEach((choice) =>
222:       choice.planned.shard.files.filter((file) => changes.has(file)).forEach((file) => skipped.push({ path: file, reason: "changed-since-index" })))
223:     return yield* overlay(ctx, plan, ready, skipped)
224:   })
225: }
226: 
```

## E25 — Query: resolução, hits e limites de overlay

`packages/core/src/research-toolkit/code-index/query.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 228–247:

```text
228: function overlay(ctx: Context, plan: CodeIndexBuild.Plan, ready: ReadonlyArray<Ready>, skipped: Array<{ path: string; reason: string }>) {
229:   return Effect.gen(function* () {
230:     const changes = yield* CodeIndexShard.dirty(ctx.git)
231:     const owner = (file: string) => ready
232:       .filter((choice) => choice.planned.shard.files.includes(file) ||
233:         (CodeIndexShard.language(file) === choice.planned.shard.language && within(file, choice.planned.shard.project)))
234:       .sort((a, b) => b.planned.shard.project.length - a.planned.shard.project.length)[0]
235:     const owned = changes.flatMap((change) => {
236:       const choice = owner(change.path)
237:       return choice ? [{ ...change, choice }] : []
238:     })
239:     const groups = Map.groupBy(owned.filter((change) => !change.deleted), (change) => change.choice)
240:     const files = (yield* Effect.forEach([...groups], ([choice, entries]) =>
241:       ctx.overlay({ root: ctx.root, shard: choice.planned.shard, paths: entries.map((entry) => entry.path) }))).flat()
242:     const digest = owned.length === 0 ? undefined : yield* Effect.promise(async () => {
243:       const hash = createHash("sha256")
244:       for (const change of owned.toSorted((a, b) => a.path.localeCompare(b.path)))
245:         hash.update(change.path).update("\0").update(change.deleted ? "deleted" : new Uint8Array(await Bun.file(path.join(ctx.root, change.path)).arrayBuffer().catch(() => new ArrayBuffer(0)))).update("\0")
246:       return hash.digest("hex")
247:     })
```

Linhas 417–422:

```text
417:     const overlaid = [...scope.overlay.values()].flatMap((entry) => entry.symbols).filter(keep)
418:     if (query.name !== undefined) {
419:       const name = query.name
420:       const ranked = (yield* fuzzy(scope, name)).filter(keep)
421:       const local = overlaid.filter((ref) => CodeIndexStore.tokens(ref.name).includes(CodeIndexStore.tokens(name)))
422:       return { candidates: [], hits: [...ranked, ...local].map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })) }
```

Linhas 429–437:

```text
429:     const rows = yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE path IN (SELECT path FROM document)
430:       ${filters.map((filter) => `AND ${filter.sql}`).join(" ")} ORDER BY path, start_line, id`, filters.flatMap((filter) => filter.params)))
431:     const stored = rows.flatMap(definitions).map((entry) => entry.ref).filter((ref) => !scope.dirty.has(ref.range.path))
432:     return {
433:       candidates: [],
434:       hits: [...stored, ...overlaid]
435:         .sort((a, b) => a.range.path.localeCompare(b.range.path) || a.range.startLine - b.range.startLine)
436:         .map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })),
437:     }
```

## E26 — Busca lexical e limites de captura

`packages/core/src/research-toolkit/search.ts`

Blob `c02ca1932f9782f4a2c141a892db5938b3d2c514` · SHA-256 `5d69897854d3c3ef0b305f4977163233ff73eea0525ad40a2b1d9b606f97cc93`.

Linhas 50–54:

```text
50:     "--glob=!**/.git/**",
51:     ...(input.paths ?? []).map((glob) => `--glob=${glob.replace(/^(?:\.[\\/])+/u, "")}`),
52:     // -e keeps a pattern that starts with "-" from being read as an option; the explicit root stops rg reading stdin.
53:     "-e", input.pattern, "--", ".",
54:   ]
```

Linhas 73–85:

```text
73:     if (result.exitCode === 2 && /regex parse error|error parsing regex/.test(stderr))
74:       return yield* new Failure({ reason: "pattern_invalid", message: stderr })
75:     // Exit 2 with some output is a partial search (unreadable files); it is reported as incomplete below.
76:     if (result.exitCode > 2) return yield* new Failure({ reason: "search_failed", message: stderr || `ripgrep exited ${result.exitCode}` })
77: 
78:     // ripgrep skips binary files without a trace, so the files that match only as binary come from a second pass.
79:     const binaryPass = yield* process
80:       .run(ChildProcess.make(command, argv(input, true), { cwd: options.cwd, extendEnv: true, stdin: "ignore" }), {
81:         maxOutputBytes: MAX_STDOUT,
82:         maxErrorBytes: 8 * 1024,
83:         signal: options.signal,
84:       })
85:       .pipe(Effect.mapError((cause) => new Failure({ reason: "search_failed", message: cause.message })))
```

Linhas 101–122:

```text
101:     const incomplete = result.exitCode === 2 || result.stdoutTruncated || (result.outputTruncated ?? false)
102:     return {
103:       matches,
104:       ...(more ? { next: offset + limit } : {}),
105:       basis: {
106:         basis: { commit: options.commit ?? "unversioned", shards: [] },
107:         execution: { op: "code_search", ms: Date.now() - started },
108:         coverage: {
109:           documents: parsed.searched,
110:           skipped: incomplete
111:             ? [{ path: ".", reason: result.exitCode === 2 ? "ripgrep could not read some paths" : "output ceiling reached" }]
112:             : [],
113:           languagesMissing: [],
114:           opaqueSites: 0,
115:           // Absence is claimable only from a search that ran to its end; a page cut by limit does not count.
116:           complete: !incomplete && !more,
117:           ignoreRespected: true,
118:           binariesSkipped: binaryFiles.filter((file) => !seen.has(file)).length,
119:         },
120:         freshness: "fresh" as const,
121:         bounds: { limit, truncated: more },
122:       },
```

## E27 — Locate: budget, ranking e verificação

`packages/core/src/research-toolkit/locate.ts`

Blob `d1343801f7b336d5e5b46eac860f6a07a0ae19fa` · SHA-256 `0ebac9d228ca1764020e0f7ccf260228dc02c1169c0143c07f258e7c7ac650f2`.

Linhas 37–43:

```text
37: export const MAX_SEARCHES = 32
38: export const DEFAULT_LIMIT = 12
39: const RRF_K = 60
40: const PER_FILE = 3
41: const CONTEXT = 3
42: const PAGE = 50
43: const SEEDS = 5
```

Linhas 228–250:

```text
228: function valid(unit: CodeIndex.Range, check: NonNullable<Unit["check"]>, lines: ReadonlyArray<string>) {
229:   return unit.startLine <= check.line && check.line <= unit.endLine && check.line <= lines.length &&
230:     lines[check.line - 1].includes(check.text)
231: }
232: 
233: function order(left: { score: number } & CodeIndex.Range, right: { score: number } & CodeIndex.Range) {
234:   return right.score - left.score || left.path.localeCompare(right.path) || left.startLine - right.startLine
235: }
236: 
237: function basis(lists: ReadonlyArray<List>, run: { indexed: boolean; ms: number; limit: number; discarded: number; truncated: boolean
238:   files: ReadonlyArray<string> }): CodeIndex.Basis {
239:   const bases = lists.flatMap((list) => list.basis ? [list.basis] : [])
240:   const freshness = bases.map((item) => item.freshness)
241:   // Without an index, the languages of the files the lexical lists reached are the ones no index served.
242:   const missing = run.indexed ? [] : run.files.flatMap((file) => LANGUAGES[file.split(".").at(-1) ?? ""] ?? [])
243:   return {
244:     basis: {
245:       commit: bases.find((item) => item.basis.commit)?.basis.commit ?? "",
246:       ...(bases.find((item) => item.basis.dirtyDigest) ? { dirtyDigest: bases.find((item) => item.basis.dirtyDigest)!.basis.dirtyDigest } : {}),
247:       shards: [...new Map(bases.flatMap((item) => item.basis.shards).map((shard) => [shard.id, shard])).values()],
248:     },
249:     execution: { op: "locate", ms: run.ms, semantic: "absent" },
250:     coverage: {
```

## E28 — Liveness: alcance, HTTP, DNS e limites

`packages/core/src/research-toolkit/liveness.ts`

Blob `3b6335d550f6979d9aca63cd0e524b3e43b0a9b2` · SHA-256 `9703355fbfac94a32110e810f0843ce22285895cc45b8da3f534f36a61f772af`.

Linhas 54–64:

```text
54:   const queue = unique.filter((url) => {
55:     if (!fresh.has(normal(url))) return true
56:     results.set(url, { url, status: "LIVE", reason: "captured in this dispatch less than 24 h ago" })
57:     return false
58:   })
59:   // A bounded pool: at most `parallel` requests in flight.
60:   const workers = Array.from({ length: Math.min(Limits.parallel, queue.length) }, async () => {
61:     for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
62:       const outcome = await probe(url, options.privateNetwork === true)
63:       const status = outcome.status === "DEAD" && !seen.has(normal(url)) ? "LIKELY_HALLUCINATED" : outcome.status
64:       results.set(url, { url, ...outcome, status })
```

Linhas 89–94:

```text
89:     if (response.status >= 200 && response.status < 300) return { status: "LIVE", httpStatus: response.status, reason: "reachable" }
90:     // A rate limit says nothing about whether the page exists.
91:     if (response.status === 429) return { status: "UNKNOWN", httpStatus: 429, reason: "rate limited" }
92:     return { status: "DEAD", httpStatus: response.status, reason: `HTTP ${response.status}` }
93:   }
94:   return { status: "DEAD", reason: `more than ${Limits.redirects} redirects` }
```

Linhas 111–116:

```text
111: async function refusal(host: string, privateNetwork: boolean): Promise<Outcome | undefined> {
112:   const name = host.replace(/^\[|\]$/g, "").toLowerCase()
113:   if (!privateNetwork && /(^|\.)(localhost|local|internal|localdomain)$/.test(name)) return { status: "UNKNOWN", reason: "local host refused by policy" }
114:   const addresses = isIP(name) ? [name] : await lookup(name, { all: true }).then((list) => list.map((item) => item.address), (error: NodeJS.ErrnoException) => error)
115:   if (addresses instanceof Error) return { status: addresses.code === "EAI_AGAIN" ? "UNKNOWN" : "DEAD", reason: `DNS ${addresses.code ?? "failure"}` }
116:   if (!privateNetwork && addresses.some(isPrivate)) return { status: "UNKNOWN", reason: "private address refused by policy" }
```

## E29 — Probe: contrato fechado, execução e verdict

`packages/core/src/research-toolkit/probe/types.ts`

Blob `a3859179186c2e7f55aa401fa4b3f091540eaffe` · SHA-256 `7946f380ef918f065273afa09304cdf61da2d88d78bb287cff0ad5812e45c3e6`.

Linhas 10–21:

```text
10: export const Limits = Object.freeze({
11:   heapMiB: 1024,
12:   /** Resident memory of the whole probe tree, enforced by omni (J4.7, D2). */
13:   rssBytes: 1024 * 1024 * 1024,
14:   scratchBytes: 2 * 1024 * 1024 * 1024,
15:   outputBytes: 1024 * 1024,
16:   tailBytes: 64 * 1024,
17:   scriptBytes: 16 * 1024,
18:   perDispatch: 1,
19:   perHost: 2,
20:   queueSeconds: 30,
21: })
```

`packages/core/src/research-toolkit/probe/run.ts`

Blob `be267f2f07e4c59a2b69f58b98ddc9499dd550ab` · SHA-256 `80ece4f75445501ac55ecc69bee4a00ca46f88bf931ba0b1f71c6ec5aa53f73c`.

Linhas 42–64:

```text
42: export const run = Effect.fn("Probe.run")(function* (input: Probe.ProbeInput, context: Context) {
43:   if (process.platform !== "darwin" && process.platform !== "linux")
44:     return yield* new ProbeError({ code: "probe_unsupported_platform", reason: process.platform })
45:   const seconds = Math.min(input.timeoutSeconds ?? context.remainingSeconds, context.remainingSeconds)
46:   if (!(seconds > 0)) return yield* denied("allowance-exhausted")
47:   yield* slot(context.dispatchID, context.queueSeconds ?? Probe.Limits.queueSeconds)
48:   const probeID = Bun.randomUUIDv7()
49:   const scratch = yield* Effect.acquireRelease(
50:     Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-probe-")).then((made) => realpath(made))),
51:     (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
52:   )
53:   const snapshot = yield* ProbeSnapshot.create({ worktree: context.worktree, snapshot: input.snapshot, scratch, maxBytes: Probe.Limits.scratchBytes })
54:   const env = ResearchProcess.environment()
55:   const plan = yield* ProbeRunners.plan({ runner: input.runner, snapshot, scratch, heapMiB: context.heapMiB ?? Probe.Limits.heapMiB, unused: context.unused, env })
56:   const launch = yield* ToolSafetySandbox.confine({ command: plan.argv[0], args: plan.argv.slice(1), cwd: plan.cwd, env: { ...env, ...plan.env }, write: [] }).pipe(
57:     Effect.mapError((error) => error.reason.startsWith("sandbox-platform-unsupported")
58:       ? new ProbeError({ code: "probe_unsupported_platform", reason: error.reason })
59:       : denied(`jail-unavailable: ${error.reason}`)))
60:   const outcome = yield* ResearchProcess.run({
61:     command: launch.command, args: launch.args, cwd: plan.cwd,
62:     env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
63:     timeoutMs: seconds * 1000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: context.rssBytes ?? Probe.Limits.rssBytes,
64:   })
```

Linhas 95–110:

```text
95: export function memoryCap(): Probe.ProbeResult["memoryCap"] {
96:   return Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off" ? "rss" : "heap-only"
97: }
98: 
99: function verdict(expect: Probe.ProbeInput["expect"], outcome: ResearchProcess.Outcome, text: string, diagnostics?: ReadonlyArray<ProbeTypecheck.Diagnostic>): Probe.Verdict {
100:   if (outcome.timedOut) return "timeout"
101:   if (outcome.memoryExceeded) return "memory_exceeded"
102:   if (outcome.failure !== undefined || outcome.overflow) return "error"
103:   if (text.includes(GUARD)) return "blocked_by_repo_guard"
104:   if (!expect) return outcome.exitCode === 0 ? "passed" : "failed"
105:   const code = (value: string) => value.replace(/^TS/i, "")
106:   const met = (expect.exitCode === undefined || expect.exitCode === outcome.exitCode) &&
107:     (expect.stdoutIncludes === undefined || outcome.stdout.data.toString("utf8").includes(expect.stdoutIncludes)) &&
108:     (expect.stderrIncludes === undefined || outcome.stderr.data.toString("utf8").includes(expect.stderrIncludes)) &&
109:     (expect.diagnosticCode === undefined || (diagnostics ?? []).some((item) => code(item.code) === code(expect.diagnosticCode!)))
110:   return met ? "reproduced" : "not_reproduced"
```

## E31 — Snapshots e dependências compartilhadas

`packages/core/src/research-toolkit/probe/snapshot.ts`

Blob `0e89bf342e5c4567c4c2cfc180a3d3961ffec91e` · SHA-256 `c376cc01e1e893d3fac7cff70f6858888b29145546e36c36ce4d4b0a4655ea77`.

Linhas 94–113:

```text
94:     return hasher.digest("hex")
95:   }) : undefined
96:   return { revision, dirtyDigest, paths: present.map((entry) => entry.file) }
97: })
98: 
99: /** Dependency directories of the original enter as symlinks, at the root and next to every package.json. */
100: const link = Effect.fnUntraced(function* (repo: string, root: string, paths: ReadonlyArray<string>) {
101:   const dirs = new Set(["", ...paths.filter((file) => path.basename(file) === "package.json" && !file.split("/").some((part) => DEPENDENCIES.includes(part)))
102:     .map((file) => path.dirname(file)).map((dir) => (dir === "." ? "" : dir))])
103:   yield* Effect.forEach([...dirs].flatMap((dir) => DEPENDENCIES.map((name) => path.join(dir, name))), (relative) => Effect.promise(async () => {
104:     const source = path.join(repo, relative)
105:     const stat = await lstat(source).catch(() => undefined)
106:     if (!stat?.isDirectory()) return
107:     if (await lstat(path.join(root, relative)).then(() => true, () => false)) return
108:     await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
109:     await symlink(source, path.join(root, relative))
110:   }), { concurrency: 16, discard: true })
111: })
112: 
113: const fail = (error: ResearchProcess.Failed) => denied(`snapshot-git-failed: ${error.command}: ${error.detail}`)
```

## E34 — Binding nativo e invocação persistida

`packages/core/src/research/binding.ts`

Blob `5f5c7f92d7ade9c902d54c0e9bce713871952e78` · SHA-256 `b64e476309f22af194c1459389814939887c117819be494adaac0b2fa73d1701`.

Linhas 25–32:

```text
25:   if (!session || session.project_id !== projectID || session.agent !== "jimmy")
26:     return yield* new Research.Error({ code: "not_found", message: "Research binding not found" })
27:   const rows = yield* database.db.select().from(EventTable).where(and(
28:     eq(EventTable.aggregate_id, sessionID),
29:     eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
30:   )).all().pipe(Effect.orDie)
31:   if (rows.length !== 1)
32:     return yield* new Research.Error({ code: "binding_missing", message: "Retained task binding is missing or ambiguous" })
```

Linhas 49–52:

```text
49:   if (bound.memberID !== "jimmy" || bound.projectID !== projectID || bound.executionSessionID !== sessionID ||
50:     !authority || authority.project_id !== projectID ||
51:     (session.parent_id ?? session.id) !== authority.id)
52:     return yield* new Research.Error({ code: "binding_mismatch", message: "Retained task placement does not match" })
```

Linhas 65–76:

```text
65: export const require = Effect.fn("ResearchBinding.require")(function* (binding: Research.Binding, context: Tool.Context) {
66:   const frame = yield* CapabilityInvocation.require(context, {
67:     projectID: binding.projectID, location: { directory: binding.directory },
68:   }).pipe(Effect.mapError((error) => new Research.Error({
69:     code: error.code === "invocation_binding_missing" ? "binding_missing" : "binding_mismatch",
70:     message: "Research invocation is not bound",
71:   })))
72:   if (frame.owner.agentID !== "jimmy" || context.agent !== "jimmy" || context.sessionID !== binding.executionSessionID)
73:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research invocation owner does not match" })
74:   const retained = yield* resolve(binding.executionSessionID, binding.projectID)
75:   if (!isDeepStrictEqual(retained, binding))
76:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research binding does not match retained placement" })
```

Linhas 100–103:

```text
100:   if (assistant?.type === "assistant" && assistant.agent === "jimmy" && assistant.content.some((part) =>
101:     part.type === "tool" && part.id === context.toolCallID && part.name === frame.rootToolName))
102:     return retained
103:   return yield* new Research.Error({ code: "binding_missing", message: "Native assistant/tool part is missing" })
```

## E35 — Allowance, charge idempotente e reserva irreversível

`packages/core/src/research/allowance.ts`

Blob `2a2b412f57e8b34016ff5bdbfe6f638e9616cf80` · SHA-256 `177b564304a9d79e9144da70a6c97107b604d40dde16ae8185467d801fd3c3eb`.

Linhas 117–142:

```text
117:     const charge: Interface["charge"] = Effect.fn("ResearchAllowance.charge")((allowance, kind, operation, amount = 1) =>
118:       Effect.gen(function* () {
119:         if (!operation.trim() || operation.length > 256 || !Number.isSafeInteger(amount) || amount < 0 ||
120:           (kind !== "bytes" && kind !== "probe" && amount !== 1))
121:           return yield* new Research.Error({ code: "over_cap", message: "Invalid allowance charge operation or amount" })
122:         const data = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)({
123:           sessionID: allowance.binding.executionSessionID, dispatchCallID: allowance.dispatchCallID, operation, kind, amount,
124:         })
125:         yield* bound(allowance)
126:         const retry = yield* charged(allowance, operation)
127:         if (retry) {
128:           if (isDeepStrictEqual(retry, data)) return
129:           return yield* new Research.Error({ code: "conflict", message: "Charge operation was reused with different kind or amount" })
130:         }
131:         yield* events.publish(ResearchEvent.AllowanceCharged, data, {
132:           id: eventID("charged", data.sessionID, data.dispatchCallID, operation),
133:           persist: true,
134:           // EventV2 runs this callback before insertion under BEGIN IMMEDIATE on the same native connection.
135:           // A preflight total outside this transaction would allow concurrent tools to overspend.
136:           commit: () => Effect.gen(function* () {
137:             yield* bound(allowance)
138:             const used = yield* spent(allowance, kind)
139:             const limit = kind === "provider" ? allowance.providerLimit : kind === "tool" ? allowance.toolLimit
140:               : kind === "probe" ? allowance.probeSecondsLimit : allowance.byteLimit
141:             if (!Number.isSafeInteger(used) || amount > limit - used)
142:               return yield* Effect.die(new Research.Error({ code: "budget_exhausted", message: `Research ${kind} allowance exhausted (${used}/${limit}); retained work remains available` }))
```

Linhas 155–163:

```text
155:         yield* bound(allowance)
156:         const reservation = yield* charged(allowance, operation)
157:         if (!reservation || reservation.kind !== "bytes")
158:           return yield* new Research.Error({ code: "binding_missing", message: "Byte reservation is not admitted" })
159:         if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > reservation.amount)
160:           return yield* new Research.Error({ code: "over_cap", message: "Observed bytes exceed reservation or are invalid" })
161:         // The frozen ledger has no credit event. Even a known unused remainder stays charged; uncertain
162:         // publication and repeated reconciliation cannot release bytes or admit a second write for free.
163:       }).pipe(researchFailure),
```

## E36 — Ledger, escopo, dispatch, retenção e replay

`packages/core/src/research/ledger.ts`

Blob `6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` · SHA-256 `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839`.

Linhas 62–84:

```text
62: export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
63:   const database = yield* Database.Service
64:   const rows = yield* database.db.select().from(EventTable).where(and(
65:     inArray(EventTable.type, types),
66:     sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
67:     executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
68:     explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
69:       json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
70:       json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
71:       json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
72:       json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
73:   )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
74:   return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
75:     id: row.id, type: row.type.slice(0, -2), data: row.data,
76:     durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
77:   }).pipe(
78:     Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
79:     Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
80:       (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
81:       ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
82:       : Effect.succeed(entry)),
83:   ))
84: })
```

Linhas 145–157:

```text
145: export const retained = Effect.fn("ResearchLedger.retained")(function* (binding: Research.Binding) {
146:   const actual = yield* ResearchBinding.resolve(binding.executionSessionID, binding.projectID)
147:   if (!isDeepStrictEqual(actual, binding))
148:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research placement changed" })
149:   return actual
150: })
151: 
152: export function replay(entries: readonly Entry[], operation: string, inputHash: string) {
153:   const found = entries.filter((entry) => entry.data.operation === operation)
154:   if (found.length > 1 || found.some((entry) => entry.data.inputHash !== inputHash))
155:     throw new Research.Error({ code: "conflict", message: "Research operation was reused with different input" })
156:   return found[0]
157: }
```

## E37 — Custódia e admissão são contratos diferentes

`packages/core/src/research/artifacts.ts`

Blob `7c8bb90f269ad00d3779923dd1d8211e3d4edbd4` · SHA-256 `57e6e7d99c507014c52b887d21dfe766311a1a20a5e3e24837665fed7091d24f`.

Linhas 85–94:

```text
85:     yield* retained(binding)
86:     const admitted = (yield* entries(binding, ref.id, scope)).filter((entry) => {
87:       if (entry.type === "research.source.admitted") return entry.data.receipt.ref.artifact.revision === ref.revision
88:       if (entry.type === "research.document.published") return entry.data.receipt.artifact.revision === ref.revision
89:       return false
90:     })
91:     const event = admitted[0]
92:     if (admitted.length !== 1 || !event || event.type === "research.record.committed")
93:       return yield* new Research.Error({ code: "not_found", message: "Research artifact not found" })
94:     yield* retained(event.data.binding)
```

Linhas 104–112:

```text
104:         if (manifest.operation !== event.data.operation || manifest.ref.id !== ref.id || manifest.ref.revision !== ref.revision || manifest.digest !== digest ||
105:           manifest.representation !== representation || manifest.bytes !== receipt.bytes ||
106:           ResearchLedger.canonical(manifest.binding) !== ResearchLedger.canonical(event.data.binding))
107:           throw new Error("Manifest differs from admission")
108:         const body = await bytes(path.join(root, `${ref.id}-${ref.revision}.body`), Research.Limits.sourceBytes)
109:         if (body.byteLength !== receipt.bytes || ResearchLedger.digest(body) !== digest) throw new Error("Body differs from admission")
110:         return body
111:       },
112:       catch: () => new Research.Error({ code: "source_unavailable", message: "Admitted research bytes are missing or corrupt" }),
```

Linhas 134–145:

```text
134:     // Validate the whole admitted representation before returning any textual page; binary is never replacement-decoded.
135:     yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(stored.content),
136:       catch: () => new Research.Error({ code: "unsupported", message: "Research artifact is not supported UTF-8 text" }) })
137:     const end = Math.min(offset + Research.Limits.pageBytes, stored.content.byteLength)
138:     const boundary = end === stored.content.byteLength ? end : end - ([0, 1, 2, 3].find((back) => (stored.content[end - back] & 0xc0) !== 0x80) ?? 0)
139:     const next = boundary < stored.content.byteLength ? Buffer.from(ResearchLedger.canonical({
140:       bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), ref: stored.ref, digest: stored.digest, representation: stored.representation,
141:       offset: boundary, size: Research.Limits.pageBytes,
142:     })).toString("base64url") : undefined
143:     return {
144:       ref: stored.ref, representation: stored.representation, text: stored.content.subarray(offset, boundary).toString("utf8"), receipt: stored.receipt,
145:       complete: next === undefined && (stored.event.type !== "research.source.admitted" || stored.event.data.receipt.complete),
```

## E38 — Intent estável e filesystem imutável

`packages/core/src/research/artifacts.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 174–190:

```text
174:         const reconcile = async () => {
175:           const saved = Schema.decodeUnknownSync(Schema.fromJsonString(ResearchLedger.Entry))((await bytes(filename, Research.Limits.eventBytes)).toString("utf8"))
176:           if (saved.type !== entry.type || saved.id !== entry.id || saved.data.operation !== entry.data.operation ||
177:             saved.data.inputHash !== entry.data.inputHash || ResearchLedger.canonical(saved.data.binding) !== ResearchLedger.canonical(binding))
178:             throw new Research.Error({ code: "conflict", message: "Research intent was reused with different input" })
179:           return saved
180:         }
181:         const existing = await reconcile().catch((error: unknown) => {
182:           if (missing(error)) return undefined
183:           throw error
184:         })
185:         if (existing) return existing
186:         await publish(filename, Buffer.from(ResearchLedger.canonical(entry))).catch((error: unknown) => {
187:           // Concurrent identical intent may differ only in its host capture/publication timestamp.
188:           if (!(error instanceof Research.Error && error.code === "conflict")) throw error
189:         })
190:         return reconcile()
```

Linhas 237–255:

```text
237: async function publish(filename: string, content: Buffer) {
238:   const staging = `${filename}.${randomUUID()}.staging`
239:   const file = await fs.open(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
240:   try {
241:     try {
242:       await file.writeFile(content)
243:       await file.sync()
244:     } finally {
245:       await file.close()
246:     }
247:     await fs.link(staging, filename).catch(async (error: unknown) => {
248:       if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
249:       if (!(await bytes(filename, content.byteLength)).equals(content))
250:         throw new Research.Error({ code: "conflict", message: "Immutable research artifact already has different bytes" })
251:     })
252:   } finally {
253:     await fs.unlink(staging)
254:   }
255: }
```

## E39 — Records e locators de evidência

`packages/core/src/research/records.ts`

Blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d`.

Linhas 103–115:

```text
103:   const evidence = Effect.fn("ResearchRecords.evidence")(function* (binding: Research.Binding, ref: Research.EvidenceRef) {
104:     const content = yield* source(binding, ref.source)
105:     // A code_locate snapshot holds ranges of many worktree files: original lines resolve inside one of its ranges.
106:     const snapshot = ref.locator.kind === "lines" && ref.locator.basis === "original" && "origin" in content.receipt &&
107:       content.receipt.origin.kind === "file" && content.receipt.origin.uri === binding.worktree ? Locate.blocks(content.text) : undefined
108:     if (snapshot && ref.locator.kind === "lines") {
109:       const lines = ref.locator
110:       if (snapshot.some((block) => block.start <= lines.start && lines.end <= block.end && lines.start <= lines.end)) return
111:       return yield* new Research.Error({ code: "reference_invalid", message: `Lines ${lines.start}-${lines.end} are not inside one range of this code_locate snapshot` })
112:     }
113:     return yield* Effect.try({ try: () => checkLocator(content.text, ref.source.representation, retainedLocator(ref.locator, content.receipt)),
114:       catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "reference_invalid", message: "Source locator does not match" }) })
115:   })
```

Linhas 521–552:

```text
521: function checkLocator(text: string, representation: typeof Research.Representation.Type, locator: Research.Locator) {
522:   if (locator.kind === "lines") {
523:     if (locator.start > locator.end || locator.end > text.split(/\r\n|\n|\r/).length)
524:       throw new Research.Error({ code: "reference_invalid", message: "Source line range does not exist" })
525:     return
526:   }
527:   if (locator.kind === "quote") {
528:     // Lookahead includes overlapping matches ("aa" occurs twice in "aaa").
529:     const matches: number[] = []
530:     for (const match of text.matchAll(new RegExp(`(?=${escapeLiteral(locator.exact)})`, "gu"))) {
531:       if ((locator.prefix && !text.slice(Math.max(0, match.index - locator.prefix.length), match.index).endsWith(locator.prefix)) ||
532:         (locator.suffix && !text.slice(match.index + locator.exact.length, match.index + locator.exact.length + locator.suffix.length).startsWith(locator.suffix))) continue
533:       if (matches.length) throw new Research.Error({ code: "locator_ambiguous", message: "Quote matches more than one location" })
534:       matches.push(match.index)
535:     }
536:     if (!matches.length) throw new Research.Error({ code: "reference_invalid", message: "Quote does not match admitted representation" })
537:     return
538:   }
539:   if (representation !== "structured-json") throw new Research.Error({ code: "reference_invalid", message: "JSON locator requires structured-json representation; cite a text source by lines or quote" })
540:   const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
541:   if (parsed._tag === "None") throw new Research.Error({ code: "source_unavailable", message: "Admitted JSON representation cannot be decoded" })
542:   if (locator.pointer !== "" && (!locator.pointer.startsWith("/") || /~(?:[^01]|$)/.test(locator.pointer)))
543:     throw new Research.Error({ code: "reference_invalid", message: "Invalid JSON pointer" })
544:   if (locator.pointer === "") return
545:   locator.pointer.slice(1).split("/").reduce((value: unknown, part) => {
546:     const key = part.replace(/~1/g, "/").replace(/~0/g, "~")
547:     if (value === null || typeof value !== "object" || !Object.hasOwn(value, key) ||
548:       (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)))
549:       throw new Research.Error({ code: "reference_invalid", message: "JSON pointer does not resolve" })
550:     return Reflect.get(value, key)
551:   }, parsed.value)
552: }
```

## E40 — CAS de registros e captura admitida

`packages/core/src/research/records.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 149–165:

```text
149:       yield* checkCitations(input.document)
150:     }
151:     const supplied = input.action === "relation" ? undefined : input.id
152:     const base = input.action === "relation" ? undefined : input.baseRevision
153:     if ((supplied === undefined) !== (base === undefined))
154:       return yield* new Research.Error({ code: "conflict", message: "Updates require both an admitted identity and base revision" })
155:     const id = supplied ?? mint(input.action, operation)
156:     const history = current.flatMap((entry) => {
157:       if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
158:       if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
159:       return []
160:     })
161:     const latest = Math.max(0, ...history)
162:     if ((base ?? 0) !== latest || (supplied && !latest))
163:       return yield* new Research.Error({ code: "conflict", message: "Research base revision is stale or missing" })
164:     if (supplied && input.action === "finding" && !input.reason)
165:       return yield* new Research.Error({ code: "reference_invalid", message: "Material finding revision requires its reason" })
```

Linhas 191–213:

```text
191:           if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
192:           if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
193:           return []
194:         })
195:         if (Math.max(0, ...revisions) !== latest)
196:           yield* Effect.die(new Research.Error({ code: "conflict", message: "Research revision changed during publication" }))
197:       }).pipe(Effect.orDie)
198:       if (committed.type === "research.record.committed")
199:         yield* events.publish(ResearchEvent.RecordCommitted, committed.data, { id: eventID, persist: true, commit })
200:       if (committed.type === "research.document.published")
201:         yield* events.publish(ResearchEvent.DocumentPublished, committed.data, { id: eventID, persist: true, commit })
202:       return mutation(committed)
203:     })
204:     return yield* publish.pipe(Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.gen(function* () {
205:       const stored = yield* replay(yield* entries(binding), operation, inputHash)
206:       if (stored?.type === "research.source.admitted")
207:         return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
208:       if (stored) return mutation(stored)
209:       const conflict = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
210:         : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
211:       if (conflict instanceof Research.Error) return yield* conflict
212:       const raced = (yield* entries(binding)).some((entry) => entry.id === eventID)
213:       return yield* new Research.Error({ code: raced ? "conflict" : "publication_uncertain", message: raced ? "Research revision conflicts" : "Research event publication is uncertain" })
```

Linhas 238–258:

```text
238:     if (previous) {
239:       if (previous.type !== "research.source.admitted") return yield* new Research.Error({ code: "conflict", message: "Capture operation conflicts" })
240:       // Replay returns the original admission; availability is checked separately on retrieval.
241:       return previous.data.receipt
242:     }
243:     if (Boolean(input.derivedFrom) !== Boolean(input.transformation) || (input.origin.kind === "atlas-own" && !input.atlas))
244:       return yield* new Research.Error({ code: "reference_invalid", message: "Derived and Atlas captures require their provenance" })
245:     // A partial received-byte parent can end inside a UTF-8 scalar. Verify custody, not textual decodability.
246:     if (input.derivedFrom) yield* artifacts.verifySource(binding, input.derivedFrom)
247:     const staged = yield* artifacts.prepare(binding, {
248:       id: ResearchLedger.eventID(binding, `source:${operation}`), type: "research.source.admitted", data,
249:     })
250:     if (staged.type !== "research.source.admitted")
251:       return yield* new Research.Error({ code: "conflict", message: "Source publication intent conflicts" })
252:     yield* artifacts.put(binding, { content, representation: input.representation, artifact: staged.data.receipt.ref.artifact }, operation)
253:     return yield* events.publish(ResearchEvent.SourceAdmitted, staged.data, {
254:       id: staged.id, persist: true,
255:     }).pipe(Effect.map(() => staged.data.receipt), Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => Effect.gen(function* () {
256:       const stored = yield* replay(yield* entries(binding), operation, inputHash)
257:       if (stored?.type === "research.source.admitted") return stored.data.receipt
258:       return yield* new Research.Error({ code: "publication_uncertain", message: "Source event publication is uncertain" })
```

## E41 — Attempt e aquisição sem retry oculto

`packages/core/src/research/records.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 300–320:

```text
300:     const replay = Effect.gen(function* () {
301:       const request = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
302:       const saved = request ? yield* Schema.decodeUnknownEffect(ResearchEvent.SourceRequested.data)(request.data).pipe(
303:         Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition request is invalid" })),
304:       ) : undefined
305:       if (!request || !saved || request.type !== "research.source.requested.1" || request.aggregate_id !== binding.executionSessionID ||
306:         ResearchLedger.canonical(saved) !== ResearchLedger.canonical(data))
307:         return yield* new Research.Error({ code: "conflict", message: "Acquisition request conflicts with retained invocation" })
308:       const outcome = yield* database.db.select().from(EventTable).where(eq(EventTable.id,
309:         ResearchLedger.eventID(binding, ResearchLedger.operation(context, "acquisition-outcome")),
310:       )).get().pipe(Effect.orDie)
311:       if (!outcome || outcome.type !== "research.source.attempted.1" || outcome.aggregate_id !== binding.executionSessionID)
312:         return yield* new Research.Error({ code: "publication_uncertain", message: "Prior acquisition has no settled outcome; live reacquisition is forbidden" })
313:       const receipt = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(outcome.data).pipe(
314:         Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition outcome is invalid" })),
315:       )
316:       if (ResearchLedger.canonical(receipt.binding) !== ResearchLedger.canonical(binding) ||
317:         ResearchLedger.canonical(receipt.receipt.binding) !== ResearchLedger.canonical(binding))
318:         return yield* new Research.Error({ code: "binding_mismatch", message: "Retained acquisition outcome scope differs" })
319:       if (!receipt.receipt.returned || !receipt.receipt.source)
320:         return yield* new Research.Error({ code: "source_unavailable", message: "Prior acquisition did not return retained evidence; use a new native call for a new attempt" })
```

## E42 — Views, inquiry e citações Markdown

`packages/core/src/research/records.ts`

Mesma identidade de fonte já declarada nesta projeção.

Linhas 447–455:

```text
447:     const id = ResearchLedger.eventID(binding, `inquiry:${allowance.dispatchCallID}:${operation}`)
448:     const shared = { sessionID: binding.executionSessionID, operation, inputHash, binding }
449:     // The native event transaction owns this check: a dispatch opens and closes its inquiry once, and nothing follows a close.
450:     const commit = () => dispatch(allowance).pipe(Effect.flatMap((list) => {
451:       const inquiries = list.filter(isInquiry)
452:       if (inquiries.some((step) => step.type === "research.inquiry.closed"))
453:         return Effect.die(new Research.Error({ code: "inquiry_state", message: "inquiry closed: this dispatch admits no further inquiry events" }))
454:       if (input.type !== "research.inquiry.checked" && inquiries.some((step) => step.type === input.type))
455:         return Effect.die(new Research.Error({ code: "inquiry_state", message: `${input.type} already happened in this dispatch` }))
```

Linhas 564–577:

```text
564:   // Research labels are Markdown links with research:<label> destinations. Code and raw HTML are not citations.
565:   const walk = (raw: unknown) => Schema.decodeUnknownSync(Schema.Array(MarkdownToken))(raw).forEach((token) => {
566:     if (token.type === "link" && token.href?.startsWith("research:") && !Object.hasOwn(document.citations, token.href.slice(9)))
567:       throw new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" })
568:     if (token.tokens) walk(token.tokens)
569:     if (token.type === "list") token.items?.forEach((item) => walk(Schema.decodeUnknownSync(MarkdownToken)(item).tokens))
570:     if (token.type === "table") {
571:       const cell = Schema.Struct({ tokens: Schema.Array(Schema.Unknown) })
572:       token.header?.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens))
573:       token.rows?.forEach((row) => row.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens)))
574:     }
575:   })
576:   yield* Effect.try({ try: () => walk(Lexer.lex(document.body)), catch: () => new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" }) })
577: })
```

