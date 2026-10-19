# Lane C, host · issues and the fixes the briefs assume

Briefs C02a, C02b, C02c, C04a and C04b (the Orchestra side of D32, D33 and D35). D32, D33 and D35 can all be built as
written. These items record a choice the decisions leave open, or an assumption the code cannot prove yet. Each
brief is written with the fix already in it.

## 1. The D35 schemas live in a new file, `groups/atlas-review.ts` (C02a, C04b)

- `groups/atlas.ts` is 481 lines (454 non-blank) today. The eight review endpoints plus the D35 shapes add about 240
  lines, and C04b adds about 30 more. That leaves the file near 750 lines, the godfile hard limit, which
  `script/godfile.ts` counts in non-blank lines.
- Fix: the D35 shapes go in `groups/atlas-review.ts`. `groups/atlas.ts` keeps the paths, the endpoints, and the three
  unions that need `AtlasEmpty` and `VerdictFields`: `AtlasReviewResult`, `AtlasReviewWriteResult` and
  `AtlasDelegateResult`.
  - `atlas-review.ts` imports nothing from `atlas.ts`. If the two files imported each other, `AtlasEmpty` would not be
    defined yet when `atlas-review.ts` loaded.
  - After C04b, `atlas.ts` should be about 640 lines.
- The input schemas get no `identifier`, the same as the existing `AtlasPromoteInput` and the other inputs. That keeps
  the SDK's optional fields plain (`token?: string`). The output shapes are annotated with their D35 names.
  `public.ts:103-104` keeps the `null`s of every component whose name starts with `Atlas`.

## 2. The structured reply is assumed to arrive as text-delta JSON (C04a)

- No production code calls `LLM.stream` with `responseSchema` today. `git grep responseSchema apps/orchestra/src`
  finds only `session/llm*` and continuity bookkeeping.
- On the AI SDK path, `llm.ts:387` sets `output: Output.object({ schema })`. The provider then streams the JSON object as
  text, and it reaches the stream as `LLMEvent` text deltas. The native runtime takes a response schema only for
  `@ai-sdk/openai` (`native-runtime.ts:76`) and sends it as `responseFormat: json`. Every other provider falls back to
  the AI SDK path.
- C04a joins the text deltas, then decodes them with `Schema.fromJsonString({ answer, why })`. A reply that does not
  decode becomes that question's `rejected` row, and nothing is written.
- The unit test replaces `LLM.Service` with a stub. This is the same approach as
  `test/session/atlas-resume-compaction.test.ts`. So the test proves the parsing and the writing, but not a real
  provider's reply. Lead check before R11 is closed: make one live `POST /atlas/delegate` call in the dev app against
  the model the screen offers.

## 3. Delegation details D33 leaves open (C04a)

- **Ids not in the current batch:** they answer `ok: false` with `rejected: "not an open question in the current
  interview batch"`, and no model call is made for them.
- **A failure on one question** stays in that question's row: an unknown model, a provider or stream error, an
  unreadable or empty reply, or the surface refusing the draft. Only `AtlasSurface.Unavailable` from `review()` fails the
  whole request, as `503` through the handler's `unavailable` mapping.
- **Order:** questions run one at a time (`Effect.forEach`, sequential). Each run appends to `review.jsonl`.
- **Model:** the call uses the requested `providerID`/`modelID` through `provider.getModel`, with normal options. It
  does not use `small: true` or `getSmallModel` as `project-copy.ts` does, because the person picked the model.
- **Writes:** the answer and the `why` are trimmed before they are written. `drafted.model` is `"<providerID>/<modelID>"`.
- **Services:** `delegate(services, input)` receives the services as an argument. The handler passes the `atlas`,
  `llm` and `provider` it already yields, so the test needs no Layer graph. The handler group now yields `LLM.Service`
  and `Provider.Service`. `server.ts` already provides both to every handler group through the app layer, as it does
  for `projectCopyHandlers`.

## 4. The C02c store test depends on C01 reading the fixture's staging (C02c)

- The new test holds `k1`. The fixture writes `k1` to `.atlas/projection.json` and `.atlas/staging.json`, the same
  files the existing snapshot test writes. The CLI's staged check is `stagedNodeKeys` (`review-store.ts:18`), a
  read-only `commitStaging`.
- If C01's surface `hold` uses that same check, `k1` is staged and the hold succeeds. If C01 checks staging some other
  way that refuses an untracked sidecar, the `ok: true` assertions fail. In that case, fix C01 to use
  `stagedNodeKeys`, as D31 requires ("the same checks"); do not weaken the test.

## 5. The territory's `projectId` is filled by the host (C02a, C02b; from `issues/c-engine.md` item 2)

- The host's `AtlasTerritoryInput` schema has no `projectId`. `AtlasSurface.territory` takes
  `Omit<AtlasTerritoryInput, "projectId">` and passes `projectId: ctx.project.id` from `InstanceState.context`. That is
  the same instance project `maestro/atlas-memory.ts` binds (`instance.project.id`).
- No host test declares a territory over a store, because the write needs `ATLAS_RATIFY_TOKEN` (D22). The C02c
  empty-route call covers decoding. C01e's tests cover the first-catalog path.
- I checked the C01d, C01e and C01f types against these briefs. `AtlasReviewResult`, `AtlasReviewWriteResult`,
  `AtlasInterviewQuestion`, the seven inputs and `AtlasPromoteInput.nodeKeys` match. Every surface field is `readonly`,
  so the handlers pass `ctx.payload` unchanged.
- `AtlasPromote` gains optional `held` and `unknown` (C01f). C02a mirrors both into the host `AtlasPromoteResult`.
- C01d's `AtlasDelegateInput` and `AtlasDelegateOut` stay unused by the host. C04a keeps its own local `Input`,
  `Drafted` and `Result` types, which have the same shapes.
