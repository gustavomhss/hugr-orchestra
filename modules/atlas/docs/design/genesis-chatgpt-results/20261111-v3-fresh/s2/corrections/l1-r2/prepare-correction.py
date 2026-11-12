from pathlib import Path
import base64, hashlib, json, re, shutil, difflib

BASE = Path("/workspace/scratch/7b5d6430f420/genesis-s2")
OUT = BASE / "corrections/l1-r2"
PIN = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
EXECUTION = "46d09d97-39a9-482a-a290-646ba1d94c99"
def sha(b):
    return hashlib.sha256(b).hexdigest()
def gitsha(b):
    return hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()
def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")

# Record originals without mutating any original, source, coverage or evidence.
preserved = []
for unit in ["app-session", "design-tui", "desktop-web"]:
    for name in ["l1.md", "coverage.json", "sources.json", "decisive-evidence.md"]:
        path = BASE / "deliverable/layers/l1" / unit / name
        body = path.read_bytes()
        preserved.append({"path":str(path), "bytes":len(body), "sha256":sha(body)})
write(OUT / "preserved-originals.json", json.dumps(preserved, indent=2) + "\n")

app_path = BASE / "deliverable/layers/l1/app-session/l1.md"
tui_path = BASE / "deliverable/layers/l1/design-tui/l1.md"
app_original = app_path.read_text()
tui_original = tui_path.read_text()
app = app_original
app = app.replace("**232 inspected**, **1,625 family-supported**, and **30 metadata-only**",
                  "**234 inspected**, **1,623 family-supported**, and **30 metadata-only**", 1)
app = app.replace("There are **251 successful source captures**: 236 in the assigned population and 15 boundary sources. Python verified their exact decoded byte lengths, SHA-256 and Git blob SHA-1; the 236 assigned captures also match the frozen tree.",
                  "There are **255 successful source captures**: 238 in the assigned population and 17 boundary sources. Python verified their exact decoded byte lengths, SHA-256 and Git blob SHA-1; the 238 assigned captures also match the frozen tree.", 1)
app_note = " The bounded L1 correction adds direct reads of skills-data and skills-dialog plus two skill API boundary sources; its new evidence and original connector responses are recorded in `decisive-delta.md` and `sources-delta.json`. Previously captured files are not counted twice."
anchor = "Correct implementation paths support the critical claims (`sources.json`, `binary-inspection.json`)."
assert anchor in app
app = app.replace(anchor, anchor + app_note, 1)
skills_section = """## Skills catalog, editing and ownership

The catalog boundary is `readSkills(value: unknown)`, called on the list response's `.data`, before visibility filtering, sorting or cache writes. It accepts an array, including an empty array, whose entries have the following declared shape; a response envelope or JSON string is not that array. Required strings have no local nonempty, uniqueness or path-safety refinement. The decoder uses `Schema.decodeUnknownOption` over the entire array and `Option.getOrThrowWith`: malformed input fails the load with `Error("Skills response is malformed")`, rather than becoming an empty catalog or silently retaining only valid entries. (`A/src/orchestra/chapters/skills-data.ts:3–28`; `A/src/orchestra/chapters/skills.tsx:77–87`.)

| Entry field | Admissible declared value |
|---|---|
| `name` | Required string. |
| `location` | Required string; the file path is used for access, editing and saved-file matching. |
| `content` | Required string containing the instructions shown in the dialog. |
| `description` | Optional string or null. |
| `mtime` | Optional number or null. |
| `internal` | Optional boolean or null; only the value `true` excludes an entry as internal. |

Visibility and editability are separate decisions. `listedSkills` normalizes backslashes, collects every input location ending in `/SKILL.md` as a folder prefix, then excludes internal entries and any other location below one of those folders. The folder set is built before internal filtering, so an internal parent's folder still participates in hiding descendants. This implements a catalog view of skill trees; it does not delete entries or prove that a hidden node cannot be loaded through its parent. Search trims and lowercases the query and matches name, description or location. Sorting places project, global and builtin sources in that order, using `name.localeCompare` within a source. Neither the decoder nor these helpers establishes unique names. (`A/src/orchestra/chapters/skills-data.ts:30–49,58–72,83–89`.)

Ownership is derived from `location` and the current directory, not the display name. A literal `/builtin/` prefix gives source/access `builtin`. Otherwise, normalized locations beginning with the normalized directory plus its trailing slash are `project`; the rest are `global` and read-only. For project files, access is `governed` first when the relative path begins `.orchestra/skills/own/`. Remaining project files are editable only when they end in lowercase `.md` and lie under `.orchestra/skills/`, `.orchestra/skill/`, `.claude/skills/` or `.agents/skills/`; all others are `fixed`. These are lexical UI rules: slash normalization does not resolve symlinks, dot segments or filesystem authority, and the helper's comment about mirroring the server is not independent proof of filesystem enforcement. (`A/src/orchestra/chapters/skills-data.ts:51–81,98–99`.)

The page's cache identity is server scope plus a NUL separator plus `pathKey(directory)`; a warm list paints immediately while a new list is requested with `location: { directory }`. Only successful decode/filter/sort writes the cache. Refresh treats an error's object `cause.status` of 404, 405 or 501 as `unavailable`; other failures, including the decoder error, become `error`. Both states expose Retry and differ from a successful empty list. The load carries the page's abort signal and ignores results after cleanup. Catalog rows retain `skill.location`, and the dialog receives the computed access class; source names and project labels are presentation. (`A/src/orchestra/chapters/skills.tsx:29–55,69–97,136–137,175–187,208–210`.)

The client edit shape is `SkillSaveInput { name: string; description: string; content: string; path?: string; mtime?: number }`. Adding supplies no existing path/mtime. Editing supplies `skill.location` as path and `skill.mtime ?? undefined`; name/description are browser-required fields, while instructions are submitted as content. The normal dialog enables editing only for add or access `edit`, exposes removal only for an editable existing entry, blocks repeated submissions while busy and discards late UI results after disposal. The page calls `sdk().orchestra.skills.save({ location: { directory }, ...input })` or `remove({ location: { directory }, path: skill.location })`. On success it closes only the same dialog instance and reloads; save retains the returned location as pending and shows a notice if the refreshed list does not contain it. Write calls here receive no page abort signal, so cleanup suppressing later UI updates does not prove cancellation of an already sent write. (`A/src/orchestra/chapters/skills-dialog.tsx:5–26,34–57,134–175`; `A/src/orchestra/chapters/skills.tsx:48–55,100–125,219–238`.)

The pinned API declares `GET /api/skill` for listing, `PUT /api/skill` with `Skill.SaveInput`, and `DELETE /api/skill` with location query plus path. Its save description reserves new files for project `.orchestra/skills`, permits rewriting a registered project file, treats global/builtin/Atlas-governed files as read-only and says frontmatter is reserialized as YAML. The inspected handler delegates to `SkillV2` with the server Location directory, mapping input path to service location and forwarding mtime; conflict write errors become `ConflictError`, other write errors become `InvalidRequestError`. This confirms the API/service boundary, not the uninspected filesystem implementation or a successful write. The page turns unsupported-write statuses into its unavailable message, avoids displaying an undeclared `ClientError` message, and otherwise uses a string `message` or its fallback. No product, decoder or write test was executed in this correction. (`packages/protocol/src/groups/skill.ts:8–56`; `packages/server/src/handlers/skill.ts:10–46`; `A/src/orchestra/chapters/skills-data.ts:92–96`; `A/src/orchestra/chapters/skills.tsx:128–132`.)

"""
assert "## Skills catalog, editing and ownership" not in app
app = app.replace("## Assets, localization and verification evidence\n", skills_section + "## Assets, localization and verification evidence\n", 1)

tui = tui_original
tui = tui.replace("`sources.json` records 196 complete source captures, including 11 necessary boundary reads, totaling 2,350,789 bytes.",
                  "`sources.json` records 198 complete source captures, including 13 necessary boundary reads, totaling 2,385,890 bytes.", 1)
tui_note = " The bounded L1 correction adds the session and permission protocol bodies as boundary evidence; `sources-delta.json` records those two new captures and the repeated/reused adapter evidence without double counting, and `decisive-delta.md` preserves exact excerpts."
tui_anchor = "`decisive-evidence.md` supplies bounded verbatim witnesses."
assert tui_anchor in tui
tui = tui.replace(tui_anchor, tui_anchor + tui_note, 1)
old_paragraph = """`DataProvider` is a separate normalized cache, with location keys serialized from directory and workspace ID. Initial refreshes use `Promise.allSettled` and log failures. Catalog loading maps provider/model/agent/config endpoints into terminal choices, filters disabled providers and retains stable agent IDs separately from display names. `createSessionActions` switches agent then model; prompt optionally admits editor context through synthetic input with `resume:false`, then posts prompt/files/agent source spans. Revert stages files; unrevert clears staging. Read tests assert actual adapter request paths and order. (`packages/tui/src/context/data.tsx:35–52,243–256`; `packages/tui/src/context/catalog.ts:24–80,174–215`; `packages/tui/src/context/session-actions.ts:7–92`; `packages/tui/test/context/session-actions.test.ts:88–125`.)
"""
new_paragraph = """`DataProvider` is a separate normalized cache, with location keys serialized from directory and workspace ID. Initial refreshes use `Promise.allSettled` and log failures. Catalog loading maps provider/model/agent/config endpoints into terminal choices, filters disabled providers and retains stable agent IDs separately from display names. (`packages/tui/src/context/data.tsx:35–52,243–256`; `packages/tui/src/context/catalog.ts:24–80,174–215`.)

## V2 session action boundary

`createSessionActions(client)` is a narrow adapter over the supplied `Orchestra.make` client. It exposes create, prompt, interrupt, compact, shell, permission reply, revert, unrevert and command. Its comment explicitly targets V2 `/api/session/:id/*` and records that legacy `/session/:id/*` abort/shell/command/summarize/revert/unrevert routes are not served by the V2 server. Compatibility here translates caller inputs and action names into V2 methods; the function has no legacy-route fallback. The table states the requests selected by this adapter, corroborated by pinned protocol declarations and unexecuted request assertions, not by a live server exercise. Every route below uses POST. (`packages/tui/src/context/session-actions.ts:4–82`; `packages/tui/test/context/session-actions.test.ts:5–27,30–149`.)

| Adapter operation | V2 path | Payload and specific boundary |
|---|---|---|
| `create` | `/api/session` | Sends agent and model; translates model `modelID` to `id`, preserving providerID and optional variant. Sends `location: { directory, workspaceID }` only when directory is truthy; workspaceID alone is therefore not forwarded. The source comment assigns omitted-directory placement to the server's working directory. |
| Selection before `prompt` or `command` | `/api/session/:sessionID/agent`, then `/api/session/:sessionID/model` | Awaits `{ agent }`, then `{ model: { providerID, id, variant } }`. Selection is session state, rather than agent/model fields embedded in the final prompt or command. |
| `prompt` | Optional `/api/session/:sessionID/synthetic`, then `/api/session/:sessionID/prompt` | After selection, a truthy context sends `{ text: context, resume: false }` and is awaited; absent/empty context skips it. The final payload is `{ prompt: { text, files, agents } }`. The protocol success is an admitted input, not completed model execution. |
| `command` | `/api/session/:sessionID/command` | After selection, sends command, arguments and mapped files. The adapter requires an arguments string and files array; it has no agents/context field. The protocol describes rendering a configured command or MCP prompt and admitting the result. |
| `interrupt` | `/api/session/:sessionID/interrupt` | No body from this adapter. The protocol describes interruption of execution owned by the current process and an idle no-op. |
| `compact` | `/api/session/:sessionID/compact` | No model/body from this adapter; its comment uses the session's own model. Protocol result is `{ data: { compacted: boolean } }`; the description permits false when nothing needed summarizing and refuses a running session as busy. |
| `shell` | `/api/session/:sessionID/shell` | Sends `{ command }`, with no agent/model. The protocol requires a nonempty command and describes recording command/output in the session's location for the next turn without starting a turn. |
| `reply` | `/api/session/:sessionID/permission/:requestID/reply` | Carries both identities and a reply of `once`, `always` or `reject`; the wrapper does not expose the protocol's optional message field. |
| `revert` | `/api/session/:sessionID/revert/stage` | Sends `{ messageID, files: true }`; it stages or moves a reversible boundary with file changes. It does not call the separately declared revert commit route. |
| `unrevert` | `/api/session/:sessionID/revert/clear` | Clears the staged revert with no body. |

The route/payload witnesses are `packages/tui/src/context/session-actions.ts:10–79`; `packages/protocol/src/groups/session.ts:157–165,301–394,431–443,464–479,550–582,655–665`; `packages/protocol/src/groups/permission.ts:119–134`; and `packages/tui/test/context/session-actions.test.ts:30–149`. Protocol descriptions in the table are declared semantics; their presence does not establish runtime success.

The adapter's `Model` shape is `{ providerID: string; modelID: string; variant?: string }`. Prompt callers must supply text, agent, model, files and agents arrays, using empty arrays when there are none. A file's legacy-facing `url`/`filename` become `uri`/`name`; only its optional `source.text` span is copied as start/end/text, with `value` renamed to `text`. Other legacy file-source fields are not forwarded. Agent mentions preserve name and map their optional source start/end/value to start/end/text. Thus editor context is a separate non-resuming synthetic request, while mention source spans remain in the final prompt. Session actions use sessionID, and permission replies additionally require requestID; directory/workspace placement is accepted only by create in this wrapper. (`packages/tui/src/context/session-actions.ts:4–5,19–53,60–79,84–92`; `packages/tui/test/context/session-actions.test.ts:65–85,88–125,127–149`.)

The awaits establish order within one call, not an atomic transaction or a lock across callers. The adapter supplies no catch/rollback, cancellation option or retry loop: a failed selection or synthetic request stops later steps, and an earlier successful step is not undone here. Prompt/command expose none of the protocol's optional id, delivery or resume controls, and synthetic is sent without an explicit id; this boundary therefore does not establish stable-ID retry reconciliation after an ambiguous failure. Returned client promises/results are passed through. The test recorder uses the real client and a replaced transport to assert paths, bodies, context/no-context branches and order, but those tests were only read; they do not establish a passing run, server execution, authorization or filesystem reversal. (`packages/tui/src/context/session-actions.ts:9–92`; `packages/protocol/src/groups/session.ts:333–367,464–472`; `packages/tui/test/context/session-actions.test.ts:5–27,30–149`.)

## Terminal interaction and supporting contracts
"""
assert old_paragraph in tui
tui = tui.replace(old_paragraph, new_paragraph, 1)

write(OUT / "app-session/l1.md", app)
write(OUT / "design-tui/l1.md", tui)
for unit, original, revised in [("app-session", app_original, app), ("design-tui", tui_original, tui)]:
    diff = "".join(difflib.unified_diff(original.splitlines(keepends=True), revised.splitlines(keepends=True),
                                      fromfile=f"original/{unit}/l1.md", tofile=f"correction/{unit}/l1.md"))
    write(OUT / f"{unit}/l1.diff", diff)

# Complete source delta, keeping per-unit incorporation explicit.
unit_map = {
 "packages/app-shell/src/orchestra/chapters/skills-data.ts": ["app-session"],
 "packages/app-shell/src/orchestra/chapters/skills-dialog.tsx": ["app-session"],
 "packages/app-shell/src/orchestra/chapters/skills.tsx": ["app-session"],
 "packages/protocol/src/groups/skill.ts": ["app-session"],
 "packages/server/src/handlers/skill.ts": ["app-session"],
 "packages/tui/src/context/session-actions.ts": ["design-tui"],
 "packages/tui/test/context/session-actions.test.ts": ["design-tui"],
 "packages/protocol/src/groups/session.ts": ["design-tui"],
 "packages/protocol/src/groups/permission.ts": ["design-tui"],
}
original_indexes = {}
coverage_by_unit = {}
for unit in ["app-session", "design-tui"]:
    d = json.loads((BASE / "deliverable/layers/l1" / unit / "sources.json").read_text())
    original_indexes[unit] = {x["path"]:x for v in d.values() if isinstance(v,list)
                              for x in v if isinstance(x,dict) and "git_blob_sha" in x}
    c = json.loads((BASE / "deliverable/layers/l1" / unit / "coverage.json").read_text())
    coverage_by_unit[unit] = {x["path"]:x for x in c["entries"]}
captures = []
for path, units in unit_map.items():
    reused = path.endswith("/test/context/session-actions.test.ts")
    raw_name = ("reused-" if reused else "") + path.replace("/", "__") + ".json"
    raw = OUT / "original-responses" / raw_name
    r = json.loads(raw.read_text())
    assert r.get("isError") is False
    s = r["structuredContent"]
    body = base64.b64decode(s["content"]) if s["encoding"] == "base64" else s["content"].encode()
    assert f"/blob/{PIN}/" in s["display_url"]
    assert gitsha(body) == s["sha"]
    target = OUT / "sources" / path
    assert target.read_bytes() == body
    incorporation = []
    for unit in units:
        old = original_indexes[unit].get(path)
        if old:
            assert old["sha256"] == sha(body) and old["git_blob_sha"] == gitsha(body) and old["byte_length"] == len(body)
        cov = coverage_by_unit[unit].get(path)
        if cov:
            assert cov["sha"] == gitsha(body) and cov["size"] == len(body)
        incorporation.append({
            "unit":unit,
            "source_index_action":"retain-existing-capture-no-double-count" if old else "add-unique-capture",
            "assigned_population_member":cov is not None,
            "coverage_action":"promote-existing-entry-to-inspected" if cov and not old else
                              "preserve-existing-inspected-entry" if cov else "boundary-source-no-assigned-path-added",
            "previous_evidence_depth": (cov.get("evidence_depth",cov.get("evidence-depth")) if cov else None)
        })
    item = {"path":path,"bytes":len(body),"byte_length":len(body),"sha256":sha(body),
            "git_blob_sha":s["sha"],"computed_git_blob_sha":gitsha(body),"git_blob_verified":True,
            "pin":PIN,"commit":PIN,
            "local_capture_file":target.relative_to(OUT).as_posix(),
            "connector_response_file":raw.relative_to(OUT).as_posix(),
            "connector_response_bytes":raw.stat().st_size,
            "connector_response_sha256":sha(raw.read_bytes()),
            "connector_request":{"tool":"github_fetch_file","repository_full_name":"gustavomhss/hugr-orchestra",
                                 "ref":PIN,"path":path,"encoding":s["encoding"]},
            "acquisition":"reused exact producer capture; response/source/SHA256/Git blob reverified" if reused else
                          "fresh GitHub connector fetch_file; explicit pin and base64",
            "line_count":len(body.decode().splitlines()),
            "incorporation":incorporation}
    if reused:
        item["reused_response_original"] = str(BASE / "producers/design-tui/captures/packages__tui__test__context__session-actions.test.ts.json")
        item["reused_source_original"] = str(BASE / "producers/design-tui/sources" / path)
    captures.append(item)

directory_responses = []
for file in sorted((OUT/"original-responses").glob("directory-*.json")):
    body=file.read_bytes()
    directory_responses.append({"file":file.relative_to(OUT).as_posix(),"bytes":len(body),"sha256":sha(body),
                                "role":"exact pinned path discovery; not a source-file capture or a new assigned path"})
manifest = {
 "schema":"genesis-s2-l1-correction-sources/v1","execution_id":EXECUTION,
 "repository":"gustavomhss/hugr-orchestra","pin":PIN,
 "status":"producer-correction; semantic judgment pending",
 "captures":captures,"directory_responses":directory_responses,
 "per_unit_reconciliation":{
  "app-session":{"original_captures":251,"unique_added_captures":4,"revised_captures":255,
                 "assigned_source_captures":238,"boundary_source_captures":17,
                 "assigned_paths":1887,"inspected":234,"family_supported":1623,"metadata_only":30,
                 "new_unique_paths":[p for p,us in unit_map.items() if "app-session" in us and p not in original_indexes["app-session"]],
                 "additional_unique_source_bytes":15578},
  "design-tui":{"original_captures":196,"unique_added_captures":2,"revised_captures":198,
                "assigned_source_captures":185,"boundary_source_captures":13,
                "assigned_paths":2087,"inspected":185,"family_supported":1889,"metadata_only":13,
                "new_unique_paths":[p for p,us in unit_map.items() if "design-tui" in us and p not in original_indexes["design-tui"]],
                "additional_unique_source_bytes":35101,"revised_unique_source_bytes":2385890}
 },
 "scope_note":"The principal incorporates this delta. Original coverage/sources/decisive-evidence and L1 bodies were read-only; no canonical original was edited by this producer."
}
write(OUT/"sources-delta.json",json.dumps(manifest,indent=2)+"\n")

# Exact excerpts: constructed from verified source bytes, no reconstructed quotations.
excerpts = [
 ("skills-decoder", "packages/app-shell/src/orchestra/chapters/skills-data.ts", [(3,28)],
  "Array contract, field optionality/nullability and whole-load decoder failure."),
 ("skills-visibility", "packages/app-shell/src/orchestra/chapters/skills-data.ts", [(30,49)],
  "Internal/tree-node visibility and construction of the prefix set before filtering."),
 ("skills-access", "packages/app-shell/src/orchestra/chapters/skills-data.ts", [(51,99)],
  "Source/access classes, allowed roots, governed priority, lexical normalization, search/order and error-message extraction."),
 ("skills-page-identity", "packages/app-shell/src/orchestra/chapters/skills.tsx", [(29,55),(69,97)],
  "Server/directory cache identity, same-dialog close guard, decode pipeline and unavailable/error distinction."),
 ("skills-page-writes", "packages/app-shell/src/orchestra/chapters/skills.tsx", [(100,137),(175,187),(208,210),(219,238)],
  "Save/remove payload boundary, pending path, failure display, cleanup, retry and access handoff."),
 ("skills-dialog", "packages/app-shell/src/orchestra/chapters/skills-dialog.tsx", [(5,26),(34,57),(134,175)],
  "Client write shape, path/mtime identity, busy/lifetime handling and editable/removal affordances."),
 ("skills-protocol", "packages/protocol/src/groups/skill.ts", [(8,56)],
  "Declared list/save/remove API and documented write ownership; not proof of filesystem enforcement."),
 ("skills-handler", "packages/server/src/handlers/skill.ts", [(10,46)],
  "Location-scoped service delegation and conflict/invalid-request mapping."),
 ("tui-adapter", "packages/tui/src/context/session-actions.ts", [(4,92)],
  "Complete adapter contract and mapping; no execution, transaction, fallback or retry proof."),
 ("tui-session-protocol-create-select-admit", "packages/protocol/src/groups/session.ts", [(157,165),(301,394)],
  "Exact create, selection, prompt, command and compact route contracts with declared semantics."),
 ("tui-session-protocol-other-actions", "packages/protocol/src/groups/session.ts", [(431,443),(464,479),(550,582),(655,665)],
  "Exact shell/synthetic/stage/clear/commit/interrupt declarations; adapter exposes no commit action."),
 ("tui-permission-protocol", "packages/protocol/src/groups/permission.ts", [(119,134)],
  "Both IDs, reply payload, optional message and declared missing-session/request errors."),
 ("tui-request-assertions", "packages/tui/test/context/session-actions.test.ts", [(5,27),(30,62),(65,85),(88,149)],
  "Real-client/replaced-transport assertions for paths, bodies and order; read only, never run.")
]
evidence = [
 "# Decisive delta — S2 L1 correction",
 "",
 f"Execution: `{EXECUTION}`. Source pin: `{PIN}`. Scope: app-session catalog/editor boundary and design-tui session-action boundary.",
 "",
 "These are exact bounded excerpts from the verified captures listed in `sources-delta.json`. Existing `decisive-evidence.md` files remain untouched. Protocol descriptions are declared semantics; comments are source assertions; a test body is an unexecuted assertion. No excerpt is a runtime result or a semantic approval.",
 "",
 "The corrected bodies add level-two headings so the real reader can address each contract independently: `Skills catalog, editing and ownership` and `V2 session action boundary`. The latter is closed by `Terminal interaction and supporting contracts`, preserving all following terminal prose. Exact section byte measurements are in `verification.json`.",
 ""
]
excerpt_manifest=[]
for identifier,path,ranges,meaning in excerpts:
    text=(OUT/"sources"/path).read_bytes().decode("utf-8")
    lines=text.splitlines(keepends=True)
    capture=next(x for x in captures if x["path"]==path)
    evidence.extend([f"## {identifier}","",meaning,"",
      f"Source: `{path}`; commit `{PIN}`; Git blob `{capture['git_blob_sha']}`; SHA-256 `{capture['sha256']}`.",""])
    for start,end in ranges:
        assert 1 <= start <= end <= len(lines)
        span="".join(lines[start-1:end])
        evidence.extend([f"Exact lines {start}–{end}:","","```ts\n"+span+("" if span.endswith("\n") else "\n")+"```",""])
        excerpt_manifest.append({"id":identifier,"path":path,"start_line":start,"end_line":end,
                                 "excerpt_bytes":len(span.encode()),"excerpt_sha256":sha(span.encode())})
write(OUT/"decisive-delta.md","\n".join(evidence)+"\n")
write(OUT/"excerpt-manifest.json",json.dumps(excerpt_manifest,indent=2)+"\n")

# Mechanical conservation and section checks. This is artifact QA, not product testing or judging.
population = {}
all_paths = []
for unit in ["app-session","design-tui","desktop-web"]:
    c=json.loads((BASE/"deliverable/layers/l1"/unit/"coverage.json").read_text())
    paths=[x["path"] for x in c["entries"]]
    assert len(paths)==len(set(paths))
    population[unit]=len(paths)
    all_paths.extend(paths)
assert len(all_paths)==4506 and len(set(all_paths))==4506
sections={}
for unit in ["app-session","design-tui"]:
    body=(OUT/unit/"l1.md").read_text()
    lines=body.splitlines(keepends=True)
    starts=[i for i,line in enumerate(lines) if line.startswith("## ")]
    sections[unit]=[]
    for ix,start in enumerate(starts):
        end=starts[ix+1] if ix+1 < len(starts) else len(lines)
        section="".join(lines[start:end])
        sections[unit].append({"heading":lines[start].strip()[3:],"utf8_bytes":len(section.encode())})
    assert len({s["heading"] for s in sections[unit]})==len(sections[unit])
for title in ["Skills catalog, editing and ownership","V2 session action boundary","Terminal interaction and supporting contracts"]:
    hits=[x for xs in sections.values() for x in xs if x["heading"]==title]
    assert len(hits)==1 and hits[0]["utf8_bytes"]<16000
# Every original line outside the explicitly replaced metadata/adapter paragraph remains.
assert tui_original.split("### Selection, local persistence and prompt admission",1)[1] == tui.split("### Selection, local persistence and prompt admission",1)[1]
assert app_original.split("## Assets, localization and verification evidence",1)[1] == app.split("## Assets, localization and verification evidence",1)[1]
for entry in preserved:
    body=Path(entry["path"]).read_bytes()
    assert len(body)==entry["bytes"] and sha(body)==entry["sha256"]
verification={
 "execution_id":EXECUTION,
 "producer_status":"ready for principal reconciliation and independent judgment",
 "semantic_verdict":None,
 "product_tests_executed":False,"runtime_executions":0,"remote_writes":0,
 "source_capture_count":len(captures),
 "fresh_file_captures":8,"reused_exact_file_captures":1,
 "verified_source_bytes":sum(x["bytes"] for x in captures),
 "source_sha256_and_git_blob_checks":"verified",
 "excerpt_count":len(excerpt_manifest),
 "excerpt_integrity":"generated directly from verified source spans",
 "original_files_unchanged":True,
 "coverage_population":population,"coverage_union_paths":4506,"coverage_union_unique_paths":4506,
 "coverage_path_hash_method":"SHA256 of sorted path strings joined by LF with final LF",
 "coverage_path_sha256":sha(("\n".join(sorted(all_paths))+"\n").encode()),
 "new_h2_sections_below_routine_16000_bytes":True,
 "sections":sections,
 "inherited_app_assets_verification_tail_unchanged":True,
 "inherited_tui_selection_through_final_tail_unchanged":True,
 "later_layers":"L2-L4 remain blocked until complete L1 judgment",
 "artifacts":[{"path":str(OUT/unit/"l1.md"),"bytes":(OUT/unit/"l1.md").stat().st_size,
               "sha256":sha((OUT/unit/"l1.md").read_bytes())} for unit in ["app-session","design-tui"]],
 "limitations":["No semantic PASS is issued by the producer.",
                "Hash equality and section size establish form/provenance only.",
                "No product, backend or UI behavior was executed.",
                "No oracles or judge packets were accessed."]
}
write(OUT/"verification.json",json.dumps(verification,indent=2)+"\n")
print(json.dumps({"files":verification["artifacts"],"sources":len(captures),"sections":{k:[s for s in v if s["heading"] in ["Skills catalog, editing and ownership","V2 session action boundary","Terminal interaction and supporting contracts","Terminal application"]] for k,v in sections.items()},"population":population,"path_hash":verification["coverage_path_sha256"]},indent=2))

