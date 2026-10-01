---
name: frame-request
description: Classify one Maestro request as orient, clarify, or ready to draft. Use for governed intake or when active work makes request intent ambiguous.
---

# Frame Request

Purpose: classify one user message without planning, scope selection, approval, task creation, or product mutation.

## Inputs

Use only current user message plus facts already observed in session/project context. Missing context stays unknown.

## Procedure

1. Mark message `orient` when user asks for status, explanation, or inspection only.
2. Mark message `work` when user requests changed product behavior, code, configuration, or delivery.
3. Extract plain-language goal only when explicit enough to draft an honest plan.
4. Separate known facts from Maestro proposals. Never upgrade inference to stakeholder fact.
5. Identify one material blocker only when possible answers would produce incompatible outcomes, cross authority, or make a plan dishonest.
6. Treat recoverable implementation uncertainty as visible proposal/assumption, not a clarification loop.
7. If active approved work could be redirected, widened, or replaced, stop at clarification.

## Output

Return compact assessment:

```text
kind: orient | work
goal: <optional outcome>
known: <observed/user facts>
proposals: <Maestro suggestions>
unknowns: <material blockers only>
uncertainty: <bounded interpretation limits>
outcome: ORIENT | CLARIFY | READY_TO_DRAFT
reason: <short user-visible reason>
```

Decision gate:

```text
orient                         -> ORIENT
work + no usable goal          -> CLARIFY
work + material blocker        -> CLARIFY
work + usable goal             -> READY_TO_DRAFT
active-work conflict           -> CLARIFY
```

## Boundaries

- Do not call Task, edit, write, shell, network, Atlas write, or member tools.
- Do not ask more than one decision question.
- Do not emit or imply approval.
- Do not treat absent project orientation as a project rule.
- This is reasoning guidance, not durable runtime admission. Do not claim replay, persistence, or task fencing until runtime evidence exists.
