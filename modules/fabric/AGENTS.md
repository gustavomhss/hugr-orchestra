# Fabric Studio domain

- Requirements/specs: `docs/specs/fabric-studio/`; active delivery anchor: `specs/DELIVERY.md` there.
- Runtime domain belongs in this module, not Core. Pure `parse`, `contracts` and `declaration` entrypoints stay browser-safe and service-free; never import Core, Server, a driver or a host builtin through them.
- Canonical wire schemas are the `Fabric*` namespaces in `@orchestra/schema`. Do not duplicate IDs, refs, states or executable tool registries.
- A declaration is untrusted data: no callbacks, scripts, free CSS/HTML, endpoints, credentials, grants, activation handles or authority. Compilation does not read the network, activate a source or admit a command.
- Readiness labels and parsed refs never authorize access. Manual and agent actions must use the same domain with real, distinct runtime authority.
- All tests run via the repository's `test:ci` runner, never locally. Typecheck locally from this module with `bun typecheck`.
- Do not restart the owner's app/server or use live tenant credentials without the explicitly authorized environment and budget.
