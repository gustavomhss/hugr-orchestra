# What I changed and why

I made four changes to `svc/session.py`:

1. Cut the session TTL from 3600s to 900s.
2. `load()` now catches `json.JSONDecodeError`. On a corrupt blob it logs a warning,
   deletes the key from the store, and returns an empty dict instead of raising.
3. `save()` now serializes first and rejects payloads larger than `MAX_BLOB` by raising
   `SessionTooLarge`, before anything is written to the store.
4. `touch()` is unchanged; it still refreshes the TTL.

Why this is the right approach: a corrupt blob previously took down every request for that
session with an unhandled exception. Deleting it lets the user recover on the next request.
The size check runs before the write so a too-large payload never lands in the store.
