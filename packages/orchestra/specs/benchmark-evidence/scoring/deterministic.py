import json, re
def norm(s): return re.sub(r"\s+"," ",s.replace("`","").replace("**","").replace("\\\"","\"").lower()).strip()
checks = {
 "P01": [["propose scope for a small dark mode toggle in settings; do not implement"]],
 "P07": [["git status --short"]],
 "P08": [["evt_maestro_context_ffb19c2f42b6519480e38c26585fe61d56526ea516d21df8656b1fc2cb1f5a36"],["ba3eaab11283017a7f0b77e83684f9978687dc3c9d8d9c52188991dcc35f58e4"]],
 "P09": [["evt_maestro_review_909befec9c33667ab523b98505f87e24beb7a17e2f6eec888b21ce8d22b27cb6"]],
 "P10": [["invalid arguments: unknown parameter"],["maestrovalidationrejected"]],
 "P11": [["unknownerror"],["lucy_error"],["fix_first"],["maestroreviewrejected"],["artifact-worktree-mismatch"],["check-evidence-mismatch"]],
 "P16": [["fix_first"],["theme.ts"]],
 "P17": [["approve"],["aprovo"],["decline"],["declino"],["cancel"],["cancelar"]],
}
out={}
for label in "AB":
  ans={a["id"]:norm(a["answer"]) for a in json.load(open(f"answers_{label}.json"))}
  for pid,items in checks.items():
    hits=[any(alt in ans[pid] for alt in item) for item in items]
    # 'cancel' must not be satisfied only by 'cancelar'
    if pid=="P17": hits[4]=bool(re.search(r"\bcancel\b",ans[pid]))
    out.setdefault(pid,{})[label]=(sum(hits),len(items),hits)
for pid,v in out.items(): print(pid,v)
json.dump(out,open("deterministic.json","w"))
