# Owner evidence: what the owner rewards and punishes

Status: evidence. Recorded 2026-10-28.

Source: 3,534 owner messages in local Claude Code transcripts, 2026-07-12 to 2026-10-28, mined in four chunks of
about 423 owner reactions each. Each reaction is paired with the agent text just before it. The raw mining stays out of
the repository because it holds private chat, including one pasted credential.

Counts are keyword lower bounds. Classes overlap. Quotes are verbatim, in the owner's Portuguese.

## What the record covers, and what it does not

- It covers how one owner reacts to lead agents: Claude Code sessions acting as tech lead, release lead and research
  lead. It is the best evidence of what this owner wants from Maestro.
- It does not cover Maestro itself. The app database holds 2 Maestro Sessions out of 32, with 0 board questions, 0
  board issues and 0 board notes. No installed app has real use. Maestro's own behaviour in real work is unmeasured.

## Complaints, ranked

| Rank | Class | Rows (chunks 1–4) | Typical quote | What triggered it |
|---|---|---|---|---|
| 1 | Not understood: jargon, IDs, walls of text | about 37 + 62 + 54 + 16 | "sua resposta pra mim foi chines, eu quero um status de projeto. Eu sou o stakeholder. Fala meu idioma." | bare issue numbers, code identifiers, stacked decisions, tables of internal labels |
| 2 | Silence and status chasing | about 30 + 19 + 27 + 24 | "eai?", "porque parou? voce acabou?" | "Aguardo", "Sigo no loop", "Te aviso assim que fechar" |
| 3 | Idle fleet, stalls, not landing | about 30 + 24 + 25 + 18 | "frota parada, porque?"; "porque ja nao vai planejando enquanto espera?" | waiting on CI or on workers with nothing else dispatched |
| 4 | Handing work or decisions back | about 14 + 15 + 10 + 10 | "para de empurrar coisas triviais pra mim, esse trabalho e seu"; "esse e seu escopo, nao meu" | "Owner-gated (só tu): merge", "Sigo pro WP-3 ou paro aqui?", "Mergeio agora?" |
| 5 | Done without proof | about 20 + 19 + 11 | "nao quero pytest nem retorna 200, quero que voce use"; "So acredite no que puder provar" | "Backlog zerado", "273 testes verdes" |
| 6 | Forgot a decision or acted without approval | about 6 + 19 + 11 | "Ja te disse isso milhoes de vezes"; "eu nao mandei voce integrar, nao aprovei ainda" | re-asking settled questions; integrating unapproved visual work |
| 7 | Shallow work | about 10 + 13 + 7 | "voce foi leviano"; "Pesquisa de merda... Faz isso direito." | research from summaries, offering to research instead of doing it |
| 8 | Cost and overengineering | about 16 + 21 + 18 | "Nao podemos criar overhead. jamais."; "Nao precisa ser uma odisseia de milhoes de tokens." | full CI reruns, heavy designs, GitHub Actions spend after it was forbidden |
| 9 | No recommendation | about 12 | "mastiga e me da sua recomendacao" | "Qual prefere?" with nothing marked |

Two findings change the earlier proposal:

1. **The owner punishes silence more than length.** Chunks 1–4 hold about 100 status pings ("eai?", "status?",
   "eta?", "nada?"). The earlier owner-voice rule "send no progress pings" was wrong for this owner. What the owner punishes is
   narration (tool-by-tool prose), not status. The owner wants the state volunteered, in one line, without asking.
2. **Too short also fails.** "ai tu resumiu demais, eu preciso entender o issue" (07-20) came after three one-line votes
   with no explanation. A decision needs the issue explained in 2–3 plain sentences, not a bare vote.

## What gets approved

About 80 approvals across the four chunks. They share one shape:

- the state first, in plain words, with one number or one artifact (a link, a path, a PR, a screenshot)
- one decision at most, with the recommendation marked and its cost stated ("sete semanas de 'deve estar
  funcionando'")
- proven kept apart from unproven, and limits stated before the owner finds them ("eu ainda não sei por que o alarme
  não disparou" was never penalised)
- the owner's own design echoed back for correction ("é assim que você entende? Corrige o que eu errei" got "E isso ai"
  three times)
- "Não preciso de nada de ti" got "fiquei ate emocionado"

Typical approvals are 2–5 words: "sigo sua recomendacao", "opcao A", "pode decidir", "Vai com as 5 recomendações". The
owner follows a marked recommendation about 26 times in chunk 1 (the total of chunk-1 decisions was not counted) and pushes back only when the recommendation
contradicts the owner's design, the cost looks absurd, or the item was small enough to decide alone.

## Standing rules the owner set more than once

| Rule | First and repeat dates |
|---|---|
| Merge, PRs and repo hygiene are the lead's job, never the owner's | 07-12, 08-09, 08-13, 10-10, 10-27 |
| Decide small things, record the decision, never ask whether to continue | 07-13, 08-02, 08-10, 08-23, 10-27 |
| Keep the fleet full; one work package per agent; use wait time for parallel work | 07-13, 07-20, 08-23, 10-18 |
| Every brief and review carries the 4 axioms: completeness, DoD, invariants, quality standards | 07-13, 08-04, 08-31 |
| Worker tasks are atomic and pre-discovered: "tudo mastigado, eles so executam" | 10-19 |
| Verify delegated work before approving it; use it as the user would | 08-02, 08-16, 10-19 |
| Never block other sessions | 10-11 |
| Nothing visual integrated without approval; mocks first | 10-25 |
| Cheap: surgical tests, small PRs, one full CI at the end | 08-03, 10-18, 10-24 |
| One source of truth for backlog and decisions | 08-23 |
| "Velocidade nunca foi metrica relevante": precision over speed | 08-23 |

## The ten rules this evidence gives Maestro

1. **Speak stakeholder.** State first, plain Portuguese, one number or artifact, no internal IDs, no tool names.
2. **Volunteer status.** Every reply to the owner ends with where the work stands, what runs now and when the next
   result comes. A long run sends one checkpoint line when a result lands, never tool narration.
3. **Decide inside scope.** Two-way doors are decided and reported. Ask only for money, accounts, credentials, taste
   (visual approval) and product direction.
4. **One decision, explained and recommended.** The issue in 2–3 plain sentences, the pick, its cost, what happens
   meanwhile.
5. **Own landing.** Merge when green and approved, then tell the owner. Never list a merge as owner-gated.
6. **Never idle.** A free slot is refilled. Waiting on CI or a worker is never the whole plan.
7. **Prove done.** Done means used as the user would. Say what ran and what did not.
8. **Remember.** Read past decisions before asking. Never ask twice.
9. **Brief completely.** Atomic, pre-discovered, the 4 axioms, nothing left to decide.
10. **Spend cheaply.** Surgical checks per unit, one full run at the end, cheap models for mechanical work.
