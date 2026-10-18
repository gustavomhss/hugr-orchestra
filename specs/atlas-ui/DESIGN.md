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
MEMORY  Backend · Jimmy · Archie · Maestro (off)   (nomes = `agent.<id>.name` do usuário, por id)
rodapé: "Local store" | "Store in git · read-only" (âmbar → Health)
```

| Tela | Tarefa | Primária | Secundária | Terciária |
|---|---|---|---|---|
| **Overview** | Em 5 s: o Atlas está bem e o que precisa de mim? | frase de estado (ou faixa do store) + 3 cartões: Needs you · Knowledge · Agents | Busiest units (5) · Recent activity (5) | — |
| **Knowledge** | Achar uma unidade | busca + contagem inline; grupos Code/Docs/Harness/Root em cards (só o nome do pacote) | resultados de busca (fatos); folha Check a claim (`verify-fact`) | — |
| **Unit** | O que um agente aprende aqui, e se ainda vale | cabeçalho (nível, dono, tier, território, Add fact) + KPIs (Facts · Up to date · In the briefing · Depends on it) + **Briefing** aberto: linha de publicação, bandas Ratified / Watch out / Go deeper / Hints, "Left out for space" | Facts by kind · Proven structure (Links, Never calls + Couldn't decide, Code changes, Hollow tests) · Connections (Used by; "What it uses: Not recorded") · Inside · Pinned by plans (Current / Out of date) · folha Add a fact (anchors → slots → draft → check) | own (grounding.source, shape.contents, tokenEstimate, ponteiros, refresh/complement), Query pack (`--by scope|dependency`), Anchors (units, holes) |
| **Fact** (painel e página) | Posso confiar nesta frase, e de onde ela veio? | afirmação + linha de estado + "Not sent to agents" (store não confiável) + uma ação primária | Code it's about · What changed (classe do `doctor why`, "Atlas suggests") · How it was derived · History (minerado, aceito, tier, selo, substituído por) · Related (mesmo arquivo, Same as, Broader/narrower) | kind, id, nodeKey, contentHash, anchor, claimNorm, scope e quem escreve, obviousness, witness, geração, Re-check proof |
| **Review** | Decidir o que espera uma pessoa | abas Changed code · Mined · To ratify; lista de triagem (frase, arquivo, 1 chip); o painel do fato é o detalhe | folhas: Merge check, Accept all → resultado por linha, Rewrite, Retire, Classify, Ratify, Find new facts → resultado com cobertura; ⋯ Derive links, Record code changes, Find hollow tests | "Command output" em cada folha de resultado |
| **Activity** | O que o Atlas deu e recebeu dos agentes, evento por evento | filtro (All · Reads · Memory · Holds · Code) + lista de frases com avatar | painel do evento (o que o agente recebeu, recibo como frase, hold com motivo, evidência e próximo passo) | hashes do recibo, binding |
| **Health** | Provar que o store está são, ou dizer por quê | frase + 6 linhas: Store access · Stored objects · Proofs · Code index · Memory · Secret scanner | painéis de cada linha; Versions · Archive · Hot set (folha com orçamento) · Calibration | Command output; comando para reconstruir o índice |
| **Settings** | Quem está conectado, quem é dono, quem escreve | abas Connection · Territories · Permissions · Store | Published to agents (Served/Held, folha Republish com as pré-condições do script), Suggest territories (`init`, blast radius), What agents can use (agente × ferramenta), Import | JSON de `maestro.atlas`; Move store (export/import) |
| **Member** | O que ele carrega em toda requisição, e o que lembra de cada task | linha "Saved in this worktree, shared by the team, merged with the branch" + KPIs + Project memory (Proposals / Indexed, total de tokens) + Memory log (últimas 5) | Out of the header ("Pushed out by N later saves") · Sent with every request (facetas: Not set up yet / Nothing writes this yet) · PRs · Logbook (Maestro) | texto bruto do `<atlas-header>` e as duas formas degradadas |
| **Task** | Onde parou e como retomar | KPIs + Where it stopped | Calls · Checkpoint history (Saved · Already saved · Not saved · Couldn't reach memory · Unconfirmed) · Files changed · Transcript; Resume sem escolha de checkpoint (o Orchestra usa o último recibo da sessão; escolher na mão é R5) | sessão, eventos do log |

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
| Up to date · Changed | FRESH · DRIFTED (um fato nunca fica STALE; STALE só aparece em snapshot e em hold) |
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
| Recency · Pushed out by N later saves | frecency (posição no log inteiro) · evicted |
| Saved · Already saved · Not saved · Couldn't reach memory · Unconfirmed | admitted · reconciled · refused · unavailable · uncertain |
| Not set up yet · Nothing writes this yet | UN-SEEDED com fonte (constitution, taste) · UN-SEEDED sem fonte (mission, terrain, ontology, orientation) |
| Check a claim · Couldn't decide | verify-fact · abstain |
| Add a fact | anchors → slots → draft → check → emit |
| Froze units for a plan · Out of date (plano congelado) | atlas_context anchor · anchor-source-drift (`WORKFLOW_KNOWLEDGE_*`); `plan-grounding-stale` é só da revisão de plano do Maestro |
| Served · Held | snapshot servido · AtlasContextHeld |
| What agents can use | perfis de seat (`roster.ts`) |

## Regras de layout

- Acordeão mostra 7 linhas e depois "Show N more"; listas cheias mostram 25. As bandas do Briefing mostram tudo (é a verdade do pack).
- KPIs só em páginas de entidade (Unit, Member, Task); a Overview usa 3 cartões; telas de lista usam contagem inline.
- No máximo 2 chips por linha: estado e um entre tier (Ratified/Core), família (se não for Stated), `example` ou resultado da última execução.
- Hash só em Technical details: 8 caracteres, "…" e botão de copiar.
- Capacidade nova: um ponto de 6 px no botão com o tooltip; o rótulo "New capability · Rn" aparece só no rodapé da folha que a ação abre.
- Uma ação primária por tela. Toast com até 12 palavras e Undo; o detalhe vai para a folha de resultado.
- O teto de tokens da memória não aparece; `over-cap` só aparece quando uma escrita é recusada, e a frase diz que o teto (500 palavras) é vitalício.
- Memória não tem Undo: é append-only. A folha de indexar avisa antes.
- "Uses" não é calculado pela UI: o Atlas não tem fecho para frente, então a linha diz "Not recorded".

## Fora de propósito

`query --by trigger` (sem produtor); retomar o token do genesis (nenhum comando aceita); o roteamento DEDUP/CREATE/UPDATE/SUPERSEDE depois da escrita (não é devolvido); quem ratificou e horário de escrita (não guardados); o cabeçalho "como foi enviado" (não persistido: a prévia diz "Rebuilt now"); horário de eventos do log (só `seq`); próximo passo para os ~40+ holds sem texto ("No suggested step" e a evidência). Construído só na biblioteca, sem comando: restaurar regra (`respawnRule`), correção de logbook por link, mine com escopo, portão de segredo para fatos, avaliação viva de Tested, push por escopo, limite global de injeção, "changes together", cobertura de área core, entrevista em lote, comparar versões, trailers de commit. Só em docs: Regions, docs com drift, criptografia por seat, nível "validated".
