# Syntax versus symbol

## Applicability

Deciding how to perform a rename or a repeated call-shape change, when the result must touch exactly the intended declarations and references.

## Non-trigger

- A single edit to a named line, which a native edit handles directly.
- Choosing which API to migrate to: that decision is the owner's.

## Inputs

- Whether the packet decided occurrences by shape or by binding.
- The declaration identity and signature, and the project context a binding-aware tool needs.

## Steps

1. Occurrences decided by shape, with bindings already settled by the packet: a syntax-level match is enough, checked span by span.
2. A rename of a declaration together with its references: use a binding-aware rename from the language service or compiler, with the full project context loaded.
3. A typed API migration: use a tool that matches on the attributed receiver and signature, only when the packet selected it.
4. Never shrink the loaded project to the writable files to hide external references.

## Tools and outputs

- Native edits; a syntax engine or a binding-aware tool only when the packet selected it.
- Output: the edit delta with its span evidence.

## Limits and checks

- Syntax matching does not identify declarations. A shadowed parameter with the same name matches too, and a raw rename would change it; the span check must reject that match.
- A syntax engine rebuilds the matched region from its template, so comments not captured in the pattern can be lost. A parser that recovers from errors does not prove the file compiles.
- A binding-aware rename covers the loaded project only, not unknown consumers, reflection or runtime strings. It is neither a collision check nor an equivalence proof. Shorthand properties and import or export aliases need an explicit choice that follows project rules.
- Missing type information can silently suppress expected matches. A zero-match result after a context failure is incomplete, not "nothing to change".
- Checks: the shadowed and other-receiver controls stay unchanged, an already-transformed input yields no further delta, and the compile and behavior checks pass.
