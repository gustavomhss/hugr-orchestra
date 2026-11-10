# G4 activation recipe

Citation card for existing doors. Not a new procedure, not a migration API, and not a G4 close.

## Rebuild returns a private candidate and does not publish

- `modules/atlas/packages/adapter-io/src/ownership-rebuild.ts:5`
- `modules/atlas/packages/adapter-io/src/ownership-rebuild.ts:6`
- `modules/atlas/packages/adapter-io/src/ownership-rebuild.ts:298`

## A CAS put is not publication

- `modules/atlas/packages/adapter-io/src/ownership-access.ts:13`
- `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts:39`

## Publication is the governed emit, and it refuses without a ratification token

- `modules/atlas/packages/adapter-io/src/governed-emit.ts:308`
- `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts:54`
- `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts:60`

## Projection activation is commitProjection

- `modules/atlas/packages/adapter-io/src/store.ts:137`
- `modules/atlas/packages/adapter-io/src/store.ts:301`

## A foreign or untrusted replacement is refused and the previous projection remains

- `modules/atlas/packages/adapter-io/src/sidecar-commit.ts:294`
- `modules/atlas/packages/adapter-io/src/sidecar-commit.ts:310`
- `modules/atlas/packages/adapter-io/src/identity-schema.ts:223`
- `modules/atlas/packages/adapter-io/test/g3-recovery.test.ts:113`

Foreign identity is refused and the reopened load returns the previous projection. The untrusted write is refused at `modules/atlas/packages/adapter-io/src/sidecar-commit.ts:294`, and G3-03 says that seam blanks the projection on read.

## A torn readable predecessor is not erased

- `modules/atlas/packages/adapter-io/src/sidecar.ts:359`
- `modules/atlas/packages/adapter-io/src/sidecar.ts:375`
- `modules/atlas/packages/adapter-io/test/sidecar.test.ts:254`

## Old-producer publication refusal is not this recipe

- `modules/atlas/packages/adapter-io/test/g3-recovery.test.ts:116`
- `modules/atlas/docs/design/genesis-g3-recovery-contract.md:30`

`87abf90956` also holds RB-07 (`modules/atlas/packages/adapter-io/test/ownership-rebuild.test.ts:274`, recipe-a-2) and RB-11 (`modules/atlas/packages/adapter-io/test/ownership-rebuild.test.ts:342`, recipe-b-2), so it is not the door. Do not cite fork/old-producer-refusal.
