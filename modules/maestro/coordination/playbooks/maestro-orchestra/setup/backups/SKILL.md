---
name: maestro-orchestra-setup-backups
description: Where the database lives, the automatic backup before migrations, the newer-version refusal, and how to restore.
internal: true
when: The owner asks where Sessions are stored, how to recover after a bad update, or why the app refuses to open the database.
not-when: The owner wants to wipe credentials (use the credentials leaf).
covers: []
---

# Database backups and restore

## Location

Sessions, projects and settings live in one SQLite file, `orchestra.db`, in the data directory (`<xdg data>/orchestra`). `orchestra db path` prints the path. `ORCHESTRA_DB` overrides it: an absolute path or `:memory:` is used as is, a relative name is placed in the data directory.

## Automatic backup

When a build opens a database with pending migrations, it first writes a consistent copy with SQLite `VACUUM INTO`:

```
<database>.backup-<last-applied-migration>-<unix-ms>
```

`legacy` stands in for the migration id when the database predates the migration journal.

- The 3 newest backups are kept; older ones are deleted (the prune sorts by the trailing timestamp).
- If the backup cannot be written, the migration does not run and nothing changes. The error reads "Could not back up the database before migrating, nothing was changed". Free space and start again.
- An in-memory database is never backed up.
- A database already up to date is not backed up.

## Newer database

If the database holds migrations this build does not know, it refuses with "This database was created by a newer Orchestra version (it has migrations this build does not know: ...). Update the app before opening it." Update; do not downgrade over a newer database.

## Restore

1. Quit Orchestra: the desktop app, the CLI and any server.
2. Move the current database aside with its `-wal` and `-shm` files.
3. Copy the chosen `<database>.backup-...` file to the database path.
4. Start the matching or a newer version. A newer one migrates again and backs up first.

## Related

Credentials are sealed with a key outside the database, so a restored database still needs that key (see the credentials leaf). Backups are local copies, not off-machine; an off-machine copy is the owner's task.
