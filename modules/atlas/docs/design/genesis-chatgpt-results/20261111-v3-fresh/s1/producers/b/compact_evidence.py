"""Create an exact-line review projection; the full evidence archive remains authoritative."""
from pathlib import Path
import hashlib
import json

B = Path(__file__).resolve().parent
manifest = json.loads((B / "source-manifest.json").read_text())
sources = {x["path"]: x for x in manifest["sources"]}
full = json.loads((B / "review-evidence-index.json").read_text())["excerpts"]
PIN = manifest["source_revision"]

plan = {
    "AGENTS.md": [(1, 2)],
    "packages/schema/AGENTS.md": [(3, 3), (14, 14), (26, 28), (41, 42), (60, 60), (76, 76)],
    "packages/schema/package.json": [(122, 124)],
    "packages/protocol/package.json": [(69, 72)],
    "packages/server/package.json": [(36, 45)],
    "packages/client/package.json": [(7, 10), (13, 14), (18, 29)],
    "packages/sdk-next/package.json": [(7, 9), (14, 21)],
    "tooling/httpapi-codegen/package.json": [(13, 16)],
    "packages/protocol/src/api.ts": [(59, 59), (68, 79), (121, 135), (149, 157)],
    "packages/client/src/contract.ts": [(1, 19), (119, 126)],
    "packages/server/src/api.ts": [(1, 8)],
    "packages/core/src/host.ts": [(40, 56)],
    "packages/schema/src/schema.ts": [(3, 17), (25, 30)],
    "packages/schema/src/session-id.ts": [(5, 12)],
    "packages/schema/src/session.ts": [(20, 53)],
    "packages/schema/src/model.ts": [(8, 9), (85, 87)],
    "packages/schema/src/prompt.ts": [(8, 30)],
    "packages/schema/src/prompt-input.ts": [(7, 26)],
    "packages/schema/src/session-input.ts": [(15, 25)],
    "packages/schema/src/session-delivery.ts": [(5, 6)],
    "packages/schema/src/session-message.ts": [(13, 16), (122, 138), (206, 219)],
    "packages/schema/src/location.ts": [(9, 25)],
    "packages/schema/src/event.ts": [(9, 12), (55, 71), (76, 94), (102, 112)],
    "packages/schema/src/session-event.ts": [(42, 55), (219, 229), (269, 288), (511, 546), (567, 583)],
    "packages/schema/src/event-manifest.ts": [(58, 83)],
    "packages/schema/src/durable-event-manifest.ts": [(7, 20)],
    "packages/protocol/src/groups/session.ts": [(102, 109), (157, 165), (175, 188), (202, 215), (333, 350), (617, 653), (655, 668)],
    "packages/server/src/handlers/session.ts": [(64, 85), (117, 143), (150, 171), (247, 263), (615, 653)],
    "packages/protocol/src/groups/message.ts": [(10, 34)],
    "packages/server/src/handlers/message.ts": [(8, 23), (34, 46), (69, 77)],
    "packages/server/src/middleware/session-location.ts": [(29, 62)],
    "packages/protocol/src/errors.ts": [(3, 17), (19, 44), (55, 78), (98, 121)],
    "packages/server/src/auth.ts": [(29, 33), (40, 49)],
    "packages/server/src/middleware/authorization.ts": [(10, 13), (33, 39), (45, 61)],
    "packages/server/src/middleware/capability-authorization.ts": [(26, 47), (52, 59), (68, 72), (80, 85)],
    "packages/server/src/middleware/schema-error.ts": [(8, 20)],
    "packages/server/src/location.ts": [(33, 40), (43, 50), (67, 81)],
    "packages/server/src/handlers/pty.ts": [(116, 138), (149, 160), (178, 179)],
    "packages/server/src/handlers/capability-artifacts.ts": [(61, 80)],
    "packages/server/src/principal.ts": [(5, 20)],
    "packages/server/src/handlers/model.ts": [(14, 28), (35, 43)],
    "packages/server/src/handlers/provider.ts": [(14, 23), (26, 38)],
    "packages/protocol/src/groups/event.ts": [(9, 25)],
    "packages/server/src/handlers/event.ts": [(13, 64)],
    "packages/client/src/generated/client.ts": [(557, 594), (597, 660), (1548, 1572), (4082, 4110)],
    "packages/client/README.md": [(13, 14), (29, 35)],
    "packages/protocol/src/groups/fs.ts": [(11, 35)],
    "packages/client/src/wire.ts": [(1, 4)],
    "packages/client/src/generated-effect/client-error.ts": [(1, 15)],
    "packages/client/src/actions-transfer.ts": [(58, 70), (107, 130), (149, 156), (170, 176)],
    "packages/client/src/actions-transfer-error.ts": [(4, 12), (37, 73)],
    "packages/protocol/src/groups/actions-transfer.ts": [(8, 17)],
    "packages/server/src/handlers/actions-transfer.ts": [(10, 18), (25, 35)],
    "packages/client/script/build.ts": [(1, 12), (28, 48)],
    "tooling/httpapi-codegen/src/index.ts": [(75, 99), (104, 123), (146, 159), (201, 219), (318, 354), (698, 739), (743, 745), (757, 769), (946, 955)],
    "tooling/httpapi-codegen/src/imported-effect.ts": [(51, 64)],
    "tooling/httpapi-codegen/src/effect-headers.ts": [(2, 32)],
    "tooling/httpapi-codegen/src/layout.ts": [(98, 113), (151, 161), (188, 190)],
    "packages/sdk-next/src/orchestra.ts": [(14, 52)],
    "packages/sdk-next/src/operator-transport.ts": [(8, 27)],
    "packages/server/src/routes.ts": [(94, 112)],
}

# Keep the actual decision branches and declarations in the reading packet. The larger archive
# retains full surrounding methods, all repeated endpoint scaffolding, and supplementary details.
plan.update({
    "packages/schema/AGENTS.md": [(3, 3), (14, 14), (28, 28), (41, 42), (60, 60)],
    "packages/protocol/src/api.ts": [(59, 59), (73, 79), (121, 126), (134, 135), (149, 157)],
    "packages/client/src/contract.ts": [(1, 19), (119, 126)],
    "packages/schema/src/prompt.ts": [(8, 17), (20, 25)],
    "packages/schema/src/prompt-input.ts": [(7, 16), (22, 26)],
    "packages/schema/src/session-message.ts": [(13, 16), (122, 138), (206, 219)],
    "packages/schema/src/event.ts": [(9, 12), (55, 64), (76, 78), (88, 94), (102, 109)],
    "packages/schema/src/session-event.ts": [(42, 55), (219, 229), (269, 280), (511, 546), (567, 583)],
    "packages/protocol/src/groups/session.ts": [(102, 109), (157, 165), (175, 187), (333, 343), (349, 350), (617, 626), (632, 633), (637, 650), (655, 668)],
    "packages/server/src/handlers/session.ts": [(68, 84), (117, 139), (150, 158), (247, 263), (615, 628), (640, 653)],
    "packages/protocol/src/groups/message.ts": [(12, 30)],
    "packages/server/src/handlers/message.ts": [(19, 23), (34, 46), (73, 77)],
    "packages/server/src/middleware/session-location.ts": [(32, 59)],
    "packages/protocol/src/errors.ts": [(3, 17), (19, 44), (55, 63), (74, 78), (98, 103)],
    "packages/server/src/middleware/authorization.ts": [(13, 13), (34, 39), (45, 57), (61, 61)],
    "packages/server/src/middleware/capability-authorization.ts": [(26, 47), (54, 59), (80, 85)],
    "packages/server/src/middleware/schema-error.ts": [(10, 19)],
    "packages/server/src/location.ts": [(33, 40), (43, 48), (67, 81)],
    "packages/server/src/handlers/capability-artifacts.ts": [(61, 76)],
    "packages/server/src/principal.ts": [(13, 20)],
    "packages/server/src/handlers/model.ts": [(18, 28), (37, 43)],
    "packages/server/src/handlers/provider.ts": [(14, 23)],
    "packages/server/src/handlers/event.ts": [(13, 45), (54, 64)],
    "packages/client/src/generated/client.ts": [(557, 594), (597, 609), (621, 627), (635, 647), (653, 660), (1562, 1572), (4082, 4110)],
    "packages/client/README.md": [(13, 14), (29, 35)],
    "packages/client/src/actions-transfer.ts": [(64, 70), (122, 130), (149, 153), (170, 176)],
    "packages/client/src/actions-transfer-error.ts": [(9, 12), (37, 48), (51, 73)],
    "packages/protocol/src/groups/actions-transfer.ts": [(10, 17)],
    "packages/server/src/handlers/actions-transfer.ts": [(10, 18)],
    "packages/client/script/build.ts": [(1, 12), (28, 48)],
    "tooling/httpapi-codegen/src/index.ts": [(75, 99), (105, 123), (150, 159), (201, 219), (318, 354), (698, 704), (707, 719), (726, 739), (743, 745), (757, 769), (946, 955)],
    "tooling/httpapi-codegen/src/imported-effect.ts": [(51, 64)],
    "tooling/httpapi-codegen/src/effect-headers.ts": [(8, 12), (18, 30)],
    "tooling/httpapi-codegen/src/layout.ts": [(98, 103), (151, 161), (188, 190)],
    "packages/sdk-next/src/orchestra.ts": [(14, 30), (38, 52)],
    "packages/server/src/routes.ts": [(94, 105), (112, 112)],
})
for path in ["packages/protocol/src/groups/fs.ts", "packages/protocol/src/groups/event.ts", "packages/client/src/wire.ts"]:
    del plan[path]

plan.update({
    "packages/schema/AGENTS.md": [(3, 3), (14, 14), (28, 28), (41, 41)],
    "packages/protocol/src/api.ts": [(59, 59), (73, 79), (121, 126), (134, 135)],
    "packages/client/src/contract.ts": [(1, 5), (10, 19), (119, 126)],
    "packages/core/src/host.ts": [(40, 56)],
    "packages/schema/src/schema.ts": [(6, 16), (25, 30)],
    "packages/schema/src/session.ts": [(20, 35), (49, 53)],
    "packages/schema/src/event.ts": [(55, 64), (76, 78), (88, 94), (105, 108)],
    "packages/schema/src/session-event.ts": [(42, 55), (219, 229), (269, 280), (511, 546), (567, 583)],
    "packages/schema/src/event-manifest.ts": [(58, 70), (76, 83)],
    "packages/protocol/src/groups/session.ts": [(102, 109), (157, 165), (175, 181), (333, 343), (349, 350), (617, 626), (632, 633), (637, 650), (655, 660)],
    "packages/server/src/handlers/session.ts": [(68, 84), (247, 263), (640, 653)],
    "packages/server/src/handlers/message.ts": [(34, 46), (73, 77)],
    "packages/server/src/middleware/session-location.ts": [(34, 59)],
    "packages/protocol/src/errors.ts": [(3, 17), (19, 44), (55, 63), (98, 103)],
    "packages/server/src/middleware/authorization.ts": [(13, 13), (34, 39), (45, 57), (61, 61)],
    "packages/server/src/middleware/capability-authorization.ts": [(27, 47), (80, 85)],
    "packages/server/src/location.ts": [(33, 40), (67, 81)],
    "packages/server/src/handlers/pty.ts": [(120, 128), (135, 138), (149, 160), (178, 179)],
    "packages/server/src/handlers/event.ts": [(13, 24), (28, 45), (54, 64)],
    "packages/client/src/generated/client.ts": [(557, 566), (573, 594), (597, 609), (621, 627), (639, 647), (653, 660), (1562, 1572), (4082, 4104)],
    "packages/client/README.md": [(29, 35)],
    "packages/client/src/actions-transfer.ts": [(64, 67), (122, 126), (149, 153), (172, 174)],
    "packages/client/src/actions-transfer-error.ts": [(37, 48), (51, 65), (68, 73)],
    "packages/client/script/build.ts": [(1, 12), (28, 48)],
    "tooling/httpapi-codegen/src/index.ts": [(75, 82), (89, 99), (105, 123), (150, 159), (212, 219), (318, 343), (698, 704), (714, 719), (727, 739), (743, 745), (757, 763), (946, 955)],
    "tooling/httpapi-codegen/src/imported-effect.ts": [(58, 64)],
    "tooling/httpapi-codegen/src/effect-headers.ts": [(8, 12), (21, 29)],
    "tooling/httpapi-codegen/src/layout.ts": [(98, 103), (151, 161), (188, 190)],
    "packages/sdk-next/src/orchestra.ts": [(14, 30), (38, 52)],
    "packages/server/src/routes.ts": [(104, 105), (112, 112)],
})
for path in ["packages/schema/src/prompt.ts", "packages/schema/src/prompt-input.ts", "packages/schema/src/session-message.ts", "packages/schema/src/model.ts", "packages/schema/src/session-delivery.ts", "packages/schema/src/durable-event-manifest.ts", "packages/protocol/src/groups/message.ts", "packages/server/src/handlers/model.ts", "packages/server/src/handlers/provider.ts", "packages/server/src/handlers/actions-transfer.ts", "packages/server/src/principal.ts"]:
    del plan[path]

records = []
for p, ranges in plan.items():
    raw = (B / "sources" / p).read_bytes()
    lines = raw.decode().splitlines(keepends=True)
    tags = sorted({key for e in full if e["path"] == p for key in e["artifact_keys"]})
    selected = []
    for start, end in ranges:
        end = min(end, len(lines))
        assert any(e["path"] == p and e["start_line"] <= start and e["end_line"] >= end for e in full), (p, start, end)
        content = "".join(lines[start-1:end])
        selected.append({"start_line": start, "end_line": end, "sha256": hashlib.sha256(content.encode()).hexdigest(), "byte_length": len(content.encode()), "content": content})
    records.append({"id": f"C{len(records)+1:02}", "path": p, "git_blob_sha": sources[p]["git_blob_sha"], "source_sha256": sources[p]["sha256"], "artifact_keys": tags, "ranges": selected})

out = ["# Compact exact review evidence\n\n",
       f"All source below is from commit `{PIN}`. This is an economic projection of the preserved full `review-evidence.md`, SHA-256 `{hashlib.sha256((B / 'review-evidence.md').read_bytes()).hexdigest()}`. Ranges are inclusive. Code-fence contents are copied unchanged; gaps between ranges are explicit. No source was rewritten and no test was executed. The full source manifest and full evidence archive remain available for follow-up.\n\n",
       "## Artifact → exact source map\n\n"]
all_keys = sorted({k for e in full for k in e["artifact_keys"]})
for key in all_keys:
    ids = [r["id"] for r in records if key in r["artifact_keys"]]
    if key == "s1.api.surface-disposition":
        ids = ["P1"]
    out.append(f"- `{key}`: {', '.join(ids)}.\n")
out.append("\n## P1 — population and fidelity observations\n\n")
out.append("The source manifest has 291 captures: 289 of 472 assigned files plus root AGENTS and Core host. All 252 assigned handwritten production src/*.ts modules are preserved; the literal surface index has 253 modules including Core host. Read register: 97 full source reads, 2 representative generated reads, 190 literal surface-indexed sources, 2 captured without semantic reading. The other 183 assigned paths remain inventory-only. The local checks validate source bytes, inventory identity, coverage bijection, excerpt/body hashes and transport shape; they do not validate the product or grant semantic acceptance.\n\n")
oversized = sources["packages/client/src/generated/types.ts"]
out.append(f"Required generated input `packages/client/src/generated/types.ts`: {oversized['byte_length']} bytes, Git blob `{oversized['git_blob_sha']}`, SHA-256 `{oversized['sha256']}`. The protocol's current 256,000-byte observer limit remains an unresolved binding boundary. This is captured-but-unread source, not an accepted semantic type inventory. The two output manifests in the full archive establish 40 Promise output names and 14 Effect output names; generated members are not all semantically read.\n\n")
out.append("The three source discrepancies are kept visible: README raw-file omission versus generated binary fs.read; handwritten upload path versus the inspected two-operation Actions transfer group/handler; V2 identifiers versus unversioned guide intent. No regeneration, bundler, HTTP request, model turn, judge acceptance or runtime binding is asserted.\n\n")
for r in records:
    out.append(f"## {r['id']} — `{r['path']}`\n\nGit blob `{r['git_blob_sha']}`.\n\n")
    for ran in r["ranges"]:
        out.append(f"Lines {ran['start_line']}–{ran['end_line']}:\n\n```\n")
        out.append(ran["content"])
        if not ran["content"].endswith("\n"):
            out.append("\n")
        out.append("```\n\n")
(B / "review-evidence-compact.md").write_text("".join(out))
for r in records:
    for ran in r["ranges"]:
        del ran["content"]
(B / "review-evidence-compact-index.json").write_text(json.dumps({"schema": "genesis-compact-review-excerpts/v1", "source_revision": PIN, "full_evidence_sha256": hashlib.sha256((B / "review-evidence.md").read_bytes()).hexdigest(), "sources": records}, indent=2) + "\n")
print(json.dumps({"compact_evidence_bytes": (B / "review-evidence-compact.md").stat().st_size, "compact_sources": len(records), "compact_ranges": sum(len(r["ranges"]) for r in records)}))
