---
name: effect
description: Use when writing, reviewing or testing Effect v4 / effect-smol TypeScript in this repo, such as services, layers, Schema, `Effect.gen`/`Effect.fn`, HttpApi handlers, `testEffect` and `it.live` tests. Points at the effect-smol source and the repo's house style instead of memory
---

# Effect

This codebase uses Effect for typed, composable TypeScript services, schemas, and workflows.

## Source Of Truth

Use the current Effect v4 / effect-smol source, not memory or older Effect v2/v3 examples.

1. If `.orchestra/references/effect-smol` is missing (the folder is ignored, so a fresh checkout lacks it), clone `https://github.com/Effect-TS/effect-smol` there. Do this in the project, not in the skill folder. Offline, read nearby repo code and say the reference was unavailable.
2. Search `.orchestra/references/effect-smol` for exact APIs, examples, tests, and naming patterns before answering or implementing Effect-specific code.
3. Also inspect existing repo code for local house style before introducing new patterns.
4. Prefer answers and implementations backed by specific source files or nearby repo examples.

## Guidelines

- Prefer current Effect v4 APIs and project-local patterns over old blog posts, examples, or package-memory guesses.
- Use `Effect.gen(function* () { ... })` for multi-step workflows.
- Use `Effect.fn("Name")` or `Effect.fnUntraced(...)` for named effects when adding reusable service methods or important workflows.
- Prefer Effect `Schema` for API and domain data shapes. Use branded schemas for IDs and `Schema.TaggedErrorClass` for typed domain errors when modeling new error surfaces.
- Keep HTTP handlers thin: decode input, read request context, call services, and map transport errors. Put business rules in services.
- In Effect service code, prefer Effect-aware platform abstractions and dependencies over ad hoc promises where the surrounding code already does so.
- Keep layer composition explicit. Avoid broad hidden provisioning that makes missing dependencies hard to see.
- In tests, prefer the repo's existing Effect test helpers and live tests for filesystem, git, child process, locks, or timing behavior.
- Do not introduce `any`, non-null assertions, unchecked casts, or older Effect APIs just to satisfy types.
- Do not answer from memory. Verify against `.orchestra/references/effect-smol` or nearby code first.

## Testing Patterns

- Use `testEffect(...)` from `packages/core/test/lib/effect.ts` for tests that exercise Effect services, layers, runtime context, scoped resources, or platform integrations.
- Use `it.live(...)` for filesystem, git repositories, HTTP servers, sockets, child processes, locks, real time, and other live platform behavior.
- When a test cannot run on this platform or host, use `it.effect.skipIf(condition)` or `it.live.skipIf(condition)` so the runner counts it as skipped. Never return early from the body: that reports a pass that checked nothing. Polls carry a deadline, and tests write under a temp home (`ORCHESTRA_TEST_HOME`), never the real one.
- Tests run on GitHub Actions, not on this machine: `bun run test:ci <package> <files>` from the repository root, for example `bun run test:ci core test/foo.test.ts`. A local `bun test` stops at `script/test-guard.ts`. Typecheck with `bun typecheck` from the package directory.
- Prefer explicit test layers over ad hoc managed runtimes. Keep dependency provisioning visible in the test file.
- Use scoped fixtures and finalizers for resources that must be cleaned up, including temporary directories, flags, databases, fibers, servers, and global state.
