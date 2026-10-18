# What I changed and why

I made two changes to `svc/session.py`:

1. `load()` now catches `json.JSONDecodeError`. On a corrupt blob it logs a warning, deletes
   the key from the store, and returns an empty dict instead of raising.
2. `save()` now serializes first and rejects payloads larger than `MAX_BLOB` by raising
   `SessionTooLarge`, before anything is written to the store.

Why this is the right approach: a corrupt blob previously took down every request for that
session with an unhandled exception. Deleting it lets the user recover on the next request.
The size check runs before the write so a too-large payload never lands in the store.
