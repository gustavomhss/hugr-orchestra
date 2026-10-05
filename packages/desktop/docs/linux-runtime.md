# Linux apps in App Dock

## Use

App Dock has separate **Browser** and **Linux workspace** contexts. Browser
profiles, web tabs and the address bar belong to Browser. Linux shows installed
desktop apps and an **Open windows** selector; choosing a running app restores
and focuses its existing window, including a minimized window. New browser tabs
start empty and open a native view after an address is submitted.

HTML action menus temporarily detach the native view so native surfaces cannot
cover their hit targets. Closing the menu restores the selected view. Toolbar,
permission/status rows and context changes resample native bounds independently
of an occluded renderer's ResizeObserver. Back/Forward follow the actual native
navigation history rather than remaining enabled on an empty history.

The global dialog stack also detaches native views, including the model picker,
provider connection and API-key dialogs. Views stay hidden through stacked-dialog
closure and are restored only when the last global dialog and local overlay close.
This controls Electron's native surfaces rather than relying on DOM z-index.

Development build versions retain the source package's semantic version plus
their preview channel and timestamp. This lets free-tier providers check the
actual client compatibility instead of rejecting a recent build stamped `0.0.0`.
Explicit version overrides remain unchanged.

1. Start a local Linux Docker engine (Docker Desktop on macOS/Windows).
2. Open the desktop's App Dock and select **Linux** in the sidebar.
3. Select **Install** and choose an official Linux `.deb` package matching the
   runtime architecture. Dependencies are installed inside the Linux workspace.
4. Select the installed application in the Linux list. Its native desktop window
   appears in App Dock. The terminal also supports normal Linux package tools.

First opening builds the bundled runtime image if absent; later openings reuse
the same installed workspace. Closing a viewer disconnects graphics without
deleting applications or files. Desktop quit awaits the owned container stop.

Applications that open HTTPS links use the Browser context in App Dock. The
workspace installs a hidden Gio browser handler that relays URLs to an
authenticated listener bound to host loopback; a browser inside Linux is not
needed for this flow. Slack authentication opens a web tab, and an associated
`slack://` callback is delivered to the installed `slack.desktop` in the same
workspace before returning to Linux. Account authentication is completed by the
user in the Browser context.

The current runtime is bounded at 2 CPU cores, 2 GiB, 512 processes, and 128 MiB
of shared memory, and is shared by its apps.
Docker's VM is a separate shared engine; these limits are not a claim about its
whole-machine footprint. Graphics forwarding suspends when the viewer is hidden,
while guest applications can continue their own background work.

Verified on macOS/amd64: GTK and Qt desktop apps, official Slack 4.52.162's sign-in
window with its native sandbox enabled, default Xpra OffscreenCanvas/decoder
workers, install/launch, renderer recovery, stop/restart persistence, and
foreign-origin credential rejection. Windows/ARM64 live verification remains
outside the current measured environment. Audio/microphone/device forwarding is
not enabled in this initial GUI workspace.

## Integration contract

The desktop owns one Linux workspace per `userData` directory. It is shared by
the installed applications; browser profile changes do not provision another
Linux environment. Startup is lazy. Application installation and the guest home
survive container stop/start and desktop relaunch.

## Process boundary

The Electron main process owns Docker commands, persistent ownership metadata,
the Linux-package file picker, endpoint credentials, and certificate pinning.
The renderer receives only the DTOs exported by `@opencode-ai/app/app-dock-linux`.
It cannot choose host paths or submit shell commands. Initial package picking
supports `.deb`; the guest terminal remains available for native Linux package
management. App enumeration and launching use Gio desktop application metadata.

The Linux workspace is an App Dock tab identified by `appdock://linux`. This is
a presentation identity, not a navigable browser URL. The ordinary HTTPS URL
guard remains the network admission boundary. Linux viewer endpoints, passwords
and certificate material never enter the browser manifest or history.

## Runtime controller

`AppDockRuntime.create({ root, context, image? })` returns:

- `start()` -> `{ url, fingerprint, password }` (main-process only)
- `state()` -> `LinuxState`
- `install(filePath)` -> `LinuxApp[]`
- `launch(appID)` -> completion
- `stop()` -> awaited stop preserving installation/data

`root` is dedicated desktop state; `context` contains the bundled build recipe.
The controller uses a stable owner ID and verifies container/volume labels before
adopting or stopping resources. It serializes start/install/launch work. Docker
CLI calls are bounded. The default workspace limit is two CPU cores and 2 GiB;
these bounds include the guest applications and are not a universal app-size claim.

Read-only engine queries use a keep-alive connection to the captured local socket
or named pipe. Ownership, durable container identity, mounts, sandbox policy, and
resource limits are checked against current engine responses on every operation.
Only the display catalogue is cached for five seconds, keyed by endpoint,
container ID, and start timestamp. Install completion refreshes it immediately;
stop, failure, and a different container incarnation invalidate it. Changes made
through the guest terminal appear after the short catalogue expiry. Gio revalidates
the actual desktop application when launching it.

Concurrent state reads share one in-flight read, with separate public snapshots.
A newly queued mutation is a join barrier, including operations from another
controller using the same root; a read after that barrier cannot adopt an older
in-flight result.

Cold start refreshes the bundled helper in the verified, stopped container before
starting it. It checks both filesystem and abstract X100 sockets before removing
stale X11 lock/socket paths. A live display or an unexpected probe failure rejects
cleanup. This avoids an old lock PID being mistaken for a new process after a
host reboot, while retaining the installed workspace and home volume.

## Browser handoff

`browser-bridge.py` is refreshed in the verified workspace when a viewer is
admitted. It registers the hidden Orchestra HTTP/HTTPS desktop handler through
Gio. Its endpoint and random token live in a private mode-0600 file. The host
listener binds only to loopback, authenticates requests, bounds JSON payloads,
and accepts HTTPS URLs without embedded user credentials.

Only browser tabs opened by a guest handoff or its popup lineage receive a
callback claim. Claims bind sender, tab generation, Linux viewer and container
incarnation, expire after 15 minutes, and are consumed before delivery. Manual
navigation, recovery, viewer retirement and tab closure revoke the relevant
claims. An unrelated browser tab cannot send a callback into Linux.

Slack callback delivery rechecks current runtime ownership and incarnation, then
passes the URI on stdin to an actual Gio desktop launch. Callback credentials
stay out of command arguments, renderer events and reported failures. The
ordinary HTTPS admission boundary remains intact; unsupported external schemes
retain the existing behavior. The forwarding bridge does not stop guest apps or
replace Slack Desktop with its web version.

Desktop sign-in pages can dispatch their callback from a hidden iframe.
`will-frame-navigate` intercepts these callbacks using the same claim checks as
main-frame navigation and popup interception; `will-navigate` alone cannot see
subframe navigation.

The local real Electron/Docker test covers default-handler handoff, iframe and
popup callbacks into an actual Gio URI receiver, return to Linux, unrelated-tab
rejection, replay rejection and callback exclusion from renderer events. Removing
the frame hook fails the iframe receiver check; removing URI delivery also fails
the receiver check. These fixtures do not perform account authentication.

After the user completed browser authentication, a separate live check recovered
the stopped owned workspace and launched the original Slack Desktop. Its native
window displayed the Portuguese workspace-naming onboarding page. Browser login
was not repeated. This proves the native app progressed past sign-in with the
persisted session; completed workspace setup and normal channel use were not
part of that check. When graphics return to the connection page, open Linux
again to recover the workspace and then select the installed app.

## Display lifecycle

The main process mounts the stock Xpra client in the existing sandboxed
`WebContentsView`, authenticates through its session storage, and pins the owned
loopback certificate in the associated Chromium session. Browser profile IDs
select Chromium storage only.

App Dock visibility changes send Xpra `suspend` / `resume` protocol packets for
the owned Linux view. Closing a view disconnects its client while guest work
remains alive. Quitting/relaunching the desktop awaits runtime stop. Failed or
abandoned startup must not leak an unowned container.

Physical owner-window visibility is also observed. Minimize/hide apply the stock
HTML5 suspend operation plus locked per-client batching with a 60-second delay;
restore/show reset batching and refresh the existing windows. The bare Xpra 6.5
suspend signal alone does not suppress window painting. Repeated selections are
coalesced, owner-state sampling waits for native visibility flags to settle, and
retired views remove their owner-window subscriptions.

An authenticated, connected view is reused without repeating provisioning. Opening
or launching it focuses the native view. Linux uses a workspace toolbar rather
than disabled browser navigation controls; its installed-app list stays near the
top of the sidebar. Sidebar layout follows the panel's width, including RTL.
Native geometry updates coalesce through a microtask rather than an animation
frame: Electron can hide the owner document while its native view remains visible.
Direction changes also resync bounds when dimensions themselves have not changed.
An occluded document can suspend ResizeObserver and native DOM resize delivery as
well. Sidebar toggles explicitly request resampling; native owner resize/restore
events request it from the trusted renderer independently of document visibility.
Successful Linux admission also resamples after the logical tab changes toolbar
height, including reauthentication of an existing view.

If the stock client returns to its trusted connection page after transport loss,
opening Linux reauthenticates the same view. Foreign origins and unexpected paths
still fail the existing admission boundary.

HTTPS popups are independent browser tabs with current panel bounds and normal
renderer events. The privileged Linux client origin cannot be opened as a browser
popup. Browser automation cannot read or evaluate the Linux client's DOM/storage;
the main process retains its authenticated-client boundary.

Desktop console collection is limited to the owner renderer's main frame. Remote
views and their subframes are excluded: the stock Xpra client prints authentication
material during connection. The real logging regression keeps a trusted-renderer
positive control while checking that remote console events and the runtime password
never enter the renderer log.

Host clipboard, printing, and file-transfer capabilities are disabled. HTML5 21
overwrites its clipboard setting during server hello, so the coordinator reapplies
the disabled capability on connection and reconnect. Expected clipboard-denial
events are not shown as workspace errors. Guest application clipboard operations
remain inside Linux.

## Local audit measurements

On the macOS/amd64 demo with official Slack's sign-in window open, a read-only
controller probe measured catalogue queries at 1700 ms on its first call, then
420 ms and 441 ms on warm calls. The earlier desktop-controller query measured
6824 ms. These are local samples under changing machine load, not a latency SLO.

The same probe reported 451.8 MiB in the workspace cgroup and 0.09% CPU at that
instant. This excludes Docker's VM, Electron renderers, and other host processes.
No total-machine footprint or authenticated Slack-session performance is inferred.

Regression checks cover browser-access rejection, current popup bounds, private
origin rejection, stale renderer selections, Linux-view replacement, and closure
of an unrelated profile during admission. In-memory mutations of popup forwarding
and close ownership make the real Electron/Docker flow fail; source remains intact.

The full built desktop was also rechecked in an isolated macOS/amd64 onboarding
instance using the existing owned workspace and persisted Slack installation.
With CDP viewport overrides cleared, renderer host bounds, the native view,
Xpra's viewport, and maximized Slack geometry agreed through sidebar expansion
and collapse, main-window resizing, and LTR/RTL direction changes. Deliberately
changing the native width made the geometry probe fail before restoration.

An actual Electron keyboard-input sequence executed a command in a newly opened
xterm. Independent guest-file inspection and X11 focus inspection verified the
result; the probe file and terminal were then removed. The current desktop's
console and network logs retained a trusted-renderer marker while excluding an
observed remote-console marker and the runtime password. These are local smoke
checks, not authenticated Slack-session or display-scanout measurements.

The Slack sign-in button was then verified opening the actual Slack login page
in native Linux Google Chrome 154.0.8037.97, installed in that same workspace.
The Linux HTTPS and Slack URI handlers were registered, and Chrome usage
reporting was disabled. Sampled Slack and Chrome renderers had `NoNewPrivs=1`
and an additional seccomp filter beyond the container control, without a
`--no-sandbox` flag. Account authentication and its completed callback were not
part of this smoke check.

No public Protocol or Server HttpApi changes are part of this contract.

## Performance recheck

A paired local comparison used a frozen pre-change runtime and the optimized
runtime against the same running workspace, alternating their read-only calls.
The final sample measured warm catalogue/state reads at 401–604 ms before and
14–25 ms after (four samples per variant, approximately 25x lower mean latency).
Four concurrent reads completed in 1733 ms before and 35 ms after when the
catalogue was still warm. Earlier samples under higher memory pressure varied
substantially; these are observations, not a latency SLO.

An animated real GTK window using the default protocol and OffscreenCanvas
workers produced 121 acknowledged paints during a 15-second minimized-owner
sample before the visibility fix. After the fix it produced zero during the
same-length minimized sample and resumed to 160 after restore. Visible controls
produced real frames in both variants. The regression asserts actual decoded
paints, not merely that a suspend packet was sent; reverting the hidden batch
delay to one second makes it fail.

The single-view native GTK key-to-offscreen-painted acknowledgement probe measured
20.4 ms p50 and 40.1 ms p95 before tuning, with actual black/white screenshot
controls and a detected injected delay. It excludes display scanout, and the
control-path improvements above are not a claim of faster authenticated Slack
rendering. The live demo was still at sign-in during this measurement.

The resource probe measured a 1.25 GB guest working set at that instant, with
Chrome and Slack running. It calibrated cgroup CPU and memory counters through
an actual allocation and short CPU load. No total-host or whole-VM memory
reduction is inferred from those cgroup samples.

## Recovery recheck

The post-reboot macOS/amd64 recheck reused the recovered workspace in an isolated
full Desktop build. Runtime installation/persistence and ownership checks passed
with 54 assertions; the renderer suite passed 17 tests with 76 assertions. Both
package typechecks and the main, preload, and renderer builds completed locally.
The real Electron/Docker lifecycle also covered hidden-owner native resampling,
trusted connection-page reauthentication, retired-listener cleanup, and the
existing foreign-origin credential boundary.

The full Desktop retained the same native view and logical identity through
reauthentication. Host bounds, native bounds, the Xpra viewport, and maximized
Slack geometry agreed after admission and native resizing, including an occluded
owner document. Sidebar and forced direction changes were also checked. Removing
X11 cleanup, the reconnect path check, the native resize subscription, or the
post-admission resample made their named checks fail. A deliberately changed native
width was detected before restoration.

An animated native GTK control acknowledged zero paints during a 10-second
minimized sample; visible and restored controls each acknowledged six paints,
with the same guest PID. This checks display suspension, not authenticated Slack
performance or display scanout. An Electron WebContents capture with `stayAwake`
showed the actual Slack sign-in screen. One earlier CDP capture contained canvas
placeholders, so that capture alone was not used as evidence of the app's pixels.
Account authentication remains user-owned.

## Usability correction

The earlier runtime/paint checks did not establish usable navigation. A user
reported mixed Browser/Linux identity and unresponsive controls. The UI recheck
reproduced duplicate browser admission (an IPC event plus its return value),
history buttons enabled without history, missing guest-window selection, and
native surfaces occluding HTML controls. These paths now have explicit context,
idempotent admission, real history state, controlled guest-window activation and
native-surface suspension for overlays.

Local browser interaction checks covered address submission, Back/Forward,
bookmarks/actions, closing the last web tab while staying in Browser, and
Browser/Linux switching. Guest checks covered app activation, a minimized xterm
restored through the window selector, workspace reauthentication, and matching
host/native geometry after permission rows changed. The renderer suite passed
19 cases; the actual Electron/Docker lifecycle and security flow passed. Removing
idempotent admission or background-window focus made the corresponding regression
fail. The focus control switches to an independent window first: minimizing alone
could restore focus implicitly and let an incomplete mutation pass.

New Brazilian Portuguese terminology was checked against Mozilla Firefox's
`pt-BR/browser/browser/preferences/preferences.ftl`, KDE Dolphin's
`po/pt_BR/dolphin.po`, and Priberam's definition of *navegador*. Existing English
copy was preserved; the new context/window keys use the shared locale fallback.
