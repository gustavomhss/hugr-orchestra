---
name: archie-workflow
description: Design a reusable Relay workflow and save it as an unpublished draft with `archie_draft_workflow`, for the owner to review and publish in Workflows.
internal: true
---

# Workflow design

A workflow is a reusable sprint the owner runs many times: phases of steps, each step gated by checks the host
grades. You design it and save it as a draft; the owner reviews it in Workflows and publishes it. Nothing you save
runs until they do.

## When a workflow fits

Draft one only when the assignment asks for a workflow, or the same multi-step job recurs and each step has an
observable result a command can check. A one-off Task stays a brief or a work package (`archie-plan`,
`archie-work-package`). A workflow that only says "do it well" with no command to check it is not worth saving.

## Design method

1. **Name the outcome.** The `brief` says what the workflow produces, when to run it and what done looks like, in two
   or three sentences. The draft's `description` repeats the when-to-run line for the Workflows list.
2. **Cut phases.** A phase (`macros[]`: `id`, `title`, `instructions`) is a stretch of work with one mindset, such as
   understand, build, prove. Its `instructions` are the protocol every step in it inherits: the rules, the order and
   what the agent must never do there. Two to five phases; one is fine for a short workflow.
3. **Cut steps.** Each `work_packages[]` entry is one move an agent finishes in one go and a check can grade:
   `id` (`phase.step`, unique), `macro` (its phase id), `kind`, `title`, `instructions`, `checklist`. Order is the
   run order. Keep the whole chain at seven steps or fewer when you can: longer chains pass the default cap and warn.
4. **Write instructions an agent can follow cold.** Name the files to read and write, the output artifact and its
   sections, what the step must not touch and what to do when it finds the premise wrong (stop and say so).
5. **Gate every step.** Every step except `inject` and `human` needs at least one deterministic `cmd` check, or the
   draft is refused (`ungated`). Then add judges where quality matters.
6. **Hand the context.** An `inject` step delivers a file (`file`, a path in the project) or inline `text` to the
   next steps, for a rulebook or a template. It needs no check.

## Checks

A control (`checklist[]`) grades by exactly one of `cmd` or `judge`, with a unique `id` across the whole sprint and an
`assert` line saying what it proves.

- **`cmd`** is a bash command whose exit code grades the step. Use the project's real test, lint and build commands,
  `test -s file`, `grep -q '^## Section' file`, word counts (`test "$(wc -w < f)" -ge 80`), and
  `git diff --name-only <base> -- <path> | grep -q .` to prove a path changed. Add
  `|| git ls-files --others --exclude-standard -- <path> | grep -q .` so a new file counts as a change. Commands that
  cannot fail (`true`, `exit 0`, `echo`) are refused.
- **`judge`** is a question a reviewer answers PASS or FAIL. Ask one concrete question and list the FAIL cases
  ("FAIL if it edits a pinned test, ..."). Set `blocking: true`, or it never stops anything. `diff: true` shows the
  reviewer the change; `context` lists files it must read.
- Pair them: a `cmd` proves the artifact exists and has its shape, a `judge` proves it is good.
- Never author `host_check` controls. The host appends `package-verification` and `cold-review` to the last step when
  a workflow runs.

Use concrete paths and commands from the project you inspected. Do not leave `${placeholder}` parameters: nothing binds
them in a drafted workflow, so the command runs with an empty string.

## Kinds

- `execute`: the agent does work. The default.
- `review`: the agent inspects earlier work and writes a verdict file. Still needs a `cmd` check on that file.
- `gate`: no new work, only checks, such as a final suite run.
- `inject`: hands the next steps a file or text.
- `human`: accepted but the arm does not support it yet. Do not use it.

## Save the draft

Call `archie_draft_workflow` with `name`, `description` and `sprint` (the sprint as a JSON string). The tool lints,
projects it onto the canvas, compiles it and saves it unpublished. A refusal names the failing lint finding or graph
problem: fix the sprint and call again. Warnings come back with the saved draft; fix them or say why they stay.

Report the draft id and name in the proposal and list "owner reviews and publishes draft `<id>` in Workflows" under
`nextActions`. Do not publish, run, arm or dispatch the workflow; the owner decides.

See [a complete example](references/example.md).
