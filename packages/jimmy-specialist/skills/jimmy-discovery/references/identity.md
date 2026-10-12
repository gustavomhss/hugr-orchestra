# Symbol identity is not runtime execution

Read when aliases, providers, registration, dynamic selection or generated code affect the answer. A lexical hit is sufficient for finding candidates, not establishing effective identity.

## Resolve the meaning

Follow the actual caller's binding through aliases, imports, reexports, package exports and wrappers. For overloads, distinguish declared signatures from the implementation body. For generated clients/interfaces, locate authoritative schema, generator input/version and selected runtime implementation.

Use configured LSP/compiler operations when their project, dependencies, config, readiness and supported operation are known. LSP 3.17 distinguishes definition, implementation, references and call hierarchy; server support and completeness are separate facts. A reference within a function is not necessarily a call. LSP UTF-16 positions are not retained-source line/quote locators.

If navigation resolves only a declaration, continue to the body or state that limitation. If the service is unavailable/partial, follow source imports and conditions statically. Do not install ts-morph, SCIP, an AST engine or another server because a guide mentions semantic resolution.

## Trace selection explicitly

Provider/interface names may have local, no-op, test and remote implementations. Find the registration key, selector and bootstrap that supplies the chosen layer/instance. Read the configuration branch and fallback. Keep separate:

1. A body exists.
2. A registration names it.
3. A selector can choose it under conditions.
4. A runtime observation shows it was loaded/activated for the scenario.

Only the fourth is observed activation. A test fixture selecting a provider does not establish production selection. An import graph does not show that a generator ran or a deployed binary used its output; read [version/config/build](version-config-build.md) when needed.

## Cross dynamic seams

Follow dependency injection keys, route tables, string registries and consumer subscriptions using their actual values and witness code. A publication and subscription with the same spelling can still use different namespaces, versions or roots. Read [boundaries](boundaries.md) for the contract bridge.

When evaluating absence, retrieve a known positive identity/reference with the same mechanism and report exclusions. Syntax and spelling graphs remain candidate maps, not compiler identities or complete may-flow models.

## Record the boundary

Capture the caller, resolved body, selector and material branch as applicable evidence. An inference should state its selection assumptions; an observation should retain the actual runtime identity supplied by the host/executor. Use [evidence](evidence.md) and [record inputs](record-tools.md), not invented semantic tool schemas.

Close with the effective entry under evidenced conditions, and name the exact unresolved runtime selector if activation is required. This guide teaches resolution discipline; it does not certify every language/server or a target runtime.
