---
name: frame-request
description: Assess one Maestro request for runtime admission. Use for governed intake or when active work makes request intent ambiguous.
---

# Frame Request

Purpose: assess one user message without planning, scope selection, approval, task creation, or product mutation. Runtime computes ORIENT, CLARIFY, or READY_TO_DRAFT; never author an outcome.

## Inputs

Use only current user message plus facts already observed in session/project context. Missing context stays unknown.

## Procedure

1. Mark message `orient` when user asks for status, explanation, or inspection only.
2. Mark message `work` when user requests changed product behavior, code, configuration, or delivery.
3. Extract plain-language goal only when explicit enough to draft an honest plan.
4. Separate known facts from Maestro proposals. Never upgrade inference to stakeholder fact.
5. Identify one material blocker only when possible answers would produce incompatible outcomes, cross authority, or make a plan dishonest.
6. Treat recoverable implementation uncertainty as visible proposal/assumption, not a clarification loop.
7. Set `activeWorkEffect` to `new-scope-or-revision` if active approved work could be redirected, widened, or replaced; otherwise set `none`.

## Output

Return an assessment in this exact JSON shape. For governed intake, pass it to `maestro_record_admission` with `methodVersion: "admit-request-v1"` as shown. The plan reader uses this exact version; a different version will not satisfy its admission lookup.

```json
{
  "methodVersion": "admit-request-v1",
  "assessment": {
    "kind": "work",
    "goal": "Add dark mode to settings.",
    "known": [
      { "text": "User requested dark mode in settings.", "source": "stakeholder" },
      { "text": "Settings page exists.", "source": "orientation" }
    ],
    "proposals": [{ "text": "Draft settings scope before implementation.", "source": "maestro" }],
    "unknowns": [],
    "uncertainty": "Theme persistence needs later inspection.",
    "activeWorkEffect": "none",
    "reason": "Goal is usable for a draft."
  }
}
```

`kind` is `orient` or `work`. `goal` is an optional string; omit it when no usable goal exists. `known`, `proposals`, and `unknowns` are required arrays, even when empty. Each known fact is an object with nonblank `text` and `source` equal to `stakeholder` or `orientation`; each proposal has nonblank `text` and `source` equal to `maestro`. Each unknown is a nonblank string describing a material blocker. `uncertainty` and `reason` are required nonblank strings, not arrays. `activeWorkEffect` is required and is `none` or `new-scope-or-revision`. Do not copy example facts unless observed. Do not include `outcome`.

Runtime decision gate, in order:

```text
invalid assessment             -> CLARIFY
orient                         -> ORIENT
work + active-work conflict     -> CLARIFY
work + no usable goal          -> CLARIFY
work + material blocker        -> CLARIFY
work + usable goal             -> READY_TO_DRAFT
```

## Boundaries

- Do not call Task, edit, write, shell, network, Atlas write, or member tools.
- Do not ask more than one decision question.
- Do not emit or imply approval.
- Do not treat absent project orientation as a project rule.
- Returning an assessment alone is not durable runtime admission. The admission tool binds its computed result to the current direct user message. Do not claim replay, persistence, or task fencing until runtime evidence exists.
