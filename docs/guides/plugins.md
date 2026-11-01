# Plugins

Plugins shape how the model thinks and speaks. Each one is a short set of behavior instructions that you switch on for a project. The page is titled **LLM behavior** and its sidebar entry is **Plugins**.

## Where it lives

Open **Plugins** in the sidebar's Advanced group. It needs a project, and each project keeps its own behaviors: what you enable here does not change other projects. The description reads **Shape how the LLM thinks and speaks. Each project has its own behavior.** Use **Search plugins** to filter the list.

## What is in the list

- **Caveman** is built in: **Technical substance stays. Fluff goes.** It has an **Intensity** of lite, full or ultra.
- Behaviors you add yourself are marked **custom**.

Each row shows a badge: **Active** when the behavior is switched on and has instructions, **Enabled** or **Disabled** for the switch, and **No instructions** when a behavior is on but has nothing to say. The switch **Enable {name}** turns a behavior on or off. **Configure** opens its details.

## Add a behavior

1. Choose **Add plugin**.
2. Fill in the dialog:
   - **Name**: what the behavior is called in the list.
   - **Description**: a short line saying what it does.
   - **Behavior instructions**: the text the model receives, written as you would write it in chat.
3. Choose **Save**.

To change one, choose **Configure**, edit and **Save**. For Caveman you can also change the **Intensity**. **Remove behavior** is in the same dialog. It asks **Remove this item?** and then removes the behavior's configuration from this project.

## When it applies

An enabled behavior is added to new chat messages. It does not apply to slash commands or shell runs. When the server holds the behaviors, they apply on the server to every turn, including chats that are already open. If the server cannot accept per-prompt instructions, the row says **not applied**, and the behavior has no effect until the server supports it.

If saving to the server fails, the row says **sync failed** with **Retry**. Your change stays in the page, and choosing **Retry** sends it again.

## Limits

- Behaviors belong to one project. Add them again in another.
- Behaviors reach the model only through chat messages. They do not change slash commands or shell runs.
