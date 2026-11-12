# Decisive L1 evidence — desktop-web

Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol pin: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

These are bounded verbatim source-line excerpts. The numeric prefixes are added line labels; source text after each prefix is unchanged. Source byte hashes refer to the complete exact capture in `sources/`. Full connector responses remain in `captures/`. Implementation and test excerpts are explicitly distinguished; no product execution is represented.

## E01. Owned readiness gates initialization

The actual ordering awaits health before publishing credentials; renderer commentary does not override it.

`apps/desktop/src/main/index.ts:467–475` · Git blob `2a00cd582c5917716fe9061a46ca614ed45d086e` · SHA-256 `79e2de4c4f9e50a9b04cf78ad09b3d03585b1e49190943e230f1d45f49b08f11`

```text
467:     // A server that never came up fails initialization, so the renderer shows why instead of a dead URL.
468:     yield* Effect.tryPromise({
469:       try: () => owned.health.wait,
470:       catch: (e) => (e instanceof Error ? e : new Error(String(e))),
471:     }).pipe(Effect.tapError((e) => Effect.sync(() => logger.error("owned serve health check failed", e.message))))
472:     yield* Deferred.succeed(serverReady, { url: owned.url, username: owned.username, password: owned.password })
473:     yield* Effect.promise(() => OmniBoot.report({ url: owned.url, username: owned.username, password: owned.password }, logger))
474:     logger.log("loading task finished")
475:   }).pipe(forwardInitializationFailure(serverReady), Effect.forkChild)
```

## E02. Stable-exit restart discrepancy

Static inference: a stable exit sets failures=0, then indexes BACKOFF[-1], reaching the undefined branch. This was not reproduced at runtime.

`apps/desktop/src/main/owned-serve.ts:76–86` · Git blob `31d70c15aafdc91ebccc1c5cd25da153cfac84ed` · SHA-256 `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5`

```text
76:         const requested = state.stopping && !state.killed && (code === 143 || signal === "SIGTERM" || process.platform === "win32")
77:         options.onEvent?.("utility-exit", { utilityPID: child.pid, code: requested ? 0 : code })
78:         options.logger.log("owned serve exited", { code, signal, stopping: state.stopping })
79:         if (state.stopping) return
80:         state.failures = Date.now() - startedAt > STABLE_AFTER ? 0 : state.failures + 1
81:         const wait = BACKOFF[state.failures - 1]
82:         if (wait === undefined) return options.logger.error("owned serve crash loop; not restarting", { url })
83:         options.logger.log("owned serve restarting", { attempt: state.failures, wait })
84:         setTimeout(() => {
85:           if (!state.stopping) launch()
86:         }, wait).unref()
```

## E03. Enforced versus report-only CSP

The fuller policy is declared separately from the enforced safe subset.

`apps/desktop/src/main/renderer-origin.ts:25–45` · Git blob `34f5db54ee46ec5a2b7714b63d2a868fb13ca095` · SHA-256 `ddccb06fef155c7d2fa5edc2693ecc4b3da9694c911fd52c4c5ee4db6929ad0b`

```text
25: /**
26:  * The enforced part of the policy is a subset that cannot break a page: no plugins and no <base> rewriting. The full
27:  * policy is report-only until it has been watched against the packaged app, because the renderer reaches remote
28:  * servers over http(s)/ws(s) at any host and uses blob workers, wasm and inline styles, none of which can be checked
29:  * without running it.
30:  */
31: export const rendererCsp = "object-src 'none'; base-uri 'self'"
32: export const rendererCspReportOnly = [
33:   "default-src 'self'",
34:   "script-src 'self' 'wasm-unsafe-eval'",
35:   "style-src 'self' 'unsafe-inline'",
36:   "img-src 'self' data: blob: http: https:",
37:   "media-src 'self' data: blob: http: https:",
38:   "font-src 'self' data:",
39:   "connect-src 'self' data: blob: http: https: ws: wss:",
40:   "worker-src 'self' blob:",
41:   "frame-src 'self' http: https:",
42:   "object-src 'none'",
43:   "base-uri 'self'",
44:   "form-action 'self'",
45: ].join("; ")
```

## E04. General IPC origin wrapper

This registration wrapper checks sender-frame origin; separate registration modules must be inspected separately.

`apps/desktop/src/main/ipc.ts:69–82` · Git blob `2214930f4cc822e565599b480ad9aad8cb29f200` · SHA-256 `918fb622129d68d6654748697e68517d9ab21ef103cc08df06aaf19d1cc0c76c`

```text
69: export function registerIpcHandlers(deps: Deps) {
70:   // Every handler here is privileged, so none runs for a frame that is not the app's own renderer: a page the window
71:   // navigated to, or a subframe from another origin, never reaches the file system, the store or the sidecar.
72:   const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
73:     isRendererOrigin(event.senderFrame?.url, rendererDevUrl(app.isPackaged, process.env.ELECTRON_RENDERER_URL))
74:   const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
75:     ipcMain.handle(channel, (event, ...args) => {
76:       if (!trusted(event)) throw new Error(`Untrusted IPC sender: ${channel}`)
77:       return listener(event, ...args)
78:     })
79:   const on = (channel: string, listener: Parameters<typeof ipcMain.on>[1]) =>
80:     ipcMain.on(channel, (event, ...args) => {
81:       if (trusted(event)) listener(event, ...args)
82:     })
```

## E05. Direct live and WSL registration

These handlers register directly and validate arguments where shown; no general origin wrapper appears in these registrations. Reachability/exploitability is not established.

`apps/desktop/src/main/live-ipc.ts:29–40` · Git blob `fcb3903779ee6a88a813ba6c23f21829167ecfcb` · SHA-256 `b5caff3ee7bf8ffc7663dc33db98cbe2400fc9d4af3614c7b7558eb6285db146`

```text
29:   ipcMain.handle("start-live-meeting", (_event: IpcMainInvokeEvent, title: unknown) =>
30:     loop.start(typeof title === "string" ? title : undefined),
31:   )
32:   ipcMain.handle("stop-live-meeting", () => loop.stop())
33:   ipcMain.handle("get-live-meeting-running", () => loop.running())
34:   // The key itself never goes back to a renderer; it can only be replaced or cleared.
35:   ipcMain.handle("has-live-transcription-key", () => hasTranscriptionKey())
36:   ipcMain.handle("set-live-transcription-key", (_event: IpcMainInvokeEvent, key: unknown) => {
37:     if (typeof key === "string") saveTranscriptionKey(key)
38:   })
39:   ipcMain.handle("get-live-readiness", () => readiness(loop.settings.get().answerModel))
40:   ipcMain.handle("request-live-permission", (_event: IpcMainInvokeEvent, source: unknown) => {
```

`apps/desktop/src/main/wsl/ipc.ts:43–55` · Git blob `e52af811a5078399011cfbe03ccd2620be5e5846` · SHA-256 `d0a829f81da133aa865e613d94368dcd69c7fb0235e7c98fb5483a571169d4c0`

```text
43:   ipcMain.handle("wsl-servers-get-state", () => controller.getState())
44:   ipcMain.handle("wsl-servers-probe-runtime", () => controller.probeRuntime())
45:   ipcMain.handle("wsl-servers-refresh-distros", () => controller.refreshDistros())
46:   ipcMain.handle("wsl-servers-install-wsl", () => controller.installWsl())
47:   ipcMain.handle("wsl-servers-install-distro", (_event: IpcMainInvokeEvent, name: string) =>
48:     controller.installDistro(requireWslIpcString("distro", name)),
49:   )
50:   ipcMain.handle("wsl-servers-probe-addable", (_event: IpcMainInvokeEvent, distros: string[]) =>
51:     controller.probeAddable(requireWslIpcStrings("distro", distros)),
52:   )
53:   ipcMain.handle("wsl-servers-install-server", (_event: IpcMainInvokeEvent, name: string) =>
54:     controller.installServer(requireWslIpcString("distro", name)),
55:   )
```

## E06. Draft buffering and blob ownership

These are implementation operations, not an executed database receipt.

`apps/desktop/src/main/draft-store.ts:42–76` · Git blob `839eff26afe682f771eea9e30c55fc0af78cfc08` · SHA-256 `04d57ecb70b91c250ea1b5c7989b7ebe5b36754e4ca218cd74f745037c9c918a`

```text
42:     const writes = [...pending]
43:     pending.clear()
44:     db.transaction((tx) => {
45:       writes.forEach(([key, value]) => {
46:         if (value === null) tx.delete(documents).where(eq(documents.key, key)).run()
47:         else
48:           tx.insert(documents)
49:             .values({ key, value })
50:             .onConflictDoUpdate({ target: documents.key, set: { value } })
51:             .run()
52:       })
53:     })
54:   }
55:   const schedule = () => {
56:     if (!timer) timer = setTimeout(flush, 500)
57:   }
58:   return {
59:     get: (key: string) =>
60:       pending.has(key)
61:         ? (pending.get(key) ?? null)
62:         : (db.select({ value: documents.value }).from(documents).where(eq(documents.key, key)).get()?.value ?? null),
63:     set(key: string, value: string | null) {
64:       pending.set(key, value)
65:       schedule()
66:     },
67:     putBlob(data: Uint8Array) {
68:       const id = createHash("sha256").update(data).digest("hex")
69:       db.insert(blobs)
70:         .values({ id, data: Buffer.from(data) })
71:         .onConflictDoNothing()
72:         .run()
73:       return id
74:     },
75:     getBlob: (id: string) => db.select({ data: blobs.data }).from(blobs).where(eq(blobs.id, id)).get()?.data ?? null,
76:     flush,
```

## E07. WAL test negative control

Read but unexecuted test: a copied main file misses newer WAL-backed data. Test code is not a passing result.

`apps/desktop/src/main/draft-store.node.test.ts:25–43` · Git blob `65f61a397984fb3c5d648d708caf4adf2b57768c` · SHA-256 `589a5565f2247d42304c312962765bd83b4e817cb6f8692e2628415ba19d342a`

```text
25: test("a main-file-only WAL copy misses the committed blob while the draft is buffered", { timeout: 30_000 }, (t) => {
26:   const fixture = createWalFixture(t)
27:   assert.equal(fixture.writer.get("prompt"), fixture.document)
28:   assert.equal(fixture.native.prepare("SELECT value FROM document WHERE key = ?").get("prompt"), undefined)
29: 
30:   const committed = fixture.native.prepare("SELECT data FROM blob WHERE id = ?").get(fixture.id)
31:   assert.ok(committed?.data instanceof Uint8Array && committed.data.byteLength > 0)
32:   assert.deepEqual(committed.data, fixture.bytes)
33:   assert.equal(createHash("sha256").update(committed.data).digest("hex"), fixture.id)
34:   assert.ok(statSync(`${fixture.filename}-wal`).size > 0)
35: 
36:   // Keep the writer open: copying only the checkpointed main file deliberately omits newer WAL commits.
37:   const filename = join(fixture.directory, "main-only.sqlite")
38:   copyFileSync(fixture.filename, filename)
39:   const copy = new DatabaseSync(filename, { readOnly: true })
40:   try {
41:     // Both queries also prove that the copy contains a usable initial schema.
42:     assert.equal(copy.prepare("SELECT data FROM blob WHERE id = ?").get(fixture.id), undefined)
43:     assert.equal(copy.prepare("SELECT value FROM document WHERE key = ?").get("prompt"), undefined)
```

## E08. Dock view isolation and stale attachment

Remote browser view options and generation-aware attachment guards constrain the visible host boundary.

`apps/desktop/src/main/app-dock.ts:237–244` · Git blob `e119706137b28191c176f3d034713ddf8fdb2100` · SHA-256 `3300100db676fc68e39c24d7e96d8ed2581b7cbdeda51bf0547cf7c294caeef0`

```text
237:     const view = new WebContentsView({
238:       webPreferences: {
239:         contextIsolation: true,
240:         nodeIntegration: false,
241:         sandbox: true,
242:         session: browserSession,
243:         backgroundThrottling: true,
244:       },
```

`apps/desktop/src/main/app-dock-utils.ts:35–44` · Git blob `620869f2544c2c5929a54c3f887b5b27535dcad9` · SHA-256 `59596fc88132811e15a1a48e9d828929fe36780db0711f92fd198d672f825c84`

```text
35: // Resize and Hide name the tab they were sent for. Only the tab attached to the window now, at that
36: // generation, takes one: anything else was sent before another tab, a recovery or a new owner took
37: // the window's place, and must not move or hide the view shown now.
38: export function appDockAttached<T extends { generation: number }>(
39:   tabs: ReadonlyMap<string, T> | undefined,
40:   active: string | undefined,
41:   tab: Readonly<{ tabID: string; generation: number }>,
42: ) {
43:   const record = tabs?.get(tab.tabID)
44:   return active === tab.tabID && record?.generation === tab.generation ? record : undefined
```

## E09. Fullscreen permission exception

Session policy is not accurately summarized as deny every permission.

`apps/desktop/src/main/app-dock-session.ts:117–125` · Git blob `a54327e6094ba89eb1b15c9c2cd2d11dae456ec4` · SHA-256 `1811d7a8f3d741bce0286093db39f349044dd37de72cec83690dcebfb1ba147b`

```text
117:       browserSession.setPermissionRequestHandler((webContents, permission, callback) => {
118:         if (permission === "fullscreen") return callback(true)
119:         if (webContents) denyPermission(webContents, permission)
120:         callback(false)
121:       })
122:       browserSession.setPermissionCheckHandler((webContents, permission) => {
123:         if (permission === "fullscreen") return true
124:         if (webContents) denyPermission(webContents, permission)
125:         return false
```

## E10. Profile revision contract

Manifest mutation uses expected revision and validates referenced active profiles.

`apps/desktop/src/main/app-dock-profile-registry.ts:289–303` · Git blob `51b63ddc3a072b7734ccb281a4826dbd93237167` · SHA-256 `c44c85c4c427449913504df36c1bbc41d56346e23032d3c778dcc8c52f0a1d6b`

```text
289:   replaceManifest(expectedRevision: unknown, value: unknown): AppDockManifestUpdate {
290:     if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
291:       throw manifestError()
292:     const revision = expectedRevision
293:     if (revision !== this.#manifest.revision) return { status: "conflict", manifest: this.manifest() }
294:     const manifest = parseManifest(value)
295:     if (manifest.revision !== revision) throw manifestError()
296:     const active = Object.keys(this.#registry.profiles).filter((id) => this.#registry.profiles[id].status === "active")
297:     if (manifest.profiles.length !== active.length || manifest.profiles.some((profile) => !active.includes(profile.id)))
298:       throw manifestError()
299:     this.writeManifest({ ...manifest, revision: this.#manifest.revision + 1 })
300:     return { status: "updated", manifest: this.manifest() }
301:   }
302: 
303:   private write(profiles: Registry["profiles"]) {
```

## E11. Host confirmation of workspace roots

Fresh runtime and process census precede confirmation of helper-proposed roots.

`apps/desktop/src/main/app-dock-native-workspace.ts:27–37` · Git blob `b9178746ec036369a9ecfd9db3a425637ebdba4a` · SHA-256 `cbd459ec825dd6749ac39bb48b274b6fe54f2b44d150560de1f050ee3f484e2c`

```text
27:       confirm: async (proposal) => {
28:         if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace confirmation cancelled")
29:         if (JSON.stringify(resource.runtime) !== JSON.stringify(scope.runtime))
30:           throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace session changed during preparation")
31:         const fresh = await runtime.workspaceScope()
32:         if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace confirmation cancelled")
33:         if (JSON.stringify(fresh) !== expected)
34:           throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace membership changed before confirmation")
35:         // Authorization is the whole verified workspace realm. These are actual
36:         // helper-proposed AT-SPI roots, not inferred X11/title/window pairings.
37:         return proposal.roots.map((root) => ({ owner: root.owner, path: root.path }))
```

## E12. Native cancellation test boundary

Unexecuted memory-channel test retains a slot until the original terminal, even after cancel acknowledgment.

`apps/desktop/src/main/app-dock-native-client-admission.test.ts:35–58` · Git blob `56f1d112e0856e56543e67ac96bb69ee880ea614` · SHA-256 `753a2a8380faa9cf8343fd33df0c1722d7a01d1da533449140a89883a9e24e2a`

```text
35:   test("retains slot after abort and control ACK until original late terminal", async () => {
36:     const { channel, client } = await memory({ cancelGraceMs: 500 })
37:     await bind(client, channel)
38:     const abort = new AbortController()
39:     const sent = failure(client.request(read(), abort.signal))
40:     expect(getEventListeners(abort.signal, "abort").length).toBe(1)
41:     const original = channel.last
42:     const queued = client.request(read())
43:     queued.catch(() => {})
44:     abort.abort()
45:     expect(await sent).toMatchObject({ code: "cancelled", outcome: "unknown" })
46:     expect(getEventListeners(abort.signal, "abort").length).toBe(0)
47:     await until(() => channel.last.op === "cancel")
48:     const cancel = channel.last
49:     expect(cancel.args.requestID).toBe(original.id)
50:     channel.ack(cancel)
51:     await Bun.sleep(0)
52:     expect(channel.writes.filter((request) => request.op === "read").length).toBe(1)
53:     channel.ack(original, "late result")
54:     await until(() => channel.last.op === "read" && channel.last.id !== original.id)
55:     channel.ack(channel.last, "next result")
56:     expect(await queued).toBe("next result")
57:     expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2, 3, 4])
58:     expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2", "golden:3", "golden:4"])
```

## E13. Native observations and actions are non-atomic

Snapshot and action response bodies explicitly avoid asserting logical identity or a verified effect.

`apps/desktop/resources/linux/app-dock-accessibility/snapshot.py:62–66` · Git blob `6f72716d93988bf57fb2e807bfcb50bd234bbfc4` · SHA-256 `d97b0c8e3376da153a6c80991f232c40d4997d011644a8f45ef703ca2045bb26`

```text
62:     result = {"backend": "linux-atspi", "scopeKind": scope_kind(binding), "observation": observation, "title": "", "items": [], "text": "",
63:               "truncated": False, "windows": [], "coverage": {"scope": "owned-controls-excluding-hidden-menu-subtrees", "complete": False,
64:               "visited": 0, "calls": 0, "omittedHiddenMenus": 0, "omittedForeignChildren": 0, "reasons": list(state["partial"])}, "consistency": "non-atomic", "capabilities": {
65:               "read": {"supported": True, "reason": "bounded-live-traversal"},
66:               "mutation": {"supported": False, "reason": "per-item-capabilities; no-logical-dataset-identity"}}}
```

`apps/desktop/resources/linux/app-dock-accessibility/actions.py:35–53` · Git blob `0735c627b1596299d6b3b837b03149ab1d938a10` · SHA-256 `aa64e55b4cf18858e4b8a2ee29cdce11e728710313ff1652085d50debbb1b214`

```text
35:     evidence, live = _target(context, record, observed=mode == "observed")
36:     if _action_names(context, record) != names:
37:         raise BusError("action-drift", "Provider actions changed during admission")
38:     result = {"method": "action", "action": action["name"], "via": "action",
39:               "dispatch": "unknown", "postcondition": "unverified", "consistency": "non-atomic",
40:               "identity": "observed-control" if mode == "observed" else "snapshot-bound-control",
41:               "logicalIdentity": "unverified"}
42:     clicked = _click(context, record, action, evidence, live, result)
43:     if clicked:
44:         return clicked
45:     try:
46:         accepted = context.call(record["owner"], record["path"], A + "Action", "DoAction",
47:                                 "(i)", (action["index"],), "(b)")[0]
48:         if not accepted:
49:             result["dispatch"] = "rejected"
50:             raise BusError("provider-rejected", "Provider rejected DoAction")
51:         result["dispatch"] = "acknowledged"
52:         _responding(context, record["owner"])
53:         return result
```

## E14. Local runtime locator and current session

Source checks local endpoint shape and current session file/process identity; no Docker or guest command ran.

`apps/desktop/src/main/app-dock-runtime-backend.ts:97–102` · Git blob `b4f0ba59436bb9e2969735f83f350b6f7530c36c` · SHA-256 `a05f5f8fede08ce113c633632b68f4cb363b23432f3d0643158a7d92dd459973`

```text
97: export function localEndpoint(endpoint: string) {
98:   if (process.platform === "win32" && /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(endpoint)) return true
99:   if (!endpoint.startsWith("unix:///")) return false
100:   const url = new URL(endpoint)
101:   return !url.hostname && !url.search && !url.hash && !url.username && !url.password
102: }
```

`apps/desktop/resources/linux-runtime/workspace.py:319–333` · Git blob `994ed493ffa0a76c7e2f4e6f32fda3f1bfc157d0` · SHA-256 `42a173e891059dc9fe9ac881a6b1ef66b6606fef4c7d7b5fe158e2ceba5cc9eb`

```text
319: def current_session(*, _runtime=RUNTIME):
320:     runtime_directories(_runtime=_runtime)
321:     try:
322:         with os.fdopen(os.open(_runtime / "session.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
323:             info = os.fstat(stream.fileno())
324:             if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
325:                 raise SessionError("native-session-record-invalid")
326:             session = parse_session(stream.read(SESSION_BYTES + 1), _runtime=_runtime)
327:     except FileNotFoundError as error:
328:         raise SessionError("native-session-record-missing") from error
329:     except OSError as error:
330:         raise SessionError("native-session-record-invalid") from error
331:     if process_identity(session["processIdentity"]["pid"]) != session["processIdentity"]:
332:         raise SessionError("native-session-stale")
333:     return session
```

## E15. WSL authenticated health

Positive authenticated body and rejected wrong password are both required.

`apps/desktop/src/main/wsl/startup.ts:7–17` · Git blob `f4556cb47b38cf37c3b98a6c4003842a83c46e49` · SHA-256 `16ee0730c7b9eaa644e5b678ee58afdaa3b490b7343be57ec8429c339ee1c3d7`

```text
7: export async function checkWslAuthentication(url: string, password: string, signal?: AbortSignal) {
8:   const request = (value: string) =>
9:     fetch(new URL("/api/health", url), {
10:       headers: { authorization: `Basic ${Buffer.from(`orchestra:${value}`).toString("base64")}` },
11:       signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
12:     })
13:   const allowed = await request(password)
14:   const denied = await request(`${password}-invalid`)
15:   const healthy: unknown = allowed.ok ? await allowed.json() : null
16:   return !!healthy && typeof healthy === "object" && "healthy" in healthy && healthy.healthy === true && denied.status === 401
17: }
```

## E16. Live transcription key storage

The key is read through safeStorage/environment fallback and stored only when encryption is available.

`apps/desktop/src/main/live-key.ts:1–27` · Git blob `b1a22d61949a3eb39d14d4e0ab2490683bfdda6a` · SHA-256 `07a9161d80bcff408020f3eeca457dac37c3f9575e0039b8b279a60d0416ab29`

```text
1: import { safeStorage } from "electron"
2: 
3: import { getStore } from "./store"
4: 
5: // The live seat's speech-to-text key. It is stored encrypted with the OS keychain (safeStorage) in the desktop
6: // settings store and never leaves main: no IPC returns it. DEEPGRAM_API_KEY in the environment is the fallback for
7: // development. The server has no route that hands out provider keys, so the desktop keeps its own.
8: 
9: const KEY = "liveDeepgramKey"
10: 
11: export function readTranscriptionKey() {
12:   const stored = getStore().get(KEY)
13:   if (typeof stored === "string" && stored && safeStorage.isEncryptionAvailable())
14:     return safeStorage.decryptString(Buffer.from(stored, "base64"))
15:   return process.env.DEEPGRAM_API_KEY?.trim() || undefined
16: }
17: 
18: export function saveTranscriptionKey(key: string) {
19:   const value = key.trim()
20:   if (!value) return getStore().delete(KEY)
21:   if (!safeStorage.isEncryptionAvailable()) throw new Error("The system keychain is not available to store the key.")
22:   getStore().set(KEY, safeStorage.encryptString(value).toString("base64"))
23: }
24: 
25: export function hasTranscriptionKey() {
26:   return readTranscriptionKey() !== undefined
27: }
```

## E17. Response capability and irreversible commit

Owner checks tie the capability to the originating frame; rename submission and unowned temporary-file cleanup have distinct handling.

`apps/desktop/src/main/response-download.ts:89–101` · Git blob `cd869d37c96453d7692c83be51386bd559314449` · SHA-256 `f6f8c2b73328cd76cc804f03b3ae2e164d926d8c599cf7612525351ace26d5af`

```text
89:   const owner = (event: IpcMainInvokeEvent) => {
90:     const win = deps.BrowserWindow.fromWebContents(event.sender)
91:     if (
92:       !win || win.isDestroyed() || event.sender.isDestroyed() || win.webContents !== event.sender
93:       || !event.senderFrame || event.senderFrame !== event.sender.mainFrame
94:     ) return
95:     return { win, frame: event.senderFrame }
96:   }
97:   const selection = (event: IpcMainInvokeEvent, handle: unknown) => {
98:     if (typeof handle !== "string" || handle.length > 64) return
99:     const save = saves.get(handle)
100:     if (!save || !owner(event) || save.sender !== event.sender || save.frame !== event.senderFrame) return
101:     return save
```

`apps/desktop/src/main/response-download.ts:56–71` · Git blob `cd869d37c96453d7692c83be51386bd559314449` · SHA-256 `f6f8c2b73328cd76cc804f03b3ae2e164d926d8c599cf7612525351ace26d5af`

```text
56:         // A chooser can stay open after cancellation. Only an already-started open/write is awaited.
57:         await save.opening?.catch(() => undefined)
58:         await save.writing?.catch(() => undefined)
59:         await save.file?.close()
60:         if (save.commit && save.temporary && save.path) {
61:           // Submission is irreversible: cancellation now observes this rename's actual result.
62:           save.committing = true
63:           await (deps.rename ?? rename)(save.temporary, save.path)
64:           save.temporary = undefined
65:           return { status: "ok" }
66:         }
67:         return { status: "cancelled" }
68:       } finally {
69:         try {
70:           // Exclusive open can collide: never unlink a path unless this save acquired its handle.
71:           if (save.file && save.temporary) await rm(save.temporary, { force: true })
```

## E18. CLI cached artifact revalidation

A manifest/hash-named installation is not reused without companion and artifact checks.

`apps/desktop/src/main/cli-install.ts:34–55` · Git blob `8633f0cba5aa23011dc11f3d616eb4dd28dcfe90` · SHA-256 `4279b2f1eb7495be45092ea2be5c57c17d736de7fe967314576c2af72827dd60`

```text
34:   const directory = join(cache, `${manifest.version.replace(/[^a-zA-Z0-9._-]/g, "-")}-${target}-${artifact.sha256}`)
35:   const existing = await readCliManifest(directory)
36:     .then(async (installed) => {
37:       if (
38:         installed.version !== manifest.version ||
39:         installed.artifacts.length !== 1 ||
40:         installed.artifacts[0]?.sha256 !== artifact.sha256 ||
41:         installed.artifacts[0]?.file !== artifact.file
42:       )
43:         return
44:       requireTreeSitterBundle(join(directory, "tree-sitter"), cliTreeSitterTarget(target))
45:       if (ripgrep !== undefined)
46:         await RipgrepBundle.verify(join(directory, "ripgrep"), cliRipgrepKey(target)!, { signature: options.signature })
47:       // A cache without the pair (an install from before the pair shipped) is rebuilt, not returned.
48:       await requireOmniPair(directory, target)
49:       return verifyCliArtifact(directory, target)
50:     })
51:     .catch(() => undefined)
52:   // A valid installed copy is checked against the digest its directory is named for, so the bundle's own copy is hashed
53:   // only when it is installed: hashing both on every launch cost about a second.
54:   if (existing) return existing
55:   const bundled = await verifyCliArtifact(source, target)
```

## E19. Shipped runtime resource boundary

Native icons, Python helper and Linux runtime are copied as extraResources outside the application archive.

`apps/desktop/electron-builder.config.ts:175–191` · Git blob `89eb781c8878687670d0e83afdc9df8e98c49734` · SHA-256 `91b330f08e0a933193ffbd8bd1d229de9a4fccb9df22a90910959d0ee87e4757`

```text
175:   afterPack: verifyPackagedResources,
176:   afterSign: verifyPackagedResources,
177:   extraResources: [
178:     // Native windows and the macOS Dock read process.resourcesPath/icons outside app.asar.
179:     {
180:       from: "resources/icons",
181:       to: "icons",
182:     },
183:     {
184:       from: "resources/linux/app-dock-accessibility",
185:       to: "app-dock-accessibility",
186:       filter: ["*.py"],
187:     },
188:     {
189:       from: "resources/linux-runtime",
190:       to: "linux-runtime",
191:     },
```

## E20. Updater persisted state and installation

Stored version does not skip the update check; installation requires ready state and stops resources first.

`apps/desktop/src/main/updater-controller.ts:82–103` · Git blob `02520c0aabcd9f85b72e5f293ec6007de807ed00` · SHA-256 `ed978923ed992c33fb226c367bc2f3a387bc3bc9411c9c28a6e292fb8aa3e4a3`

```text
82:     async start() {
83:       const ready = await input.persistence.get()
84:       if (ready?.version === input.currentVersion) await input.persistence.clear()
85:       return check()
86:     },
87:     check,
88:     async install() {
89:       if (state.status !== "ready") throw new Error("Update is not ready to install")
90:       const version = state.version
91:       transition({ status: "installing", version })
92:       await input
93:         .stop()
94:         .then(() => {
95:           input.backend.quitAndInstall()
96:           transition({ status: "ready", version })
97:         })
98:         .catch((error) => {
99:           transition({ status: "ready", version })
100:           throw error
101:         })
102:     },
103:   }
```

## E21. Web token removal

The browser host removes the auth_token query entry from history after extraction.

`apps/web/src/entry.tsx:99–110` · Git blob `3b12a89db1e5b83c5692bfcf1482882fab94f7f6` · SHA-256 `3f9fbf2d2c59b3b203f9cb74a0f9b33c0e24a511b931775b908d76645383aa56`

```text
99: const getDefaultUrl = () => {
100:   const lsDefault = readDefaultServerUrl()
101:   if (lsDefault) return lsDefault
102:   return getCurrentUrl()
103: }
104: 
105: const clearAuthToken = () => {
106:   const params = new URLSearchParams(location.search)
107:   if (!params.has("auth_token")) return
108:   params.delete("auth_token")
109:   history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash)
110: }
```

## E22. English locale fallback

Representative non-English dictionary branches merge over English rather than replacing it.

`apps/desktop/src/renderer/i18n/index.ts:114–128` · Git blob `58e3c1e26b59ed06852c38f455b37d5ec180284b` · SHA-256 `35b2d4853348e60dafb0e355b160eb96257862a00d1c1c6c1d8601d8b2a1e6b9`

```text
114: const base = i18n.flatten(desktopEn)
115: 
116: function build(locale: Locale): Dictionary {
117:   if (locale === "en") return base
118:   if (locale === "zh") return { ...base, ...i18n.flatten(desktopZh) }
119:   if (locale === "zht") return { ...base, ...i18n.flatten(desktopZht) }
120:   if (locale === "de") return { ...base, ...i18n.flatten(desktopDe) }
121:   if (locale === "es") return { ...base, ...i18n.flatten(desktopEs) }
122:   if (locale === "fr") return { ...base, ...i18n.flatten(desktopFr) }
123:   if (locale === "da") return { ...base, ...i18n.flatten(desktopDa) }
124:   if (locale === "ja") return { ...base, ...i18n.flatten(desktopJa) }
125:   if (locale === "pl") return { ...base, ...i18n.flatten(desktopPl) }
126:   if (locale === "ru") return { ...base, ...i18n.flatten(desktopRu) }
127:   if (locale === "uk") return { ...base, ...i18n.flatten(desktopUk) }
128:   if (locale === "ar") return { ...base, ...i18n.flatten(desktopAr) }
```

## E23. Generated corpus provenance

The generator writes four consolidated documents and per-invariant pages, emitting measured labels from literal test references. No tests run in this excerpt.

`apps/desktop/docs/corpus/app-dock/generate-corpus.mjs:704–726` · Git blob `4b9fc9841ff91f95437548022eb589af4b3bcfc0` · SHA-256 `48c7c08012d6295992660b381665b49daa0eba9f6d6b2298ceccd912832b2241`

```text
704: // Write all artifacts
705: function writeAll() {
706:   fs.writeFileSync(path.join(outDir, "00-invariant-register.md"), genInvariantRegister());
707:   fs.writeFileSync(path.join(outDir, "01-requirements.md"), genRequirements());
708:   fs.writeFileSync(path.join(outDir, "02-goldens.md"), genGoldens());
709:   fs.writeFileSync(path.join(outDir, "03-cards.md"), genCards());
710: 
711:   // Split into per-invariant files
712:   const invariantsDir = path.join(outDir, "invariants")
713:   fs.mkdirSync(invariantsDir, { recursive: true })
714:   for (const inv of invariants) {
715:     let md = `# Invariant: \`${inv.id}\` - ${inv.title}\n\n`
716:     md += `> Clauses: ${inv.clauses.length} | Unwanted: ${inv.unwanted.length} | Witnesses: ${inv.tests.join(", ")}\n\n`
717:     md += "## Clauses\n"
718:     for (const c of inv.clauses) {
719:       md += `- ${c} *(measured: ${inv.tests.join(", ")})*\n`
720:     }
721:     md += "\n## Unwanted\n"
722:     for (const u of inv.unwanted) {
723:       md += `- ${u} *(measured: ${inv.tests.join(", ")})*\n`
724:     }
725:     md += "\n"
726:     fs.writeFileSync(path.join(invariantsDir, `${inv.id}.md`), md)
```

## E24. Proof setup is not semantic readiness

The development testbed documentation states limits of launch receipts and future package resolution.

`apps/desktop/test/native/README.md:3–5` · Git blob `af310c247f23b1c53ee81c8ab107d35e6d9a36fb` · SHA-256 `32d28e19a87ddad44e00c28b34ce6522c5093e0463d60b46cfd177746303afe0`

```text
3: This bootstrap launches real Mousepad/GTK3, FeatherPad/Qt and official VS Code/Electron.
4: Dependency installation, bus reachability and launch receipts do **not** prove semantic
5: readiness or native operations. The lead runs W0's tree/action/file/config oracles separately.
```

`apps/desktop/test/native/README.md:21–24` · Git blob `af310c247f23b1c53ee81c8ab107d35e6d9a36fb` · SHA-256 `32d28e19a87ddad44e00c28b34ce6522c5093e0463d60b46cfd177746303afe0`

```text
21: Ubuntu apt repositories remain live. `/opt/orchestra-a11y/versions.json` records the
22: complete installed package/version closure, Python/PyGObject/GLib and actual VS Code
23: Electron/Chromium/Node versions. Retain the built image ID with every proof receipt;
24: the Dockerfile alone does not promise a byte-identical future apt resolution.
```

## E25. Main-fiber failure and localization instruction

Observed fallback logs the formatted cause, shows a native error box and exits. The visible title/Logs label are literals; the separate instruction requires typed localization. This is a source/instruction conflict, not an executed failure.

`apps/desktop/src/main/index.ts:498–508` · Git blob `2a00cd582c5917716fe9061a46ca614ed45d086e` · SHA-256 `79e2de4c4f9e50a9b04cf78ad09b3d03585b1e49190943e230f1d45f49b08f11`

```text
498: // A failure before any window exists would otherwise leave a process with nothing on screen.
499: Effect.runFork(main).addObserver((exit) => {
500:   if (Exit.isSuccess(exit)) return
501:   const reason = Cause.pretty(exit.cause)
502:   writeLog("main", "desktop startup failed", { reason }, "error")
503:   dialog.showErrorBox(
504:     "HuGR Orchestra could not start",
505:     `${reason.split("\n")[0]}\n\nLogs: ${join(app.getPath("userData"), "logs")}`,
506:   )
507:   app.exit(1)
508: })
```

`apps/desktop/AGENTS.md:5–9` · Git blob `5040a3d090c75ff05ab0aab956b7efbbe0c1f6df` · SHA-256 `854f55f901c5bbf938c65d674de5dc3182feb1593f38009318bd029a3717ca81`

```text
5: - NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for native menus, picker titles, dialogs, buttons, accessible labels, and displayed errors.
6: - When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
7: - NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
8: - Keep locale and grammar logic in the shared typed i18n layer. Renderer code should resolve copy through the app language API, and the main process should consume typed native-translation bundles through `nativeT(...)`; native menus, dialogs, and IPC handlers must not inspect locales, choose plural categories, or assemble translated sentence fragments.
9: - Prefer complete translated phrases with only irreducible dynamic placeholders. If native UI needs richer grammar, deepen the shared bundle/API instead of adding locale branches to desktop feature code.
```

## Reading limits

A source check is evidence that the guard/state transition exists at this commit. It is not proof of actual provider behavior, process disappearance, installation integrity, UI outcome, platform permission or a passing test. Historical measured/ready labels and development-only proof recipes remain documentary claims. See `l1.md` for family context and `coverage.json` for every assigned leaf.
