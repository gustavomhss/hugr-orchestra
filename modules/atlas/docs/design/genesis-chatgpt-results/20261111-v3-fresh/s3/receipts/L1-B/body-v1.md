# Relay — L1: superfícies, contratos e limites verificáveis

**Unidade L1-B, S3.** Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Execução: `bdac971f-e4ee-40e5-ad9b-30d659303bab`. Este corpo descreve código e documentação nesse pin; não declara execução do produto, aprovação independente, publicação Atlas ou implantação. Caminhos abreviados abaixo são relativos a `modules/relay/`; caminhos iniciados por `packages/`, `docs/guides/`, `specs/relay-langgraph/` e `.orchestra/` são da raiz. `sources.json` vincula fonte, commit, blob Git, SHA-256 e captura exata; `review-evidence.md` fornece trechos decisivos.

## 1. O que existe e quem decide

Relay avalia checklists ordenados de work packages (WPs), decide avanço/repetição/escalada e registra fatos num ledger encadeado. O resultado vale para os controles efetivamente declarados e executados. Uma declaração do agente, um comando trivial, um hash íntegro ou um rótulo “review” não comprovam qualidade geral. Sprint é o plano; WP é uma unidade com ID estável; macro agrupa WPs planos. A ordem do array continua sendo a ordem de execução. Keep-best refaz controles anteriores aceitos; não congela arquivos nem restaura snapshots. [`README.md`; `SPEC.md:21–55`; `src/arm/round.ts:107–211`]

Há três superfícies que não se substituem:

| Superfície | Entrada e consumidor | Autoridade e limite |
|---|---|---|
| Motor nativo TypeScript | `src/index.ts` e exports explícitos de `package.json`; Core/Server da Orchestra | `ArmCreate/Load/State/Evaluate`, `GateControl/Check`, `Ledger*`, `RelayAudit`, authoring, judge e hooks. O módulo recebe portas de shell/Git/judge; Core injeta processo, sandbox, projeto, chave e configuração. |
| Drivers shell e ferramentas Python standalone | `bin/relay-arm-hook.sh`, `bin/relay-gate`, `lib/relay-gate.sh`, `bin/relay`, daemon e ferramentas | Contratos próprios, preservados como ferramentas e oracles de regressão. CLI não administra agentes; daemon usa o CLI. Existência dessas ferramentas não implica que a UI nativa as execute. |
| Integração Python LangGraph | `lib/orchestra_relay.gated()` e CLI do pacote | Reescreve arestas estáticas para inserir approval/check/retry; ledger externo é autorrelatado, SHA-256 simples. É implementação atual distinta do antigo serviço Python de authoring. |

A cadeia nativa instalada usa Server `HttpApi`, `RelayDocuments` e o store de projeto `<Global.data>/relay/<projectID>/authoring.sqlite3`. O antigo par `bin/relay-api` / `lib/relay_authoring/cli.py` foi retirado; os módulos restantes de `relay_authoring` sustentam regressão/paridade, não as rotas instaladas. Não classificar todos os arquivos Python como aposentados. [`docs/python-runtime-disposition.md`; `packages/core/src/relay.ts:174–193`; `packages/server/src/handlers/relay-document.ts`]

## 2. Mapa contratual das famílias

`coverage.json` atribui todos os 3.700 caminhos a uma disposição, família e need do enum Atlas. Este mapa reúne necessidades; não transforma cada arquivo golden em uma necessidade nova.

| Família / entradas | O que entra → o que sai; fronteira útil |
|---|---|
| Arm e estado — `src/arm/*`, hook shell | Token, sprint, metadados, estado e avaliação → posição, ledger, feedback e disposição. Identidade, lock, retries e release pertencem à avaliação. |
| Gate e JSON — `src/gate/*`, `src/json.ts`, `lib/relay-gate.sh` | Checklist selecionado, workdir e parâmetros → veredictos/falhas nomeadas. JSON estrito e writer compatível com jq têm regras próprias; não trocar serialização de bytes assinados por `JSON.stringify` casual. |
| Ledger e auditoria — `src/ledger/*`, `src/audit.ts`, `bin/relay`, `benchmark/verify_ledger.py`, `bin/relay-note` | Registro → cadeia; cadeia/plano → integridade, controles, drift, problemas e uso. `relay-note` pertence ao gate-core, não concede autoridade ao chamador. |
| Judge — `src/judge/*`, `benchmark/judge.py`, `calibrate_judge.py` | Critério/contexto → resposta/votação ou indisponibilidade. Stub e calibração não são revisão independente. |
| Authoring — `src/authoring/*`, `lib/relay_authoring/*` | Documento/skills → sprint ou snapshot hook, diagnósticos, versão publicada. Store nativo usa adaptadores SQLite Bun/Node; o Python fica como referência de regressão. |
| Hooks — `src/hook/*`, `src/authoring/hook.ts` | Instalações habilitadas + evento → ações ordenadas. Planejador puro; Core aplica efeitos e permissões. Hook não é o workflow que Maestro executa. |
| Profiles — `bin/relay-profile.py`, `profiles/*.yaml` → `*.sprint.json` | YAML é fonte; JSON vizinho é compilado. Critério sem mapping gera lacuna, não controle fictício. Compilar um campo/kind não prova suporte pelo driver. |
| Policies — `bin/relay-policy.py`, `policies/*` | Bundles → controles prependidos a cada WP. Preprocessamento é explícito, não obrigatório em todo harness. Há conflito real de IDs repetidos com lint/audit. |
| Spec library — `bin/relay-spec.py`, `specs/*` | `meta.json+sprint.json` parametrizados → instância, lint e comparação de emenda. Não executa os controles; atribuição `--signed-by` não é assinatura criptográfica. |
| Autodecompose — `bin/relay-autodecompose.py` | Coleta pytest → draft por arquivo/nodeid, com cap e rollup. Precisa revisão humana de cobertura; coleta não equivale a execução dos testes. |
| Daemon — `bin/relay-daemon.py` | HTTP eval/ask/answer → CLI e arquivos persistentes. Não é host nativo de authoring nem fronteira autenticada. |
| Telemetria — `bin/relay-corpus.py`, `relay-dash.py` | Traces retidos → registros/estatísticas e visão de frota. Corpus exclui cadeias quebradas; dashboard é leitor. Integridade não autentica autoria nem calcula cobrança real. |
| Planning — `tools/criterion`, `tools/edd/*` | Artefatos de plano → critérios mecânicos; graph sugere ordem/conflitos. `criterion` trata SKIP/ausência como falha, sem decidir mérito do plano. |
| Specification / design — `tools/spec/spec-check`, `tools/design/design-check` | Registries/rastreabilidade e mapa de intenção → checks estruturais, quotes e reconciliação. Não provam escolha dos requisitos, valor dos cenários ou ausência de steering sutil. |
| Research — `tools/research/*` | Captura datada/hasheada, registros, memo e comandos → verificações/replay. Snapshot prova os bytes recuperados; não a verdade da fonte. Replay compara saída stripped ou só exit quando isso foi explicitado. |
| LangGraph — `lib/orchestra_relay/*` | Builder + gates → grafo instrumentado e ledger externo. Limites específicos na seção 7. |
| Benchmark / exemplos | Drivers, campanhas, judge_cases, results; `demo/*`, `examples/fleet-chain/*` | Entradas e evidência de experimentos/scripted runs. Não demonstram qualidade de modelo, sigilo de holdout ou fan-out confiável por existência. |
| Governança e docs — `AGENTS.md`, `docs/skills.json`, skills, index, checkers | Catálogo roteia ownership/testes/dependências; checks de docs verificam estrutura e hashes. Revisão fria requer pessoa/agente distinto; texto de skill não a impõe mecanicamente. |
| Empacotamento e compatibilidade | `package.json`, `bunfig.toml`, `tsconfig.json`, requirements, metadados | Superfícies públicas e ambiente de desenvolvimento. Dependências runtime diretas do pacote: Schema e Effect; `#sqlite` resolve por runtime. |

Fontes das linhas de tooling: `docs/skills.json:3–30`, `docs/python-runtime-disposition.md`, cabeçalhos/contratos dos executáveis capturados; fronteiras de quoting e emenda em `docs/spec-library.md:19–52`; políticas em `docs/guardrails.md:9–62`. O catálogo cobre `bin/lib/tools/benchmark/demo/examples`; não é inventário completo do motor TS.

## 3. Entradas e semântica dos controles

Exigir IDs de WP estáveis e controles globalmente únicos ao autorar. `checklist` ausente/null/[] pode produzir avaliação sem controles; nonarray é defeito de extração. ID de controle vazio/NUL ou assert inválido interrompe antes desse controle; veredictos anteriores podem existir. Controles comuns rodam em ordem declarada, sem parar numa falha ordinária; falha de registro obrigatório interrompe a sequência. [`src/gate/control.ts:71–99,197–220`; `lib/relay-gate.sh:248–278`]

- **`cmd`:** não vazio prevalece sobre `judge`; o status final do programa inteiro decide. `false; true` pode passar. Tabs/LF internos e finais fazem parte do programa/oracle. `assert` é texto de relatório, não código decisor.
- **`judge`:** sem cmd válido, usa critério/contexto e opcional diff/paths. Falha semântica bloqueia apenas com `blocking:true`; default é advisory. Critério/scope declaradamente inválidos são falhas nomeadas. Falha de aquisição de diff em item advisory continua advisory.
- **`host_check` nativo:** o gate-core deixa ao arm; o dry check falha sem registrá-lo. Arm chama callback registrado, na ordem dos controles. Só status pass passa; callback ausente, erro, resposta fora do schema ou timeout de 60 s falham. Guarda `host_check`, revision e event_id da proveniência; oracle é hash de `host_check:<nome>`.
- Campos `type`, `model`, `rubric` e `output_contract` não instalam um avaliador tipado nos drivers shell. `self_check` só fornece perguntas. Review só lembra leitura fria; não cria outro contexto. `human` é aceito pelo compilador de profiles mas o arm o trata como kind desconhecido.
- Hash de oracle comum cobre cmd exato, ou critério mais paths brutos; não inclui `blocking`, contexto, modelo, base ref ou todo o plano. `artifact` opcional resume paths/conteúdo/ausência, não o diff completo.

[`SPEC.md:64–113,192–207,327–336`; `src/gate/control.ts:246–290`; `src/gate/check.ts:74–96`; `src/arm/round.ts:252–293`]

O judge TS lê somente `relay.judge.*`, com backend stub/api; não herda credenciais do provider nem oferece CLI. API não segue redirects; timeout de uma chamada é 60 s. Voto exige maioria estrita; empate falha e amostra indisponível aborta o ballot. Truncamento é voto com evidência parcial. O prompt que diz “independent auditor” não comprova independência: registros levam `non-independent`. Python standalone conserva stub/api/cli e seleção por ambiente; não transportar esse contrato para o nativo. [`src/judge/config.ts:8–65`; `src/judge/api.ts:45–82`; `src/judge/ballot.ts:43–69`; `SPEC.md:265–309`]

## 4. Drivers, execução e estado

| Driver | Controles atuais e regressões | Estado/saída |
|---|---|---|
| Arm TS | Checklist; anteriores cmd e host_check com pass registrado, sem repetir host check já capturado na mesma avaliação. Sem DoD legado. | Token explícito; posição por ID. Outcomes estruturados, incluindo busy/refused/defect/parked/noop/revision-drift. `all-gates` pode percorrer gates sob o mesmo lock. Só `complete` remove o HOLD de conclusão. |
| Arm shell | Checklist; cmd anteriores com pass registrado. | Prefere agent_transcript_path existente; token explícito ou marcador único. `position` é ID; counter é espelho. Bloqueio JSON pede continuação; stdout vazio e exit 0 também podem ser recusa, defeito, conclusão ou escalada. Lock ocupado: exit 3. |
| `relay-gate eval` | Checklist atual, depois DoD; depois todos os cmd/checklist e DoD anteriores. | Counter inteiro; 0 advance/complete, 1 gate-fail, 2 escalate, 3 busy. Escalada não cria latch awaiting-human do arm. Erro de entrada pode não ter JSON. |
| `relay-gate check` | Só checklist selecionado; sem regressão. | Não registra veredictos, avança ou cobra retry; ainda executa efeitos dos comandos/judge e cria/adquire lock. Posição nomeada sobrepõe counter. |
| Benchmark hook | DoD atual, depois checklist; regressão só DoD anteriores. | Counter inteiro; `RELAY_GATE=off` avança sem controles. Não generalizar seus dados ao runtime nativo. |

[`src/arm/evaluate.ts:24–63,116–126,222–254`; `src/arm/round.ts:107–211`; `SPEC.md:39–55,385–391`; `bin/relay-gate:183–325`; `bin/relay-arm-hook.sh:40–100,583–608`; `benchmark/relay_hook.sh`]

**A porta instalada decide isolamento e timeout.** Core executa shell novo via AppProcess/ToolSafetySandbox, ambiente sem extensão automática, PATH/HOME e params filtrados; não passa RELAY_* do processo, chaves do provider nem ledger key. `GATE_TIMEOUT` atual é **15 minutos por check de workflow**; hook Verify e Test now têm **60 s**; host_check e judge API têm seus 60 s próprios. O shell standalone não fornece timeout de comando. Comentários antigos de `GateShell`/PARITY sobre RELAY_* e 60 s não substituem Core atual. [`packages/core/src/relay.ts:38–48,219–257`; `src/gate/shell.ts:14–28`; `SPEC.md:98–101`]

ArmCreate cria por staging+rename e aceita repetição idêntica, recusando conflito do mesmo token. Rebind nativo exige arm ainda não avaliado, bytes iguais, execução compatível e run lock; não é migração arbitrária de um run. Loader recusa symlink/tipo/tamanho acima de 512 KiB e mudança de tamanho/mtime durante a leitura. ArmState resolve ID inteiro primeiro, depois sufixo após primeiro ponto, depois compatibilidade sem LF final; CR permanece identidade. Não confundir esse resolver com autenticação. [`src/arm/create.ts:26–88,96–136`; `src/arm/load.ts:9–46`; `src/arm/state.ts:28–65`]

Budget 3 permite três reblocks e escala na próxima falha; regressão isolada no arm tem budget separado. Rodadas idênticas podem ser compactadas como gate-fail-repeat sem cancelar cobrança de retries. Release com motivo registra human-release antes de consumir o arquivo/resetar; refaz o mesmo WP, sem dispensar controles. No standalone, o mesmo usuário do SO pode editar release/plano/estado: texto de motivo não autentica aprovação. [`SPEC.md:223–257`; `src/arm/evaluate.ts:67–89,267–276`]

## 5. Auditoria, persistência e recuperação

A cadeia acrescenta `gen/prev/seq/mac/h`, com h no último membro raiz. Verificador lê os bytes assinados sem reserializar, exige sequência e links, rejeita chaves duplicadas inclusive escapadas/aninhadas, Números especiais lexicais inválidos e downgrade de modo. Writer tem gramática/normalização própria; não presumir que aceitar append equivale a verificar toda a cadeia anterior. `.chain.lock` serializa append; `.run.lock` serializa avaliação daquele diretório. Nenhum protege arquivos de trabalho contra escritores externos. [`src/json.ts:53–80`; `src/ledger/chain.ts:35–115`; `src/ledger/verify.ts:60–131`]

SHA-256 simples pode ser refeito por quem controla o diretório. HMAC exige chave correta e ajuda apenas quando chave/escritor confiável ficam separados do produtor. Core mantém chave de projeto fora do ambiente dos checks; não inferir isolamento contra todo processo do mesmo usuário. Remover a cauda pode deixar prefixo válido em ambos os modos; completude exige âncora externa do último head. [`SPEC.md:338–367`; `packages/core/src/relay.ts:568–604`]

| Pergunta | Porta e interpretação correta |
|---|---|
| “Os registros formam cadeia íntegra?” | `LedgerVerify` / `benchmark/verify_ledger.py`: 0 inclusive ledger vazio/prefixo não terminal; 1 quebrado/recusado; 2 ausente. |
| “Há aprovação auditável dos controles registrados?” | `RelayAudit.verify` / `bin/relay verify --json`: 0 para conjunto determinístico final pass, terminal completo e sem defeitos/drift detectados; 1 integridade quebrada; 2 íntegro porém não auditável. |
| “Corresponde ao plano alcançável?” | Exigir também `oracle_recheck.status == "ok"`. Sem sprint, not-run pode acompanhar exit 0; sprint fornecido/descoberto ilegível é invalid. IDs adicionados/removidos e oracles alterados produzem diverged; legado sem oracle produz unverified. |
| “Qual o problema ou uso registrado?” | `problems` e `cost` não verificam integridade. Ausência de uso medido resulta `total:null`, não custo zero. Saída ausente/ilegível é falha de execução. |

O relatório de controles usa o último checklist-item, não o último regression-item; drift observa ambos. Judge não decide sozinho o exit do audit. No TS, workflow-disposition só herda evento terminal anterior quando sourceSeq coincide com seq imediatamente anterior. Auditoria não refaz checks nem prova artefatos atuais, independência do revisor, conclusão de cada WP, DoD ou cada campo do plano. [`src/audit.ts:119–194,277–290,779–787`; `SPEC.md:393–422`]

Registros obrigatórios precedem estado/counter/retry correspondentes, mas efeitos de comandos podem já ter ocorrido; append parcial ou falha posterior de escrita permanecem possíveis. Shell ainda tolera falha de alguns registros auxiliares/archives; TS endureceu esses caminhos para defect. Não há promessa geral de transação, fsync ou rollback. `ArmSettlement.Boundary` deixa identidade/recibos duráveis com o chamador: before pode devolver avaliação já salva; disposição precede writes; repair exige lock e nomes seguros. Isso não prova “exactly once” de efeitos arbitrários. [`SPEC.md:368–383`; `src/arm/settlement.ts:13–69`; `test/golden/PARITY-EXCEPTIONS.md` WP6-5]

Recuperação nativa de lock exige diretório de lock anterior ao processo, não detido por avaliação local; registra gate-recovered antes de remover. Não remove lock jovem nem resolve automaticamente conflito de identidade/planos. `Relay.evaluate` recusa arm ligado a workflow com WORKFLOW_NATIVE_SETTLEMENT_REQUIRED; progressão deve atravessar transição nativa governada. Recuperar lock, liberar arm e reparar disposição são operações diferentes. [`packages/core/src/relay.ts:374–418,491–519`]

## 6. Authoring, hooks e material gerado

Graph compile transforma cadeia ordenada em WPs planos e fases contíguas em macros; start não vira WP e fica fora das fases. Budget de authoring é inteiro 0–99. IDs de controles são únicos no workflow, controle vazio é recusado, skill pode combinar/substituir instruções com binding de hash. Parâmetros de tools viram `tools` do WP; enforcement pertence ao host. Atlas knowledge conserva seleções globais/por WP; limites e autoridade não nascem do texto importado. [`src/authoring/graph.ts:111–231`; `SPEC.md:434–458`]

Draft salva com diagnóstico; formato malformado é recusado. Só publicação congela version row; autosave muda draft. Updates pedem versionId ou checksum, salvo force explícito; stale dá 409. Publicar compila e registra principal, mas não arma nem agenda. Check público de documento recusa com maestro-execution-required. Hook publicado/exportado não equivale a instalado: instalação fixa snapshot e edição posterior não atualiza silenciosamente essa cópia. [`src/authoring/store.ts:125–214`; `packages/server/src/handlers/relay-document.ts:68–89,158–165`; `SPEC.md:424–442`]

HookEvaluate seleciona installs habilitados e não unpublished, por ordem, e percorre condição/ações; Verify separa Pass/Fail. Só planeja, não concede nada. Os kinds de hook (remind/block/approve/verify/repair/record/allow) não devem ser confundidos com WP kind human nem com um revisor frio real. [`src/hook/evaluate.ts:7–8,41–107`]

Nove profiles são embarcados. `bugfix, feature-launch, safe-refactor, tdd_feature, wp-execute` estão habilitados; `design, planning, research-v2, spec-decompose` são editáveis mas admission retorna 409 profile-tools-missing porque suas ferramentas não foram portadas. YAML descarta campos como protected/output_contract/loop; lint não mede completude de critérios. Bundles de policy repetem IDs em WPs: lint rejeita duplicate-control-id e audit do sprint pode retornar SPRINT-INVALID. É conflito preservado, não coverage validada. Quoting do spec renderer não torna seguro interpolar params arbitrários em Python embutido ou shell já entre aspas. [`src/authoring/store.ts:253–339`; `docs/profiles.md:26–48,66–92`; `docs/guardrails.md:29–35`; `docs/spec-library.md:24–52`]

## 7. Integrações externas e evidência preservada

Daemon recebe exatamente sprint_path ou sprint inline, workdir/state_dir; delega ao CLI. Eval retorna HTTP 200/409/423 por advance/fail/escalate; busy sem outcome utilizável dá 500. Ask/answer possui pré-check e estado próprios, não deduplicação de todo efeito. Default loopback não cria autenticação, TLS ou confinamento de caminhos. [`docs/daemon.md:9–34,79–94`; `bin/relay-daemon.py:14–37`]

LangGraph implementa `gated`, não todas as portas da visão EXPERIENCE: move arestas estáticas, insere approval **antes** do nó e check depois; recusa arestas condicionais/Command/joins nos nós gated e chegada condicional no nó com approval. Check shell tem timeout de 600 s; judge só registra advisory sem modelo funcional. Ledger keyed por thread/node/attempt/event evita repetir append já registrado; decisão já registrada é relida. Checkpointer durável é necessário para retomar após morrer o processo; dev usa memória. Não há HMAC ou aprovação autenticada, e uso da mesma thread concluída não cria outra conclusão. O PLAN/EXPERIENCE registra intenção e cortes; canvas export, app approval, middleware, gate() isolado e CrewAI não são instalados por esses documentos. [`lib/orchestra_relay/__init__.py:28–88,95–183,215–259`; seu `README.md:37–57`; `specs/relay-langgraph/PLAN.md:11–19`]

### Cobertura e profundidade

População fixa: **3.700 entradas**, sem omissões/duplicatas na reconciliação. **3.330 golden** se repartem em arm 1.255, audit 692, authoring 393, check 211, judge 211, ledger 543, JSON 6, external 9, generate 6 e 4 arquivos raiz. Há **66 test/fixtures**; os **304 demais caminhos** incluem código, testes, docs, configs e dados. Cada membro mantém seu blob na coverage, família e justificativa de profundidade. Cenários/output files são membros de evidência compartilhada; sua presença não é execução atual nem 3.330 interpretações independentes. [`population-B.json` → `coverage.json`; `test/golden/FORMAT.md`]

O ORACLE do **repositório** fixa 14 fontes Python/shell, com metadados de ferramentas/geração. Conferência SHA-256 dos 14 arquivos capturados: **14/14 correspondem**; recibo `oracle-pins-static-check.json`. Isso não é executar geradores nem a suíte. Goldens, fixtures, judge_cases e resultados não foram alterados. PARITY-EXCEPTIONS documenta divergências TS: tokens explícitos, ausência de archive, host checks, JSON mais estrito e mudanças de authoring/store, entre outras. [`test/golden/ORACLE`; `test/golden/PARITY-EXCEPTIONS.md`]

RESULTS declara observações históricas e limites; um agregado N500 M não é sweep, comparação R/D ou prova first-pass. Testes TS/Python, fixtures mutantes e generators são rotas para revisão futura; **nenhum teste do produto ou CI foi executado por este produtor**. `AGENTS.md` raiz exige GitHub Actions; docs guard/index só provam estrutura/bytes. `EXP-RELAY.md` é card de uma migração em outro baseline, não instrução desta execução. [`benchmark/RESULTS.md:1–8,65–107`; `bin/check-docs.py:1–7`; `bin/gen-doc-index.py:3–8`; `AGENTS.md` raiz]

**Uso desta base:** localizar a família na coverage, abrir suas capturas pinadas e ler o contrato do driver antes de modificar. Para mudança de comportamento, atualizar SPEC/skill corrente e selecionar testes pelo catálogo e consumidores reais; preservar evidência histórica e solicitar revisão fria independente. A aprovação L1 e os níveis posteriores pertencem à orquestradora/juízes; esta entrega é o candidato factual com limites explícitos.

