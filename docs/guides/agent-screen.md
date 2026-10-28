# The agent screen

**Agents** lists every agent in the open project as a card: its picture, name, whether it leads or works as a
specialist, a dot for whether its provider is connected, its description, how many tools, skills and Atlas memories it
has, and its model. Only Maestro's card has **Open Chat**, because every other agent works through Maestro.

Click a card to open that agent's screen. **Agents** at the top takes you back to the list.

## Tabs

- **Overview**: description, mode, model, step limit and avatar. A project agent you made can be removed here; Maestro
  cannot be removed or taken out of the lead mode.
- **System prompt**: what the agent is told before every task. Edit it in place. An empty prompt, or **Reset to
  built-in**, brings back the prompt the agent ships with.
- **Tools**: the tools the model sees in this project after permissions, and the permission rules you can change.
- **Toolkit**: what the agent brings of its own, beyond the shared tools.
  - **Command-line engines** are the pinned tools the agent runs from its own toolkit, such as code generators,
    checks and indexers. Each row shows what the engine reads, its role, its pinned version and whether it is
    installed on this machine. An engine is fetched once per machine the first time the agent needs it.
  - An agent with no toolkit of its own says so.
- **Skill tree**: what the agent knows, as a tree. Each root its seat ships is a row you can open to the nodes below
  it, one level at a time, the same way the agent opens them while it works. A deeper node shows **Opens when**: the
  situation that makes the agent load it. Catalog skills from this project and your profile follow as plain rows.
- **Memory**: what the agent has recorded in the project's Atlas, newest first, with a link to open it in Atlas.

## Saving

Changes on Overview, System prompt and Tools are kept as a draft. A bar at the bottom shows **Unsaved changes** with
**Discard** and **Save**. Saving writes the agent's file under `.orchestra/agent/<id>.md`; the agent uses the new
settings from its next turn.

See [Agent avatars](agent-avatars.md) for pictures.
