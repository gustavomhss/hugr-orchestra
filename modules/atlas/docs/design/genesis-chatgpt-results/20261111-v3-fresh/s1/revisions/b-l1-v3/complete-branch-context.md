# B2 — complete minimal generated runtime branches

Source `packages/client/src/generated/client.ts` at `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; full-source SHA256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`.

These are the complete requested branches, assembled from the existing C34 source and new V06 lines. Only three prior lines are repeated here: 597, 653 and 654, the indispensable closing/release lines. The main additional supplement has zero C/S overlap. This minimal context is not a regenerated client or an execution result.

## binary-success

Lines 595–597; 98 bytes; SHA256 `982420772be23bd408fa112c9a727d14cfc7a76b137ff8a564d5a8d2821efe9c`.

```ts
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
    }
```

## SSE-finally

Lines 649–654; 120 bytes; SHA256 `918d47dde944d44dc0967056e6334260e085c304a3db27e7bc009ef1590422d8`.

```ts
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
```
