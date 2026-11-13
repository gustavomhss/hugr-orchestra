# Offline maintenance overlay verifier

The consumer validates the maintenance-caller overlay without importing Atlas,
preparing an evaluation, installing, extracting, or deploying anything.

It requires four JavaScript/declaration outputs and one manifest, validates
unique identity fields and a closed SHA-256 path set, rejects traversal and
symlinks, checks output hashes, and compares all six source/package hashes
against a separately supplied complete modules/atlas tree. Three source files
also have independent immutable SHA-256 pins embedded in the verifier.

Usage (base-tree is mandatory and must be modules/atlas from the declared commit):

    node scripts/verify-maintenance-overlay.mjs --overlay-dir /artifact/modules/atlas --base-tree /checkout/modules/atlas --base-commit 920794008c16169c486bbd1ca8ef8e962d83f29c --repository gustavomhss/hugr-orchestra

No implicit current working tree, network lookup, or Git ref resolution occurs.
The overlay is not a standalone package; the verifier only authenticates files.
