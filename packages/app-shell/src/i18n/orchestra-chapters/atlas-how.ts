// Copy owned by the Atlas how view (A30). Keys: orchestra.atlas.how.<name>, English verbatim from specs/atlas-ui/mock.
export const ATLAS_HOW_COPY = {
  "orchestra.atlas.how.crumb": "How it works",
  "orchestra.atlas.how.eyebrow": "How it works",
  "orchestra.atlas.how.title": "Follow one fact",
  "orchestra.atlas.how.lead": "A real sentence from this store, from the moment History proposed it to the moment its code moved.",
  "orchestra.atlas.how.another": "Another fact",
  "orchestra.atlas.how.quote": "“{{claim}}”",
  "orchestra.atlas.how.none": "No fact to follow yet.",
  "orchestra.atlas.how.stop.learned": "Learned",
  "orchestra.atlas.how.stop.checked": "Checked",
  "orchestra.atlas.how.stop.stored": "Stored",
  "orchestra.atlas.how.stop.served": "Served",
  "orchestra.atlas.how.stop.watched": "Watched",
  "orchestra.atlas.how.learned.line": "History visited this file and the model proposed one sentence about it.",
  "orchestra.atlas.how.learned.none": "No stored reasoning.",
  "orchestra.atlas.how.learned.error": "The stored reasoning could not be read.",
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

export const ATLAS_HOW_COPY_BR: Record<keyof typeof ATLAS_HOW_COPY, string> = {
  "orchestra.atlas.how.crumb": "Como funciona",
  "orchestra.atlas.how.eyebrow": "Como funciona",
  "orchestra.atlas.how.title": "Siga um fato",
  "orchestra.atlas.how.lead": "Uma frase real deste armazenamento, desde o momento em que o Histórico a propôs até o momento em que o código dela mudou.",
  "orchestra.atlas.how.another": "Outro fato",
  "orchestra.atlas.how.quote": "“{{claim}}”",
  "orchestra.atlas.how.none": "Nenhum fato para seguir ainda.",
  "orchestra.atlas.how.stop.learned": "Aprendido",
  "orchestra.atlas.how.stop.checked": "Verificado",
  "orchestra.atlas.how.stop.stored": "Armazenado",
  "orchestra.atlas.how.stop.served": "Servido",
  "orchestra.atlas.how.stop.watched": "Observado",
  "orchestra.atlas.how.learned.line": "O Histórico visitou este arquivo e o modelo propôs uma frase sobre ele.",
  "orchestra.atlas.how.learned.none": "Nenhum raciocínio armazenado.",
  "orchestra.atlas.how.learned.error": "Não foi possível ler o raciocínio armazenado.",
  "orchestra.atlas.how.learned.answer": "A resposta inteira do modelo fica armazenada junto da afirmação (answerRef).",
  "orchestra.atlas.how.checked.line":
    "Antes de virar um fato, ela passou por quatro verificações, em ordem. A cadeia para na primeira que falhar.",
  "orchestra.atlas.how.gate.shape": "Bem formado",
  "orchestra.atlas.how.gate.shape.text": "Tem uma afirmação, um nível, um escopo e uma âncora válida.",
  "orchestra.atlas.how.gate.truth": "Bate com o código",
  "orchestra.atlas.how.gate.truth.text": "O código da âncora ainda gera o mesmo hash que a afirmação viu.",
  "orchestra.atlas.how.gate.authz": "Permitido",
  "orchestra.atlas.how.gate.authz.text": "Quem escreve pertence ao grupo {{scope}}.",
  "orchestra.atlas.how.gate.ratify": "Aprovado",
  "orchestra.atlas.how.gate.ratify.text": "A chave de aprovação de uma pessoa assina a gravação.",
  "orchestra.atlas.how.stored.line":
    "O Atlas armazena o fato pelo conteúdo, então o mesmo fato sempre tem o mesmo endereço, e nada é sobrescrito.",
  "orchestra.atlas.how.layer.identity": "Identidade",
  "orchestra.atlas.how.layer.identity.text":
    "nodeKey = hash(anchor ‖ kind). O mesmo lugar e o mesmo tipo são o mesmo fato, não importa como foi escrito.",
  "orchestra.atlas.how.layer.content": "Conteúdo",
  "orchestra.atlas.how.layer.content.text":
    "contentHash = BLAKE3 do fato, sem a fundamentação nem a atualidade. Reancorar nunca muda esse valor.",
  "orchestra.atlas.how.layer.current": "Versão atual",
  "orchestra.atlas.how.layer.current.text":
    "A geração {{gen}} aponta a chave para esse conteúdo. Cada gravação publica uma nova geração; as últimas quatro ficam.",
  "orchestra.atlas.how.layer.anchor": "Âncora",
  "orchestra.atlas.how.layer.anchor.text": "O hash do código que a afirmação descreve, no commit {{rev}}.",
  "orchestra.atlas.how.stored.note":
    "{{n}} objetos no armazenamento: todos os fatos mais a resposta do modelo por trás deles. A exportação copia os objetos (atlas-okf.json); a importação os reexecuta pelas verificações.",
  "orchestra.atlas.how.served.in": "Quando um agente pergunta sobre esta unidade, esta frase faz parte do briefing que ele recebe.",
  "orchestra.atlas.how.served.out":
    "O briefing desta unidade acabou o espaço antes desta frase; o agente a vê citada e pode puxá-la.",
  "orchestra.atlas.how.served.note":
    "Os briefings são montados sempre do mesmo jeito: primeiro os fatos aprovados, depois ponteiros para unidades menores, depois dicas, em 1.500 caracteres. Nada é descartado em silêncio.",
  "orchestra.atlas.how.watched.moved":
    "O código mudou: {{stat}} desde que o fato foi derivado. A âncora não gera mais o mesmo hash, então o Atlas marca como alterado e pede que você decida.",
  "orchestra.atlas.how.watched.still": "O código dele não mudou desde que foi derivado, então continua valendo.",
  "orchestra.atlas.how.watched.blast.one": "{{n}} arquivo importa este arquivo, então os fatos dele estão no raio de impacto.",
  "orchestra.atlas.how.watched.blast.other": "{{n}} arquivos importam este arquivo, então os fatos deles estão no raio de impacto.",
  "orchestra.atlas.how.review": "Revisar",
  "orchestra.atlas.how.back": "Voltar",
  "orchestra.atlas.how.next": "Próximo: {{title}}",
  "orchestra.atlas.how.open": "Abrir o fato",
}
