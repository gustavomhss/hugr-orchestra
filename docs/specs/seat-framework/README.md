# Native seat framework

Each native specialist has one definition in `packages/orchestra/src/maestro/seats/<id>.ts`, registered in `seats/index.ts`. Maestro keeps its fixed name. Specialist ids route work; labels are presentation (`agent.<id>.name`, optionally overridden by `labelEnv`). The backend default label lives only in `BACKEND_DEFAULT_LABEL` in `roster.ts`.

## Definition

- `id`, `role`, `abilityClass`, `returnCard`, `forbiddenActions`, `prompt`: stable identity and charter. Prompts may render `{{label}}`.
- `profile`: shared `execution` or `review` permission base. Existing seats retain their historical roster/profile projections and behavior. New seats receive their own profile key unless `profileKey` declares a separate stable projection; aliases cannot collide with bases or other installed seats and do not change routing or grants.
- `description`: task-list guidance describing role, access and return without display labels.
- `labelEnv?`, `skills`: label override and seat-scoped entry skill names. Backend and Archie skills live in `modules/specialists/<id>/skills/<skill>/SKILL.md`; other seats and the scaffold retain `packages/<id>-specialist/skills/<skill>/SKILL.md`. Companion references remain in their tree. Source runs read it directly; Bun binaries and Node sidecars embed and extract each tree into a content-addressed cache directory.
- `writeRoots`, `strictResume`: host-bound dispatch `writePaths` (read-only when absent) and retained logical-task resume enforcement.
- `workResult?`: result schema id for a closed worker-claim card. The fenced tag is `returnCard`; task metadata carries parsed claims separately from host termination, task identity and enforced roots. The upstream `archie` seat uses `upstream-work-result-v1` for proposal artifacts and host-observed authorship; other installed work-result seats retain the execution card shape. This is evidence, not acceptance, approval or materialized artifact identity.
- `atlasMemory`, `toolkit`: supported capability boundaries below.

## Supported boundaries

Current upstream example: `id: "archie"`, `profileKey: "upstream"`, config `agent.archie.name`,
packaged tree `modules/specialists/archie/skills/`, entries `archie-plan` and `archie-work-package`.
This is an ID correction, not a display-only alias or a new permission/memory/toolkit grant; historical
source receipts keep their original IDs. See [naming correction](../upstream-specialist/NAMING-CORRECTION.md).

Permissions extend shared bases with only the seat's entry skills and read-only external skill root. Native config cannot widen permissions. Existing execution/review members keep their semantics.

### Shell read boundary

Argument checks cannot confine what a command reads at run time (`python -c`, scripts, `xargs`, variables), so on macOS and Linux every native seat's shell command runs in the OS sandbox (`ToolSafetySandbox.wrap`: seatbelt on macOS, `srt` over bubblewrap on Linux) with reads confined as well as writes (`ToolSafety.Profile.sandbox.readRoots`, built by `seatProfile` in `src/tool/shell.ts`). One policy on both platforms; a seat command may read:

- its worktree and instance directory, and the git directories a linked worktree keeps outside it (`gitdir` and its `commondir`);
- saved tool output (`TRUNCATION_DIR`), the external directories its native profile grants (its skill root), and the backend toolkit root for the toolkit seat;
- its write roots and per-command scratch directory (`TMPDIR` and toolchain caches);
- the host toolchain (`ToolSafetySandbox.toolchain`): `/usr`, `/bin`, `/sbin`, `/opt`, `/nix`, the libraries (`/lib*` on Linux; `/System`, `/Library/{Apple,Developer,Frameworks}`, dyld and timezone data, the selected Xcode and the record that its license was accepted on macOS), the essential `/etc` entries (users, hosts, TLS, loader, locale, time; never `hostname`, `machine-id`, `shadow` or `ssh`), the runtime's and every `PATH` directory with the install prefix of a `bin` directory not directly under the home directory, git's `~/.gitconfig` and its XDG `config`, `ignore` and `attributes` files (never the XDG credential store `git/credentials`), and exactly what a rustup-proxied cargo needs: the proxies in `CARGO_HOME/bin`, `RUSTUP_HOME/settings.toml` and `RUSTUP_HOME/toolchains`, and what an offline build of fetched registry dependencies reads, `CARGO_HOME/registry/{index,cache,src}` (never cargo's `credentials`, `credentials.toml`, `config` or `config.toml`, its git databases and checkouts, nor rustup's `downloads`, `tmp` or `update-hashes`). `CARGO_HOME`, `RUSTUP_HOME` and `XDG_CONFIG_HOME` count only when absolute and neither a home nor above one, and a granted entry that is a link counts only when it resolves inside its home, inside a system root, or to a file keeping git's own names (a dotfiles link). Cargo's credentials and config, its git databases and git's XDG credential store are also denied outright, so they stay unreadable where a readable root holds them (a `CARGO_HOME` under `/usr` whose `bin` is on `PATH`). Git dependencies do not build in a seat: cargo opens the git database to resolve even a locked one offline; vendored and path dependencies do.

Every other path, the rest of the home directory included, is denied; data, state, `.ssh`, `.aws` and the other credential paths stay denied for reads and writes, except that saved tool output under data is carved out read-only. A host whose sandbox cannot start refuses the command with `shell-read-sandbox-unavailable: <reason>` and never runs it unconfined, whatever `unconfinedFallback` says; on Linux a first command waits for the sandbox runtime's first download instead of refusing. Linux CI runners install bubblewrap and socat (`test.yml` and `test-ci.yml`), so seat shells run confined there.

Owner decision (2026-10-11): Maestro's reads are not sandboxed. Maestro keeps argument checks with permission asks, because the owner answers them; seats cannot ask, so the sandbox decides for them.

On Linux, srt guards dotfiles a writable root lacks (`.bashrc`, `.gitconfig`, `.vscode` and the like) with placeholders that cannot be opened, so a recursive `grep` over the worktree root reports them; `rg`, which skips hidden entries, does not.

Limit: Windows has no read sandbox. There seats keep only the argument checks (`ShellScan`: out-of-workspace operands are refused, and a read operand only the running shell resolves fails closed), which do not confine interpreters or programs that build their own paths.

Skill trees support UTF-8 text only, including companion references; binary companions are unsupported. Embedding rejects invalid or nonlossless UTF-8 and preserves authored bytes without whole-tree newline normalization. Packaged skill-tree text checks out with LF on every platform, including JSON and TypeScript companions; Git's binary detection preserves binary bytes, while embedding still rejects unsupported content. Source and compiled startup fail closed if a declared tree or entry is missing or invalid; project/global skills cannot substitute for packaged entries. Every `SKILL.md` must be a declared, seat-scoped entry with its matching string name and optional string description, using the runtime frontmatter parser.

Source roots and extracted tree roots must be real directories, not symlinks; tree entries cannot be links or escape their root. Extraction verifies the content digest before reuse and serializes cooperative publication of each cache copy. This confines supported authored trees and cooperative starts, not hostile concurrent filesystem rewrites or symlinked cache ancestors.

Atlas Memory's public boundary and durable receipts have one supported owner: backend. Definitions requesting it for another id fail. Exposure requires the native owner's capability; no new seat is bound to backend memory. Backend toolkit packs, runtimes and skill content remain backend-only; requesting that toolkit from another seat fails. Core derives its closed entry-skill type from the packaged directories via `bun script/toolkit-pack.ts skills` (run in `packages/core`). Core does not import orchestra.

## Add and qualify a seat

From `packages/orchestra`:

```sh
bun script/seat.ts add <id> --role "<role>"
```

The scaffold creates a definition, prompt, initial skill/reference tree and barrel entry. Invalid/reserved ids and occupied paths are refused. It seeds scoped execution, strict resume and the shared return card, without Atlas or toolkit grants.

Owner decision (2026-10-07): interrupted creation fails closed. An existing scaffold lock and any partial artifacts are preserved for owner review; another invocation never deletes them or steals the lock. Ordinary failures roll back only artifacts created by that invocation. Automatic crash recovery is outside this scaffold's contract.

Qualification sequence: **charter → skills/references → fit-qualified toolkit packs → return card → charter plus real Maestro seat evaluation**. The scaffold is a starting point, not a qualified specialist. New toolkit ownership needs a separately supported boundary; do not flip a capability to reuse backend engines. Evaluate real dispatch, permission/write scope, result evidence and domain task quality before adoption.
