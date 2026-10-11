# Owned artifact producer: controlled-build boundary

<!-- producer-scope-exception:begin -->

## PUB-NS-001 — declared human-authorized scope exception

This changes the two hostile-writer gates' acceptance scope. It is an explicit
owner-authorized exception, not a fix for the POSIX source-name race or an
implicit claim that descriptor checks provide inode/name compare-and-swap.

Authorized by the human owner on 2026-10-08 through the lead's question tool.
The question was:

> Achei expansão de escopo: dois testes exigem proteção contra processo malicioso com mesmo usuário, capaz de trocar pastas durante export. Contrato original cobre artefatos em diretório de build controlado. POSIX não oferece rename/unlink condicionado ao inode; proteção contra esse atacante exige isolamento adicional. Confirmo diretório de build controlado como limite, documentando exclusão de mutação maliciosa pelo mesmo usuário?

Exact owner answer:

> Build controlado (Recommended)

The owner authorizes the original owned-build namespace limit: malicious same-UID
mutation is excluded; a privileged publisher capability is not required.
Reason: the stronger hostile-writer contract would require an additional
enforceable isolation capability, beyond this owned-build handoff. This decision
defines the supported boundary; it does not promise future sandbox protection.
<!-- producer-scope-exception:end -->

## Original contract references

`PLAN.md:37` (wording present in original `ae5017bb63`):

> 7. Artifact target, version and bytes are explicit and verified; caches cannot silently reuse another executable.

`PLAN.md:68`:

> Files must be regular files confined to that directory.

`WAVE-2.md:11` at `8a13dcdd53` (lead-owned document, absent from this producer base):

> Export regular raw owned binaries into a schema-1 directory consumed by `ORCHESTRA_CLI_PREBUILT_DIR`, with target-specific filenames, captured version and SHA-256. Preserve source outputs; reject malformed/conflicting/overlapping inputs; no registry/compiler fallback. Native execution/build proof remains a distinct matching-runner check.

These clauses describe the owned-build handoff. They did not specify security
against arbitrary actors already authorized to mutate the publication namespace.
The decision above supplies that previously unstated trust boundary.

## Supported boundary and retained checks

The source, publication parent, and staging namespace are stable and exclusively
build-owned during capture/publication/cleanup. Cooperating producers may contend
for an output, but never mutate another invocation's staging entries or bytes.
Ownership here is a build contract, not an OS-enforced exclusion of the same UID.

Source regularity/nofollow handles, lossless alias/overlap admission, captured
version/target/digests, copied-byte verification, native no-overwrite publication,
fully verified exact retries, and conflict preservation remain required. Their
normal-contract tests are unchanged. Hostile mounts, arbitrary same-UID namespace
mutation, and arbitrary in-place byte mutation are outside the supported boundary.

POSIX parent FDs anchor directory objects, not leaf names. The identity prechecks
are defense in depth; native rename/unlink still select the current named entry.
There is no source-name CAS, privileged publisher, user namespace, daemon, or
caller-asserted authority flag in this scope.

## Executable limitations and landing evidence

Both real interleavings remain in `packages/cli/test/artifact-posix-race.test.ts`:
publication can commit the hostile replacement while the captured stage survives;
cleanup can remove the replacement while the original stage survives under its
renamed entry. Each example asserts one actual interleaving and its observed
filesystem outcome. They are limitation witnesses, not protection guarantees.
If that behavior changes, the witnesses fail rather than silently skipping it.

Historical run `37856140144` recorded two red protection assertions. Reclassification
does not erase that evidence. This edit makes no new green-test claim. One
independent cold review and the lead's single batched native lane are required
before landing; the normal-contract checks remain part of that batch.
