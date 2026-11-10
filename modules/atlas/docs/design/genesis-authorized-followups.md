# Authorized follow-ups — owner, 2026-11-10

The owner authorized the two items the lead had stopped. No mine. No paid consumer. No semantic PASS on historical hashes. No second store.

## AC-03 reader proof

The eight keys in `ac03-direct-use-matrix-v1.json` stay historically unconsulted. A direct-use proof is a real `ownership.read` by `key` that returns that artifact's body section.

Test file: `modules/atlas/packages/adapter-io/test/ac03-direct-use.test.ts`

Use `ownershipFixture` and `ownership.read({ scope, key, maxBytes })`. Publish one manifest whose entries are the eight keys. Each body contains a unique section line `section:<key>`. The read for that key returns a ready result whose body contains that line. A key that is not in the manifest holds `ownership-missing`.

Do not set matrix `disposition` to PASS. Add `readerProof` pointing at the test file. Leave `disposition` as `OPEN`.

## Old-producer refusal

`ownership-rebuild.test.ts` RB-16 already refuses `recipeVersion: "recipe-a-999"` as `malformed-ownership` and does not execute. Do not rename that reason.

Add one test, `G4-01 old-producer-cannot-publish`, in `modules/atlas/packages/adapter-io/test/ownership-rebuild.test.ts`, using the same fixture. An old `recipeVersion` returns hold, `executed` is empty, and the result is not `kind: "candidate"`. Cite RB-16. Do not add a migration API.
