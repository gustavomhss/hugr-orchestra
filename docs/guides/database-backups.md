# Database backups and restore

Orchestra keeps sessions, projects and settings in one SQLite file. Print its location with:

```bash
orchestra db path
```

`ORCHESTRA_DB` overrides it. An absolute path or `:memory:` is used as is; a relative name is placed in Orchestra's data directory.

## Automatic backup before every migration

When a new version opens a database that still has pending migrations, it first writes a consistent copy next to the database with SQLite `VACUUM INTO`:

```
<database>.backup-<attempt-uuid>
```

The entire migration batch and journal conversion run in one transaction. A failed batch rolls back, and each retry captures the latest live data again.

- Backups already present when this safety protocol first runs are retained. The protocol also keeps three recent attempts and the current recovery point; references to the same file count once. Failed attempts cannot prune the original backups.
- A sidecar `<database>.migration-backups.json` and private `<database>.migration-work` directory track publication and cleanup across process crashes. Keep them with the database; do not edit them or place files in the private directory.
- Publication refuses to overwrite an existing file. A damaged sidecar, unexpected private file or failed cleanup stops migration so existing data and recovery points remain available.
- If the backup cannot be written (full disk, read-only folder), the migration does not run and nothing is changed. Free space and start the app again.
- An in-memory database is never backed up.

## A database from a newer version

If the database has migrations this build does not know, Orchestra refuses to open it with "This database was created by a newer Orchestra version… Update the app before opening it." Both the current and older Drizzle journals are checked completely before any migration or backup starts. This protects data written by a newer release from being read with the wrong schema. Update the app; do not downgrade over a newer database.

## Restore a backup

1. Quit Orchestra (desktop app and any `orchestra` CLI or server).
2. Move the current database aside together with its `-wal` and `-shm` files, if present.
3. Copy the chosen `<database>.backup-…` file to the database path.
4. Keep the backup itself and its safety sidecar/private directory intact.
5. Start the version of Orchestra that matches the backup, or a newer one. A newer one migrates it again and takes a fresh backup first.
