# Permission and question requests

When an agent needs a decision, the composer is replaced by a dock above it:

- **Permission request.** The agent wants to run a tool or touch a resource. Use Deny, Allow once, or Allow always. Allow always covers the same request in this project.
- **Question.** The agent asks you something. Answer it, or use Dismiss (or Escape) to decline.

## Stop works at any time

While a permission or question dock is shown, a **Stop** button stays visible above it. Stop ends the turn:

- The agent's current turn is interrupted, and the tool it was waiting on is not run.
- Every open permission and question of that session is rejected, so nothing is approved by stopping.
- The dock closes.

Stop does nothing when the session is idle. You can send a new message afterwards.

Deny and Dismiss also reject the request, but they only answer that one request. The agent may then ask again or try another route. Use Stop when you want the whole run to end.
