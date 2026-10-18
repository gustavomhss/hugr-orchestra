# Atlas UI — especificação de design

2026-10-18. "Tem tudo do avião e mais um pouco, porém é ridiculamente fácil de usar." Cada item de [`INVENTORY.md`](INVENTORY.md) tem exatamente uma casa e uma camada; nada fora do inventário aparece na tela.

## Princípios (testáveis)

1. **Uma tarefa por tela, respondida acima da dobra** (1280×800).
2. **Três camadas, sem pular:** primária (zero toques: cabeçalho, até 4 KPIs ou 3 cartões, uma lista) · secundária (um toque: aba, acordeão, painel, folha) · terciária ("Technical details" ou a tela Health). Hash, variável de ambiente, comando de CLI e código de recusa só na terciária; SHA curto de commit pode na secundária.
3. **Palavra simples primeiro, termo do Atlas no hover** e em Technical details (glossário abaixo).
4. **Verdade sem alarme:** cinza = lacuna real em estado normal; âmbar = alguém precisa decidir; vermelho = só "bloquearia o merge" e "recusado agora".
5. **Toda escrita mostra os portões antes** (faixa Checks, de `draft`/`check`) **e todo lote mostra o resultado por linha.**
6. **Nunca inventar:** o que não existe aparece "Not recorded" com o motivo; dado ilustrado leva `example`.
7. **Uma frase por seção, até 20 palavras;** o resto atrás de um "?".

## Navegação

```
Overview · Knowledge · Review [n] · Activity · Health (•) · Settings
MEMORY  Backend · Jimmy · Archie · Maestro (off)
rodapé: "Local store" | "Store in git · read-only" (âmbar → Health)
```

| Tela | Tarefa | Primária | Secundária | Terciária |
|---|---|---|---|---|
| **Overview** | Em 5 s: o Atlas está bem e o que precisa de mim? | frase de estado (ou faixa do store) + 3 cartões: Needs you · Knowledge · Agents | Busiest units (5) · Recent activity (5) | — |
| **Knowledge** | Achar uma unidade | busca + contagem inline; grupos Code/Docs/Harness/Root | resultados de busca (fatos) | — |
| **Unit** | O que um agente aprende aqui, e se ainda vale | cabeçalho (nível, dono, tier, território) + KPIs (Facts · Up to date · In the briefing · Depends on it) + **Briefing** aberto: linha de publicação, bandas Ratified / Watch out / Go deeper / Hints, "Left out for space" | Facts by kind · Proven structure · Connections (Used by / Uses) · Inside · Pinned by plans | own (grounding.source, shape.contents, tokenEstimate, ponteiros, refresh/complement), Query pack (`--by scope|dependency`), Anchors (units, holes) |
| **Fact** (painel e página) | Posso confiar nesta frase, e de onde ela veio? | afirmação + linha de estado + "Not sent to agents" (store não confiável) + uma ação primária | Code it's about · What changed (classe do `doctor why`, "Atlas suggests") · How it was derived · History (minerado, aceito, tier, selo, substituído por) · Related (mesmo arquivo, Same as, Broader/narrower) | kind, id, nodeKey, contentHash, anchor, claimNorm, scope e quem escreve, obviousness, witness, geração, Re-check proof |
| **Review** | Decidir o que espera uma pessoa | abas Changed code · Mined · To ratify; lista de triagem (frase, arquivo, 1 chip); o painel do fato é o detalhe | folhas: Merge check, Accept all → resultado por linha, Rewrite, Retire, Classify, Ratify, Find new facts → resultado com cobertura; ⋯ Derive links, Record code changes, Find hollow tests | "Command output" em cada folha de resultado |
| **Activity** | O que o Atlas deu e recebeu dos agentes, evento por evento | filtro (All · Reads · Memory · Holds · Code) + lista de frases com avatar | painel do evento (o que o agente recebeu, recibo como frase, hold com motivo, evidência e próximo passo) | hashes do recibo, binding |
| **Health** | Provar que o store está são, ou dizer por quê | frase + 4 linhas: Store access · Stored objects · Proofs · Code index | painéis de cada linha; Versions · Archive · Hot set · Calibration | Command output; comando para reconstruir o índice |
| **Settings** | Quem está conectado, quem é dono, quem escreve | abas Connection · Territories · Permissions · Store | Published to agents (catálogo, unidades), Suggest territories (`init`) | JSON de `maestro.atlas`; Move store (export/import) |
| **Member** | O que ele carrega em toda requisição, e o que lembra de cada task | KPIs + Project memory (Proposals / Indexed, total de tokens) + Memory log (últimas 5) | Out of the header · Sent with every request · PRs · Logbook (Maestro) | texto bruto do `<atlas-header>` |
| **Task** | Onde parou e como retomar | KPIs + Where it stopped | Calls · Checkpoint history · Files changed · Transcript | sessão, eventos do log |

## Glossário (UI → Atlas)

| UI | Atlas |
|---|---|
| Briefing / Published briefings / Republish | own pack / Own snapshot / R7 |
| Ratified · Core | banda governante T1 · T0 |
| Hint | advisory (T2) |
| Watch out · Go deeper · Left out for space | gotchas · ponteiros `own_<folha>` · pullReachable / advisoryDropped |
| Used by · Uses · Inside | dependents · dependencies · finer |
| Kind · Not sorted yet | slot · sem slot |
| Stated · Tested · Link · Never calls · Code change · Hollow test | advisory · predicate · relation · negation · transition · test-vacuity |
| Up to date · Changed · Out of date (still sent) | FRESH · DRIFTED · STALE |
| Moved · Changed | drift mechanical · semantic |
| Re-anchor · Rewrite · Retire | plano reground · emit UPDATE · supersede |
| Merge check · Would block merge | reconcile · exit 2 |
| Machine-proven · Argued · No proof | seal proven · justified · nenhum |
| Same as · Broader / narrower · Couldn't decide | sameAs · subsumes · abstention |
| Mined · Accept · Keep for later | candidato em staging · promote · R2 |
| Find new facts · Suggested · Declined · No record · Stopped · Not reached | mine · seeded · abstained · unrecorded · interrupted · unvisited |
| Checks: Well-formed · Matches code · Allowed · Approved | shape · truth · authz · ratify |
| Approval key · Writing as · Write group | ATLAS_RATIFY_TOKEN · actor · scope |
| Local · In git, read-only · In git, locked | trusted · tracked-provable · tracked-staging |
| Stored objects · Unused (harmless) · Versions | CAS · orphan · generations |
| On hold · Why · Next step | HOLD · reason · next step |
| Read · Saved · Not saved · Resumed with memory | atlasContext · emit admitted · refused · atlasResume |
| Sent with every request · Project awareness · Where we are · Not set up yet | `<atlas-header>` · Awareness · Orientation · UN-SEEDED |
| Recency | frecency |

## Regras de layout

- Acordeão mostra 7 linhas e depois "Show N more"; listas cheias mostram 25. As bandas do Briefing mostram tudo (é a verdade do pack).
- KPIs só em páginas de entidade (Unit, Member, Task); a Overview usa 3 cartões; telas de lista usam contagem inline.
- No máximo 2 chips por linha: estado e um entre tier (Ratified/Core), família (se não for Stated), `example` ou resultado da última execução.
- Hash só em Technical details: 8 caracteres, "…" e botão de copiar.
- Capacidade nova: um ponto de 6 px no botão com o tooltip; o rótulo "New capability · Rn" aparece só no rodapé da folha que a ação abre.
- Uma ação primária por tela. Toast com até 12 palavras e Undo; o detalhe vai para a folha de resultado.
- O teto de tokens da memória não aparece; `over-cap` só aparece quando uma escrita é recusada.

## Fora de propósito

`query --by trigger` (sem produtor); retomar o token do genesis (nenhum comando aceita); o roteamento DEDUP/CREATE/UPDATE/SUPERSEDE depois da escrita (não é devolvido); quem ratificou e horário de escrita (não guardados); o cabeçalho "como foi enviado" (não persistido: a prévia diz "Rebuilt now"); horário de eventos do log (só `seq`); próximo passo para os ~31 holds sem texto ("No suggested step" e a evidência).
