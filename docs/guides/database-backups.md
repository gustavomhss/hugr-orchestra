# Database backups and restore

Orchestra keeps sessions, projects and settings in one SQLite file. Print its location with:

```bash
orchestra db path
```

`ORCHESTRA_DB` overrides it. An absolute path or `:memory:` is used as is; a relative name is placed in Orchestra's data directory.

## Automatic backup before every migration

When a new version opens a database that still has pending migrations, it first writes a consistent copy next to the database with SQLite `VACUUM INTO`:

```
<database>.backup-<last-applied-migration>-<unix-ms>
```

`legacy` replaces the migration id when the database predates the migration journal.

- The three newest backups are kept and older ones are deleted.
- If the backup cannot be written (full disk, read-only folder), the migration does not run and nothing is changed. Free space and start the app again.
- An in-memory database is never backed up.

## A database from a newer version

If the database has migrations this build does not know, Orchestra refuses to open it with "This database was created by a newer Orchestra version… Update the app before opening it." This protects data written by a newer release from being read with the wrong schema. Update the app; do not downgrade over a newer database.

## Restore a backup

1. Quit Orchestra (desktop app and any `orchestra` CLI or server).
2. Move the current database aside together with its `-wal` and `-shm` files, if present.
3. Copy the chosen `<database>.backup-…` file to the database path.
4. Start the version of Orchestra that matches the backup, or a newer one. A newer one migrates it again and takes a fresh backup first.
