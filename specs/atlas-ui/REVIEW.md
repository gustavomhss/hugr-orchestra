# Review de fidelidade: mock × Atlas real

2026-10-18 · base `dev` @ `6ea9383245` · mock v3 (commit `2ce0cb8f03`).

Dois revisores independentes compararam cada afirmação do mock com o código do Atlas e do Orchestra. Os achados mais graves foram reconferidos no código. Caminhos relativos a `modules/atlas/packages/` (Atlas) ou `packages/orchestra/src/` (Orchestra).

Os achados se dividem em dois tipos:

- **A — Mecânica errada:** o mock descreve algo que o Atlas faz de outro jeito. Corrigir.
- **B — Capacidade que não existe:** o mock desenha uma ação que o Atlas ou o Orchestra não tem. Ou ela vira requisito novo, marcado na tela, ou sai.

---

## A — Mecânica errada (corrigir)

### Alta

1. **O pack não é "exatamente o que o agente recebe".**
   - No Orchestra, o agente puxa um **snapshot Own comitado** (`OWN-SNAPSHOT.json`) com `atlas_context unit` (`maestro/atlas-source.ts:77-84`). Nada é empurrado ao entrar na unidade.
   - O snapshot não exporta pack com fato não-FRESH (`retrieval/src/own-snapshot.ts:197-205`), e o host trava (`artifacts-invalid`) se a fonte mudou.
   - Promover, ratificar, editar ou aposentar só chega ao agente depois de rematerializar o snapshot.
   - **Correção:** rotular como "o que `atlas own` compõe agora" e mostrar a revisão e o estado do snapshot.
2. **Orçamento do pack errado.**
   - O custo é em **caracteres** (`adapter-io/src/own-bands.ts:70`). O teto é **1500 para o briefing inteiro** e o sub-teto advisory é 750 (`retrieval/src/own.ts:56,78`).
   - A ordem é governante, depois gotchas, depois ponteiros, e o advisory por último. O preenchimento **para no primeiro fato que não cabe**, e a ordenação é tier e depois nodeKey.
   - O mock contava ~4× mais e ordenava por frescor.
3. **Drift de âncora de arquivo inteiro é semântico.**
   - O conteúdo antigo do arquivo não existe mais em lugar nenhum, então todos os 63 são **semânticos**: `reconcile` sai com código 2 e bloqueia o merge, e `doctor reground` propõe **aposentar** (`adapter-io/src/doctor-source.ts:101-124, 257-263`).
   - Reemitir a mesma afirmação é deduplicado e o fato continua com drift.
   - **Correção:** "semântico, bloqueia merge" e as ações *reescrever* (draft e emit com âncora nova) ou *aposentar*. O "Ainda vale" sai.
4. **Classificar cria outro fato.** O slot faz parte do nodeKey (`knowledge/src/write/router.ts:355-361`). Um slot novo gera um nó novo, o antigo continua servido, e a escrita exige que o fato esteja FRESH.
5. **Aposentar não tira o fato da leitura.** É um emit com `authoring: SUPERSEDED`, mas nenhum caminho de leitura filtra isso. **Correção:** "marcado como substituído; continua servido".
6. **Decaimento da memória de projeto.**
   - Toda regra entra com frecency 1. A "idade" é o número de registros gravados depois dela no `memory.jsonl` **por qualquer membro** (`adapter-io/src/memory-read.ts:142-163`). Abaixo de 0,1 a regra sai, ou seja, depois de 4 registros.
   - Não existe ledger de uso, e reenviar a mesma regra não a renova.
7. **Consciência no modo Ilustrado.** Só `taste` (de `CONVENTIONS.md`) e `constitution` (dos fatos T0) têm fonte. `mission`, `terrain` e `ontology` **estão sempre sem semente** (`adapter-io/src/awareness-store.ts:23-26`).
8. **"Privado do membro" é falso.** MEM-1 é escopo de injeção, não controle de acesso. Quem lê o repositório lê toda a memória de todos (`docs/reference/atlas-memory.md:121,140`).

### Média

9. **Editar acrescenta, não substitui.** Um UPDATE advisory no mesmo tier soma a nova afirmação ao conjunto (`knowledge/src/write/upsert.ts:332-336`). Se a afirmação citar outros símbolos, a âncora muda e nasce um nó novo.
10. **Ratificar.**
    - T1 pede qualquer `ATLAS_RATIFY_TOKEN` não vazio; T0 pede o literal `billy` (`knowledge/src/ratify/ratify.ts:142-144`). É um nome, não uma credencial.
    - Subir o tier **substitui** as afirmações.
    - O nó não guarda quem ratificou, então "Ratificado por Maestro / por você" não tem fonte.
11. **Dependentes são fatos, não arquivos.** As linhas `dependent` do `own` são nodeKeys de fatos no fecho reverso do SCIP, com no máximo 8, e sem `index.scip` não existe nenhuma (`adapter-io/src/own-source.ts:185-210`).
12. **Falta a banda de gotchas.** Fatos T1 ou acima com slot `gotcha` ou `rationale` vão numa seção própria (`adapter-io/src/own-bands.ts:44-81`).
13. **Unidades e níveis.**
    - `OwnLevel` é só `crate | module | service | feature`. "folder" e "repo" não existem.
    - O dono do pack vem do `policy.json` e o tier é o mais estrito arquivado, não o do território.
    - No Orchestra, as unidades são as do snapshot.
14. **Palavras-chave T0.** São fixas no código (`auth, payments, secrets, kms, crypto, billing`, em `knowledge/src/ratify/tier.ts:31`), casam com **segmentos de caminho de território** e não fazem parte da política de escrita.
15. **Minerar.**
    - O escopo é ignorado: minera o repositório inteiro.
    - Os braços são os três juntos, ou exatamente um via `ATLAS_MINE_SLOT`.
    - `symbol` **adiciona** sites, não substitui.
    - O orçamento é **por braço** (até 600 sites no padrão).
    - O custo de US$ 0,10 por site não tem fonte.
16. **Cabeçalho injetado.**
    - O formato real é `<atlas-header member rules rule-words>`, com `- mission: unseeded`, `none recorded` e `- [scope] rule` (`maestro/atlas-header.ts:38-58`).
    - Ele vai em **toda requisição ao provedor**, não "por turno".
17. **Memory log.**
    - É um registro por checkpoint, agrupado por `taskId`. A sessão (`task_id`) é proveniência.
    - Recusas não ficam no `memory.jsonl`: só existem nos recibos da sessão.
    - O status (Concluída / Pausada / Bloqueada) é inferência da interface, não algo do Atlas.
    - "O que volta no resume" é o último recibo admitido **naquela sessão**. Sem recibo, o Atlas escolhe o registro único ou recusa (`ambiguous`).
18. **Compactação.** No run D, uma compactação automática aplicou e tirou o fold da visão do agente. O restore está ligado no código (`7dba2cbc3c`, `session/prompt.ts:1225`), mas nunca foi observado ao vivo.
19. **PR memory.** `knowledgeDelta` precisa ser `object[]` (as strings do mock seriam recusadas com `template-invalid`). Nada no Orchestra produz PR memory, e o logbook só existe para o Maestro, que não está ligado.
20. **Chat.** Os recibos mostrados são inventados: os runs reais não chamaram `atlas_context`, o recibo não tem contagem de tokens nem campo "scanned", e não existe `@atlas` no composer.

### Baixa

- **link sameAs:** os dois nós continuam (não são "respondidos como um só"), a autorização vale para a classe inteira, e um par retratado não pode ser religado.
- **Portões:** a ordem real é truth, authz, âncora, incumbente e ratify. Não existe "shape primeiro". O braço advisory do mine não tem portão de verdade.
- **"Inside":** o limite é 16 escopos (`FINER_CAP`).
- **Scanner de segredos:** gitleaks pinado, com fallback para gitleaks ou trufflehog no PATH. Sem scanner, a gravação é recusada com `scanner-unavailable`.
- **Histórico:** datas, "quatro passadas" e "promovido como Maestro" são inferidos. O ator da política é `seat:orchestrator`.
- **"Versionada com o repositório":** só se o projeto rastreia `.atlas/memory.jsonl`. O Orchestra não comita.
- **Export:** grava só o CAS. O import só funciona num store vazio.
- **Código morto:** `views-more.js:80-113` foi sobrescrito por `views-memory.js`. Apagar.

---

## B — Capacidade que não existe (decisão do owner)

| # | No mock | No Atlas / Orchestra hoje |
|---|---|---|
| B1 | Memória de projeto com **Proposals → Index** e "Add rule" pelo steward | O próprio membro grava a regra (`atlas_memory_emit` kind `project`) e ela é admitida na hora. Não existe proposta nem aprovação. A ferramenta só roda para o membro dono. |
| B2 | **Arquivar / Restaurar** regra | A saída do cabeçalho é calculada na leitura. Não existe ação. |
| B3 | **Promover candidato por linha** e "Deixar no staging" | `atlas promote` não recebe argumentos e assenta **todo** o staging. O staging não tem marca nem remoção. |
| B4 | **Fila de propostas de ratificação** (proposto por Lucy ou Archie, rejeitar) | Não existe `proposedTier` nem rejeição no Atlas. |
| B5 | **Declarar território** pela interface | O catálogo é um JSON comitado e editado à mão, sem porta de escrita. |
| B6 | **"Respawnar com esta memória"** como botão | Só o Maestro chama `task` com `memoryUnit`. O replay de transcript (`@atlas/persist`) não está ligado. |
| B7 | Mostrar **quem ratificou** | O nó não guarda o ratificador. |

**Recomendação:** corrigir todo o grupo A agora. No grupo B, manter só o que você quer como produto (B1, B3 e B6 parecem centrais), marcando na tela "requer capacidade nova", e registrar cada um como requisito para o Atlas ou o Orchestra. O que você não quiser sai do mock.
