# pgx

## Applicability

Native PostgreSQL access through `github.com/jackc/pgx/v5` at `v5.8.0` (its module floor is Go 1.24): a `*pgxpool.Pool`, a `*pgx.Conn` or a `pgx.Tx`. Read [Go](../../languages/go.md) first, and [atomic writes](../../data/transaction.md) when writes share a transaction. sqlc output runs on these handles; for it also read [sqlc generated queries](sqlc.md).

## Non-trigger

- `database/sql` with the pgx `stdlib` driver, or an ORM on top of it: its cancellation and transaction rules differ. Never convert it.
- pgx v4 code (`github.com/jackc/pgx/v4`): types and pool API differ.
- Changing pool size, the query execution mode or the isolation level. Those are supplied configuration.

## Inputs

- The handle the repository receives, and who owns the transaction.
- The isolation level when it is not the default, the locking rules, and the constraint names mapped to responses.

## Steps

1. Run a standalone statement on the pool: `pool.Exec`, `pool.Query` or `pool.QueryRow`. Consecutive pool calls may use different connections.
2. For atomic work, begin once and send every statement through the transaction:
   ```go
   tx, err := pool.Begin(ctx)
   if err != nil {
       return err
   }
   defer func() {
       cctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), cleanupBudget)
       defer cancel()
       if err := tx.Rollback(cctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
           // report per the packet's cleanup contract; never replace the primary error
       }
   }()
   // every statement: tx.Exec / tx.Query / tx.QueryRow
   return tx.Commit(ctx)
   ```
   `Rollback` after a successful `Commit` returns `pgx.ErrTxClosed` and does nothing, so the deferred call is safe. Where the project already uses it, `pgx.BeginFunc(ctx, pool, fn)` commits when `fn` returns nil and rolls back otherwise.
3. Run `SELECT ... FOR UPDATE` through `tx`; the row lock holds until commit or rollback. On the pool the statement autocommits and the lock is gone when it returns.
4. Read one row with `QueryRow(...).Scan(...)`. No row returns `pgx.ErrNoRows`; match it with `errors.Is(err, pgx.ErrNoRows)` and map it to the packet's not-found result.
5. Read many rows with `pgx.CollectRows(rows, pgx.RowToStructByName[T])`, which closes `rows`, or loop with `defer rows.Close()` and check `rows.Err()` after the loop. `Query` returns only send errors; a failed statement can surface only in `rows.Err()`.
6. Map a named constraint with `errors.As`:
   ```go
   var pgErr *pgconn.PgError
   if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "tasks_tenant_project_title_key" {
       // the packet's conflict result
   }
   ```
   Map only the constraints the packet names; other violations stay errors.
7. Session state (`SET`, session advisory locks, temporary tables, `LISTEN`) needs one connection: `conn, err := pool.Acquire(ctx)` followed by `defer conn.Release()`.

## Tools and outputs

- `pgxpool` (`New`, `Begin`, `Acquire`), `pgx` (`Tx`, `Rows`, `CollectRows`, `ErrNoRows`, `ErrTxClosed`), `pgconn.PgError`, and `pgtype` for nullable values such as `pgtype.Text{String, Valid}` and `pgtype.Timestamptz{Time, Valid}`.
- Outputs: handwritten repository code and tests. Raw pgx has no generated output.

## Limits and checks

- The context passed to `Begin` governs only the `BEGIN` statement. Canceling it later rolls nothing back; only `Rollback` or the loss of the connection does. Each later call takes its own context.
- A statement interrupted by its context leaves the transaction unusable. Return that primary error; a failed cleanup rollback is reported beside it.
- `pgxpool.Pool` is safe for concurrent use; `pgx.Tx`, `*pgx.Conn` and `*pgxpool.Conn` are not. Never run statements of one transaction from several goroutines.
- `Commit` and `Rollback` on a pool transaction release its connection. A transaction never finished, or an `Acquire` never released, holds a pool slot until the pool blocks.
- One statement sent to the pool inside a transaction escapes it and still compiles.
- `Commit` can fail; never answer success before its error is checked. A cancellation racing a sent `COMMIT` leaves the outcome unknown: follow the packet's uncertain-outcome rule and never retry blindly.
- Checks against the supplied real PostgreSQL: the commit path persists every write; a forced failure after the first write leaves no row visible from a second connection; a pool limited to one connection (`pool_max_conns=1`) exposes a leaked slot.
