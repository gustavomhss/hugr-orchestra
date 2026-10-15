# R33 — Exact, scoped backend code transformations

2026-10-03. Research only. Primary docs, tagged source, upstream test bodies inspected; codemods/tests **not executed**. Before/after pairs and controls below are desk-reviewed expectations, not measured results. Version pins identify evidence baselines, not latest-version recommendations or this repo's installed stack.
Artifact: `backend-r33-codemods/RESEARCH.md`; existing detached metadata-only worktree, base `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.

## Decision

| Adopt when ticket fits | Editing work removed | Scope mechanism | Semantic strength |
| --- | --- | --- | --- |
| ast-grep 0.45.3 | Repeat exact call-shape replacement | Explicit files + supplied match spans | Parsed syntax; no binding resolution |
| ts-morph 28.0.0 | Rename declaration and bound references together | Explicit Project context + rename-location allowlist | TypeScript language-service references; not equivalence proof |
| OpenRewrite 8.92.8 / Maven plugin 6.49.0 | Typed Java method migration, including references/imports | Supplied module + exact `FindSourceFiles` precondition | Attributed receiver/signature matching |
| Go 1.26.0 native `fix -inline` | Replace calls through supplied deprecated wrappers | Named package + single analyzer + edit-span validation | Compiler bindings and conservative source inliner |

Use existing CLI/native edit tools. New MCP wrapper rejected: recipe input, preview, path checks, edits and check execution already fit existing tools; concrete missing capability not established.

## The backend specialist receives execution contract; owner retains judgment

- Owner supplies exact transformation, old/new symbols, declaration identity/signature, before/after fixtures, expected occurrences/spans, input hashes/base revision, explicit writable files and separately permitted read context.
- Owner supplies pinned tool/runtime/compiler/parser versions, tsconfig/classpath/dependencies or Go build tags/platform, complete relevant reference context, check commands and expected results. Missing context is blocker, not permission to discover more files.
- Owner already chose migration semantics, architecture and impact boundary. The backend specialist applies recipe and reports mismatches; no diagnosis, repository exploration, recipe broadening, architecture decisions or opportunistic cleanup.
- Preview first. Compare canonical paths **and spans/symbols** against ticket; reject symlink escapes. Counts alone cannot distinguish correct targets from false positives. Check expected input bytes again before native edits; reject added/deleted/renamed files unless explicitly allowed.
- Future execution controls: valid fixture must produce exact delta; negative/ambiguous fixture must behave as specified; identical out-of-scope sentinel stays byte-identical. After approved edit, rerun must propose no further edits, or explicitly recognize supplied after-state. None of these controls ran during R33.
- Missing input, parse/type-context failure, unexpected zero matches, ambiguous binding, extra match or scope escape return blocked with evidence. Do not reinterpret empty output or exit zero as completed migration. Do not apply generated patch blindly.
- Run only supplied checks. Here, TypeScript checks use `bun typecheck` from affected package; tests run from package directories. Public Protocol/Server `HttpApi` changes require `bun run generate` in `packages/client`; never hand-edit generated clients. Owner must include generated outputs in authorized scope.

## 1. ast-grep — small syntax recipes, pre-decided target occurrences

**Stack/license:** Rust CLI, tree-sitter TypeScript parser; [0.45.3 release](https://github.com/ast-grep/ast-grep/releases/tag/0.45.3), [MIT](https://github.com/ast-grep/ast-grep/blob/0.45.3/LICENSE). [CLI](https://ast-grep.github.io/reference/cli/run.html), [rewrite docs](https://ast-grep.github.io/guide/rewrite-code.html).
**Supplied recipe:** in `src/handler.ts`, approved `legacy.send(expr)` occurrences become `modern.send(expr)`. Owner supplies both bindings and intended API behavior; argument stays once, in same position. No imports inferred or added.
```sh
ast-grep run --lang ts --pattern 'legacy.send($X)' \
  --rewrite 'modern.send($X)' --color never src/handler.ts
ast-grep run --lang ts --pattern 'legacy.send($X)' \
  --json=compact --inspect=entity src/handler.ts
```
```diff
-const result = legacy.send(build(id))
+const result = modern.send(build(id))
```
**Preview/write:** first command prints diff by default; second exposes match ranges plus inspected-file evidence. `--interactive` permits per-change edits; `--update-all` writes all matches. Recommended path: review preview, apply bounded native edits. No invented `--dry-run` flag.
**Semantic limit:** structure handles nested arguments; names do not identify declarations. `function f(legacy) { legacy.send(body) }` also matches and would become `modern.send(body)`, despite different binding. This is deliberate adversarial control: raw tool overmatches; ticket/span check must reject it. If bindings not pre-decided, return blocked.
**Unchanged/scope:** omitted files not traversed when explicit file arguments used. Matching code in `outside.ts` remains untouched. Unmatched source retained; matched region rebuilt from template, so comments/trivia not captured in metavariables can be lost. Parser recovery is not compilation validation.
**Controls/checks:** valid nested-call fixture → one expected replacement. `other.send(body)` and string `"legacy.send(body)"` → no match. Already-transformed fixture → no old-pattern match. `run` returns 0 with matches, 1 without; inspect diagnostics before classifying failure as zero-match. Check supplied file was processed, exact ranges/output, then package typecheck and supplied API behavior test.
**Source/test evidence:** [run implementation](https://github.com/ast-grep/ast-grep/blob/0.45.3/crates/cli/src/run.rs); [CLI tests](https://github.com/ast-grep/ast-grep/blob/0.45.3/crates/cli/tests/run_test.rs) cover language restriction, rewrite output, invalid pattern and `test_status_code_fail_with_no_match`. Upstream tests establish intended tool behavior, not execution of this recipe.

## 2. ts-morph — binding-aware TypeScript rename with edit preflight

**Stack/license:** [ts-morph 28.0.0](https://github.com/dsherret/ts-morph/blob/28.0.0/packages/ts-morph/package.json), [common 0.29.0 / bundled compiler build pin TypeScript 6.0.2](https://github.com/dsherret/ts-morph/blob/28.0.0/packages/common/package.json), [MIT](https://github.com/dsherret/ts-morph/blob/28.0.0/LICENSE). Match ticket's target compiler; do not silently substitute this reference stack.
**Supplied recipe/input:** private top-level `timeoutMs` → `requestTimeoutMs` in `/src/client.ts`; preserve object key `timeoutMs`. Exactly declaration and shorthand value reference authorized. API core below is memory-only fixture; production read context must come from owner, including any relevant importers.
```ts
import { Project } from "ts-morph"
const project = new Project({ useInMemoryFileSystem: true })
const input = "export {}; const timeoutMs = 1000; const options = { timeoutMs };"
const file = project.createSourceFile("/src/client.ts", input)
const binding = file.getVariableDeclarationOrThrow("timeoutMs")
const options = { renameInStrings: false, renameInComments: false, usePrefixAndSuffixText: true }
const locations = project.getLanguageService().findRenameLocations(binding.getNameNode(), options)
if (locations.length !== 2 || locations.some(x => x.getSourceFile() !== file)) {
  throw new Error("rename scope mismatch")
}
binding.rename("requestTimeoutMs", options)
const output = file.getFullText()
```
```diff
-export {}; const timeoutMs = 1000; const options = { timeoutMs };
+export {}; const requestTimeoutMs = 1000; const options = { timeoutMs: requestTimeoutMs };
```
**Preview/write:** snapshot original texts, inspect `findRenameLocations` including text spans/prefix/suffix, then compare all changed Project texts; require exact supplied locations, beyond fixture's count/file check. API has no CLI dry-run switch. Memory manipulation plus `getFullText()` supplies preview; real-filesystem `save()` would persist changes. Prefer native edits from reviewed delta over unrestricted `project.save()`.
**Semantic limit:** `rename()` uses TypeScript language service; `.set({ name })`/raw text replacement are not equivalent. Resolution covers loaded project, not unknown consumers, reflection or runtime strings. Do not shrink Project to writable files merely to hide external references. Supplied context may be broader than write scope.
**Important option:** without `usePrefixAndSuffixText`, shorthand key can also change. With it, import/export aliases may be introduced elsewhere; that can preserve old public names when intended migration needs new names. Recipe must choose behavior explicitly and obey repo's no-import-alias rule.
**Controls/checks:** valid fixture → exact output above. Append `function f(timeoutMs: number) { return timeoutMs }` → inner binding untouched; string/comment occurrences remain. Rename to existing conflicting identifier → contract rejects; language-service rename alone is not collision/equivalence proof. Missing old declaration → `getVariableDeclarationOrThrow` fails, not silent success; already-migrated status requires verified supplied after-state.
**Scope control:** add read-only `/outside.ts` with bound reference to an exported target in a separate fixture; rename-location set must expose escape and caller must abort before persistence. Validate expected binding identities and supplied compile/behavior checks after rename; diagnostics alone can miss runtime contract changes.
**Primary evidence:** [rename docs](https://ts-morph.com/manipulation/renaming), [save behavior](https://ts-morph.com/manipulation), [language-service implementation](https://github.com/dsherret/ts-morph/blob/28.0.0/packages/ts-morph/src/compiler/tools/LanguageService.ts), [named-node tests](https://github.com/dsherret/ts-morph/blob/28.0.0/packages/ts-morph/src/tests/compiler/ast/base/name/namedNodeTests.ts) cover cross-file rename, comments/strings and shorthand/export behavior.

## 3. OpenRewrite — attributed Java API recipe, existing Java tooling only

**Stack/license:** Java 17 fixture; Maven plugin [6.49.0 POM pins core BOM 8.92.8](https://github.com/openrewrite/rewrite-maven-plugin/blob/v6.49.0/pom.xml). Selected core recipe [Apache-2.0 source](https://github.com/openrewrite/rewrite/blob/v8.92.8/rewrite-java/src/main/java/org/openrewrite/java/ChangeMethodName.java); third-party recipe catalogs require separate license checks.
**Supplied recipe:** `com.acme.LegacyClient.fetch(java.lang.String)` → `fetchOne`; classpath provides both old/new APIs. Only `backend/src/main/java/com/acme/Handler.java` writable. Declaration stays in dependency; no overload/override migration. Owner supplies `/supplied/r33.yml` containing:
```yaml
type: specs.openrewrite.org/v1beta/recipe
name: com.acme.r33.RenameFetch
displayName: Rename the approved fetch call
preconditions:
  - org.openrewrite.FindSourceFiles:
      filePattern: backend/src/main/java/com/acme/Handler.java
recipeList:
  - org.openrewrite.java.ChangeMethodName:
      methodPattern: com.acme.LegacyClient fetch(java.lang.String)
      newMethodName: fetchOne
      matchOverrides: false
      ignoreDefinition: true
```
**CLI:** repo-root CWD; `backend` is supplied Maven module, inside same Git root. Existing cached plugin/dependencies and prepared build context required. No POM edit needed:
```sh
mvn -o -f backend/pom.xml org.openrewrite.maven:rewrite-maven-plugin:6.49.0:dryRunNoFork \
  -Drewrite.activeRecipes=com.acme.r33.RenameFetch \
  -Drewrite.configLocation=/supplied/r33.yml -Drewrite.failOnInvalidActiveRecipes=true
```
```diff
-String load(LegacyClient client, String id) { return client.fetch(id); }
+String load(LegacyClient client, String id) { return client.fetchOne(id); }
```
**Semantic limit:** receiver/signature attribution distinguishes unrelated `Other.fetch(String)` and `LegacyClient.fetch(int)`. Missing types/classpath can suppress expected changes; parse success alone insufficient. Method references/static imports may also change if matched. `ignoreDefinition: true` actually skips compilation units declaring matching method, not just declaration node; keep this caller separate.
**Preview/unchanged:** `dryRunNoFork` avoids lifecycle fork; regular `dryRun` forks through `process-test-classes`. Source preview still writes report/cache artifacts. Fresh result normally at `backend/target/rewrite/rewrite.patch`; zero-change run writes no new patch and can leave stale patch from earlier run. Bind preview to current run/input hashes; successful exit alone proves neither matches nor source validity.
**Scope:** `FindSourceFiles` paths relative to repository root; empty pattern matches all, so reject blank recipe input. Preconditions filter edits after parsing, not read scope; module may parse other files. Preconditions cannot contain arbitrary recipes' generated files. This selected recipe is rename-only; check every patch path/hunk against ticket anyway.
**Controls/checks:** valid attributed call → exact rename. Same spelling on different receiver/overload → unchanged. Remove API classpath → failed/incomplete context, never approved zero-match. Same target call in `backend/src/main/java/com/acme/OtherHandler.java` → unchanged through path precondition. Already `fetchOne` → no fresh delta. Run supplied Maven compile/test selector and behavior fixture after native edit; reject unrelated formatting/dependency changes.
**Primary evidence:** [recipe docs](https://docs.openrewrite.org/recipes/java/changemethodname), [precondition semantics](https://docs.openrewrite.org/reference/yaml-format-reference), [recipe tests](https://github.com/openrewrite/rewrite/blob/v8.92.8/rewrite-java-test/src/test/java/org/openrewrite/java/ChangeMethodNameTest.java), [dry-run implementation](https://github.com/openrewrite/rewrite-maven-plugin/blob/v6.49.0/src/main/java/org/openrewrite/maven/AbstractRewriteDryRunMojo.java), [NoFork goal](https://github.com/openrewrite/rewrite-maven-plugin/blob/v6.49.0/src/main/java/org/openrewrite/maven/RewriteDryRunNoForkMojo.java).
**Adoption cost:** current recipe docs describe authenticated Code Genome artifact distribution. Source license does not imply anonymous binary retrieval. Use only already-provisioned Java workflow; do not add credentials, plugin installation or Java infrastructure for this TypeScript repo.

## 4. Go native inliner — migration encoded in supplied wrapper

**Stack/license:** Go **1.26.0**, [BSD-3-Clause](https://github.com/golang/go/blob/go1.26.0/LICENSE); [release notes](https://go.dev/doc/go1.26) describe replaced `go fix`. Vendored analyzer baseline [x/tools d44be789a05c](https://github.com/golang/go/blob/go1.26.0/src/cmd/vendor/modules.txt). Older `go fix` behavior is not interchangeable.
**Supplied recipe/context:** owner already provided deprecated wrapper and `//go:fix inline` directive in `internal/compat/api.go`; the backend specialist does not invent API forwarding logic. Only approved call in `internal/compat/caller.go` writable; caller already gofmt-formatted, package `compat`.
```go
package compat

func New(id int) int { return id + 1 }

//go:fix inline
func Old(id int) int { return New(id) }
```
```diff
-func Load(id int) int { return Old(id) }
+func Load(id int) int { return New(id) }
```
```sh
GOTOOLCHAIN=local GOPROXY=off go fix -mod=readonly -inline \
  -inline.allow_binding_decl=false -diff ./internal/compat
```
**Actual behavior:** `-inline` enables this analyzer alone, suppressing other default fixers. `-fix=inline` is obsolete and has no selecting effect in 1.26; using it risks running default suite. Compiler static callee and directive facts drive rewrite. Wrapper definition remains; imports can change if wrapper delegates across packages.
**Preview/write:** `-diff` emits unified diff instead of source writes; removing it applies fixes. `-json` instead of `-diff` reports structured diagnostics/suggested edits without applying, useful for span checks; flags cannot be combined. Build/cache activity still occurs. Use preview plus bounded native edits for strict file/symbol tickets.
**Semantic limit:** inliner protects argument evaluation order; transformations requiring function-literal fallback are discarded, binding declarations disabled above. Dynamic calls `fn := Old; fn(id)` remain; runtime dispatch is not rewritten. Build tags/platform select analyzed code. Own dedicated tests of deprecated function can intentionally retain calls.
**Controls/checks:** direct `Old(id)` → `New(id)`. Shadowed `func f(Old func(int) int) int { return Old(1) }` → unchanged. Function-variable call → unchanged; missing directive → no inline delta, not migration success. Already `New(id)` → no further inline delta. Add unrelated modernizer candidate `var v interface{}` → unchanged under `-inline`.
**Scope:** named package includes its test variants; package selection is not file/symbol allowlist. Any extra annotated target or edit to another file must reject whole proposed delta. Identical call in unselected package remains untouched; dependency analysis supplies facts without authorization to edit dependencies. Reject formatting outside permitted hunks.
**Checks/evidence:** supplied `go test ./internal/compat` and required tag/target matrix; compare golden output and runtime behavior. [CLI source](https://github.com/golang/go/blob/go1.26.0/src/cmd/go/internal/vet/vet.go), [analyzer source](https://github.com/golang/go/blob/go1.26.0/src/cmd/vendor/golang.org/x/tools/go/analysis/passes/inline/inline.go), [suggested-fix/binding tests](https://github.com/golang/tools/blob/d44be789a05c/go/analysis/passes/inline/inline_test.go), [suite positive fixture](https://github.com/golang/go/blob/go1.26.0/src/cmd/go/testdata/script/fix_suite.txt), [vendor exclusion fixture](https://github.com/golang/go/blob/go1.26.0/src/cmd/go/testdata/script/fix_vendor.txt).

## Studied, narrower value than shortlist

**Comby 1.8.1 — fallback for delimiter-aware templates/unsupported AST languages.** [Tagged README/license](https://github.com/comby-tools/comby/tree/1.8.1) declares Apache-2.0; [CLI docs](https://comby.dev/docs/cheat-sheet), [structural limits](https://comby.dev/docs/advanced-usage#custom-language-definitions), [positive/negative matcher tests](https://github.com/comby-tools/comby/blob/1.8.1/test/alpha/test_special_matcher_cases.ml).
Supplied `legacy.send(:[x])` → `modern.send(:[x])`: `comby 'legacy.send(:[x])' 'modern.send(:[x])' -stdin -matcher .js -diff < src/handler.ts` previews same simple call rewrite without directory traversal. `-i` writes; `-review` offers interactive acceptance. Balanced delimiters/comments/strings are useful, but no binding/type model; shadowed receiver overmatches, `other.send(body)` gives no delta. Prefer ast-grep when actual syntax-node shape matters. Equal hole text does not prove equal symbols or side-effect safety.

**jscodeshift 17.3.0 — useful when exact reviewed JS/TS transform already exists.** [Version/Node >=16/MIT](https://github.com/facebook/jscodeshift/blob/v17.3.0/package.json), [CLI/API docs](https://github.com/facebook/jscodeshift/blob/v17.3.0/README.md), [worker source](https://github.com/facebook/jscodeshift/blob/v17.3.0/src/Worker.js), [worker/parser tests](https://github.com/facebook/jscodeshift/blob/v17.3.0/src/__tests__/Worker-test.js).
Local command: `jscodeshift -t /supplied/rename.cjs --parser=ts --extensions=ts --dry --print --run-in-band --fail-on-error src/handler.ts`. Supplied transform returns new text → preview; same original → `nochange`; no return → `skip`. `--print` emits source, not unified diff. Transform's parser export can override CLI parser. TypeScript parser does not provide TypeScript typechecker; lexical scope utilities do not establish project-wide receiver/overload identity. Prefer ts-morph for that requirement. `--dry` controls runner writes, not side effects inside arbitrary transform code; never use URL transforms or unreviewed downloaded scripts.

**Cargo fix — compiler suggestions/edition migration, not arbitrary backend recipe.** Reference Rust/Cargo **1.90.0** toolchain, Cargo source package 0.91.0, [MIT OR Apache-2.0](https://github.com/rust-lang/cargo/blob/rust-1.90.0/Cargo.toml); [docs](https://doc.rust-lang.org/cargo/commands/cargo-fix.html), [pinned CLI](https://github.com/rust-lang/cargo/blob/rust-1.90.0/src/bin/cargo/commands/fix.rs), [fix tests](https://github.com/rust-lang/cargo/blob/rust-1.90.0/tests/testsuite/fix.rs).
With toolchain already present, `cargo +1.90.0 fix -p server --lib --frozen` applies rustc suggestions, e.g. `let mut x = 3;` → `let x = 3;` when `x` is read but never mutated. It also applies other eligible suggestions: package/target selection is not exact file/symbol scope. Pinned CLI has no source dry-run flag; `cargo check` can preview diagnostics, not full iterative fixed output. Review isolated-run diff before any transfer.
`--edition` prepares next edition but does not change manifest edition; inactive feature/target code stays unseen. No-suggestion fixture exits successfully unchanged; non-machine-applicable cases may remain. Tests include `no_changes_necessary`, `fixes_extra_mut`, feature selection and shared files across packages (`#[path]`), demonstrating why package scope cannot guarantee path scope. Avoid for narrow symbol tickets; adopt only owner-defined compiler/edition migration with complete scope and feature/target checks.

## Adopt / avoid

Adopt ast-grep for repetitive bounded syntax, ts-morph for supplied TS bindings; OpenRewrite and native Go inliner only on matching existing backend stacks. They reduce editing work without assigning the backend specialist discovery work.
Avoid repo sweeps, glob-based scope expansion, generic “modernize everything,” syntax-only semantic rename claims, partial-reference renames disguised as success, config changes to provision tools, generated patches applied blindly, and new MCP plumbing. Return exact proposed delta and supplied-check evidence; owner resolves ambiguous or out-of-contract cases.
