# Local check scope contract

Issue #1558. These Core-local prerequisites are not active Lucy analyzers. Registration, actual analysis qualification and user-guide activation belong to the adapter/integration wave.

`ReviewScanProjection.create` consumes a host-owned `ReviewScratch.Snapshot`. It creates independent regular-file copies in a separate caller-scoped tree, excluding only validated host dependency roots (`node_modules`, `.venv`, `target`). It refuses other links, multiply-linked source files, unsafe metadata and exceeded limits. Default caps are 64 MiB, 10,000 entries, depth 64 and 1 MiB of UTF-8 path bytes; callers may only lower them. Source snapshot and dependency-shadow implementations remain unchanged. File hashes describe actual copied bytes; the source digest is a host-supplied provenance reference, not a new attestation of the original snapshot. Projection digest binds both, plus relative exclusions. The host owns both scratch locations; this does not isolate a hostile same-uid writer.

The base projection alone supplies `.orchestra/lucy-local-checks.json`, with at most 64 KiB and an exact manifest hash. No head, parent-directory or environment fallback is permitted. Unknown fields, unsupported values, malformed data and modified projected bytes refuse preparation. Example reserved policy:

```json
{
  "version": 1,
  "shfmt": { "indent": 2, "language": "bash" },
  "cargoMachete": { "enabled": true }
}
```

`shfmt` presence opts in. Indentation is 0 (tabs), 2, 4 or 8; language is bash, posix, mksh or bats. Selection returns only requested existing `.sh`, `.bash`, `.bats` and `.ksh` files. Diff selection omits deleted files; explicit file selection refuses a missing requested shell file. Flags are closed: `-d -i <indent> -ln <language> --`. Those explicit parser/printer flags disable EditorConfig in pinned [shfmt v3.14.1 main.go](https://github.com/mvdan/sh/blob/v3.14.1/cmd/shfmt/main.go#L189-L205); P1 must also prove that behavior with the actual tool. A formatting mismatch remains a formatting check, not a security/correctness finding.

Cargo requires `cargoMachete.enabled: true`, diff scope, a requested Rust/manifest/lock change and a projected Cargo manifest. Its coverage is the whole bounded reviewed projection. Explicit `scope=files` refuses instead of widening. Closed flags are `--no-ignore .`, never metadata/fix/build commands. This disables ambient ignore files while the host excludes dependency shadows. No clean analysis is inferred from policy or selection alone.

Paths are host-relative POSIX spellings. Traversal, absolute/drive paths, NUL, backslash and declared dependency-root requests refuse before filtering. Selection retains the base policy hash and head projection digest. Missing policy, disabled tool, empty selection and unavailable scope are explicit not-run inputs for the later dispatcher.

Adapter acceptance still must prove clean/seeded/error fixtures, confinement, bounded raw artifacts and routed coverage. In pinned [cargo-machete v0.9.2 main.rs](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/main.rs#L184-L187), a manifest-analysis error can be printed while the final exit remains zero; P2 must detect that error and report acquisition-error, with an actual malformed/workspace fixture. Full epic CI runs once the routed implementation wave is complete.

P0C/P2 must also prove confinement against source paths in Cargo manifests that leave the projection and against ancestor workspace lookup ([search_unused.rs](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/search_unused.rs#L119-L145), [workspace lookup](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/search_unused.rs#L267-L278)). Removing filesystem links alone does not cover those paths. The preparatory selection API is not permission to run an unconfined analyzer.
