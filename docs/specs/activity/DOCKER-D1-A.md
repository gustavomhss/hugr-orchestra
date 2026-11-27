# Docker container inventory contract

D1-A freezes the signatures and unavailable stubs for the next activity wave. The
[Docker plan](https://github.com/gustavomhss/hugr-orchestra/blob/0168657720c392bad22424f8f6a3f4c4d7cc32aa/docs/specs/activity/DOCKER-WAVE.md)
defines the collector, acceptance IDs, and implementation order. This seam depends on
the read-only Monitor integration at `a012a7b845d0fb80044b6be22356a0f645cef578`.

## Canonical anchors

| Layer | Signature |
| --- | --- |
| Schema | `ActivityMonitor.DockerSnapshot` has `instanceID`, `snapshotRevision`, `readAt`, `source`, `coverage: "containers"`, optional `inventory`, and optional `attempt`. `DockerRevision` is a canonical decimal string. Revision `"0"` has neither inventory nor attempt. Every positive revision requires an attempt. |
| Schema | `DockerInventory` has `sampledAt` and up to 1,000 `containers`. Each `DockerContainer` has `containerID`, optional `name` and `sizeText`, `owner: ""`, `logical: null`, `unique: "não colapsei"` and `useProof: "unproved"`. |
| Schema | `DockerAttempt` has `startedAt`, `sampledAt`, `state` and `gaps`. States are `complete`, `partial`, `failed` and `unavailable`. A complete attempt requires an inventory and an empty gap list. The collector commits matching inventory and attempt timestamps in the same update. |
| Protocol | `activity.docker` is `GET /api/activity/docker`. `activity.readDocker` is `POST /api/activity/docker/read`. Both return `DockerSnapshot` on success and use the existing Activity API authorization. POST declares `ServiceUnavailableError` for collector unavailability at the service boundary. |
| Core | `ActivityDocker.make(): Monitor` creates one monitor. `snapshot(): DockerSnapshot` reads it synchronously. `read(): Effect.Effect<DockerSnapshot, ReadUnavailable, AppProcess.Service>` is the explicit reading seam. |
| Promise and Effect Client | Both variants generate `activity.docker` and `activity.readDocker` with a bodyless, parameterless operation. Promise accepts optional request options. The Effect methods take no arguments. |

The Core stub assigns an instance ID and returns revision `"0"` with no inventory
or attempt. The HTTP stub returns that cached shape on GET and the typed 503
`ServiceUnavailableError` on POST. The Core read stub fails with
`DockerReadUnavailable`. D2-B connects the POST to the collector and maps that
service-boundary error to 503. Once implemented, a missing executable or daemon
failure during an observation becomes an attempt in the snapshot, retaining any
complete inventory. Before connecting POST to the real runner, D2-B updates
the HTTP and exerciser fixtures to provide a bounded test collector. Both the
effect scenario and its authenticated probe use that fixture so the gates run
without a Docker daemon. A complete empty reading has an explicit inventory with
`containers: []`.

## Acceptance and implementation handoff

- **Axioms.** The producer is individual containers only. The command is
  `docker container ls --all --no-trunc --size --format json` via
  `AppProcess.Service.run`, with a 5,000 ms deadline, 262,144 stdout bytes and
  16,384 stderr bytes. `Size` is labelled text from the producer.
  [Docker CLI reference](https://docs.docker.com/reference/cli/docker/container/ls/)
- **DoD.** Freeze the signatures above, compile the Core and Server stubs, and
  regenerate both Client variants. Run the seam test and package typecheck on
  GitHub Actions. Give independent review the exact candidate diff.
- **Completeness criteria.** Distinguish the absent inventory, a complete empty
  inventory, a retained inventory and an unsuccessful attempt. The seam test
  checks those shapes, exact decimal revision, raw size text, authentication and
  the unavailable stub. A02–A04, A172–A174 and A219 still require the collector
  acceptance tests against the approved seam.
- **Invariants.** GET reads cached state only. POST takes no caller argv, body,
  context or path. Neither stub calls a process. A sample changes revision only
  when an attempt commits. Failed, partial and unavailable attempts retain any
  complete inventory and its timestamp.
- **Success criteria.** The generated read methods reach the authenticated Activity
  endpoints. A stub read cannot publish an empty success. A valid complete empty
  reading encodes distinctly from unread. The D1-B oracles will cover capped runs,
  failure precedence, JSON validation, singleflight and retention.
- **Quality standards.** Keep Schema and Protocol independent of Core and Server.
  Generate the Client from `packages/client`. Review the generated diff as a
  separate unit. Use hosted tests and typechecking, keeping collector and page
  changes in their own acceptance and implementation phases.
