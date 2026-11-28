# A05 — open acquisition findings and preservation observation

Status: **keep [#1684](https://github.com/gustavomhss/hugr-orchestra/pull/1684) in draft** at production source `0076ad37e7adb98746f63b0f95a8431a7a552b29`. Core and Main selected acceptance is GREEN; the findings below prevent a positive landing recommendation. This record does not claim an exploit, a disclosed output leak, command execution or an observed out-of-memory event.

## Directory authority during object acquisition

Source: [scoped-history.ts](https://github.com/gustavomhss/hugr-orchestra/blob/0076ad37e7adb98746f63b0f95a8431a7a552b29/packages/core/src/review-toolkit/scoped-history.ts#L421), blob `b82a4e19424699390ea4cce03c497e46754c9b5f`, SHA-256 `d06224addad7b2b6295ef4c551d41d8acfe62fe69c6db9ea4969635cf74f1424`.

The projection checks a parent pathname with `realpath` before enumeration and again after copying. It opens the file pathname with `O_NOFOLLOW | O_NONBLOCK`. No-follow protects the final path component; it does not retain stable authority over parent directories across intervening awaits. A concurrent parent replacement with an external directory reference, restored before the final check, can leave the already opened regular-file handle outside the original object-store authority. Before/after `fstat` checks establish stability of that handle, not membership in the original directory.

This is a source-derived race finding confirmed by two reviews, not a runtime exploit result. Integrity checking, the captured anchor, exact selected paths and content hashes constrain usable historical output. They cannot undo a read outside the authorized directory during acquisition. More checks on the pathname after reading do not establish the missing continuous authority.

The corrective packet must retain stable directory authority or justify an immutable source mechanism, with a deterministic hosted regression frozen against the existing contract before production changes. No broader filesystem grant, new executor or weakening of exact captured-source authority follows from this finding.

## Host enumeration allocation before admission

The reader accepts at most 258 outer entries, 16,384 object-store entries and 256 MiB of copied objects, with repository metadata capped at 1 MiB. These are admission/copy bounds. [Bun 1.3.14 `Dir.read`](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/js/node/fs.ts), blob `ef7c8714aa8bb3748af94de00beff0a362513ef5`, internally performs eager `readdir` before the caller can enforce its accepted-entry limit. The Git child's ResearchProcess RSS supervision does not supervise that preceding host allocation; the callback deadline does not establish a host-heap bound.

The passing fixtures establish their observed entry/byte/refusal behavior. They do not establish bounded enumeration on arbitrary large or changing stores. No observed CI host exhausted memory. Recording this limit does not itself relax the contract or authorize landing the enabled route.

Two investigated Git substitutions were rejected without changing production or frozen acceptance:

- `git ls-files` reaches repository discovery before candidate filename validation. [Git v2.56.1 `dir.c`](https://github.com/git/git/blob/v2.56.1/dir.c), blob `d896e7be4b1fd2fad965712c68ac9aa851fcbe27`, and [setup.c](https://github.com/git/git/blob/v2.56.1/setup.c), blob `0d157ac2548f006aa727a3c144a13174434d49c1`, establish the nested-repository inspection concern.
- `git diff --no-index` between two directories can avoid selected payload reads in the investigated restricted path, but it does not establish confinement. Git's [Windows attribute mapping](https://github.com/git/git/blob/03b41523c576f26ad34085378717a0c1b287470f/compat/win32.h), blob `671bcc81f93351909e01b82278e7e5195b788f84`, can classify a mount-point junction as a directory and traverse it. Pathname `lstat`/open races remain. [diff-no-index.c](https://github.com/git/git/blob/03b41523c576f26ad34085378717a0c1b287470f/diff-no-index.c), blob `f320424f05fe0f3c0a33f1fca937282f4621ee9c`, also does not eliminate startup/config/environment and configurable order-file concerns. It is not a qualified drop-in replacement.

## Windows preservation timeout

The 23-file selection at snapshot `e9ba40cedf386f4a0596a191cbebcbbc519d0cde`, run [46180600651](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46180600651), passed types on all hosts. Linux and macOS had 122 PASS; Windows job `141089051103` had 121 PASS and one timeout at **5000.88 ms**, against the unchanged **5000 ms** limit. The failing case was `registered plan APPROVE then code FIX_FIRST keeps the host round when the prior card is forged or absent` in `lucy-governed-round.test.ts`. There was no assertion mismatch or stack identifying the blocked await. Cleanup `141091855509` passed.

The isolated diagnosis keeps the same test blob `178220b2841aca0a19d3b275ec9ba21ebd6c756e`, SHA-256 `cc1058a4b66cdbffec6f4fa29cfcc4a659f5336ea8322a9ba51924c99828c316`, on the base and candidate. No test assertion, timeout or production byte was changed for this comparison. Both snapshots add only `.ci-run.json` and the package-typecheck step.

| Source | Snapshot / run | Observation |
| --- | --- | --- |
| Base `8cf8407fbd4508a59ea8465d947d5b06e5c49296` | `2dd921cacbb8535c45d3dd07939cbcffdceb62cb`; [46181796099](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46181796099) | Types PASS; 0 PASS / 1 timeout at 5015.19 ms; 128 Omni, 0 delegated; no expect-count emitted. Job `141092791972`, cleanup `141093249715` PASS. |
| Candidate `0076ad37e7adb98746f63b0f95a8431a7a552b29` | `9ef8d82486d1fb95b969175491e3395ff9d53f9d`; [46181797487](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46181797487) | Types PASS; 0 PASS / 1 timeout at 5009.68 ms; 149 Omni, 0 delegated; no expect-count emitted. Job `141092796222`, cleanup `141093175524` PASS. |

Both isolated executions reproduced the timeout. Its occurrence on the base demonstrates that it does not require A05 changes. The pair does not prove that the candidate has no performance effect, locate the blocked await or establish a performance distribution. The original broad Windows gate stays failed; neither a later pass nor a repeated timeout rewrites it. This is a valid execution timeout, not setup failure and not causal assertion RED. The fixture uses real registry/Git/SQL with controlled Session ports; this is preservation of those boundaries, not native per-profile skill execution. Both isolated logs report that no declaring Omni fixture ran; raw spawn counters are not a fixture-positive declaration.

## Landing and campaign disposition

The acquisition findings block this enabled history route independently of the timeout diagnosis. Preserve all existing GREEN receipts and failed observations; do not cite an earlier source-PASS as unconditional current landing approval. The [qualification record](engagement-history-qualification.md) contains the historical gates, and the [profile crosswalk](engagement-profile-qualification.md) identifies the remaining dynamic skill and report-semantic evidence. The [complete ToDo](resumption-todo.json) retains all five foundations, 15 spine rows, 29 coverage rows, 83 tools and four additional compliance tools. A05, compliance and final GO remain open.
