# Isolated browser suite control

Frozen before implementation. Cold43453802489 App Linux ran644 browser cases successfully but produced95 unnamed afterAll failures: suite-scope control was evaluated independently for every isolated file. Isolating mocks is required; full-suite process coverage must remain mandatory. Do not remove --isolate, disable the preload, manufacture spawns, relax declaring-test ownership or change test:ci request scope.

Root chooses one parent browser runner at script/test-browser.ts. It invokes the same actual Bun browser command, same happydom/control preloads and selected arguments through AppProcess. Parent scope remains suite/declared as inherited. Each child VM runs the existing declared control; parent aggregation restores the suite-wide requirement across VMs. No change to script/test-omni-control.ts is authorized. The parent captures and validates its external nonce, gives children a NEW private cryptographic nonce, omits inherited RUN ownership, and prints exactly one final verdict carrying the external nonce. Child-private verdicts remain distinct.

Frozen validation: real child exit0; stdout/stderr not truncated; final actual Bun summary with nonzero file count; an exact count of correctly formatted private-nonce pass/N/A verdicts equal to the reported file count (N/A receipts do not authenticate file identity); finite nonnegative counts; no missing/duplicate/unknown verdict; all declaring-test failures remain child failures. Sum only child verdict counts, never the parent's act of starting Bun. Reuse Omni.verdict for on/strict aggregate semantics. Suite scope requires positive aggregate spawn count; all-N/A suite fails. A focused declared run may be N/A only with no declaring test, no spawn and no delegation. Invalid scope/mode, legacy off, malformed output and truncation fail closed.

Package test:browser switches to this runner; test:ci's focused browser path stays unchanged. Root owns Turbo dependencies for the root entry and Core implementation, and exact closed-source mention registrations (Core implementation + its test). Do not edit native scope assignment validation or spawn allowlists. Fixed browser preloads remain absolute to the repository; default selection remains ./test-browser; user arguments and exit failures are preserved. No app/server runtime changes.

Hosted acceptance: actual two-file isolated command passes with one real AppProcess spawn and one plain file; all-plain suite fails; silent declaring second file fails even when first file spawned; strict actual delegation fails; child test failure stays failure. Validate missing/duplicate/wrong-nonce/malformed counts/summary/truncation with pure boundary cases, not a second decision implementation. Test bodies execute through AppProcess and declare their own process expectation. Run focused controls on both OS, then complete App/browser and complete cold workflow. No local tests/build/generation.

Ownership: Memory owns the root thin entry, Core implementation and new Core acceptance file; Root owns package command/Turbo/closed-source registration integration. IO independently reviews the runner against this contract after its release packet. Preserve actual producer counts and distinguish wrapper qualification from full App success.

The first local Core typecheck identified that a root-owned script cannot resolve Effect from the root package. Implementation therefore lives in packages/core/script/test-browser.ts with its existing Effect dependency; the root script is a thin import/re-export and CLI invocation. No new dependency was added. Preserve explicit ./test-browser in the package command; shard invocations call the root entry with exact files.

## Static wiring integration discovered by third cold

Third cold43479893813 Core Linux4 ran348P/1F: the converse wiring guard recognized direct Bun preload
commands but did not recognize the new audited browser entry. Its four findings name the existing declaring
browser files; the runtime suite control itself passed with1067 own Omni spawns and zero delegated.
Keep this failure recorded and let all other jobs finish. Do not add a preload globally or weaken runtime control.

Root freezes a narrow guard extension: accept only the exact app-shell package script
`bun run ../../script/test-browser.ts ./test-browser`, only for its `test-browser` directory, and only when
both the root entry and Core implementation are tracked. Preserve the existing direct-preload branch.
Negative controls must reject missing runner files, another entry, shell command suffixes, a different target
directory and the same spelling in another package. The actual CLI acceptance suite remains the proof that
this named runner enforces the preload and aggregate verdict; this static check proves wiring only.
Memory owns only the existing Core guard and its fixture; UI cold-reviews. Gate the repair through hosted
guard plus actual browser CLI controls on both OS, then qualify the completed integration again. No bypass,
allowlist addition, runtime scope change or weakening of declaring-test ownership is authorized.
