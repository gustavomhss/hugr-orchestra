# Skills: catalog visibility

The Skills chapter lists the skills Orchestra finds in the project's skill folders (`.orchestra/skills/`, `.claude/skills/`, `.agents/skills/`), the global folder and the built-in modules.

## Agent-only skills

Some skills exist only for an agent to load, for example the planning skills of a specialist seat. Mark them in the frontmatter so the catalog does not show them to users:

```markdown
---
name: archie-plan
description: …
internal: true
---
```

- `internal: true` (or `yes`) hides the skill from the Skills chapter and from a workflow step's skill list. Agents still discover and load it as before, and a step that already names it still runs.
- The core skill loader ignores the key, so no other change is needed.
- Built-in examples: every seat tree root (`archie-*`, `backend-*`, `jimmy-*`, `team-stack`) and Maestro's playbooks (`maestro-*`, `frame-request`).

## The skill list in the system prompt

Agents see the skills they may load as a list in the system prompt, sorted by name. The list is bounded so a large catalog cannot crowd out the task:

- A description longer than 300 characters is cut and ends with `…`. Put what decides when to load the skill first.
- Once the described list reaches about 12,000 characters, the remaining skills are named in one line without descriptions. The agent loads any of them by exact name with the `skill` tool, as before.

## Seat skill trees

A specialist seat ships its knowledge as a skill tree rather than one long skill. Only the tree's roots are listed to
the agent, each with its description. When the agent loads a root with the `skill` tool, the answer ends with a
**Next level** index of that root's children, each with a line saying when to open it and when not to. The agent
opens one level at a time and loads only the branch the task needs, so a FastAPI change reads the FastAPI node and
never the Django one.

- Seat trees are not in the Skills chapter: they belong to their seat, and no other agent can load them.
- Language and framework knowledge several seats share lives in one shared `team-stack` tree.
- To see a seat's tree, open the agent's screen and its **Skill tree** tab ([The agent screen](agent-screen.md)).
