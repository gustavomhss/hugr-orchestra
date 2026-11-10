---
name: team-stack-compiled
description: "Language facts for assigned Rust, JVM, C/C++, .NET or Swift components."
when: "The assigned component uses one of these compiled or managed-runtime stacks."
not-when: "The component is JavaScript, Python, Go, Ruby, PHP or a standalone SQL migration."
---

# Compiled and managed-runtime stacks

Choose the leaf for the assigned component: `team-stack-compiled-rust`, `team-stack-compiled-jvm`, `team-stack-compiled-native`, `team-stack-compiled-dotnet` or `team-stack-compiled-swift`.

Read its actual target and project configuration. A toolchain mentioned in a lockfile is not proof it owns this component. These facts do not authorize builds, installations or network access.
