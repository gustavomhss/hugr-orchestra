---
name: team-stack-compiled-swift
description: "Swift concurrency and target-specific evidence for the assigned component."
when: "The assigned component uses Swift."
not-when: "Swift is present only in an unrelated dependency or platform target."
---

# Swift

Identify the Swift language mode, package or project, SDK and target platform; do not assume an Apple-only API or simulator exists on every host. Interpret concurrency diagnostics according to the actual compiler and settings.

Actor isolation protects actor-isolated state from simultaneous access, but identify the actor and each suspension before assuming an operation's larger invariant is atomic. A detached task does not inherit the current actor isolation in the same way as an unstructured task created with `Task`; follow its captures, lifetime and cancellation path. Source: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/ (official Swift book; indexed text).

No-build review can inspect source, configuration and supplied results. Compilation and tests require the host's supported lane, target SDK and platform; a Linux result does not establish behavior on an Apple-specific target or simulator. If the host cannot build that target, mark the check not-run, not a pass. Never install or fetch an SDK or package during review.
