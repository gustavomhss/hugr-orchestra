# Brand source assets

Six existing PNG/SVG identity assets relocated from `packages/identity`. Relative file names, bytes
and modes are preserved. This is a data directory, not a workspace package.

These source assets are distinct from Desktop channel icons, App public logos and inline UI logo
components. The relocation does not substitute those runtime resources or change visual behavior.
Repository source inventory and Nix input capture include this directory; historical receipts retain
the old paths and their original revision identity.

Changes to the assets need exact byte/mode review. The focused inventory checks live in Core and
Script; run their package-local typechecks with `bun typecheck`. Hosted selectors stay `core` and
`script`, with full distribution qualification reserved for the campaign bundle.
