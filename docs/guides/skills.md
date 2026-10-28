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
- Built-in examples: every specialist seat's skills (`archie-*`, `backend-*`, `jimmy-reference`) and Maestro's playbooks (`maestro-*`, `frame-request`).
