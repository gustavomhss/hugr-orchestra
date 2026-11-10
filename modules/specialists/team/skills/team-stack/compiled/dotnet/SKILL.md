---
name: team-stack-compiled-dotnet
description: "C# asynchronous and nullable-reference facts for the assigned .NET component."
when: "The assigned component uses .NET or C#."
not-when: "A .NET project or package is unrelated to the assigned component."
---

# .NET

Identify the target framework, SDK and nullable context from the component; versions and project settings control which diagnostics and APIs apply.

- A C# nullable reference annotation informs compiler analysis; it does not add runtime null checks. The null-forgiving operator suppresses a warning, not an actual null value. Trace untrusted data and real guards. Source: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-reference-types
- A task-returning async method lets a caller await completion and observe its exception; `async void` cannot be awaited by its caller and is intended for event handlers. Follow the actual call path before concluding a failure is lost. Source: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-return-types

A no-build review can inspect source and existing reports; compilation, analyzer execution and tests need the host's supported build lane and the project's dependencies. A warning-free build is not runtime behavior evidence. When that lane or SDK is unavailable, record not-run. Never install or restore packages during review.
