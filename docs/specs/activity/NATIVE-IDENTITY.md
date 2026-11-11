# Native tree identity — frozen integration contract

Lead decision, 2026-11-11. Baseline `ae88ee7f81302be367f10c754a8c62c32421466d`, branch `activity-monitor`. This is an additive amendment to the native Child surface, not a wire-protocol change or an authorization API.

## Contract

- Rust `Child::tree_id(&self) -> String`; Node/Bun/Deno `readonly Child.treeId: string` for both pipe and PTY children.
- The Rust client renders its existing supervisor generation and existing tree id as decimal strings separated by `:`. Both u64 values remain exact; JavaScript never converts them to numbers. Consumers treat this string as opaque.
- Private forwarding chain: `client::Tree::tree_id` → `process::Life::tree_id` → public `Child::tree_id` → native getter → JavaScript getter. The first method formats `self.sup.num` and `self.id`; the others only forward.
- The getter is stable after root exit and after stop. It performs no I/O and changes no process state. It reads the supervisor's tree identity, never a sampled PID.
- Uniqueness is within one native host process, across its supervisor generations. The monitor API also supplies a stable `instanceID` UUID for this server/observer lifetime. Future actions must reject mismatched instances; this change exposes no action.
- A supervisor generation is not the membership/path/dirty generation required to confirm an action in R12. No membership-generation or control guarantee is implied.
- `recordID` remains an observation UUID. New optional `supervisorID` holds the actual `treeId` only when the loaded native binding supplies a nonempty string. An older installed binary leaves it unread; the UI does not substitute a PID or UUID.

## Acceptance and verification

1. Two real pipe children in one host have distinct, nonempty native identities; neither is a PID string.
2. Reading identity does not claim the output consumer, close stdin or end a child. A fixture READY marker remains readable.
3. A child's identity stays identical after root exit and after stop.
4. A real PTY child exposes the same identity contract.
5. Rust channel tests return the same raw tree id in two supervisor generations and observe different identities. Large u64 components preserve every decimal digit.
6. Core publishes native identity separately from root PID and observation UUID; separate monitor lifetimes have different instance UUIDs.
7. Schema, generated Client and Trees retain that identity unchanged. The UI labels a missing native address as unread and exposes no process action.
8. Legacy native binaries remain observable with explicit missing identity. Existing ownership, output and lifecycle behavior is preserved.

## Ownership

The delegated native package owns only native forwarding implementations, native unit tests, parity and native API/PLAN documentation. The lead owns the declaration scaffold, the independent binding acceptance file, Core, Schema, Client generation, UI and hosted proof. These write sets are disjoint. No repository branch change, commit, push, application restart or local test is part of the delegated package.

No Relay SubagentStop configuration was found in the checked project settings. A Relay arm supplies deterministic checks but is not claimed as an enforced finish hook here; the lead reproduces checks and reviews the diff before accepting the package.
