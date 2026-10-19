// Copy owned by the Atlas how view (A30). Keys: orchestra.atlas.how.<name>, English verbatim from specs/atlas-ui/mock.
export const ATLAS_HOW_COPY = {
  "orchestra.atlas.how.crumb": "How it works",
  "orchestra.atlas.how.eyebrow": "How it works",
  "orchestra.atlas.how.title": "Follow one fact",
  "orchestra.atlas.how.lead": "A real sentence from this store, from the moment Genesis proposed it to the moment its code moved.",
  "orchestra.atlas.how.another": "Another fact",
  "orchestra.atlas.how.quote": "“{{claim}}”",
  "orchestra.atlas.how.none": "No fact to follow yet.",
  "orchestra.atlas.how.stop.learned": "Learned",
  "orchestra.atlas.how.stop.checked": "Checked",
  "orchestra.atlas.how.stop.stored": "Stored",
  "orchestra.atlas.how.stop.served": "Served",
  "orchestra.atlas.how.stop.watched": "Watched",
  "orchestra.atlas.how.learned.line": "Genesis visited this file and the model proposed one sentence about it.",
  "orchestra.atlas.how.learned.none": "No stored reasoning.",
  "orchestra.atlas.how.learned.answer": "The model's whole answer is stored next to the claim (answerRef).",
  "orchestra.atlas.how.checked.line":
    "Before it could become a fact it passed four checks, in order. The chain stops at the first that fails.",
  "orchestra.atlas.how.gate.shape": "Well-formed",
  "orchestra.atlas.how.gate.shape.text": "It has a claim, a tier, a scope and a valid anchor.",
  "orchestra.atlas.how.gate.truth": "Matches code",
  "orchestra.atlas.how.gate.truth.text": "The anchor's code still hashes the way the claim saw it.",
  "orchestra.atlas.how.gate.authz": "Allowed",
  "orchestra.atlas.how.gate.authz.text": "The writer holds the {{scope}} group.",
  "orchestra.atlas.how.gate.ratify": "Approved",
  "orchestra.atlas.how.gate.ratify.text": "A person's approval key signs the write.",
  "orchestra.atlas.how.stored.line":
    "Atlas stores the fact by its content, so the same fact always has the same address, and nothing is ever overwritten.",
  "orchestra.atlas.how.layer.identity": "Identity",
  "orchestra.atlas.how.layer.identity.text":
    "nodeKey = hash(anchor ‖ kind). The same place and kind is the same fact, however it is worded.",
  "orchestra.atlas.how.layer.content": "Content",
  "orchestra.atlas.how.layer.content.text":
    "contentHash = BLAKE3 of the fact, without its grounding or freshness. Re-anchoring never changes it.",
  "orchestra.atlas.how.layer.current": "Current version",
  "orchestra.atlas.how.layer.current.text":
    "Generation {{gen}} points the key at that content. Each write publishes a new generation; the last four stay.",
  "orchestra.atlas.how.layer.anchor": "Anchor",
  "orchestra.atlas.how.layer.anchor.text": "The hash of the code the claim describes, at commit {{rev}}.",
  "orchestra.atlas.how.stored.note":
    "{{n}} objects in the store: every fact plus the model answer behind it. Export copies the objects (atlas-okf.json); importing replays them through the checks.",
  "orchestra.atlas.how.served.in": "When an agent asks about this unit, this sentence is part of the briefing it gets.",
  "orchestra.atlas.how.served.out":
    "This unit's briefing ran out of room before this sentence; the agent sees it named and can pull it.",
  "orchestra.atlas.how.served.note":
    "Briefings are built the same way every time: ratified facts first, then pointers to finer units, then hints, in 1,500 characters. Nothing is dropped silently.",
  "orchestra.atlas.how.watched.moved":
    "The code moved: {{stat}} since it was derived. The anchor no longer hashes the same, so Atlas marks it changed and asks you to decide.",
  "orchestra.atlas.how.watched.still": "Its code hasn't moved since it was derived, so it still holds.",
  "orchestra.atlas.how.watched.blast.one": "{{n}} file imports this file, so its facts sit in its blast radius.",
  "orchestra.atlas.how.watched.blast.other": "{{n}} files import this file, so their facts sit in its blast radius.",
  "orchestra.atlas.how.review": "Review it",
  "orchestra.atlas.how.back": "Back",
  "orchestra.atlas.how.next": "Next: {{title}}",
  "orchestra.atlas.how.open": "Open the fact",
}
