# Atomic pinned native notices

Ruff 0.17.3's independently hashed Linux x64 and macOS arm64 archives contain a
binary but no LICENSE. The actual tagged upstream LICENSE, including its third-
party notices, was captured separately at `8fd78ebed1`; its exact SHA-256 is
`2597d854122b77ddc71971564ca2350a37608575ce324adc5650a2b2051c8f18`.
Do not invent a LICENSE archive entry or ship an abbreviated substitute.

The existing `PinnedArtifact.install` already installs multiple separately pinned
artifacts into one staging directory, then publishes `.complete` with one rename.
Reuse it: do not add a second publication phase, rewrite completed installs, or
fetch a notice during a review. This is a host provisioning capability.

NativeEngine gains optional `notices: ReadonlyArray<{url: string,
integrity: \`sha256-${string}\`, filename: string}>`. Each notice is an exact raw
download, mapped to `notices/<filename>` inside the install. Filename is a single
lowercase basename matching `[a-z0-9][a-z0-9.-]{0,127}\.txt`, unique per engine;
no separators, traversal, absolute path or collision with an executable/marker.
Reject malformed metadata rather than falling back to an empty notice list.

Native installation passes `[target.artifact, ...noticeArtifacts]` to the existing
atomic installer. Status/readiness must require every declared notice to be a
regular non-symlink file whose exact SHA-256 matches its declared integrity.
Missing, modified or symlinked notices are not ready. Existing engines with no
declared notices keep their behavior. Hosted/source engines are out of this slice.

Do not repair or overwrite a completed cache whose declared notices are missing;
return the existing lifecycle's named not-ready failure. A new engine/version has
no old license-less completed cache to adopt. The manifest pin remains authority,
not a remote filename or an unverified license-class label.

Implementation ownership: G5 owns backend-toolkit manifest/index/new native-notice
helper and focused fixture tests only. No Ruff runtime registration or platform
compatibility claim follows from this generic install seam. Tests must use real
PinnedArtifact staging and a loopback byte server, never a mocked successful
installer: binary + full notice positive, bad hash before publication, missing/
modified/symlinked notice status, malformed filename/duplicate refusal, concurrent
ensure first-writer, and an existing no-notice engine regression. The lead runs
remote tests and an omitted-notice mutation; no local heavy execution is allowed.
