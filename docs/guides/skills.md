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
