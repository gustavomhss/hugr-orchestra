# Maestro — base verificável L1

Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Unidade `L1-A`, S3, execução `bdac971f-e4ee-40e5-ad9b-30d659303bab`. Este corpo transporta conhecimento; não instala uma skill. É um candidato L1 para revisão, sem alegar publicação Atlas, execução do produto ou aceite L2–L4.

**Convenção de evidência.** `[C:x]` identifica `modules/maestro/coordination/x`, retirando `src/` e `.ts` quando presentes; `[A:x]` faz o mesmo em `modules/maestro/arsenal/`; `[B:path]` identifica o path completo fora desses módulos. Cada chave resolve em `sources.json` para commit, blob Git, SHA-256, captura integral e extensão da inspeção. `review-evidence.md` conserva recortes exatos decisivos. **Observação** significa código/contrato lido; **intenção** significa guia/spec; **interpretação** é a conclusão delimitada; **lacuna** registra comportamento não disponível ou não comprovado.

## 1. Missão e fronteira

**Observação.** Maestro conduz e integra: conhece a equipe, roteia trabalho, mantém vínculos de plano/aprovação/execução, recebe resultados e participa da verificação. O roster proíbe autoaprovação, autorrevisão e implementação de produto como papel do conductor. O código permite microedições medidas; não se deve converter esse charter em uma afirmação de que toda escrita do conductor é impossível. O guia direciona planejamento a `archie` e investigação a `jimmy`. [C:roster; C:v2/conductor; C:v2/team-source; B:docs/guides/maestro.md]

| Componente | Contrato e porta | Fronteira observada |
| --- | --- | --- |
| `coordination`, pacote `@orchestra/maestro` | Camada `product`; exports explícitos; roster, definições de seats, V2, playbooks e contribuição de segurança Arsenal | Compõe serviços do host. Não é um segundo executor de Sessions nem dono de uma base de Sessions própria. |
| `arsenal`, pacote `@orchestra/maestro-arsenal` | Camada `module`; exports `.` e `./server`; catálogo de operações com schemas e efeitos | Produz operações/conselhos delimitados. Permissões, processos reais, observações nativas e avaliação de conclusão pertencem ao host. |

Os manifests são privados de workspace. `coordination` depende de Core, Schema, LLM, Atlas boundary, Arsenal e Relay. O contrato documentado de camadas admite suas dependências de produto e proíbe importar composição/apps; Arsenal admite foundation/native/library. Isso é contrato de arquitetura, não relato de uma execução do checker. [C:package.json; C:README.md; A:package.json; A:README.md]

**Observação de composição.** `apps/cli/src/host.ts` entrega `MaestroSeatsV2.contribution`, seguida de continuidade e do execution host Claude; Dock é condicional. A contribuição tem ID `maestro`: troca TaskGovernance e ToolSafety, registra o host global de workflow/board e nós por Location. `Host.merge` recusa que contribuições tomem os nós reservados de SessionExecution, Session, LocationServiceMap e ScheduledTask. A execução e persistência centrais continuam no Core/composition root. [C:v2/seats; B:apps/cli/src/host.ts; B:packages/core/src/host.ts]

## 2. Identidades estáveis e disponibilidade

**Observação.** `maestro` é o ID do conductor e seu nome é fixo. Os demais seats usam o ID em roteamento, config `agent.<id>`, permissões e proveniência. Labels são apresentação; variáveis `labelEnv` podem sobrepor a config, com validação de tamanho, controles e colisões. `archie` roteia por esse ID; `upstream` é sua projeção de profile, não outro seat. O antigo ID de backend deriva de `BACKEND_DEFAULT_LABEL` e é canonicalizado para `backend` na leitura; escritas novas usam o ID canônico. O literal do label não é reproduzido aqui. [B:AGENTS.md; C:roster; C:seats/seat; C:v2/seats]

| ID | Trabalho e retorno | Perfil / disponibilidade no pin |
| --- | --- | --- |
| `maestro` | Conductor/integrator; recibo de transição/Project/merge | Agente default do Core, fora de `Seats.all`. |
| `backend` | Implementação backend; `backend-result`, schema `backend-work-result-v1` | `execution`; disponível; write roots e strict resume; toolkit backend; MCP declarado `hugr-composer`. |
| `archie` | Produto, arquitetura, especificação e planejamento; `upstream-result`, schema `upstream-work-result-v1` | `execution`, profileKey `upstream`; planner disponível; write roots e strict resume; sem execução de workflow/delegação/autoaprovação. |
| `jimmy` | Descoberta e pesquisa; `jimmy-result`, schema `discovery-work-result-v1` | `discovery`; research disponível; strict resume; produto somente leitura. |
| `lucy` | Revisão fria; cartão citado `APPROVE/FIX_FIRST/REJECT` | `review`; disponível; `approves:true`; não edita nem roda shell. |
| `live` | Copiloto de reunião usado diretamente pelo owner; sem return card | `direct`; agente primary, não despachável por Task; sem edição, comandos ou delegação. |
| `patty` | Frontend; implementação/evidência sensorial/diff | `execution`; `staffed:false`. |
| `billy` | Segurança; verdict de ameaça/controles | `review`; `staffed:false`. |
| `rosie` | Documentação; cartão de evidência | `execution`; `staffed:false`. |
| `frankie` | Auditoria de processo/ledger; verdict | `review`; `staffed:false`. |

Fontes da tabela: [C:roster; C:seats/index; C:seats/backend; C:seats/archie; C:seats/jimmy; C:seats/lucy; C:seats/live; C:seats/patty; C:seats/billy; C:seats/rosie; C:seats/frankie].

Há nove definições mais o conductor. Ausência de `staffed` significa disponível, e no máximo um seat pode declarar cada papel `research`, `planner`, `approves`. Um dispatch novo para seat não staffed é recusado; uma continuação reservada, workflow ou resume pode atravessar essa barreira, preservando trabalho retido. Estar no roster não prova qualificação nem disponibilidade de runtime instalado: falha de carregamento deixa a Location abrir com warning, sem seats nativos e com denials. [C:seats/index; C:v2/governance; C:v2/seats-service; C:v2/seats]

**Identidade de autoridade.** A spec ratificada define `ComposedActor = projectId + sessionId + memberId`; label, modelo e Task ID não substituem essa identidade. A implementação percorre Sessions persistidas até a raiz, recusa ciclo, ausência, falha de leitura e projeto diferente. `LogicalTaskV2` mantém identidade `tsk_` ao lado da Session; no resume estrito exige trabalho retido do mesmo projeto/member e filho direto do caller. Compatibilidade histórica lê autoridade antiga do pai imediato sem reescrever o evento. [B:docs/specs/hugr-maestro/actor-identity-contract.md — intenção; C:session-authority; C:v2/governance/logical-task — observação]

## 3. Portas que o consumidor deve reconhecer

| Porta | Contrato útil no L1 |
| --- | --- |
| Exports de coordenação | `./roster`, `./seats`, `./seats/seat`, `./session-authority`, `./governed-task`, `./approval`, `./task-hash`, `./work-contract`, helpers Arsenal/skills e `./v2/seats`, `./v2/seats-service`, `./v2/skill-sources`. O manifest contém a lista integral; não há export raiz livre. |
| Plugin/host | `maestro/seats` projeta definições como agentes da Location; `Host.Contribution.id = maestro` compõe a capacidade no produto. |
| Core `task` + TaskGovernance | `admit`, `beforeTurn`, `settle`; inputs adicionais `authorizationID`, `governed`, `writePaths`, `workflow`, `memoryUnit`, `effort`, `allowedDomains`, `card`, `background`. Core continua a executar a Session. |
| Ferramentas do conductor | `maestro_record_admission`, `maestro_record_plan_revision`, `maestro_catalog_context`, `maestro_record_context`, `maestro_record_validation`, `maestro_request_review`, `maestro_present_approval`, `maestro_record_approval`, `maestro_grant_authorization`, `maestro_workflows`, `maestro_record_result_decision`. A última tem a lacuna funcional abaixo. |
| Portas de seats | `maestro_record_review` pertence a `lucy`; `archie_draft_workflow` a `archie`; pesquisa pertence ao seat de research. A visibilidade é complementada por gate de identidade no executor. |
| Atlas | `atlas_context` permite leitura a Maestro e aos owners nativos suportados; `atlas_memory_recall`/`atlas_memory_emit`, header e resume pertencem aos seats com Atlas Memory. |
| Arsenal nativo | `maestro_arsenal_catalog` → `maestro_arsenal_describe` → `maestro_arsenal_execute`; Maestro nativo e upstream nativo, este restrito a operações puras de autoria. |
| Arsenal standalone | `createServer`/`start` em `./server`, MCP stdio; exige contexto explícito. CLI exige diretórios absolutos disjuntos, project ID e `--allow` para efeitos. Não abre servidor HTTP de Maestro. |
| Workflow | Publicação Relay da Location vincula definição, parâmetros, skills/âncoras e os checks finais `package-verification` e `cold-review`; host global resolve o binding durável, arm e placement. |

[C:package.json; C:v2/seats; C:v2/tools; C:v2/governance/input; C:v2/governance; C:v2/tools/gate; C:v2/atlas-source; C:v2/workflow/relay; C:v2/workflow/host; A:server; B:packages/core/src/tool/maestro-arsenal.ts]

**Persistência observada.** Os leitores `GovernanceRecordsV2` consultam eventos versionados pela tabela Core/EventV2; não escrevem essas linhas. Produtores de governança publicam via EventV2, como reservations e Task bindings. Campos e versões legadas são lidos explicitamente; revision V3 valida corpo fechado, hash e ID. O estado Arsenal fica sob `<stateDirectory>/<projectID>`, fora do repositório de produto; o host fornece e cerca esse root. Catálogo e describe não importam os handlers de I/O, que são carregados sob demanda. [C:v2/governance/records; C:v2/governance/dispatch; C:v2/governance/logical-task; A:registry; A:contract; A:governance/HOST-BINDINGS.md; B:packages/core/src/tool/maestro-arsenal.ts]

## 4. Autoridade não vem de texto ou de um ID copiado

**Observação.** Os profiles nativos são o último piso de permissões, depois da config. Review não recebe shell/edit; execution nega publish e leitura de `.env` por regras explícitas; discovery deriva suas ferramentas do descriptor do Core; direct só observa e comunica dentro do escopo declarado. Grants de skill/MCP/Atlas são adicionados por seat. O gate de ferramentas exige caller igual ao owner e owner nativo nessa Location; um agente customizado que apenas reutilize o ID não se torna seat nativo. CallerGate também avalia a permissão `task` do próprio profile antes de delegação. [C:roster; C:v2/seats; C:v2/tools/gate; C:v2/governance/caller]

**Escrita.** `writePaths` de seats com `writeRoots` é relativo ao worktree; ausente/vazio significa somente leitura. O host recusa paths absolutos, `..` e escape por symlink, canonicaliza os roots e guarda regras reservadas `tool_safety_write_root` no filho. ToolSafety relê esse vínculo a cada chamada e intersecta-o com os roots do projeto. Shell exige sandbox, scratch e ausência de fallback sem confinamento. O confinamento adicional de leitura dos seats é aplicado em macOS/Linux; o código não concede a mesma garantia de read sandbox no Windows. [C:v2/governance/write-roots]

No dispatch novo feito por Maestro, o seat que constrói trabalho rastreado precisa de `card`; um agente fora dos seats que pode escrever precisa declarar `writePaths` (inclusive `[]`), e paths em áreas de outro teammate staffed são recusados. O vínculo de card relaciona seat/Session e move Backlog/Ready para Building. O conductor exige `board_read` recente antes de write no board e leitura da issue para Task com card. [C:v2/governance; C:v2/conductor]

**Aprovação governada.** O input `governed` é opcional e explicitamente destinado a Task governada. O playbook descreve o fluxo auditável pedido pelo owner; isso não torna toda tarefa normal dependente da cadeia. A aprovação valida apresentação exata e atual, primeira resposta de usuário posterior, na mesma Session e não sintética; só as palavras aceitas pelo parser aprovam ou declinam. Decisões carregam revisão, validação, contexto, policy e task hashes. Questionamento/ambiguidade não vira aprovação. Reservations vinculam uma única child Session e permission snapshot; antes do primeiro provider turn o dispatch é revalidado ou a aprovação é consumida. Repetição incompatível não amplia escopo. [C:v2/governance/input; C:playbooks/maestro-run/governed/SKILL.md — intenção; C:approval; C:governed-task; C:v2/governance/dispatch; C:v2/governance/reservation; C:v2/governance — observação]

**Arsenal.** `ArsenalContext.authorize` exige recursos/commands concretos; schema/effects declarados não são grants. O wrapper nativo verifica identidade, descriptor previamente descrito, observações de host e efeitos pedidos. Planos, policies e diagnósticos não aprovam execução. `surfaceHash` é FNV-1a de drift, explicitamente sem compromisso de segurança. Audit/status têm limites de janela; digest de observações fornecidas não autentica prosa. O contrato do host mantém custo/pricing desconhecido como HOLD, não zero. [A:contract; A:registry; A:governance/HOST-BINDINGS.md; B:packages/core/src/tool/maestro-arsenal.ts]

## 5. Conhecimento distribuído e corpus do repositório

| Classe | Disposição no pin |
| --- | --- |
| Código compilado e nove prompts em `src/seats/prompt/*.txt` | Fazem parte do produto; cada definição importa o prompt. |
| `seat.skills` | Árvores declaradas entram no módulo virtual `orchestra-seat-skills.gen.ts`; backend/archie vêm de `modules/specialists/<id>/skills`, outros seats de `packages/<id>-specialist/skills`; `team-*` vem de `modules/specialists/team/skills`. |
| 48 arquivos `coordination/playbooks/**` | Distribuídos; inventário exato é validado por `PlaybookContent.files`. Cinco roots: `frame-request`, `maestro-orchestra`, `maestro-plan`, `maestro-repo`, `maestro-run`. Nomes de playbooks são reservados; homônimo de projeto/usuário não os substitui. |
| `docs/**`, `.orchestra/skills/**`, AGENTS | Ficam no repositório. Guias de usuário ainda não são publicados; manutenção/ownership não deve ser adicionada a `seat.skills`. |
| `script/seat.ts`, testes e fixtures | Ferramentas/evidência para contribuidores. Scaffold escreve definição, prompt, barrel e árvore inicial, mas não qualifica um especialista nem é loader de plugins em runtime. |

[B:AGENTS.md; C:seats/seat; C:seat-skills-module; C:playbook-content; C:v2/skill-sources; C:script/seat; B:apps/cli/script/packaged-skills.ts]

**Observação de packaging.** O leitor exige UTF-8 preservável, árvore completa, frontmatter/names corretos e entradas regulares sem links; referências binárias não são suportadas. O gerador inclui árvores por seat, shared e Maestro. Startup compilado extrai bytes para cache por versão/digest, valida antes de reuso e usa lock cooperativo; mantém cópias antigas para rollback. Isso não demonstra defesa contra qualquer reescrita hostil concorrente do filesystem. `build.ts` fornece os arquivos virtuais e `ORCHESTRA_SEAT_SKILLS_EMBEDDED:true`. [C:seat-skill-content; C:seat-skill-root; C:seat-skills-module; B:apps/cli/script/build.ts; B:docs/specs/seat-framework/README.md]

## 6. Limites e conflitos que o próximo nível deve preservar

- **Lacuna funcional comprovada:** `maestro_record_result_decision` sempre termina em `HOLD work-result-unavailable` após o gate. V2 carrega WorkResult no resultado estruturado de Task, mas não tem a identidade de tool-part e o registro necessários para essa decisão. Resultado do worker não é aceite durável. [C:v2/tools/result]
- **Limites de continuação:** upstream em background recusa `upstream-settlement-unavailable`; sem host de background recusa `background-unavailable`; replay autorizado que não corresponde à chamada reservada recusa `authorized-replay-unavailable`. Não há troca automática para execução sem os controles. [C:v2/governance]
- **Limite do conductor:** 10 leituras desde o último Task síncrono; budget por drain, removido em `session-idle` e novo após restart. As próprias alterações são medidas antes do próximo edit/shell contra snapshot: exceder 20 linhas ou 2 arquivos deixa a chamada que excedeu acontecer e limita as seguintes. Sem snapshots não há medição. Não é um limite atômico de patch nem durável entre processos. [C:v2/conductor]
- **Compatibilidade:** alias histórico de backend, leitura de eventos de versões anteriores e projeções históricas de profiles continuam existentes. O rótulo “Legacy and compatibility: none” do README não é descrição suficiente dessas compatibilidades internas. [C:README.md; C:roster; C:v2/governance/records; C:v2/governance/logical-task]
- **Conflito documental:** a spec de seat framework ainda afirma Atlas Memory somente para backend. `define`, as quatro definições e `MaestroAtlasSourceV2.Owner` permitem `backend`, `jimmy`, `archie`, `live`. Sua referência a `packages/orchestra/src/maestro` também é antiga. Para disponibilidade no pin, o código atual decide; a intenção histórica permanece visível. [B:docs/specs/seat-framework/README.md; C:seats/seat; C:v2/atlas-source]
- **Conflito de comentário:** `v2/seats.ts` menciona standalone sem árvores; o root reconhece `ORCHESTRA_SEAT_SKILLS_EMBEDDED` e o build standalone o define. A falha de carga é real, mas não autoriza concluir que todo standalone carece de seats. Nenhum binário foi executado neste L1. [C:v2/seats; C:seat-skill-root; B:apps/cli/script/build.ts]
- **Fronteira Claude:** o host recusa `maestro_*` governado antes de carregar `maestro-run-governed`; exclui `maestro_arsenal_*` e `maestro_workflows`. Carregar o playbook não substitui aprovação, permissões nem os gates de cada ferramenta. [B:modules/engine-adapters/claude-code/src/v2/host.ts; B:AGENTS.md]

## 7. Cobertura e ponto de partida para L2

`coverage.json` reconcilia **424 paths únicos**: 325 em Maestro e 99 associados. Classificação: 175 implementações, 75 testes, 7 fixtures/suportes, 48 playbooks, 9 prompts, 6 configs, 2 READMEs com blocos gerados, 2 licenças/attribution, 1 gerador; associados: 10 skills de repositório, 84 documentos e 5 mocks. Nada foi excluído por ser histórico, fixture ou asset. Os testes e assets são agrupados pelo contrato/gerador que explica sua função; arquivos não inspecionados mantêm essa condição e sua necessidade seguinte. Houve inspeção de 73 paths dessa população e 7 fontes de fronteira, não leitura alegada dos 424 corpos.

**Interpretação.** Esta base permite escolher o dono e a porta: identidade/roteamento em roster+seats; admissão/escopo em governance+write-roots; aprovação em approval/reservation; publicação/avaliação de workflow na ponte Relay; operações delimitadas em Arsenal; shipping em seat-skill-content/module/root. L2 deve aprofundar os contratos locais dessas famílias; L3 deve reconciliar seus fluxos com Core/Relay/Atlas/adapters; L4 deve transformar isso em manutenção e diagnóstico. São necessidades preservadas, não níveis já entregues.

**Lacuna de prova desta unidade:** inspeção estática e verificações de bytes/população apenas. Nenhum teste Bun, typecheck, checker de produto, execução de Session, build distribuído ou porta Atlas foi executado. Os testes consultados declaram controles de roster, governança, packaging e autoridade Arsenal; não recebem PASS por terem sido lidos. Os juízes e consumidores da campanha ainda precisam julgar/exercitar as obrigações de suas etapas. [C:test/roster.test; C:test/v2-task-governance.test; C:test/seat-skills-build.test; A:test/registry.test; A:test/resource-authority.test; B:AGENTS.md]
