# Claude mode

Claude mode runs Orchestra on your Claude subscription. To you it is Orchestra as in any other mode: the same app,
the same screens and widgets, the same Maestro, seats, board, workflows, permissions and skills. Only the way Orchestra
reaches the model changes.

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
- Claude Code's own subagent tool is not used. Seats are always Orchestra Sessions.

## Known limits

- If Anthropic bills a turn as extra usage or refuses it, the app shows the provider's message. You can enable extra
  usage, use an API key, or pick another provider.

Design and decisions: `docs/specs/claude-mode/meta-harness.md`.
