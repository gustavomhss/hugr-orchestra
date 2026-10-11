# Frozen Cassandra compatibility build

## Current owned build — 2026-10-10

The current revision is `3.0.4+orchestra.cassandra3`, with upstream library/project pin `3.0.4`. It adds a Linux transport to the `cassandra2` command overlay below; the metadata backport, module/sum pins and the Darwin Unix-mode source are unchanged. Owner decision 2026-10-10: on Linux the exact-endpoint grant uses the sandbox runtime's own exact allowlist instead of the AF_UNIX broker.

- Generator SHA-256 is `614ecf03874e6ad19f6ba7878998cffc00e9bd85ddd6f3b03cd3d8ced22b15a7` before and `eaae89f157fd288df1d8b658aa71da4fa002b64c5e7ea32d5b9fba94faaf0fd5` after the overlay. `cassandra1`/`cassandra2` ready binaries cannot satisfy the new cache identity.
- Linux host policy: with an exact endpoint grant the srt settings carry `allowedDomains` = exactly the granted `127.0.0.1:<port>` entries, `strictAllowlist: true`, `allowUnixSockets: []`, `allowAllUnixSockets: false`, `allowLocalBinding: false`; nothing else is reachable from its network namespace. The Unix broker is not started on Linux. Without a ready srt (dependency missing, acquiring, failed) the command refuses with `sandbox-loopback-endpoint-backend-unavailable` even when the profile allows unconfined fallback; malformed grants keep their earlier named refusals. Windows keeps `sandbox-loopback-endpoint-exact-policy-unsupported`.
- Linux client mode: the host exports `ORCHESTRA_TCP_PROXY_CONNECT` (granted ports, `;`-separated). The Go Dialer validates them and srt's `HTTP_PROXY` (`http`, host `localhost`/`127.0.0.1`, numeric port, optional userinfo sent as `Proxy-Authorization: Basic`), then opens one HTTP `CONNECT 127.0.0.1:<port>` tunnel per driver connection. Headers are read byte by byte, so no tunneled byte is buffered; non-200 fails as `orchestra-cassandra-dialer:proxy-refused:<code>`, a malformed reply as `proxy-invalid-response`. The proxy, not the parser, enforces the grant. srt's `NO_PROXY` (which lists `127.0.0.1`) is deliberately ignored: direct loopback has no route in the namespace. Both env values present, or either malformed, fails as `invalid-routes`/`invalid-proxy` with no TCP fallback.
- Clients that stay refused on Linux: psql (libpq), SQLx and PGLS have no HTTP CONNECT or SOCKS support and dial raw TCP, which the namespace refuses (`Connection refused`). They remain `network-denied-by-profile` under a sandboxed profile; nothing fakes support for them. Any other client that speaks CONNECT to srt's proxy reaches exactly the granted ports, which is the owner's ruled capability.
- CI-only host setup: stock `ubuntu-latest` (24.04) restricts unprivileged user namespaces, which bubblewrap needs. The stock image also lacks `bwrap` and `socat` (probed). The hosted proof runs `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` and installs `bubblewrap`/`socat` inside its own test setup; no workflow or product code changes the host.
- Executed on GitHub Actions `ubuntu-latest` with a real `cassandra:5.0.5` container ([hosted proof](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38101100565), `test/tool-safety-srt-endpoint.hosted.ts`, 1 pass): before srt was installed the grant refused `sandbox-loopback-endpoint-backend-unavailable`; then `"$BACKEND_TOOLKIT_BIN/gocqlx-schemagen"` from `BackendToolkit.prepare`, wrapped by `ToolSafetySandbox.wrap` under srt 0.0.78/bubblewrap, generated `models/models.go` for `shop.carts`: 496 bytes, SHA-256 `6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4`, identical to the Darwin `cassandra2` result. In the same sandbox: CONNECT to the granted port `200 Connection Established`; CONNECT to another live host port `403 Forbidden` (that service accepted 0 connections); raw TCP to both `ECONNREFUSED`; psql `Connection refused`; the owned client named an undeclared port `undeclared-port`. Mutation: dropping the endpoint entries from `allowedDomains` turned this proof and the settings test [RED](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38101359710) (generation failed `orchestra-cassandra-dialer:proxy-refused:403`); restored code is the green run above.
- Unit/parser runs: [Core](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38100973838) Linux 20 pass/1 skip, Windows 9 pass/12 skip (fake-srt settings shape and no-fallback on Linux; Go parser and CONNECT tunnel tests on both; Unix broker roundtrip on Linux). [macOS](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38101132727) 6 pass: seatbelt TCP/bind denial and the `cassandra3` binary over real broker routes. [Orchestra](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38100970847) Linux/Windows 21 pass/1 skip each. Not measured: `cassandra3` against a real Cassandra on macOS (the Unix mode is byte-identical to `cassandra2`), and Linux hosts other than stock `ubuntu-latest` with the sysctl relaxed.
- Scylla runtime, executed 2026-10-11 on GitHub Actions `ubuntu-latest` ([hosted proof](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38102408496), same `test/tool-safety-srt-endpoint.hosted.ts`, 3 pass including the Cassandra proof): real single-node `scylladb/scylla:6.1.2` and `scylladb/scylla:2026.1.14` containers (`--smp 1 --memory 512M --overprovisioned 1 --developer-mode 1`, health-gated on a CQL `describe keyspaces`), the same `shop.carts` schema, the same toolkit path and srt allowlist as the Cassandra proof. Both generated `models/models.go` of 496 bytes with SHA-256 `6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4`, byte-identical to the Cassandra and Darwin results, so Scylla's `system_schema` differences need no generator change. Scylla registers `scylla_tables` in the standard catalog, so these runs take the driver's present-extension branch (the catalog-availability query finds the row and the original Scylla query runs) that Cassandra never reaches; the generation succeeding is the only evidence of that branch, nothing asserts it separately. Teeth: generating from a Scylla schema without the `quantity` column [failed RED](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38102638529) (hash `bce796b3...` against the pinned one, struct without `Quantity`); restored code is the green run. Still not measured: multi-node Scylla, Scylla versions other than these two tags, and the availability-query error branch.

## Previous owned build `cassandra2` — 2026-10-09

- The command-only Go overlay uses the pinned driver's public Dialer API and ordinary Unix `net.Conn`; the library/driver API remains unchanged. Its original generator SHA-256 is `614ecf03874e6ad19f6ba7878998cffc00e9bd85ddd6f3b03cd3d8ced22b15a7`; the `cassandra2` patched SHA-256 was `d6c16409427c85c28da69d2f86290ba9874db908ade094334571d150f5e3c50e`. The metadata/module/sum pins below remain current.
- `ORCHESTRA_TCP_PROXY_ROUTES` is a host-captured map to scoped Unix sockets. Routes accept only declared literal `127.0.0.1:<port>` endpoints. Present invalid maps, undeclared ports, LAN and IPv6 addresses fail without direct TCP fallback. With the map absent, normal Go TCP remains available to unconfined host probes; kernel sandbox policy still denies it.
- The host broker fixes upstream destinations before listening. The sandbox permits only its declared Unix socket paths and continues to deny raw TCP, UDP and bind. No C/DYLD interposer, descriptor emulation or clang acquisition remains. Exact endpoint enforcement was supported by the measured Darwin deployment; at `cassandra2` Linux/Windows returned named HOLD (Linux superseded by `cassandra3` above).
- Real Cassandra `5.0.5` generation through the actual sandbox produced `Carts` metadata/structs: 496 bytes, SHA-256 `6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4`. Schema, marker and cart count were unchanged. Final measured Darwin binary SHA-256 was `9400b5501dd2440976f30f06d4ec5b428f07750be4a721fade6cb8ff671be5c7`.
- Working unauthorized-endpoint controls received no additional fixture connections. Generic Node TCP returned `EPERM`; the mapped absent-cluster endpoint returned protocol-discovery `EOF`. Owned broker PIDs exited and socket directories disappeared after each scope. Evidence: `tcp-adapter-host-proof/evidence-pid.json` under the approved temp parent below. The owned Cassandra fixture was subsequently stopped; old PIDs are not live identities.
- Final Go-overlay [Actions](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37876482521) built the owned graph on Linux/Windows. Final published acquisition/provenance [Actions](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37975154451) passed on both; Linux additionally exercised Unix broker I/O, pre-canceled dial, read deadline, close and frozen addresses. Windows does not execute that Unix roundtrip. Scylla runtime is covered by the 2026-10-11 proof above. In-flight behavior was added afterwards (Actions [run](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38094310339), Linux and Windows green): on Linux, against a Unix server that accepts and then stalls, closing the connection from a canceled context releases a blocked `Read` and a blocked `Write` with `net.ErrClosed` and the peer observes EOF; moving the deadline wakes a blocked `Read` with a timeout; a write deadline against a peer that never reads expires with a timeout once the socket buffer is full; and a dial against a full Unix backlog (`EAGAIN`) is refused promptly without leaking descriptors. A Go connection cannot return `context.Canceled` from `Read`/`Write`, and the dial context must not bind the connection (the driver cancels it after dialing), so the driver abandons a blocked call by closing or moving the deadline, which the dialer passes straight through. The dialer needed no change. Windows keeps its named refusal and runs only the parser tests.
- Scenario `21` passed unchanged oracle with `openai/gpt-6-luna` in `2026-10-09-gpt6-luna-cassandra-typed`, evaluated source `6417e702b1`: native preflight observed no-grant `EPERM`/zero receipts, then granted `EOF`/one receipt before the model ran. The result reports `project-prerequisite-missing:cluster` in its typed blocker. Failed/interrupted earlier attempts remain separate; this is not a new full 21/21 campaign.

## Historical metadata-only prototype

Recorded: 2026-10-08. Implementation commits: `bcc40787ea` and `a4ba236ee7`, based on `705e24a015`. This records the owned build and measured evidence, not universal database conformance.

## Identity and provenance

- Host engine/cache identity: `3.0.4+orchestra.cassandra1`. It cannot reuse an original `3.0.4` ready binary.
- Upstream generator/library: `github.com/scylladb/gocqlx/v3 v3.0.4`; generator code is unchanged. Project version comparison remains library `3.0.4`; generated imports remain `github.com/scylladb/gocqlx/v3/table`.
- Driver: Scylla fork `github.com/scylladb/gocql v1.15.3`, revision `e35803084ebafd200e3f7fd74a5be5dfdb409b2d`, with the exact catalog-availability backport below. Both upstreams are Apache-2.0. Their licenses/source notices remain installed; `driver/ORCHESTRA-MODIFICATIONS.txt` identifies the modification and hashes.
- Host toolchain measured: private Go `1.25.14`, Darwin/amd64. Acquisition and real builds also pass the targeted Core tests on Linux and Windows.

The [upstream generator module](https://github.com/scylladb/gocqlx/blob/v3.0.4/go.mod) requires `github.com/gocql/gocql v1.7.0` but replaces it with the Scylla fork `v1.15.3`. Substituting upstream gocql `v1.7.0` was compile-incompatible: gocqlx requires fork APIs such as `Session.Batch`, request-timeout and host-ID methods. That substitution is not used. Build info for the owned overlay reports the original gocql requirement replaced by local `../driver (devel)`; the local source identity is verified Scylla `v1.15.3` plus the recorded patch, not upstream gocql `v1.7.0`.

## Byte pins

| Artifact/file | SHA-256 |
| --- | --- |
| [gocqlx v3.0.4 module ZIP](https://proxy.golang.org/github.com/scylladb/gocqlx/v3/@v/v3.0.4.zip) | `c2fab6884101f71422b97d84d7d052f1ddc0753444085e786035b3ace9bd6837` |
| [Scylla gocql v1.15.3 module ZIP](https://proxy.golang.org/github.com/scylladb/gocql/@v/v1.15.3.zip) | `87ee54949e9d85954570a663357c2311d5d4a05678802c7d186745f40dc4bfb1` |
| Original `metadata_scylla.go` | `f378e73b05f84f325cccea3e20291a7802406dede1c1ced1bd9477602b67db1a` |
| Patched `metadata_scylla.go` | `a9c4427039563b57c9b2597ceeb6aa603b50fb34c918823336aaca1b24d5d111` |
| Original generator `go.mod` | `88e0b9f90ed4a25ae3b4caf8ef44fd6b4d773b1ac6c18ea3b8d4adab3ada0954` |
| Private generator `go.mod`, local driver replacement | `813bf43cbf7732310489d0cc6dbe046e144af305952c1d2ab3eeeaa4734aac40` |
| Unchanged generator `go.sum` | `05120abdde922346d67397c8bf7b5aafa0a1e5291fa051d4567c2a0d7d4d6621` |
| Measured Darwin owned binary | `b09a4383d09a02d06cea964b5d185b14a8c07fe29807714dba186335679fc4c6` |
| Generated `models.go`, 496 bytes | `6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4` |

Checksum-database module sums, verified during the prototype investigation:

```text
gocqlx v3.0.4: h1:37rMVFEUlsGGNYB7OLR7991KwBYR2WA5TU7wtduClas=
gocql v1.15.3: h1:0vJT5pm7g5v8/pCs3tuXuRAfSRWvc1kib8J846Z+Z4g=
driver go.mod: h1:+rInt+HjERaMEYC4N8LocQQEAdREhYKU4QPkE00K5dA=
```

## Exact backport and installation boundary

The [original driver metadata path](https://github.com/scylladb/gocql/blob/e35803084ebafd200e3f7fd74a5be5dfdb409b2d/metadata_scylla.go#L844-L870) unconditionally queries `system_schema.scylla_tables` after standard table metadata. Cassandra lacks that extension. The verified prototype adds only this guard immediately before the original Scylla query:

```go
// Cassandra has the standard schema catalog but not Scylla's optional extension table.
iter = session.control.querySystem(`SELECT table_name FROM system_schema.tables WHERE keyspace_name = ? AND table_name = ?`, "system_schema", "scylla_tables")
var extensionTableName string
hasScyllaTables := iter.Scan(&extensionTableName)
if err := iter.Close(); err != nil {
    return nil, fmt.Errorf("error querying scylla table schema availability: %v", err)
}
if !hasScyllaTables {
    return tables, nil
}
```

Absent extension row returns standard metadata. Availability query/close errors fail; no catch-all `InvalidQuery` handling exists. When present, the original Scylla query and its remaining path are byte-identical. No database data or protocol is faked.

`BackendToolkitCassandra` uses the existing `PinnedArtifact` installer to verify the whole upstream ZIP before extracting a private `staging/driver`. Exact before/after file hashes authorize one patch application; empty, malformed, unknown or already patched source fails with a named typed HOLD. Generator module/sum hashes are checked before writes, and the replacement module hash is checked too. Only the staged generator `go.mod` points to `../driver`; the build uses `-mod=readonly`. Project `go.mod`, upstream `go.sum`, shared Go module caches and the original engine cache are not patched.

## Measured Cassandra result and controls

Owned acquisition used an isolated toolkit root and the production installer against live Apache Cassandra `5.0.5`, endpoint `127.0.0.1:49363`, PID `82966`, start identity `Thu Oct 8 18:21:49 2026`. Those are identities at measurement time, not a continuing liveness guarantee.

- `shop.carts` generation: exit `0`; last restored run measured `61 ms`. Generated `Carts` metadata: partition key `user_id`, clustering key `item_id`, columns `added_at`, `item_id`, `quantity`, `user_id`.
- Compiled generated struct types: `AddedAt time.Time`, `ItemId string`, `Quantity int32`, `UserId string`.
- Typed Go API/live-read probe: exit `0`, `896 ms`; checked `Carts.Metadata()`, driver `KeyspaceMetadata`, a cart read (zero rows) and the existing marker value `7f9a6649-2158-461b-97ee-6e5b5455dc4d`. This exercises the new Go graph/API, not a raw generated-text layout oracle.
- Original binary and a production build with the backport call omitted: exit `1`, `table scylla_tables does not exist`. Restoring the call returns generation to exit `0`.
- Missing keyspace: exit `1`, `keyspace does not exist`, empty output directory. Closed port `127.0.0.1:49604`: exit `1`, connection refused, empty output directory.
- Before/after schema, marker and cart row count were identical. Original binary SHA-256 stayed `c8e6a7220e347a2f5cbe884a45fe365929b5045c195ee769ec525884fc92a068`.

Evidence files remain private to the owned probe: `cassandra-owned-build-20261008/evidence.json` and `cassandra-owned-omission-20261008/evidence.json`, relative to the harness-approved temporary parent. Prototype evidence under that same parent: `cassandra-5.0.5-fixture-20261008/fixture.json` and `cassandra-5.0.5-fixture-20261008/catalog-guard-v1.15.3-variant/sourcepatch.diff` (patch SHA-256 `871247d7d94b001ae94510d9cb6d00357d1b2867e02e0f39c9f459d45f621d78`).

[Core Actions](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37849527624): Linux 13 passed; Windows 9 passed, 4 POSIX-only skips. The real acquisition test runs on both. [Source-pin removal](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37849115288) and [backport-call removal](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37849300611) each made their targeted test red; both were restored. Core package `bun typecheck` passed. These are scoped checks, not a full case-21 benchmark or proxy proof.

## Scylla source evidence and unverified runtime

Scylla `6.1.2`, revision `b60f9ef4c22383e04057858a0d09d60caee03acd`, source establishes that its extension appears in the standard catalog:

- [`db/schema_tables.cc`](https://github.com/scylladb/scylladb/blob/b60f9ef4c22383e04057858a0d09d60caee03acd/db/schema_tables.cc): lines 344–354 define `scylla_tables`; 3472–3482 register it in `all_tables`; 219–238 save the schema keyspace; 2112–2118 write table schema; 2620–2624 write the `keyspace_name`/`table_name` catalog row. Verified file SHA-256: `34f60e3cbacd2ef42350696e7ffb1893f8606afea2227bb5b1829526d9ab9e37`.
- [`db/system_keyspace.cc`](https://github.com/scylladb/scylladb/blob/b60f9ef4c22383e04057858a0d09d60caee03acd/db/system_keyspace.cc): lines 2239–2242 and 2287–2293 install registered system tables. Verified file SHA-256: `683b9139ea5fcc22446a46688b94721724f1163fb26cf4fe54f8280bd2424a5c`.

Scylla runtime was **not measured** at this point in the record; the present-extension branch was later executed against real Scylla 6.1.2 and 2026.1.14 (see the Scylla runtime bullet at the top). Availability-query/close-error runtime injection was **not performed**; source and hash tests preserve the strict error branch. The missing-keyspace control exercises an earlier metadata failure, not that branch. Cassandra `4.1.8` was source-inspected, not launched; it is not a runtime claim.
