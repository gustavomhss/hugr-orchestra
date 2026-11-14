# Proposta de navegação da futura união S1

**Estado: proposta preparatória de S1-03; nenhuma entrada global, união ou versão externa está aceita por este documento.** A coordenação S1 é a autoridade para selecionar os cinco handoffs, corpos, recipes, roots, predecessores e pareceres. Este produtor só propõe rotas concretas para encontrar a evidência de cada necessidade.

| Identidade conhecida | Pin ou valor real |
|---|---|
| Repositório | `gustavomhss/hugr-orchestra` |
| Fonte de produto | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Kit de divisão/navegação | `70234d541a9a3539935ef16f19e33c8f2d5f30ec` |
| Herança | `a8df22ae3a140c58c63f62ce2a634c84f415c943` |
| Execução local | `34269cf4-d631-41c5-a30b-85b0ec217390` |
| Dono da união S1 / branch | `S1_COORDINATION` / `genesis-fresh-s1` |
| Dono global posterior / branch | `ROOT` / `genesis-fresh-final` |
| Versões aceitas selecionadas por esta proposta | **NOT_SELECTED** |

Os links K abaixo são arquivos **capturados no commit exato do kit**, com Git blob e SHA256 em [captures.json](captures.json). Não são links inventados para handoffs que ainda não foram lidos. A descrição `NOT_STARTED`/`PREPARED_NOT_EXECUTED` nesses arquivos é o estado histórico do kit, não uma consulta ao progresso atual das outras sessões. [K01–K08 em evidence.md]

## 1. Diretório de donos e keys reais

| Dono/subfatia | Branch e quantidade de fontes no kit | Keys L1 históricas atribuídas | Autoridade de navegação pinada |
|---|---|---|---|
| S1-01 — sessões | `genesis-s1-sessions`; 555 | `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.persistence`, `s1.core.context`, `s1.core.configuration`, `s1.core.project`, `s1.core.models`, `s1.core.economy`, `s1.core.runtime` | [Mission 01][k1] |
| S1-02 — ferramentas | `genesis-s1-tools`; 424 | `s1.core.tools`, `s1.core.security`, `s1.core.extensions`, `s1.core.capability` | [Mission 02][k2] |
| S1-03 — automação | `genesis-s1-automation`; 462 | `s1.core.automation`, `s1.core.research`, `s1.core.boundaries`, `s1.core.entry` | [Mission 03][k3] |
| S1-04 — API | `genesis-s1-api`; 472 | `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.session-contract`, `s1.api.server-edge`, `s1.api.stream-contract`, `s1.api.client-projection`, `s1.api.codegen`, `s1.api.sdk-composition`, `s1.api.surface-disposition` | [Mission 04][k4] |
| S1-05 — bibliotecas | `genesis-s1-libraries`; 323 | `s1.runtime.llm_turns.l1`, `s1.runtime.llm_providers.l1`, `s1.runtime.llm_recording.l1`, `s1.runtime.plugin.l1`, `s1.runtime.codemode.l1`, `s1.runtime.codemode_openapi.l1`, `s1.runtime.effect_sqlite.l1`, `s1.runtime.http_recorder.l1`, `s1.runtime.guides_intent.l1`, `s1.runtime.maintenance_intent.l1` | [Mission 05][k5] |

A [partição][kp] atribui exatamente 36 keys históricas e 2.236 paths a donos, sem heurística por prefixo. A soma de quantidades serve para conferir cobertura futura; não demonstra qualidade, compreensão ou fechamento. A nova chave **`s1.subslice03.support`** é uma contribuição local deste despacho, não uma 37ª key histórica fingidamente encontrada no kit. Ela reconcilia as 104 fontes locais antes roteadas por `s1.core.entry`.

## 2. Entrada proposta por necessidade

Esta tabela é uma recomendação editorial fundamentada na divisão real. Um leitor inicia pela necessidade e encontra o dono e o contrato que deve ser lido. O preenchimento de versão aceita fica reservado à coordenação.

| Necessidade | Pergunta de navegação | Entrada local ou key do dono | Complemento que decide o limite | Estado da seleção |
|---|---|---|---|---|
| `entry` | Como localizar serviço, schema, export, fixture e gerador do Core? | S1-03: `s1.core.entry` histórico preservado; novo `s1.subslice03.support` local | S1-01/02/04/05 precisam fornecer as entradas de seus recortes; a coordenação escolhe o índice global | NOT_SELECTED |
| `component` | O que o adaptador Core entrega a Atlas/Relay/RAG? | S1-03: `s1.core.boundaries` e `s1.core.research` | Obrigações `external-boundaries` e `runtime-and-package-closure`: S3/S4/S5; keys externas não fornecidas pelo kit, portanto não preenchidas | NOT_SELECTED |
| `flow` | Quando scheduling/Board/Actions admite, executa e conclui? | S1-03: `s1.core.automation` | S1-01: `s1.core.session-admission`, `s1.core.session-execution`; S1-02: `s1.core.tools`/`s1.core.capability` quando há chamada | NOT_SELECTED |
| `flow` | O que move-session faz e quem paralisa o runner? | S1-03: `s1.core.boundaries` | S1-01: `s1.core.project`, `s1.core.session-execution`, `s1.core.context`, `s1.core.persistence` | NOT_SELECTED |
| `ownership` | Quem controla identidade, trust, sandbox e permissão de ferramenta? | S1-02: `s1.core.security`, `s1.core.tools`, `s1.core.capability`, `s1.core.extensions` | S1-01: Session/execution; S1-03: ports/gates observados, sem transferir ownership | NOT_SELECTED |
| `operational` | Como interpretar hold, checkpoint, recibo, replay e indisponibilidade? | S1-03: `s1.core.boundaries`; S1-01: `s1.core.persistence`, `s1.core.session-execution` | S3 para engine Relay; S4 para capacidade/qualificação do runtime; identidade por candidato/caso continua obrigatória | NOT_SELECTED |
| `component` | Qual o contrato HTTP/SDK vigente, inclusive vocabulário de prompt? | S1-04: `s1.api.schema-contracts`, `s1.api.session-contract`, `s1.api.server-edge`, `s1.api.client-projection` | S1-01 para comportamento da Session; `api.html` local é intenção histórica | NOT_SELECTED |
| `flow` | Como turno/tool/result da biblioteca é adotado pelo host? | S1-05: `s1.runtime.llm_turns.l1`, `s1.runtime.llm_providers.l1`; S1-01: `s1.core.models`, `s1.core.session-execution` | `LLM-tool` e `C-N02`; existência da biblioteca não prova adoção | NOT_SELECTED |
| `maintenance` | Onde mudar exports, SQL/migrações, cliente gerado e schema de configuração? | S1-03: `s1.subslice03.support`; S1-04: `s1.api.codegen`; S1-01: `s1.core.configuration`, `s1.core.persistence` | S1-05: `s1.runtime.effect_sqlite.l1`, `s1.runtime.maintenance_intent.l1`; obrigações `C-N05`/`C-N02` | NOT_SELECTED |
| `evidence` | O que é fixture preparada, replay, teste executado ou prova de plataforma? | S1-03: `s1.subslice03.support`; S1-05: `s1.runtime.llm_recording.l1`, `s1.runtime.http_recorder.l1` | S4 fornece release e capacidade exatos; owners dos testes fornecem recibos reais compatíveis | NOT_SELECTED |
| `maintenance` | Como atualizar toolkit, pacote vendorizado ou superfície externa? | S1-03: `s1.core.research`, `s1.subslice03.support` | Dono do engine/release selecionado pela coordenação; pin/digest/gerador e licença precisam continuar identificados | NOT_SELECTED |
| `ownership` | Quem pode aceitar a união dos cinco recortes? | `S1_COORDINATION`, branch `genesis-fresh-s1` | Dois julgamentos independentes da união e closure; ROOT recebe S1 para integração global | NOT_SELECTED |

Os needs orientam acesso à evidência. A presença de um need na tabela não afirma que L2/L3/L4 daquele dono já existe ou foi aceito. Esta produção entregou somente L1 e esta proposta.

## 3. Cross-flows concretos que a coordenação deve reconciliar

### 3.1 Automação → admissão → execução

**Observação do kit.** `automation-admission` atribui a S1-01 o fornecimento a S1-03 da distinção entre admissão, execução/conclusão e cancelamento em Actions/agendamento/Board. **Proposta.** A união deve ligar `s1.core.automation` às versões aceitas de `s1.core.session-admission` e `s1.core.session-execution` somente quando o conteúdo exigir essas garantias. `capability-schedule.ts` substitui o runner na fixture; esse caso isolado não pode preencher a lacuna de execução de Session. [kd; S18]

### 3.2 Workflow → publicação/skills/Atlas → settlement

**Observação local.** Core verifica publicação pinada, materialização de skills/âncoras, pending fence, identidade de assistant message e recibo de disposition; currentStep é leitura sem avanço. **Proposta.** `s1.core.boundaries` deve ser a entrada do lado Core, com links selecionados de S1-02 para autoridade de skills/capability e de S1-01 para a Session. O lado externo Relay/Atlas/Omni exige a evidência aceita dos donos indicados em `external-boundaries`; esse kit nomeia fornecedores S3/S4/S5, mas não fornece suas keys/versões. Esses campos permanecem ausentes, não são preenchidos com UUID, hash ou `package_ref` fictício. [B15–B20; kd]

### 3.3 MoveSession → Location → API

**Observação local.** Aplicar no destino, publicar evento e limpar origem não compõem uma transação única; o adaptador não coordena runner. **Proposta.** Rotear o reader para `s1.core.boundaries`, depois `s1.core.project`/`s1.core.session-execution`/`s1.core.context` e, para caller HTTP, `s1.api.session-contract`/`s1.api.server-edge`. A aceitação integrada precisa conservar a falha pós-evento e dizer onde a exclusão do caller é garantida. O nome “move” ou um teste preparado não fornece essa garantia. [B03; obrigação API-session em kd]

### 3.4 Host → bibliotecas → schemas e geração

**Observação do kit.** `C-N01-host` põe loader/trust/permissões em S1-02; `C-N01-session`, `C-N02` e `C-N05` dão a S1-01 execução, adoção/persistência e configuração. S1-05 consome esses complementos. **Proposta.** Registrar esses vínculos ao lado de `s1.runtime.plugin.l1`, `s1.runtime.llm_providers.l1`, `s1.runtime.effect_sqlite.l1` e `s1.runtime.maintenance_intent.l1`, distinguindo guia de implementação e adoção. Para contrato público/SDK, passar por `s1.api.codegen` e `s1.api.sdk-composition`. Os helpers exportados pelo Core e o snapshot SQL são suporte à mudança, não nova autoridade global. [kd; S01–S07]

## 4. Como preencher versões sem criar referências falsas

**Intenção da proposta.** Quando um handoff real for recebido, a coordenação pode preencher o registro abaixo a partir de bytes e decisões observados. Os campos vazios expressam seleção ainda não feita; não são objetos válidos de referência a serem importados agora.

```json
{
  "status": "PROPOSED_NOT_ACCEPTED",
  "kit_revision": "70234d541a9a3539935ef16f19e33c8f2d5f30ec",
  "artifact_key": "s1.core.boundaries",
  "owner": "S1-03",
  "selected_version_status": "NOT_SELECTED",
  "selected_payload_commit": null,
  "selected_body_sha256": null,
  "accepted_judgments": [],
  "accepted_predecessors": [],
  "runtime_binding": null
}
```

O mesmo formato de estado pode acompanhar as rotas, mas não impõe uma nova schema ao produto. Após observação real, a seleção precisa identificar body exato, recipe, fonte, decisão dos dois juízes, dependência semanticamente necessária e runtime quando a capacidade o exigir. SHA de captura de fonte não substitui nenhum desses campos.

**Observação do kit.** Os paths contratuais de handoff são:

| Dono | Path esperado no kit, cuja existência/versão atual esta proposta não atesta |
|---|---|
| S1-01 | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/01-sessions/handoff.json` |
| S1-02 | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/02-tools/handoff.json` |
| S1-03 | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/handoff.json` |
| S1-04 | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/04-api/handoff.json` |
| S1-05 | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/05-libraries/handoff.json` |

Esses são destinos declarados em [dependencies.json][kd], não links para conteúdo não observado. Branch de owner não é commit pinado de payload. A união deve observar payload e selo, reconciliar avanços, conferir os 2.236 paths e selecionar roots/closure sem publicar “S1 completa” a partir deste recorte de 128 fontes.

## 5. Contribuição concreta entregue por este produtor

- [bodies/boundaries.md](bodies/boundaries.md): candidato `s1.core.boundaries`, lado Core das 24 fontes atribuídas.
- [bodies/support.md](bodies/support.md): candidato novo `s1.subslice03.support`, reconciliação dos 104 paths locais de suporte.
- [history/entry.md](history/entry.md): corpo `s1.core.entry` inteiro preservado, SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`; não transformado em união.
- [coverage.jsonl](coverage.jsonl), [captures.json](captures.json), [evidence.md](evidence.md) e [evidence-review.md](evidence-review.md): disposição e prova literal para julgamentos reais posteriores.

O roteiro pode ser consumido imediatamente como proposta de navegação. Aceite de união, criação de dependências de build, seleção de versões, import/publication Atlas e camadas L2–L4 permanecem ações futuras da autoridade competente, não efeitos deste arquivo.

[k1]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/01-sessions/mission.json
[k2]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/02-tools/mission.json
[k3]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/mission.json
[k4]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/04-api/mission.json
[k5]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/05-libraries/mission.json
[kp]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/partition.json
[kd]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json
[kr]: https://github.com/gustavomhss/hugr-orchestra/blob/70234d541a9a3539935ef16f19e33c8f2d5f30ec/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/roster.json
