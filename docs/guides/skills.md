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

- `internal: true` (or `yes`) hides the skill from the Skills chapter only. Agents still discover and load it as before.
- The core skill loader ignores the key, so no other change is needed.
- Built-in examples: `archie-plan` and `archie-work-package`.

## Seat skill trees

A specialist seat ships its knowledge as a skill tree rather than one long skill. Only the tree's roots are listed to
the agent, each with its description. When the agent loads a root with the `skill` tool, the answer ends with a
**Next level** index of that root's children, each with a line saying when to open it and when not to. The agent
opens one level at a time and loads only the branch the task needs, so a FastAPI change reads the FastAPI node and
never the Django one.

- Seat trees are not in the Skills chapter: they belong to their seat, and no other agent can load them.
- Language and framework knowledge several seats share lives in one shared `team-stack` tree.
- To see a seat's tree, open the agent's screen and its **Skill tree** tab ([The agent screen](agent-screen.md)).
