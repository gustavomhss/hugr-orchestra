# Context savings

**Context savings** in the sidebar (inside the Advanced group) shows how much tool output Orchestra kept out of the model's context in the open project, and lets you turn each saving on or off. The subtitle reads "Less output. The evidence that matters, kept intact." For how the saving works, read [Context](context.md).

## The summary

At the top, one switch, **Context savings for this project**, turns everything on or off for the project. When it is off, the screen says "Context savings is off for this project. Item settings and previous savings are kept."

Four figures follow:

| Figure | Meaning |
| --- | --- |
| **Bytes saved** | The size of output that was shortened away. |
| **Estimated tokens saved** | The same, as a local estimate. |
| **Saved calls** | How many tool calls were shortened. |
| **Active items** | How many items below are switched on. |

The figures cover this Orchestra project only. **Refresh** reloads them. Sizes are in bytes. Tokens are local estimates (characters divided by 4), not billed usage. A figure Orchestra could not measure shows **Unavailable**, never zero. If the history is bounded, the screen says "History is bounded. Savings cover only the collected executions."

## The items

Each row is one item, such as a tool or a command, with **Bytes saved**, **Estimated tokens saved** and an **On / off** switch. Turning a row off stops Lean from shortening that item for the project. Search with **Search items…**, or narrow the list with **Filter by category**: **All categories**, **Build**, **Tests**, **Lint**, **Dependencies** or **Search**.

A row marked **Summarized when large** has no filter of its own. With context savings on, its output over 4 KiB is summarized, and the failure blocks of failed commands stay in full. Recover the complete original with `lean_recall`.

If a change cannot be saved, the screen says "Could not save this change. Your last confirmed settings are still shown."

## Execution history

Choose a row's name to open **Execution history** under it. Each saved execution shows its command (marked **Command truncated** when long), whether it **Completed** or **Failed**, the exit code, the bytes and tokens saved, and **Open session** to jump to the chat that ran it. **Close history** closes it. A new item shows "No saved executions for this item yet."

## When the screen is empty

- "Context savings is unavailable for this project. Connect a supported server to view savings and controls." The server does not provide it.
- "No context savings items are available for this project." Nothing has a profile yet.

## See also

- [Context](context.md): what is shortened, what is never shortened, and the research seat.
