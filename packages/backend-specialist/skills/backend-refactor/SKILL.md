---
name: backend-refactor
description: "Procedure for an assigned structural change with behavior to preserve: a move, extraction or rename between supplied seams, a binding-aware rename, a syntax recipe over pre-decided occurrences, or an edit at a generated-code boundary. Load with backend-implement when the packet prescribes a refactor. Not for choosing the target structure, cleanup sweeps or changing behavior."
---

# Backend refactor

This skill gives direct access to the refactor procedure of `backend-implement`, which you load first. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; where this skill and the packet disagree, follow the packet.

The rules of the mode live in one place: read [prescribed refactor mode](../backend-implement/references/modes/refactor.md) before editing. This entry adds the transformation method.

## When this applies

- Applies: the packet prescribes a structural change and the external behavior to preserve: wire format, data results and resource lifetimes.
- Does not apply: choosing the architecture or the target seam; "clean up", "modernize everything" or a repository sweep; a framework major upgrade, which is a separate [migration or compatibility](../backend-implement/references/modes/migration.md) assignment.
- A "refactor" that changes accepted inputs or outputs is not preservation. Return a `packet` blocker that quotes both sides.

## Inputs beyond the common packet

- The old and target seams or symbols, with the declaration's identity and signature.
- The writable files, and the read context the packet permits separately, such as consumers. Read context may be broader than write scope.
- The expected occurrences or spans, when the change is a recipe over many sites.
- The invariants to preserve, before and after fixtures when supplied, and the base revision.
- When a transformation tool is selected: its version and the project context it needs, such as the compiler configuration, classpath or build tags.

Missing context is a `packet` blocker, never permission to look for more files.

## Select the reference

- [Scoped transformation](../backend-implement/references/refactors/scoped-transformation.md): preview, scope check, bounded apply and rerun, including generated outputs.
- [Syntax versus symbol](../backend-implement/references/refactors/syntax-vs-symbol.md): which edit method can prove which identity.

Exact invocations of a selected engine live in its recipe; a recipe is used only when the packet selects that tool.

## Common procedure

1. Read the named targets and the supplied context.
2. Choose the edit method. A native edit is the default. Use a binding-aware rename when symbol identity matters, and a syntax recipe only for occurrences the packet already decided.
3. Preview before writing. Compare the paths, spans and symbols against the packet, not only the count.
4. Apply the reviewed delta as bounded native edits.
5. Adapt only the callers the packet assigns. An unassigned caller that needs a change is a `packet` blocker.
6. Run the compiler and the preservation checks.

## Your choices and the caller's

Yours: equivalent internal expressions, small helpers, the edit method within the packet's selection, and fixes for compile errors in lines you changed.

Not yours: the target structure, any widened recipe, an unassigned caller, a behavior change the new seam would require, tool installation or configuration changes to provision a tool, and opportunistic cleanup. Never tighten validation or redesign a public interface while moving code.

## Checks

- A clean compile is not preservation evidence. Run the supplied seam and preservation checks, and keep unrelated files outside the delta.
- A zero-match run, an empty output or exit code 0 is not a completed transformation.
- An unexpected zero match, an extra or ambiguous match, a parse or type-context failure, or a scope escape is a `packet` blocker with the evidence, not a partial success.
- Report only what you ran. Return the result as `backend-implement` describes.
