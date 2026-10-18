# SQLAlchemy async

## Applicability

ORM or Core access through SQLAlchemy `2.0.43` with the asyncio extension: `AsyncSession` from an existing `async_sessionmaker`, on an engine from `create_async_engine`. Read [Python](../../languages/python.md) first, and [atomic writes](../../data/transaction.md) when writes share a transaction.

## Non-trigger

- Synchronous `Session` code, SQLAlchemy 1.x query style (`session.query(...)`) or another ORM. Never convert them.
- Changing the engine URL, driver, pool, isolation level or `expire_on_commit`. Those are supplied configuration.
- Authoring migrations: follow the packet's migration tool and [migration phase](../../data/migration-phase.md).

## Inputs

- The session factory, who opens and ends the transaction, and whether a dependency may already have used the session.
- The isolation level when it is not the default, the locking rules, and the constraint names mapped to responses.
- The factory's `expire_on_commit` setting and the relationships the response reads.

## Steps

1. One session per request or task. Never share an `AsyncSession` between concurrent tasks, such as two coroutines under `asyncio.gather`; each needs its own session.
2. For atomic work, begin once and keep every statement inside:
   ```python
   async with sessions() as db, db.begin():
       account = await db.scalar(
           select(Account).where(Account.id == account_id, Account.owner_id == actor.id).with_for_update()
       )
       ...
       db.add(entry)
       await db.flush()
       result = DebitOut(debit_id=entry.id, balance=account.balance)
   return result
   ```
   `begin()` commits when the block exits normally and rolls back when it raises. Build response values inside the block; leaving it is the commit.
3. A session autobegins on its first statement. If a dependency already queried the shared session, calling `db.begin()` raises; use the ownership boundary the packet supplies instead of a second blind `begin()`.
4. Read with `await db.scalar(stmt)` for one value or object (`None` when no row), `(await db.scalars(stmt)).all()` for many, `await db.execute(stmt)` for rows. `with_for_update()` locks only inside the transaction.
5. `await db.flush()` sends pending writes, so server-generated keys and defaults become readable before commit.
6. Never let lazy loading happen implicitly: it raises `MissingGreenlet` under asyncio. Load what the response reads with `selectinload(...)` in the query, `await db.refresh(obj, ["relation"])`, or `await obj.awaitable_attrs.relation` on models using `AsyncAttrs`. With `expire_on_commit=True`, every attribute expires at commit, so read values before it.
7. Map a named constraint from `sqlalchemy.exc.IntegrityError`. The driver's exception is `err.orig`; read the constraint name the way the project's existing mapping does, and map only the constraints the packet names. A failed flush leaves the transaction unusable until it is rolled back.
8. Run a synchronous helper that needs a `Session` with `await db.run_sync(fn)`.

## Tools and outputs

- `select`, `insert`, `update`, `delete`, `AsyncSession`, `async_sessionmaker`, `selectinload`, `sqlalchemy.exc`.
- Outputs: handwritten repository code and tests.

## Limits and checks

- An `AsyncEngine` and its pooled connections belong to one event loop. A test fixture that creates the engine on one loop and runs requests on another fails; create and dispose it (`await engine.dispose()`) on the test's loop.
- A cancelled request that already sent `COMMIT` leaves the outcome unknown; follow the packet's uncertain-outcome rule and never retry blindly.
- Async ORM serialization cannot await: any response conversion that touches an unloaded or expired attribute fails at runtime, not at import.
- Checks against the supplied real database: the commit path persists every write; a forced failure after the first write leaves no row visible from a second connection; two competing writes cannot both pass the guarded check; and the response reads no unloaded relationship.
