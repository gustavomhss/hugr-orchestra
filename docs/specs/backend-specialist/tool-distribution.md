# Tool ownership and default distribution

Status: owner-approved product policy and initial external payload, 2026-10-04. Packaging and runtime qualification remain implementation work.

## Owner decision

**Distinguish tools we build from existing external tools we ship. A useful, selected free/open-source tool belongs in the backend specialist's default installation, ready to invoke.** Documentation telling the user to install it later does not meet that product requirement.

Owner approval: "aprovado", following the initial external-tool list and conditional HuGR Composer candidates. This approves the selection and default-distribution direction. It does not certify installation or remove the stated qualification requirements. The subsequent [owned-tool specification](owned-tools.md) defines proposed qualified contracts for those concrete operations.

Selection is a product/packaging decision based on usefulness and compatibility, not a new per-task approval ceremony. The chosen stack determines which available tool a task uses; it does not turn a selected default into an optional manual install.

## Two tool origins

| Origin | What it means | Implementation owner |
| --- | --- | --- |
| **HuGR/backend-specialist-owned** | Useful backend operations implemented by us, or qualified existing HuGR capabilities reused by the backend specialist | We own the operation, behavior and maintained adapters; shared producers retain their existing owners |
| **External, supplied by default** | Existing free/open-source engines selected for concrete implementation value, packaged with their supported invocation route | Upstream owns the engine; we own the pinned distribution, integration and usage recipes |

Wrapping `sqlc` does not make its compiler our invention. An adapter remains our code around an explicitly identified external engine. Existing native read/edit/shell and Atlas services remain host/foundation capabilities, not newly built backend specialist tools.

**Origin is independent of interface.** Either origin can be exposed through a native tool, CLI or MCP where that interface is useful. An external CLI can already serve a skill through native shell execution; a new MCP wrapper is not required merely to count it as integrated.

## What “by default” guarantees

- Normal backend specialist installation provisions the selected default executables, helper packages and the runtime dependencies needed to invoke them on the advertised host target.
- Provisioning finishes during ordinary installation/setup, before the first implementation assignment needs the tool. Package presence, a download link or an unmaterialized first-use fetch is not ready availability.
- Versions and invocation paths are explicit. Installation uses normal package/release mechanisms and isolated tool environments where needed; it does not require a new package-manager daemon or agent runtime.
- Distribution may use multiple platform/runtime artifacts internally. The normal install still includes its published default set; internal packaging splits do not become tool-by-tool user setup.
- On-demand skill loading and starting only the needed process remain useful. Preinstalled does not mean every tool description is always in context or every server process is always running.
- A missing/broken promised default on a supported target is an installation defect. Unsupported targets and project prerequisites are reported distinctly rather than pretending the tool is ready.

Installation availability is not permission to run any operation or change the application stack. Maestro/caller scope and native enforcement continue to govern invocation.

## Approved initial default payload

These external engines are approved for the initial default payload. Exact release pins, supported platforms and invocation conformance still need implementation verification. They are not already installed by this work.

| Tool | Default implementation value | Packaging/project distinction | Evidence |
| --- | --- | --- | --- |
| **ast-grep** | Scoped structural matching and transformations | Supply native CLI; use task's language/parser and authorized targets | [R33](research/33-codemods.md) |
| **sqlc** | SQL/schema to typed query bindings | Supply compiler; generated application driver/runtime dependencies still follow project design | [R31](research/31-typed-sql.md) |
| **ogen** | Go HTTP transport, codecs and selected validators from OpenAPI | Supply generator; project owns its selected generated-code/runtime boundary | [R29](research/29-http-codegen.md) |
| **Orval** | TypeScript clients and selected schema/validator generation | Supply locked generator environment and compatible tool runtime; do not replace application's runtime | [R29](research/29-http-codegen.md) |
| **datamodel-code-generator** | Python models from supplied schemas | Supply isolated generator environment and its formatter dependencies; project chooses its model runtime | [R38](research/38-python-composer.md) |
| **Buf and selected local codegen plugins** | Protobuf generation and compatibility operations | Supply the actual local plugins used by advertised recipes; no required paid registry or implicit remote generator | [R30](research/30-rpc-contracts.md) |
| **SQLx CLI** | Rust query-metadata preparation/check workflows | CLI is supplied; matching Rust project toolchain, schema/DB access and SQLx crate remain task prerequisites | [R31](research/31-typed-sql.md), [R50](research/50-rust-variants.md) |
| **OpenAPI Generator** | Selected JVM and other backend generation targets | Supply CLI plus required invocation runtime; only qualified targets count as supported | [R29](research/29-http-codegen.md) |
| **Kiota** | Typed outbound API clients | Supply usable CLI for supported host; generated client dependencies remain application-owned | [R29](research/29-http-codegen.md) |

This approved starting payload is not the entire research catalog. Additional external tools enter the default set when selected for real value and qualified for distribution. A paid service, trial quota or account-gated feature is not silently represented as a free default capability. Record the actual license and permitted distribution for the chosen artifact.

## Libraries and services are different dependencies

SQLx crate is not SQLx CLI. MapStruct, Mapperly, Effect, Hypothesis, proptest, Testcontainers and framework/driver packages participate in application builds or tests. A helper library can be supplied in the backend specialist's own tool environment where it powers a real helper, but adding a dependency to the target application's manifest is still a scoped implementation change.

Default tool availability does not automatically add an ORM/framework to every project. Prefer the project's explicit pinned command where it is compatible with the task; otherwise use the matching managed default when the design permits that tool. Do not substitute the newest bundled version for a project-required version silently.

Databases, container engines, credentials and project-specific compilers/SDKs are distinct prerequisites. For example, installed SQLx CLI does not mean the requested database is reachable; a Testcontainers library does not mean Docker is running. The installer supplies dependencies needed by the tool itself, while project/service requirements remain visible and separately bound.

## Owned capabilities

Backend-specialist-specific operations still need a recurring backend use, useful inputs/results and a concrete benefit over existing tools. The [initial owned-tool contract set](owned-tools.md#selected-initial-operations) qualifies the existing `hugr-compose` and `hugr-scaffold` producers rather than inventing generic shell/editor/test wrappers. Qualified interface changes and readiness remain implementation work.

HuGR Composer is an existing shared HuGR asset, not an external open-source default. `hugr-compose` and `hugr-scaffold` are approved reuse candidates conditional on qualification; the [documented source/bridge limits](backend-toolbox.md#hugr-composer-valuable-local-asset-qualify-concrete-outputs) remain real packaging/integration work for their owners. Tool ownership does not imply readiness.

For owned handlers with multiple interfaces, native/CLI/MCP adapters reuse the same operation and result semantics. For third-party engines, thin adapters preserve the real engine identity, version and outcomes. Both are described by the relevant skills.

Atlas Memory operations are existing foundation capabilities, not additional backend-specialist-owned tools or external toolkit entries. Consume their actual typed doors and host binding as specified in [atlas-memory-contract.md](atlas-memory-contract.md).

## Availability and responsibility

The distribution inventory records origin, upstream/source, exact version, license, supported host targets, invocation/interface, related skill recipes and required project services. Use existing package manifests, locks and release records for concrete installation data; this is not a new runtime catalog protocol.

Release/installation verification must exercise a representative advertised operation with the actual distributed artifact and dependencies. A binary name or `--version` response alone does not establish that generation or transformation works. These are future packaging checks, not executed results in this document.

Product/package maintainers own supplying and repairing the default toolset. The backend specialist consumes available tools under the task's authority and reports precise installation or project-prerequisite failures; it does not open an environment-investigation or installer-repair mission inside an unrelated backend assignment.
