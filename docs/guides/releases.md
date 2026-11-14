# Validating and promoting a release

`release-cli` and `release-desktop` build artifacts. Their retained `publish` input must be false; true refuses before queries or builds and directs you to `release-promote`. Signing still happens in the producer before packing and hashing.

Freeze the reviewed source on `release-X.Y.Z`. Run both producers, the distribution qualification and the full test workflow on that exact branch and SHA. Keep their successful run IDs and original artifacts. Validate the downloaded application and CLI in an isolated profile, and record the actual checks with the cut.

Approve `VALIDATION.json` only after the producer has generated the final desktop feeds. Each feed URL must point to an installer in the matching immutable `desktop-vX.Y.Z` release. The receipt records the original archives, tarballs, installers and final metadata by path, size and SHA256, with source/version/run identities and runtime validation. Changing a feed after approval invalidates the receipt.

`blockMapSize` can describe a blockmap embedded in an installer and does not require an adjacent `.blockmap` file. Sidecar files that are present remain part of the approved receipt and immutable assets. Metadata checks do not replace the original runtime validation of the installer.

Run `release-promote` first with `publish=false`, then with the same inputs and `publish=true` after validation succeeds. Promotion downloads original producer artifacts, checks their receipt and every effective desktop URL against actual installer size/SHA512, and checks the current feed before creating tags or publishing packages. It never rebuilds or edits approved artifacts.

Existing npm packages are skipped only when their original tarball SRI matches. Existing annotated tags must bind the same source and receipt. Published versioned releases must have exactly the approved assets and digests; conflicting published bytes are not overwritten. A matching draft can finish uploading and be verified before publication.

The mutable `desktop-latest` release receives only update metadata. Its manifests name already verified versioned assets; old fixed-name payloads remain untouched for clients that already fetched legacy relative feeds. Before replacing metadata, promotion records and reads back a version/receipt floor in the release body. Preserve that marker and other release assets.

A crash between operating-system manifests can leave different valid versions visible. The same original receipt can complete the remaining metadata. A newer manifest or floor blocks an older retry; the same floor version with a different receipt also blocks. This is serialized official publication, not an atomic all-platform switch, continuous asset availability, or a CAS against manual external edits.

If an existing unmarked legacy feed is incomplete, stop and obtain release-owner repair guidance. A complete legacy feed can be adopted; a confirmed absent release can bootstrap with its floor before any manifest upload. Authentication, network, malformed metadata and missing artifact errors are failures, not permission to assume an empty release.

If original artifacts have expired, recover the original bytes and evidence under the release owner's process or choose a new reviewed cut. Do not rebuild the same published version, change an existing tag, transform an approved relative-feed receipt, or weaken identity checks. Older relative-feed candidates require a new producer run and validation before approval; immutable versions already published remain protected and may require a new version. Historical validation records remain historical evidence, not approval of a different metadata format.
