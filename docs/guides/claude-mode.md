# Claude mode

Claude mode runs Orchestra on your Claude subscription. To you it is Orchestra as in any other mode: the same app,
the same screens and widgets, the same Maestro, seats, board, workflows, permissions and skills. Only the way Orchestra
reaches the model changes.

## Set up Claude mode

1. **Check the prerequisites.** Have a Claude subscription. Packaged Orchestra uses its deployed Claude Code
   resources. For the optional terminal route below, install Claude Code separately if you do not already have a
   `claude` command; follow the [official installation instructions](https://code.claude.com/docs/en/setup#install-claude-code).
   See the adapter's [executable lookup](../../modules/engine-adapters/claude-code/src/executable.ts#L34-L124)
   for the deployed-resource and explicit-install rules. Claude mode does not need an API key.
2. **Sign in to Claude.** Open **Providers**, find **Claude mode**, and choose **Sign in to Claude**. Claude Code opens
   the browser; the page also offers a fallback link and a field for the sign-in page's code. Alternatively, with the
   Claude Code CLI installed, run this in a terminal on the machine running Orchestra's server:

   ```sh
   claude auth login --claudeai
   ```

   Claude Code owns and stores this login; Orchestra relays the browser URL and pasted code, not the credential.
3. **Choose the engine.** Once **Claude account** shows **Signed in**, select **Claude Code** under **Maestro engine**.
   The other choice, **Orchestra**, uses Orchestra's normal engine. These controls are on the
   [Providers page](../../packages/app-shell/src/orchestra/chapters/claude-mode.tsx#L116-L209), with these
   [English labels](../../packages/app-shell/src/i18n/orchestra-chapters/providers.ts#L25-L67).

For manual configuration, the current JSON key is `agents.maestro.engine`, with value `"claude-code"` (or `"orchestra"`
for the normal engine):

```json
{
  "agents": {
    "maestro": { "engine": "claude-code" }
  }
}
```

The global settings writer uses an existing `orchestra.jsonc`, otherwise an existing `orchestra.json`, otherwise creates
`orchestra.json` in Orchestra's global config directory. See the [config writer](../../packages/core/src/config.ts#L272-L317),
[file selection](../../packages/core/src/config.ts#L372-L380) and [engine schema](../../packages/core/src/config/agent.ts#L14-L21).
The [configuration schema](../../packages/core/src/config.ts#L34-L54) uses plural `agents`. Changing the engine does not sign you in.

### Signed-out status and availability

When the account check reports signed out, **Claude account** shows **Not connected** and the **Claude Code** engine
choice is disabled. Sign in before selecting it. Subscription-backed Anthropic availability is added to the catalog
only when Maestro uses `claude-code`, the provider is enabled and the account is signed in; signing out does not provide
subscription-backed models. See the [availability rules](../../modules/engine-adapters/claude-code/src/v2/catalog.ts#L13-L54).

Account checks have a **30-second cache**. After a terminal login, a subsequent check can still return the cached
signed-out result until that cache expires; expiry alone does not schedule a refresh. A successful signed-in status is
remembered for **10 minutes**. If a later probe fails or times out, the last known signed-in status is kept rather than
treated as a sign-out; without one, the service returns signed out. A sign-in started through Orchestra clears both
caches when its CLI process ends, whatever the outcome. These are status-cache lifetimes, **not session expiry or a
general error timeout**. See the [account service](../../modules/engine-adapters/claude-code/src/v2/account.ts#L13-L84)
and [subscription login command](../../modules/engine-adapters/claude-code/src/v2/login.ts#L8-L32).

If the page instead says **Could not check the Claude sign-in. This is not a sign-out.**, use **Try again**. That message
means the page's status request failed, not that your Claude session expired.

## Why Claude mode exists

Anthropic lets a Claude subscription be used through Claude Code, not by other apps calling the model directly. Claude
mode exists only to follow that rule, and it follows everything Anthropic defines for it:

- **Claude Code runs the model.** Every turn on a Claude model is a Claude Code turn, signed in with your Claude login.
- **Claude Code's own prompt is kept.** Orchestra adds a short note after it and never replaces it.
- **Anthropic's billing applies.** Anthropic decides how each turn is billed. Orchestra never changes its prompts,
  tools or requests to influence that, and never tests it.

Claude mode is not meant to look or work differently. Anything that differs from normal mode, other than what the
rules above require, is a defect.

## What is the same as normal mode

- **The interface.** Every screen, widget and panel is the same. A Claude Code tool call shows with Orchestra's usual
  widget (shell, read, edit, todos, skill, ...).
- **Delegation.** Maestro dispatches a seat with Orchestra's task tool, as in normal mode. Each dispatch is its own
  Session, which you open from the task row and follow live. A seat on a Claude model runs on Claude Code too; a seat
  on another provider's model runs as it would in normal mode.
- **Seats.** Each seat works by its own Orchestra prompt and skills, under its own permissions.
- **Permissions.** Every tool call is checked against Orchestra's permission rules before it runs.
- **Workflows, reviews and the board.** Governed workflows, review requests, Atlas and the board use Orchestra's own
  tools, exactly as in normal mode.
- **Project context.** The project's context and the active workflow's instructions reach the model with your message.
  They are sent again only when they change, and after the conversation is compacted.

## What Claude Code requires

These follow from Claude Code running the model. None of them changes what you see.

- Claude Code's built-in tools do the reading, editing and shell work; Orchestra's own tools, such as the board, the
  task tool and the skill tool, are offered to it beside them.
- Built-in reading, editing and shell work still pass Orchestra's authorization gate. Orchestra-specific tools are served
  as `mcp__orchestra__*`, with their permissions settled by Orchestra's runner; selecting Claude Code is not permission
  bypass. See the [host's tool gate](../../modules/engine-adapters/claude-code/src/v2/host.ts#L152-L224).
- Built-in file tools and Glob/Grep search roots are checked against the physical project Location. An absolute path
  outside it needs `external_directory` approval as well as permission for the read, edit or search. Relative escapes
  and project aliases that point outside are refused; aliases inside the project use the target's permissions and safety
  restrictions. Claude Code receives your original arguments. These checks do not guarantee safety against another
  process replacing a symlink between approval and the filesystem operation.
- Claude Code's own subagent tool is not used. Seats are always Orchestra Sessions.

## Known limits

- Claude Code's tool calls show with Orchestra's usual widgets (shell, read, edit, todos, task, ...).
- If Anthropic bills a turn as extra usage or refuses it, the app shows the provider's message. You can enable extra
  usage, use an API key, or pick another provider.

Design and decisions: `docs/specs/claude-mode/meta-harness.md`.
