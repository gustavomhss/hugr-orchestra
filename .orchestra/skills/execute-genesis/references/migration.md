# Continuar o Genesis com cinco domínios paralelos

## Identidade da continuação

Esta é uma mudança de protocolo da campanha **`20261111-v1`**, autorizada pelo pedido
de executar cinco fatias paralelas com juízes. Usar `protocol_epoch: parallel-v2`
e `results_epoch: 20261111-v2-parallel`. O diretório novo não significa campanha nova,
orçamento zerado, repetição do trabalho concluído ou descarte de trabalho pendente.

Manter `genesis-chatgpt-sN` e o número da conversa. Escrever a continuação em
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/sN/`.
Conservar integralmente `20261111-v1/` e seus commits. Carregar o kit v2 pelo commit
indicado no prompt; não resetar a branch para esse commit nem sobrescrever outra branch.

As atribuições por fase são substituídas pelas cinco fatias verticais de
[parallel-partition.json](parallel-partition.json). Cada uma tem inventário, produção
cumulativa, dois juízes, correções e provas do domínio. Não exigir inventário final,
quota ou liberação prévia de S1/S5 para trabalho local. Preservar dependências reais
entre artefatos; retirar as barreiras artificiais entre sessões.

**As cinco entregam ao root desta conversa principal.** `final_integration_owner`
é `root`; S5 executa somente seu domínio CLI/infra/transversal e seus juízes locais.
O root integra depois em `genesis-chatgpt-final`, branch a criar somente quando essa
execução começar, e registra o agregado sob
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.
O fechamento terá par independente próprio `integration/J1` e `integration/J2`.
Preservar a preparação histórica de S5 e entregá-la ao root; não descartá-la ao mudar
seu papel. A gravação deste kit não cria a branch final nem executa a integração.
Aplicar [completion.md](completion.md): migração e checkpoints permitem continuar,
não substituem o cumprimento de todas as obrigações da fatia.

## Procedimento de retomada sem perda

1. **Reler a branch real.** Descobrir seu HEAD e ler nele handoff v1, ledger, arquivos
   adicionados depois do último handoff e eventual migração v2 já publicada. Se v2
   existe, continuá-la; não repetir a migração ou seus despachos. Os SHAs abaixo são
   históricos, nunca autorização para voltar a branch ou ignorar commits posteriores.
2. **Capturar a evolução.** Fixar HEAD e hashes dos arquivos consumidos. O handoff pode
   apontar a orçamento antigo enquanto a branch contém revisão nova. Consumir também
   plano/ledger atual de S1 e referências econômicas usadas pela própria sessão.
   Identificar outputs concluídos, propostas, tentativas pendentes e resultados ainda
   não publicados acessíveis no contexto original.
3. **Reconciliar antes de redistribuir.** Procurar resultado durável e estado observável
   dos IDs antigos. Reutilizar handles somente se ainda existirem nesta conversa.
   Manter `IN_PROGRESS`, `RESERVED` ou `UNCERTAIN` sem prova de término. A migração não
   cancela, liquida, zera ou redespacha esses IDs. Registrar próxima reconciliação e
   continuar unidades independentes que não os dupliquem. Ausência de handle em outro
   chat não prova término da tentativa original.
4. **Aplicar o owner map.** Conservar o número da sessão, mas adotar IDs/caminhos de
   sua nova fatia. Referenciar trabalho v1 aplicável por commit/hash; encaminhar o
   restante ao proprietário correto como evidência/proposta. Não repetir inspeção
   ou geração só porque o autor antigo tem outro número.
5. **Congelar contrato e plano locais.** Definir necessidades, artefatos, fontes,
   dependências, critérios e orçamento lógico finitos. Carregar uso, reservas e
   incertezas v1; emitir revisão local quando precisar de capacidade adicional,
   com delta e justificativa. Não aguardar nova aprovação de S1 ou S5.
6. **Publicar e produzir.** Gravar `migration.json`, manifesto e handoff conforme
   [handoffs.md](handoffs.md), com payload/selagem separados e lease. Se a branch
   avançou durante a montagem, reconciliar antes da escrita. Produzir/revisar o
   domínio local sem aguardar outras sessões; depender apenas do artefato concreto
   necessário à próxima unidade. Entregar a selagem imutável ao root.

Reúso semântico exige comparar corpo, fonte, autoridade, receita, escopo, contrato
e dependências. Preservar decisões originais; a mudança de epoch não as transforma
em aprovação do novo conjunto. Se o reúso se limita à preparação/baseline, declarar
esse limite. Nenhum parecer local implica aprovação da união pelo root.

## Snapshot v1 para localizar trabalho — reler HEAD antes de usar

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo anterior:
`2689c516d63488be37de678cc853dd4556fd5c13`. O snapshot foi observado em 11/11/2026;
**não é um lock das branches nem uma declaração do estado atual das outras conversas**.

| Sessão | HEAD observado | Trabalho persistido |
| --- | --- | --- |
| S1 | `f36bdbcef001bbe681cccfb4f450899cd0f8c4f9` | Censo Git, catálogo de 50 critérios, mapa de aceitação, bootstrap-v2/48 e ledger de retomada. Inventário semântico incompleto no handoff. |
| S2 | `77d2b6df40961eda5a56dee1fed99a490a147113` | 72 arquivos: importer v2, rebuild v3, auditoria de reúso, recibos de runtime baseline. Nenhuma camada nova produzida/aceita. |
| S3 | `c9fcdb6215b9c939cedab0c044144366d4da74bb` | 87 arquivos: 13 formas de cenários, proposta de recusa, dossiês e runtime baseline compilado. Recuperação não executada. |
| S4 | `002c1efa8d8b84b45dc47736a3dab683d18ec1aa` | 78 arquivos: hosts, CI, migração, preservação histórica e três propostas. Nenhum gate funcional do candidato. |
| S5 | `adfcbc639d31d2ae01f72e58d21f2657d5c6b63c` | 247 arquivos de preparação de S1–S4 importados, fila de seis propostas, rubric e sementes de casos. Candidato não montado; sem decisões de juízes. |

Handoffs imutáveis do snapshot:

- [S1](https://github.com/gustavomhss/hugr-orchestra/blob/f36bdbcef001bbe681cccfb4f450899cd0f8c4f9/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/handoff.json)
- [S2](https://github.com/gustavomhss/hugr-orchestra/blob/77d2b6df40961eda5a56dee1fed99a490a147113/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s2/handoff.json)
- [S3](https://github.com/gustavomhss/hugr-orchestra/blob/c9fcdb6215b9c939cedab0c044144366d4da74bb/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s3/handoff.json)
- [S4](https://github.com/gustavomhss/hugr-orchestra/blob/002c1efa8d8b84b45dc47736a3dab683d18ec1aa/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s4/handoff.json)
- [S5](https://github.com/gustavomhss/hugr-orchestra/blob/adfcbc639d31d2ae01f72e58d21f2657d5c6b63c/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s5/handoff.json)

Todos tinham `candidate_revision: null` e `scope_revision: null`. S2/S3/S4 acrescentavam
somente resultados v1; patches ainda eram propostas. O `actual_head_revision` de um
recibo de execução da baseline não é o HEAD atual da branch de transporte.

### S1 avançou além de seu handoff

O [orçamento no HEAD f36bdbc](https://github.com/gustavomhss/hugr-orchestra/blob/f36bdbcef001bbe681cccfb4f450899cd0f8c4f9/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/budget-allocation.json)
é `bootstrap-v2`, emitido às `2026-11-11T14:52:57Z`: **48 unidades lógicas**, com
S1=16, S2=6, S3=10, S4=6 e S5=10. Acrescentou capacidade a S3/S5, conservou uso e
incertezas anteriores e continuava `FROZEN_PREPARATION_ONLY`. O handoff de S1 ainda
referia bootstrap-v1. Carregar esse histórico e sucedê-lo com planos locais de
continuação, sem aguardar nova liberação global de S1. Se houver revisão posterior,
registrá-la junto com a cadeia de continuidade; não escolher a revisão mais conveniente.

O [ledger no mesmo commit](https://github.com/gustavomhss/hugr-orchestra/blob/f36bdbcef001bbe681cccfb4f450899cd0f8c4f9/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/execution-ledger.jsonl)
registrava às `14:53:19Z`:

- `s1-preparation-001`, `s1-domains-product-001`, `s1-domains-platform-001` e
  `s1-economy-001`: `UNCERTAIN`, sem quota liberada, após busca sem resultado recuperável.
- `s1-resume-002`: `IN_PROGRESS`.
- `s1-domain-product-002`, `s1-domain-platform-002` e `s1-economy-audit-002`:
  `RESERVED_NOT_DISPATCHED` naquele commit.

Não presumir que os estados continuam iguais. Capturar a evolução antes de novas
unidades. Incertezas continuam vinculadas ao ledger antigo mesmo se o novo mapa
mudar o responsável pelo domínio. Registrar disposições, não reescrever o histórico.

### Reúso por domínio e pacote Atlas da nova S4

Reaproveitar o [censo de S1](https://github.com/gustavomhss/hugr-orchestra/blob/f36bdbcef001bbe681cccfb4f450899cd0f8c4f9/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/receipts/tree-reconciliation.json):
16.710 entradas, 14.442 blobs, 2.268 diretórios, nenhuma divergência de árvore. Isso
prova enumeração estrutural, não suficiência semântica. Reusar o
[catálogo de 50 critérios](https://github.com/gustavomhss/hugr-orchestra/blob/73ad904a850bdf40011a39c6823b13125cc56142/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s1/criteria-catalog.json)
sem herdar a dependência dos antigos responsáveis por fase.

A **nova S4, proprietária do Atlas**, recebe seis propostas já preparadas. A base é
`1cde2ff7a71bcf7aecb5d030917b577165135d38`; aplicação ao candidato atual exige nova
comparação. Os hashes identificam a versão observada, não atestam correção ou teste.

| Proposta | Referência imutável | SHA-256 |
| --- | --- | --- |
| Native importer v2 | [S2 / native-importer-v2.patch](https://github.com/gustavomhss/hugr-orchestra/blob/77d2b6df40961eda5a56dee1fed99a490a147113/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s2/proposals/native-importer/native-importer-v2.patch) | `b9a6d645bcf1ac345c9cca0b8c2d3d622e2d4e936a03f330f9fd3189a04a4e67` |
| Rebuild boundaries v3 | [S2 / ownership-rebuild-boundaries-v3.patch](https://github.com/gustavomhss/hugr-orchestra/blob/77d2b6df40961eda5a56dee1fed99a490a147113/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s2/proposals/rebuild/ownership-rebuild-boundaries-v3.patch) | `794aabd22be61dad3be2f55021f69098b68e11440d43c9e0b00bd7c52175c71d` |
| Recusa de falsa ativação | [S3 / rollback-activation-refusal.patch](https://github.com/gustavomhss/hugr-orchestra/blob/c9fcdb6215b9c939cedab0c044144366d4da74bb/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s3/proposals/rollback-activation-refusal.patch) | `590ecbf74b8a8cbb856904d5aa350a08dfce6ec0c8eb69d5b31de781ba81ec73` |
| Hosts Atlas | [S4 / ownership-host-entrypoints.patch](https://github.com/gustavomhss/hugr-orchestra/blob/002c1efa8d8b84b45dc47736a3dab683d18ec1aa/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s4/proposals/ownership-host-entrypoints.patch) | `309506c1e2c13cc71dc652de49f80396e08ab015f6c4bf8b5d827013f888a4e5` |
| Integração Maestro | [S4 / v2-atlas-membership.test.patch](https://github.com/gustavomhss/hugr-orchestra/blob/002c1efa8d8b84b45dc47736a3dab683d18ec1aa/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s4/proposals/v2-atlas-membership.test.patch) | `3440e6234f3aed38c426b6d0f55024339167d6d62e749b75340d26f4dcb0b2d5` |
| Escopo de CI Atlas | [S4 / atlas-workflow-scope.patch](https://github.com/gustavomhss/hugr-orchestra/blob/002c1efa8d8b84b45dc47736a3dab683d18ec1aa/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s4/proposals/atlas-workflow-scope.patch) | `f59fc15b903d7d233049dfaa10d6d0d4847803dd37a3a054963248e4dd4c4f45` |

S4 conserva autoria, recibos e versões anteriores, e coordena arquivos fora de sua
propriedade com o dono definido em `parallel-partition.json`. Isso inclui workflow
de CI e teste de Maestro: receber uma proposta não concede escrita irrestrita nesses
caminhos. Os demais resultados migram por domínio e owner map, não pelo antigo autor.

Preservar adicionalmente:

- S2 `reuse/reuse-candidates.json`, `reuse/compatibility-gaps.json`, comparações de fonte
  e recibos: 20 corpos históricos e dez arquivos de revisão verificados, além de
  suplemento e derivações corrigidas. Reúso exige disposição de compatibilidade.
- S3 `recovery-contract.md`, `case-index.json`, `cases/`, `judgment-dossier.json`,
  `judging/` e recibos. Os 13 cenários eram preparados; a proposta só recusa falsa
  ativação, não implementa rollback compatível completo.
- S4 inventários protegidos, mapas de hosts/CI/migração, casos, fontes e recibos de
  preservação. Evidência histórica e sintaxe de proposta não provam migração.
- S5 `rubric-v1.json`, `consumer-cases/preparation-v1.json`, disposições históricas,
  fila de propostas e reconciliações: material reutilizável pelo root para a união,
  mantendo autores e versões. As sementes de consumidor não são casos executados.

A [integração histórica de evidência de S5](https://github.com/gustavomhss/hugr-orchestra/blob/adfcbc639d31d2ae01f72e58d21f2657d5c6b63c/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s5/integration-manifest.json)
importou 247 arquivos, mas usou S1 de `72ef14f3393cbc1cb2c3b68e8e6f5ee28b005c76`
e S3 de `19a2bb9959f3c19c03c25ff975c97f6cb4780015`. Essa cópia não substitui
HEADs mais novos das branches de origem. Seu antigo papel de integração não permanece
como gate de S5 em `parallel-v2`.

### Execução e juízes realmente observados

S2/S3/S5 compilaram runtime da baseline com saída 0; S3 preservou a primeira compilação
falha e a correção de empacotamento de `@c4312/scip`. Leituras reais retornaram
`HOLD ownership-store-unavailable`. S4 verificou aplicabilidade/sintaxe em cópias.
Não havia camada nova aceita, consumer eval, ativação, recuperação, rollback ou CI
de candidato demonstrado nesses recibos. Conservar os estados abertos.

O [roster de S5 no snapshot](https://github.com/gustavomhss/hugr-orchestra/blob/adfcbc639d31d2ae01f72e58d21f2657d5c6b63c/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s5/judge-roster.json)
tem J1/J2 com `agent_id: null` e aguarda primeiro pacote/alocação; não registra um par
criado. Antes de iniciar pares v2, reler roster e ledger atuais. Se houver agentes
ou decisões posteriores, preservá-los e registrar a transição; o snapshot não permite
substituir agentes ativos. Os pares locais pertencem a sua fatia/epoch. O root registra
separadamente seu par independente de integração, sem convertê-los em votos globais.

## Template de recibo de migração — não executado

Publicar no novo prefixo e referir no handoff de selagem. Não inserir hash/commit do
próprio recibo dentro dele. Preencher os placeholders com dados da retomada atual.

```json
{
  "schema": "genesis-protocol-migration/v1",
  "template": true,
  "campaign": "20261111-v1",
  "protocol_epoch": "parallel-v2",
  "from_results_epoch": "20261111-v1",
  "results_epoch": "20261111-v2-parallel",
  "session": "sN",
  "branch": "genesis-chatgpt-sN",
  "final_integration_owner": "root",
  "observed_branch_head": "<SHA40 relido na retomada>",
  "observed_at": "<data UTC observada>",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "prior_handoff_ref": {"commit": "<SHA40>", "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/sN/handoff.json", "sha256": "<SHA256>"},
  "prior_ledger_refs": [],
  "observed_budget_refs": [],
  "new_protocol_ref": {"commit": "<SHA40 do kit v2>", "path": ".orchestra/skills/execute-genesis/SKILL.md", "sha256": "<SHA256>"},
  "partition_ref": {"commit": "<SHA40 do kit v2>", "path": ".orchestra/skills/execute-genesis/references/parallel-partition.json", "sha256": "<SHA256>"},
  "ownership_scope_ids": ["<id da nova atribuicao>"],
  "new_scope_ref": null,
  "new_local_plan_ref": null,
  "carried_attempts": [],
  "carried_reservations": [],
  "carried_uncertainties": [],
  "reuse_dispositions": [],
  "pending_reconciliation": [],
  "legacy_artifacts_modified": false,
  "legacy_attempts_automatically_cancelled": false,
  "legacy_usage_reset": false,
  "physical_attempts": "UNKNOWN",
  "tokens": "UNKNOWN",
  "billing": "UNKNOWN",
  "state": "PREPARING_MIGRATION",
  "acceptance_claim": "NONE"
}
```

Cada item carregado inclui `attempt_id` original, estado observado, unidade/quantidade
quando conhecidas, ledger de origem e próximo passo. Arrays vazios só são válidos
num recibo concluído se a leitura do histórico provar ausência de itens; não servem
para omitir uso ou reservas. Cada disposição de reúso identifica referência original,
novo proprietário, compatibilidade, limites e ação: preservar, reutilizar preparação,
propor aplicação, reutilizar corpo aceito com bindings ou manter pendente.

O primeiro plano local informa revisão, predecessor(es), alocação histórica consumida,
uso concluído, reservas pendentes/incertas, novas unidades por atividade, reserva de
correção e total lógico. Ampliação posterior preserva vínculos e registra o delta
antes de gastá-lo. As contas não se apresentam como medição de tokens, tentativas
físicas, cobrança ou garantia de enforcement econômico do runtime. O root carrega
suas próprias unidades de integração e juízes no agregado, sem escondê-las nas fatias.

Concluir a migração quando a continuidade estiver registrada e o trabalho local
puder avançar. Migração concluída não afirma Genesis concluído, cobertura global,
juízes satisfeitos, produto importado, CI executado ou produção ativada.

Depois de migrar, persistir e executar a fila de obrigações próprias até a entrega
completa: artefatos exigidos, dois juízes, correções e nova avaliação, consumidores
reais e gates locais necessários. Não parar no inventário, proposta, checkpoint ou
PASS semântico. `DELIVERY_COMPLETE` só descreve a fatia com essas obrigações satisfeitas;
a integração global diferida ao root não é motivo para deixar trabalho local aberto.

Uma impossibilidade real de executar obrigação local resulta em `INCOMPLETE_BLOCKED`,
com operação/rota tentada, evidência, itens afetados e condição de desbloqueio. Continuar
as demais obrigações e entregar o checkpoint como incompleto, sem renomear o bloqueio
como conclusão ou ocultá-lo na futura integração global.
