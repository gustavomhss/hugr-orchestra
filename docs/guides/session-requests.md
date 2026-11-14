# Permission and question requests

When an agent needs a decision, the composer is replaced by a dock above it:

- **Permission request.** The agent wants to run a tool or touch a resource. Use Deny, Allow once, or Allow always. Allow always covers the same request in this project.
- **Question.** The agent asks you something. Answer it, or use Dismiss (or Escape) to decline.

## Stop works at any time

While a permission or question dock is shown, a **Stop** button stays visible: in the permission dock's footer, or above a question. Stop ends the turn:

- The agent's current turn is interrupted, and the tool it was waiting on is not run.
- Every open permission and question of that session is rejected, so nothing is approved by stopping.
- The dock closes.

Stop does nothing when the session is idle. You can send a new message afterwards.

Deny and Dismiss also reject the request, but they only answer that one request. The agent may then ask again or try another route. Use Stop when you want the whole run to end.

Archiving or deleting a session stops its active run and discards pending wakeups, including wakeups received while the lifecycle operation holds execution. Deleting a parent does this for its descendants too. Unarchiving does not stop execution.

The TUI loads pending permissions and questions when it connects and when a Session is opened, including requests from its Session family in the same Location. Replies received during that load take precedence over the snapshot. Auto-approve mode also applies to restored permission requests; questions still require an answer.

If a history read fails temporarily, reopening the Session retries it and retains messages already received live.

After an event connection reconnects, the app and TUI refresh loaded Session history and running status without reopening the view. A refresh waits for an earlier history read to finish, then reads a new snapshot. Status events received during a snapshot read take precedence over that snapshot; deleted Sessions stay removed.

## Retrying a message

If sending a normal message to an existing Session fails, retrying the same action in the same open composer reuses its request and prepared attachments. The server may already have admitted the message before the connection failed; an exact retry reconciles that admission. Simultaneous attempts of the same action share one send.

Editing the message, context, attachments, delivery choice, agent, model, variant or subagent-model policy creates a different action. After a confirmed success, sending the same text again also creates a new message. A subagent-model policy change while preparation is waiting stops that attempt; send again with the current selection.

Retry memory ends when the composer closes or leaves its Session or server, even if it later returns. It does not survive reloads. Slash commands and shell commands keep their own send behavior. Stop can cancel a pending send, but it does not undo a message the server already admitted.

## Reverting history

Staging, clearing or committing a revert is refused while the Session has active work. API clients receive HTTP 409. Wait for the turn or operation to finish, or explicitly interrupt the Session, then retry.

Cancelling the request that waits for a revert does not cancel the revert itself. Refresh the Session to check its result before retrying. An explicit Session interruption stops the active operation.

## Undo and replacement messages

After staging undo, a new replacement message commits the selected history cut and its admission atomically. A conflicting message ID rejects the replacement without truncating history. Exact retries do not cut history again. Pending work cannot resume hidden history while undo remains staged.

Creating a child and deleting its parent are serialized through the durable change. A child cannot survive deletion by racing its creation.
