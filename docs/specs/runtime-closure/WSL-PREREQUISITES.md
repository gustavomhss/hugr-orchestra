# WSL product proof prerequisites

Run from a complete checkout with Desktop dependencies installed and Bun available:

```powershell
bun packages/desktop/scripts/wsl-product-proof.ts --resources C:\producer\raw-artifacts --distro ExplicitInstalledDistro --report C:\reports\fresh-proof.json
```

`--resources` is the real Linux producer's schema-1 raw artifact directory, containing
`manifest.json` and its named binaries. Guest glibc target selects `linux-x64-baseline`
for `uname -m` = `x86_64`, or `linux-arm64` for `aarch64`; version/digest come from producer.
Report parent must exist; report itself must not exist.

Require native Windows, working `wsl --list --quiet`, explicitly named installed distro
with completed first-run setup, compatible glibc, bash, and guest commands:
`env uname getconf sha256sum timeout mktemp mkdir cp chmod mv rm sleep wslpath stat touch`.
Windows loopback must reach guest's `0.0.0.0` listener; port races fail rather than pass.
Desktop runtime import also requires its installed native/translations dependencies.

Hosted WSL previously lacked an installed distro. Future workflow owner must provision
an isolated CI-owned guest or select an explicit self-hosted runner. This harness installs
no distro and supplies no speculative rootfs URL, digest, or provisioning certification.

Boundary: real production installer/admission, manifest verification, foreground CLI
password/serve via production `wslServeScript`, authenticated health and negative auth.
Not Desktop `spawnWslSidecar`, UI startup, daemon registration/restart, or distro provisioning.
Guest HOME/XDG/DB/temp and host negative artifacts are owned temporary storage. Password
stdout stays in memory; server output is discarded; report stores booleans, identity, digest.
Harness has not been executed here. Workflow wiring and combined validation belong to owner.
