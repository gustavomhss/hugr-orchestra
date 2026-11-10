---
name: team-stack-compiled-native
description: "C and C++ lifetime, native build and sanitizer evidence for the assigned component."
when: "The assigned component contains C or C++ code."
not-when: "Native files occur only in an unrelated dependency."
---

# C and C++

Identify the actual target, compiler, compilation options and build system before interpreting diagnostics. Inspect ownership across allocation, deallocation and borrowed pointer or view lifetimes; follow a view or iterator past a mutation or destruction of its backing storage. A plausible dangling reference needs a concrete path and relevant API or ownership contract, not a guess from a type name.

Clang AddressSanitizer uses compiler instrumentation and a runtime to detect exercised errors including use-after-free and out-of-bounds access. It does not prove unexecuted paths safe; container overflow diagnostics can have false positives and negatives under documented conditions. Source: https://clang.llvm.org/docs/AddressSanitizer.html

Source and available reports can be inspected in a no-build review. Sanitizer evidence requires a supported host build/test lane, a compatible target and an instrumented execution that reaches the path. If that lane or runtime is unsupported, record sanitizer work as not built or not run, not a pass. Never install compilers, dependencies or runtime libraries during review.
