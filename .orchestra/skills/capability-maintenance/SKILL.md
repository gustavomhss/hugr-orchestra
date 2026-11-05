---
name: capability-maintenance
description: Ownership and change boundaries for Core capability connections, operators, and artifacts. Use when changing packages/core/src/capability or its capability server handlers, especially authority, routing, policy, execution, or artifact persistence.
---

# Capability maintenance

## Ownership map

| Surface | Owner | Boundary |
| --- | --- | --- |
| Operator authority | `capability/operator` | Issues scoped authority; request context is not itself authority. |
| Connection and target | `capability/connection` | Location-scoped host data, policy, credentials and bindings. |
| Artifacts | `capability/artifact` | Private blob persistence and session references/pins. |
| Routing and execution | capability server handlers | HTTP/API boundary; keep this separate from provider implementation. |

`CapabilityPolicy` is the policy/commit boundary used by connection and artifact operations. Connection resolution returns host material (including credential identity): never project it or loaded credentials into model-facing tool output. Artifact authorization checks binding and policy before resolving data; storage identity and placement matter across database reopen and session boundaries.

Do not turn this guide into an inventory of providers, integrations, or the wider Linux/app dock. Follow the owning adapter only when the change crosses that boundary. Server handlers are routing boundaries, not owners of capability authority or persistence.

## Safe changes

- Trace the operation from its handler/facade to the owning module and policy check; preserve typed failure behavior at each boundary.
- Keep credential validation exact to the saved credential and integration; do not infer remote qualification from a supplied subject.
- Keep artifact bytes, roots, quotas, and references in the artifact owner. A logical quota is not a physical disk/orphan-burst cap.
- Check location, workspace, session, and owner binding before broadening reads or writes.
- Name relevant existing witnesses in `packages/core/test`, including `capability-connection-management-authority.test.ts`; inspect the domain-specific artifact/operator tests before changing those paths. This is a pointer, not a claim that tests were run.
- After editing, review the full diff for authority or secret data crossing into a model/tool response.

## Source trail

- `packages/core/src/capability/operator/index.ts` — private issued authority, expiry/revocation and scoped request context.
- `packages/core/src/capability/connection/index.ts` — Location-scoped management, exact credential and policy boundary.
- `packages/core/src/capability/artifact/index.ts` — shared storage, binding/policy authorization and references.
- `packages/core/src/capability/policy.ts` and `sql.ts` — policy and persistence seam.
- `packages/server/src/handlers/capability-*.ts` — request routing; follow the specific handler for its actual authorization path.
