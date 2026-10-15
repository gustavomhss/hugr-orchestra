# Shared Linux workspace

Build context for `AppDockRuntime.create({ root, context, image? })`. The default
image is built lazily, on the selected local Linux Docker engine. One labelled
container keeps installed packages in its writable layer; one labelled home
volume keeps user files. `stop()` stops the container without removing either.
Do not delete the container to implement a restart.

The baseline is Ubuntu 24.04, Xpra `6.5.4-r0-1` (server, x11 and matching common
packages), and HTML5 `21-r1-1`. APT verifies the Xpra repository with its bundled
public signing key, using `Signed-By`; exact versions and APT preferences prevent
silent baseline upgrades. The base starts only xterm. Gio enumerates visible
DesktopAppInfo entries and launches them in the environment of an actual Xpra
child, including its DISPLAY and session DBus address.

The controller binds only `127.0.0.1` with a Docker-assigned port. Certificates are
renewed on start, and the main-process readiness probe verifies the certificate
as its CA. Endpoint credentials are main-process values and metadata is mode
0600. The renderer receives only Linux DTOs. The lead's display coordinator is
responsible for Chromium certificate pinning and Xpra authentication.

Installation accepts the main process's already-picked `.deb` path. Files are
copied to a fixed root-only guest staging directory. dpkg metadata checks native
architecture before APT installs the package and its dependencies. No caller
command, desktop Exec parser, or per-application VM is involved.

Run the focused real-Docker test from `packages/desktop`:

```sh
APP_DOCK_RUNTIME_INTEGRATION=1 bun test ./src/main/app-dock-runtime.test.ts
```

This builds one uniquely owned image, uses one disposable container at a time,
checks actual GTK/Gio launching, installation, restart persistence and foreign
ownership rejection, and removes only its exact disposable container/volume.
The test image is retained. `APP_DOCK_RUNTIME_TEST_IMAGE` can reuse that image for
the ownership test alone. Tests are skipped without the explicit integration
flag; a skipped run is not runtime verification.

## Chromium namespace sandbox

`seccomp.json` preserves the Moby Docker 28.3.2 default policy and adds only an
allow entry for `clone`, `setns`, and `unshare`, as required for Chromium's
unprivileged user-namespace sandbox. Default `ERRNO`, AF_VSOCK restrictions,
io_uring denial and clone3's ENOSYS fallback remain intact. No added capabilities,
privileged mode or application `--no-sandbox` flag is used.

Source: `https://raw.githubusercontent.com/moby/moby/v28.3.2/profiles/seccomp/default.json`.
Profile bytes SHA-256: `7735069913d0bcbc55f9c9a4f977a64fd491172a7a25eca8a4511f86cf3d8c1f`.
Canonical SHA-256: `ba7ed925345f1b6839c40dfe341404ca0cb94f4a2a438b79c058793106713daa`;
canonical JSON sorts object keys lexicographically and retains array order.
The runtime pins this policy for both creation and adoption. Unchanged official
Slack 4.52.162 amd64 displayed its sign-in window with this policy in a real Xpra
view; sandbox remained enabled.
