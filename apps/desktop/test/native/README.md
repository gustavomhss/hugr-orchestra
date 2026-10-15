# W0 isolated Linux development session

This bootstrap launches real Mousepad/GTK3, FeatherPad/Qt and official VS Code/Electron.
Dependency installation, bus reachability and launch receipts do **not** prove semantic
readiness or native operations. The lead runs W0's tree/action/file/config oracles separately.

## Build

From `packages/desktop/test/native` in the bootstrap worktree:

```sh
docker build --provenance=false --tag orchestra-a11y-test:20260930 .
```

The Ubuntu 24.04 multi-architecture index is digest-pinned. VS Code `1.140.0`, commit
`07f806f999227108933c2e30515b26eecc1fda74`, uses official Microsoft Linux x64/arm64
archives with separate SHA-256 checks. Selection uses **guest** `dpkg` architecture;
no host binary is copied. Build/run on a matching Linux guest architecture. Cross-builds
and emulation do not establish native ABI or performance coverage.

Ubuntu apt repositories remain live. `/opt/orchestra-a11y/versions.json` records the
complete installed package/version closure, Python/PyGObject/GLib and actual VS Code
Electron/Chromium/Node versions. Retain the built image ID with every proof receipt;
the Dockerfile alone does not promise a byte-identical future apt resolution.

## Lead-owned start

Set `BRIDGE_DIR` to the absolute production-helper directory and `PROOF_DIR` to the
absolute probe-script directory. Verify both directories exist before this sequence.
Only the lead starts the full testbed; heavyweight probes run serially.

```sh
docker volume create --label orchestra.a11y.owner=dock-accessibility orchestra-a11y-session-20260930
docker volume create --label orchestra.a11y.owner=dock-accessibility orchestra-a11y-home-20260930
docker run --detach --name orchestra-a11y-session-20260930 \
  --label orchestra.a11y.owner=dock-accessibility \
  --network none --shm-size 256m --stop-timeout 10 \
  --mount type=volume,src=orchestra-a11y-session-20260930,dst=/session \
  --mount type=volume,src=orchestra-a11y-home-20260930,dst=/home/proof \
  --mount "type=bind,src=${BRIDGE_DIR},dst=/bridge,readonly" \
  --mount "type=bind,src=${PROOF_DIR},dst=/proof,readonly" \
  orchestra-a11y-test:20260930
```

Named volumes copy the image's UID/GID 1000 directory ownership. A bind-mounted
`/session` or `/home/proof` must already be writable by guest `1000:1000`. Use fresh
volumes for fresh oracles; reusing the home volume deliberately preserves saved files
and settings. No host display, home, configuration, D-Bus socket or privileged mode is needed.

## Session and channel paths

- Supervisor: `/usr/local/bin/orchestra-a11y-session`, under `tini`; UID/GID `1000:1000`.
- Xvfb: display `:91`, `1280x900x24`, authenticated with `/session/Xauthority`, TCP disabled.
- Session bus: `unix:path=/session/session-bus`; independent `dbus-run-session`.
- Accessibility bus: `org.a11y.Bus.GetAddress`, socket `/session/runtime/at-spi/bus_91`.
- `/session/environment.json`: atomic environment publication including both full
  bus addresses, `DISPLAY`, `XAUTHORITY`, `XDG_RUNTIME_DIR`, `HOME`, toolkit enablement
  and `ORCHESTRA_A11Y_SESSION_ID`. This file appears after apps launch, not after semantic proof.
- `/session/apps.json`: apps keyed `mousepad`, `featherpad`, `vscode`; `pid`, `startTicks`
  (Linux `/proc/PID/stat` field 22), `bootID`, PID/mount namespace identities, executable,
  launch epoch, argv, file path and a non-atomic descendant process-identity sample.
  These are launch evidence, not confirmed exporter/window bindings; revalidate live identities.
- Editable inputs: `/home/proof/{mousepad,featherpad,vscode}.txt`.
- Electron config oracle: `/home/proof/vscode-profile/User/settings.json`;
  extensions: `/home/proof/vscode-extensions`. Bootstrap never seeds the target
  `files.trimTrailingWhitespace` setting. Existing files/settings survive restart.
- Version closure: `/session/versions.json`; process logs: `/session/logs/*.log`.

Load the published environment for each helper/probe without starting another bus:

```sh
docker exec --interactive --user 1000:1000 orchestra-a11y-session-20260930 \
  /usr/local/bin/orchestra-a11y-session --exec python3 /bridge/main.py
```

Replace `/bridge/main.py` with the actual helper entrypoint, or `/proof/<probe>.py`.
`--exec` preserves raw stdin/stdout/stderr. A separate helper container must share the
same `/session` mount at the same path, UID/GID and the testbed PID namespace
(`--pid=container:orchestra-a11y-session-20260930`) for `/proc` identity checks; mount
`/bridge` and `/proof` read-only there too. Share the home volume only if its independent
file oracle needs it. Start the helper only after reading the current environment receipt.

## Stop and constraints

```sh
docker stop --time 10 orchestra-a11y-session-20260930
```

The supervisor terminates/reaps its owned launch group and detached descendants with
finite deadlines, removes the environment publication and owned bus sockets, and leaves
launch/version/log receipts. App exit is allowed for restart/removal probes; restarted apps
need new launch evidence. No automatic retries or relaunches occur.

VS Code's recorded test-only flags include `--no-sandbox`, `--disable-gpu` and
`--disable-dev-shm-usage` for container constraints, plus forced renderer accessibility,
disabled extensions/workspace trust and an isolated profile. They affect this guest proof
only. GTK/AT-SPI typelibs, GTK4 introspection and `xdotool` are development/setup tools;
the production helper only needs Python, PyGObject Gio/GLib and the session's AT-SPI/D-Bus.
No window manager, Xpra, model-facing tool composition or helper resource envelope is proved here.
