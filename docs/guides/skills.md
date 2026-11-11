# Skills: discovery, caching and loading

The Skills chapter lists the skills Orchestra finds in the project's skill folders (`.orchestra/skills/`, `.claude/skills/`, `.agents/skills/`), the global folder and the built-in modules.

## Markdown frontmatter

Skill, agent and command frontmatter is data. Orchestra accepts YAML (including `yaml` and `yml` labels) and JSON, and refuses executable languages such as `javascript` and `js` before parsing. YAML values containing unquoted colons keep the existing compatibility fallback.

Automatically discovered project `AGENTS.md` files must resolve physically inside the project, including through symlinks. An escaping file is ignored without reading its target. Your global `AGENTS.md` and safe configured instructions remain available.

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
- The core skill loader preserves this metadata. It controls catalog visibility, not authorization; agent access still follows skill permissions.
- Built-in examples: every seat tree root (`archie-*`, `backend-*`, `jimmy-*`, `team-stack`) and Maestro's playbooks (`maestro-*`, `frame-request`).

## Cached discovery

Orchestra keeps the skills it has already read and interpreted in memory. Repeated catalog reads can reuse those results instead of scanning the source folders and parsing every Markdown file again. The cache belongs to the project's runtime services, not to a permanent file on disk or to the model provider.

| What happens | What the next read sees |
| --- | --- |
| Read the same registered sources again | Reuses their loaded contents. |
| Edit a skill file outside Orchestra | Keeps the cached version until the source is explicitly reloaded. There is no automatic filesystem watcher for this cache. |
| Explicitly reload the sources | Loads their contents again into a fresh cache. |
| Register or discard a source | Creates a fresh source state; registering the same folder again cannot revive an older cache. |
| Successfully save or remove a project skill through Orchestra | Invalidates cached contents so the next read reflects the write. |

For example, if Orchestra has loaded a skill whose description is “Review API changes”, editing that file to say “Review API and schema changes” in another editor does not update the cached description by itself. An explicit source reload makes the next read see the new description. Saving through Orchestra performs cache invalidation for you.

A read already in progress may finish with its earlier snapshot. It cannot put that old content back into the current cache after a reload or successful write. This protects against a slow reader undoing a newer refresh.

**A page refresh and a source reload are not the same operation.** Asking the server for the catalog again can still use its in-memory source cache. This section describes source reloads, not a promise that every UI refresh rescans the disk. Cache invalidation also does not rewrite messages already recorded in a session.

## What this saves — and what it does not

There are different costs involved:

- **Discovery cache:** avoids repeated filesystem reads and Markdown parsing. By itself it does not shorten the instructions sent to a model, reduce billed input tokens or establish a provider prompt-cache hit.
- **Catalog transport:** the Skills screen requests names, descriptions and other metadata first, then fetches one full skill when you open it to read or edit. Its warm catalog does not retain instruction bodies. This reduces bulk transfer and decoding, not model input tokens. Older servers without the split routes use the legacy full-list API as a compatibility fallback, so they do not receive the same transfer reduction.
- **Selective model loading:** the agent initially sees names and descriptions, not every skill's full body. It loads instructions with the `skill` tool when needed. Skill trees let it follow only a relevant branch instead of loading the whole tree. This is the mechanism that limits how much skill text enters the conversation; actual token counts depend on what the agent loads and the model request.

Cache membership is never permission to use a skill. Agent skill permissions and source precedence still apply independently.

The transport split does not make source discovery lazy: a cold source still needs to be read and interpreted to build its catalog. It also does not remove the full-list API used by existing clients. If a skill's winning source file changes between listing and opening it, the screen asks you to reload rather than silently opening a different file for editing.

## The skill list in the system prompt

Agents see the skills they may load as a list in the system prompt, sorted by name. The list is bounded so a large catalog cannot crowd out the task:

- A description longer than 300 characters is cut and ends with `…`. Put what decides when to load the skill first.
- Once the described list reaches about 12,000 characters, the remaining skills are named in one line without descriptions. The agent loads any of them by exact name with the `skill` tool, as before.

## Seat skill trees

A specialist seat ships its knowledge as a skill tree rather than one long skill. Only the tree's roots are listed to
the agent, each with its description. When the agent loads a root with the `skill` tool, the answer ends with a
**Next level** index of that node's children. Each child is listed by name with its description and, when the child
sets them, a **When** and a **Not when** line. The agent opens one level at a time and loads only the branch the task
needs, so a FastAPI change reads the FastAPI node and never the Django one.

- Seat trees are not in the Skills chapter: they belong to their seat, and no other agent can load them.
- Language and framework knowledge several seats share lives in one shared `team-stack` tree.
- To see a seat's tree, open the agent's screen and its **Skill tree** tab ([The agent screen](agent-screen.md)).
