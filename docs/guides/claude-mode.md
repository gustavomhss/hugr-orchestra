# Claude mode

Claude mode runs Orchestra on top of Claude Code, signed in with your Claude subscription. Claude Code keeps its own
prompt, tools, context window and login, as it would in a terminal. Orchestra adds to it the way a plugin does.

## What Orchestra adds

- **A short note on Claude Code's prompt.** Maestro's role, its seats, and the governed paths it must use. Claude
  Code's own prompt is never replaced.
- **Project context beside your message.** The project's context and the active workflow's instructions reach Claude
  Code beside the prompt. They are sent again only when they change, and after Claude Code compacts the conversation.
- **Seats as subagents.** Each Orchestra seat is a Claude Code subagent named `orchestra:<seat>`. The research seat
  comes in three sizes, `orchestra:jimmy-quick`, `-focused` and `-deep`, each with its own turn budget.
- **Orchestra's permissions.** Every tool call, including a delegation to a subagent, is checked against Orchestra's
  permission rules before it runs. A call made inside a seat's subagent is checked under that seat's rules.

## What stays Orchestra's own

Approved workflows dispatch through Orchestra's own task tool, and governed reviews through its review request. Those
calls carry Orchestra's governance, so Maestro uses them instead of a plain subagent for that work.

## Known limits

- A subagent's run shows as one collapsed `Agent` row in the session, without its own child session.
- Seat skills are not attached to the subagents yet.
- If Anthropic bills a turn as extra usage or refuses it, the app shows the provider's message. You can enable extra
  usage, use an API key, or pick another provider.

Design and decisions: `docs/specs/claude-mode/meta-harness.md`.
