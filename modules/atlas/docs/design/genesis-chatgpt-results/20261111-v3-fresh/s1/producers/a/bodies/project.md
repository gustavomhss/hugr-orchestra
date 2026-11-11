# Project identity, canonical paths and retained checkpoints

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Project.resolve` discovers a Git repository. Without one it uses the global project identity and the filesystem root as project directory; callers must not mistake that root for the active Location's work area. In a repository, identity preference is normalized remote URL hash, existing common-directory cache, then root commit. The worktree is the resolved project directory and the Git common directory is its VCS store. A cache-write bridge remains for compatibility. `record` inserts/upgrades a project row and publishes an update; `ProjectDirectories` separately stores exact project/directory/strategy membership. [1,2]

Location mutation resolves both lexical and physical identity. Relative paths cannot escape the active Location; a lexical-internal path resolving outside its physical root fails. Absolute external paths produce canonical external-directory approval resources rather than granting access. Missing targets resolve through a real existing directory; dangling symlinks are followed with a bounded hop loop. Path resolution and permission are separate stages. [3]

The general FileSystem service exposes read/list/find/glob/grep. Its read/list boundary validates lexical and physical containment, requires the right target kind, and returns content/listing; search is delegated to `FileSystemSearch`. This service is not itself the model-tool permission surface. The `read` leaf described in the tool artifact adds permission and media/text limits. The list helper can browse directories without opening all Location services. [4]

`ProjectCheckpoint` stores a UTF-8 JSON payload with SHA-256 digest, a Session-derived project/directory owner, a fork ID, boundary and attempt 0 or 1. Its identity is `forkID:attempt`. Save checks exact retries against retained Session ID, fork ID, boundary, attempt and payload before resolving a current Session; exact retries still work after the source Session is gone. A differing payload or identity is a conflict. Reads require project ID plus checkpoint ID and verify the digest; list bounds offset and limit (default 20, maximum 50). Storage/preparation errors are mapped to a safe `storage` reason. [5]

The Session facade restricts move to another resolved directory/workspace in the same project and uses exclusive execution ownership. A fork copies projected history before the requested/staged-revert boundary into a new Session with new message IDs and negative projection sequences; it is not a replay of original external effects. [6]

## Normative intent and limits

The older project specification states the multi-project/worktree goal, but its sketch of HTTP routes is historical design material. Current route authority belongs to the Protocol/Server sources, outside this artifact. [7]

Project-copy strategies, Git mutation, snapshot/revert, formatting/LSP and repository cache each have their own source families. This L1 establishes their ownership and the shared identity/path boundary, not complete implementation of every Git or filesystem operation. Digest checking detects payload mismatch; it does not establish semantic validity, authorization to consume a checkpoint, or guaranteed future restoration. No filesystem mutation, Git operation, checkpoint save/read or product test was run.

## Source anchors

- **1.** `packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — isRoot, identity resolution and record, lines 26–64,85–148,170–191.
- **2.** `packages/core/src/project/directories.ts:7863f4d2640a9b4bd85febab338610446bf839ef` — exact directory/strategy membership, lines 47–158.
- **3.** `packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — resolve and canonical/external resources, lines 12–59,90–175.
- **4.** `packages/core/src/filesystem.ts:46791eb40338be5fcc31bc22d110a9899d6b5d80` — service, containment and list helper, lines 55–135.
- **5.** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99` — save/read/list identity, digests and storage boundary, lines 13–212.
- **6.** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — fork and move, lines 519–590.
- **7.** `docs/specs/project.md:35adeb94cff7e1d24adc9844f9e25fdb17df08a5` — historical multi-project goal and route sketch, lines 1–64.
