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
