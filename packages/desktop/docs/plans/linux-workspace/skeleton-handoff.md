# Dock Skeleton Mode: user feedback handoff

The user supplied model feedback while the Linux execution/PTY work was active.
This packet belongs to the GUI integration owner (`dock-accessibility`). Linux
execution and filesystem access remain the separate `linux_*` tool channel.

## Requested additive interface

- `dock_read.mode`: `full` (existing default), `a11y`, `skeleton`.
- Preserve existing full output; skeleton is a compact semantic outline.
- Explicit hierarchy: parent/children references or a nested tree; include
  containers/groups/headings that explain otherwise isolated controls.
- Semantic path plus role/name/states, logical tree/read order, actionable state.
- Optional actionable/visible/inViewport filters; report unsupported visibility
  rather than treating missing provider evidence as visible.
- Requested formats: JSON, indented tree, and CSV with proper text escaping.

Example supplied by the user:

```text
dialog "Modal da segmentação de mercado"
  heading "Como você quer usar o Slack?"
  fieldset "Como você quer usar o Slack?"
    checkbox "Chat e colaboração" (checked)
    checkbox "Gerenciamento de projetos"
    checkbox "Comunicar-se com clientes e consumidores"
  button "Avançar" (enabled)
```

## Contract constraints to preserve

- A semantic path is a **selector to revalidate**, not durable object/record
  identity. Duplicate names, reordered siblings and virtualized lists can change
  what it matches. Report ambiguity/missing/stale targets; never silently choose
  the first match or retry an uncertain mutation.
- Browser numeric refs and native opaque `n:` refs remain distinct. A shared
  parentRef/children shape must support both, not force native refs into numbers.
- Use the actual DOM/accessibility ancestry, not geometry-derived grouping.
  Retain enough ancestors when filtering children so group context is not lost.
- Preserve existing epoch/scope validation, protected-text handling, finite
  observation budgets, partial/error status and explicit continuation.
- Traversal order should be identified as provider/tree order; it is not a proof
  of keyboard focus order when the provider does not establish that relation.
- The suggested screenshot-reduction percentage is a hypothesis. Benchmark a
  representative browser/GTK/Qt/Electron corpus before publishing a percentage.

This document records feedback and integration constraints. It does not claim
that Skeleton Mode or path-based actions have been implemented by this worktree.
