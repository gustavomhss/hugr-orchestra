# S3 L4 — ownership e fronteiras de mudança

**Estado:** `CANDIDATE_UNRELEASED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Este artefato atribui responsabilidade no pin; não cria grants, não substitui CODEOWNERS/owner approval e não prova composição em runtime.

## 1. Regra central

Ownership acompanha a fonte autoral e a fronteira que aplica o contrato. Maestro coordena e mantém vínculos, mas não absorve implementação de produto, persistência Core, autoridade do owner, adapters, Relay, Dock ou Janitor. Um fluxo transversal deve manter vários owners explícitos em vez de escolher um “dono global”.

## 2. Matriz de ownership

| Superfície | Owner/fonte de verdade | Responsabilidade | Não possui |
| --- | --- | --- | --- |
| identidade/roster/seat profiles | Maestro coordination + composição Core | IDs canônicos, charters, staffing, floors, gates e projeção de seats | credenciais de provider, Sessions paralelas ou autoaprovação |
| aprovação e Task governada | objetos/governance Maestro sobre Session Core | revisão/hash, reply do owner, reservation, permission snapshot, admit/beforeTurn/settle | permissão genérica ou bypass de ToolSafety |
| Session e execução | Core/ExecutionHost | criar/retomar Session, turns, tool execution e lifecycle | semântica autoral de skills ou settlement Relay |
| skills de especialistas | owner da árvore `modules/specialists/<seat>/skills` ou package correspondente | conteúdo autoral e compatibilidade do seat | módulo virtual gerado ou grants externos |
| embed/extraction de skills | owner do gerador/runtime Maestro/CLI/desktop | membership, bytes, virtual module, targets, digest/cache | conteúdo de domínio da skill |
| adapter Claude | `modules/engine-adapters/claude-code` sob contratos Core | tradução do Turn, hooks, provider lifecycle e refusas provider-specific | criar autoridade, permitir Agent/Task ou substituir Session Core |
| Relay | `modules/relay` e workflow host que o compõe | profiles/policies, arms/WPs, gates, ledger/receipts e settlement | Sessions provider, credenciais Dock ou rollback de efeitos externos |
| Dock | `modules/app-dock` + composição desktop | transport/interface, canal, token por launch, lifetime/reaper | credenciais inventadas ou limpeza genérica de processos |
| Janitor | `modules/janitor` + sink do host | scan/report read-only | remover, matar, reiniciar ou resolver efeito Dock incerto |
| capability assets | `modules/capability-assets` | catálogo, provenance, source qualification e destinos reservados | conexão, autenticação, grant, conformance/live acceptance |
| Atlas Memory de seats | código Maestro/Core para owners permitidos | gates para backend/jimmy/archie/live e contexto/memória | autorização de seat arbitrário ou prova de runtime por spec |

## 3. Mudança transversal: dispatch Maestro → Claude → Relay

A mudança deve ser decomposta:

1. **Maestro/governance:** identidade, revisão, approval, reservation e caller/owner gates.
2. **Core:** child Session e lifecycle.
3. **Claude adapter:** tradução e refusas específicas; `Agent`/`Task` continua proibido.
4. **Tool owner:** schema/handler e `authorize`/`execute`.
5. **Relay/workflow:** definição, checks, receipts e settlement.
6. **Owner/reviewer:** decisão humana e revisão independente.

Nenhum desses passos autoriza o seguinte por inferência. Um playbook carregado não concede approval; uma approval não executa tool; uma tool concluída não fecha workflow; settlement não substitui revisão semântica.

## 4. Mudança de skill

- O owner da árvore autoral mantém texto e estrutura.
- O owner de `SeatSkillContent`/gerador mantém validação e captura.
- O owner de `SeatSkillRoot`/packaging mantém embed, extraction e cache.
- O owner do seat/profile mantém grants e compatibilidade de execução.
- Relay só participa quando um resultado Relay consome os bytes como input real. Link de navegação não lhe transfere ownership nem invalidação.

Editar o `*.gen.ts` diretamente cruza a fronteira errada. Colocar a orientação apenas em `.orchestra/skills` atende contribuidores, não o seat shipped.

## 5. Labels, assets e autoridade

### Label

O owner pode alterar a apresentação do backend por `labelEnv` (precedência maior) ou `agent.backend.name`; o ID `backend`, routing, config key e proveniência permanecem. Valor inválido cai para o default do roster. Maestro não é renomeável nessa superfície.

### Capability assets

Os 32 itens catalogados podem ser avaliados individualmente, mas o catálogo é data-only. Ownership do asset cobre provenance e conteúdo adaptado, não credenciais, conexão, autorização, conformance, produção ou economia. Uma pergunta que peça confirmar tudo live e estimar dólares deve receber abstention: usage/custo são `UNKNOWN` sem baseline e medição.

## 6. Atlas Memory e conflito documental

O baseline de código aceita Atlas Memory apenas para `backend`, `jimmy`, `archie` e `live`; o gate continua restrito a owner nativo/localidade. Uma spec antiga backend-only é evidência histórica/conflito documental, não motivo para apagar os três owners atuais nem para liberar qualquer seat. A manutenção correta preserva:

- código observado e descriptors atuais;
- spec/path antigo com sua época;
- limite dos quatro IDs;
- ausência de prova runtime/CI.

## 7. Handoff mínimo

Cada mudança deve registrar:

- fonte autoral e owner;
- consumidores reais e se a aresta é build, semântica ou navegação;
- IDs/Session/permission snapshot relevantes;
- gerados/cache afetados;
- checks positivos e negativos;
- receipts e estado de runtime/CI;
- conflitos históricos preservados;
- desconhecidos (`UNKNOWN`/`NOT_RUN`).

Não transfira ownership porque um diretório tem muitos arquivos, um documento o menciona ou Maestro coordenou o trabalho.
