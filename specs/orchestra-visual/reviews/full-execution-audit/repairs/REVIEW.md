# Reparos da revisão integral — ferramentas de execução

Este documento registra implementação de reparos, não aceite do frontend. A revisão histórica permanece em `../REVIEW.md`; seus reprodutores descrevem o comportamento antigo e não são reescritos para apagar os achados. A verificação executada no GitHub e as identidades de publicação ficam em `VERIFICATION.json`.

## Limites preservados

O contrato de produto continua 4.3. PLAN, SURFACES, SPEC, WIDGETS, BUDGETS, COVERAGE, fixture, imagem aprovada, marca, grafo, scopes, leases, IDs de critérios e progresso não são alterados por estes reparos. Não há novos épicos, WPs, tasks, dependências de runtime ou scheduler. A identidade **efetiva da prova** passa ao esquema 2 para vincular as novas regras; recibos antigos precisam ser revalidados, nunca migrados para PASS por troca de hash. O progresso do produto permanece sem aprovação fabricada.

## EX-01 — Universo do censo protegido

`tools/census.py::scan_roots` normaliza caminhos POSIX, exige as quatro raízes contratadas, recusa duplicatas após normalização, caminhos inseguros, diretórios ausentes/redirecionados e descoberta totalmente vazia. A barra final deixa de produzir busca por `//`: o arquivo real continua sendo encontrado e exige classificação. Novos arquivos não rastreados continuam entrando na descoberta. `check` e a CLI estrita usam a mesma regra.

**DoD:** negativos de cobertura vazia/estreitada reprovam; censo completo passa.
**Invariants:** leitura não altera fonte ou índice; não procurar não equivale a não existir UI.
**Quality standards:** normalização única, raízes explícitas, falha com diagnóstico.
**Completeness criteria:** raízes vazias, obrigatória retirada, extra inexistente, ausente, barra final, duplicação, caminho inseguro, symlink, UI nova e censo válido; teste também pela CLI.
**Success criteria:** S01 não pode ser encerrada deixando de pesquisar a aplicação.

## EX-02 — Submissão e retomada compartilham a atualidade

`tools/source_proof.py` passa a conter as funções existentes `git_snapshot` e `source_errors`, antes locais ao seletor. `tools/validate_evidence.py::validate_submission` é a entrada comum do seletor e da CLI: contrato canônico, integridade, atribuição BASE..HEAD, origem declarada das provas, compatibilidade com o checkout e censo S01. Não há uma segunda política de frescor. As exceções já existentes de marcos históricos são preservadas; o aceite final continua sensível ao código atual.

A CLI normal exige `--repo`. `--integrity-only` é diagnóstico deliberado e retorna **INTEGRITY_VALID**, com `candidate_compatible: false`, nunca aprovação do candidato. `validate_receipt` continua como função de baixo nível para testes estruturais/prova histórica; não é a API de submissão. O seletor continua sendo responsável também pelas dependências e autoridade externa. Nenhum recibo, isoladamente, prova verdade semântica ou autoriza publicação.

**DoD:** CLI e retomada concordam sobre alterações relevantes posteriores.
**Invariants:** prova histórica é preservada; o rótulo histórico não certifica o candidato atual.
**Quality standards:** uma implementação de frescor, HEAD explícito e saída não ambígua.
**Completeness criteria:** fonte atual, alteração commitada, dirty, alteração alheia ao scope, marco histórico, ausência de repo e CLI real.
**Success criteria:** o executor não recebe PASS de aceite para uma prova que o mesmo fluxo de retomada considera STALE.

## EX-03 — Aplicação dos axiomas vinculada à prova

A regra textual de aplicação existente é agora uma constante validada em todos os nós. Metadados ancestrais apresentados ao executor entram no manifesto efetivo. Se um agregador declarar estágios explicitamente, precisa cobrir seus critérios e apontar para seu próprio encerramento; a ausência mantém a convenção publicada. A regra de estágio das tasks continua intacta. As atribuições de widgets/casos também integram a identidade.

**DoD:** aplicação alterada e estágio ancestral inválido/futuro são recusados; metadados pertinentes mudam o digest.
**Invariants:** encerramento de pai nunca é pré-requisito do produtor; os cinco grupos e seus IDs não são removidos.
**Quality standards:** contexto e prova consomem a mesma política, sem analisador semântico de prosa.
**Completeness criteria:** aplicação, etapa inexistente, etapa futura/filho, encerramento próprio válido, controle já existente de task e atribuição de widget.
**Success criteria:** mudar a obrigação que o LLM recebe não mantém silenciosamente válida a identidade antiga da prova.

## H-01 — Artefatos declaradamente fabricados separados de provas de execução

A submissão inspeciona os envelopes tipados do recibo e de suas categorias, relatórios de métricas/observações, manifesto visual e relatório nativo, incluindo metadados de origem. Marcadores explícitos como `synthetic: true`, `test_only: true` ou `evidence_origin: demo` são recusados. A mesma verificação alcança importações diretas de recibos; importações recursivas não são aceitas. Dados de workload dentro do cenário não são classificados como medições fabricadas.

Os testes de esquema continuam usando fixtures, agora rotuladas explicitamente. Remover um marcador **não autentica** uma medição: o teste sem marcador demonstra somente que a classificação não inventa autenticidade. Logs brutos não são vasculhados por palavras como “demo”, pois podem legitimamente citar exemplos negativos. Não foi criado serviço de atestação.

**DoD:** a submissão recusa provas declaradas como teste; o avaliador estrutural continua testável.
**Invariants:** medições reais sobre workloads sintéticos continuam possíveis; nenhuma fixture dos testes é publicada como PASS do produto.
**Quality standards:** classificação explícita e limitada de origem, não promessa de detecção de fraude.
**Completeness criteria:** recibo, métricas, observações, manifesto visual, relatório nativo, importação direta, importação aninhada, workload sintético e controle sem marcador.
**Success criteria:** o executor não reaproveita acidentalmente uma evidência rotulada de teste como resultado do aplicativo.

## E-01 — Congelamento sem novo motor de invalidação

`RUN.md` exige concluir os bindings S01 e congelar normas antes do fan-out. Alterações necessárias identificam seções, consumidores e provas atingidas; pacotes são regenerados e o seletor decide validade. Mantém-se o hash integral conservador: o cone de W07 não foi reduzido artificialmente. A correção adotada é de disciplina e legibilidade, não um novo cache ou mecanismo de invalidação.

O pacote visual inclui assets oficiais e artefatos de contrato cuja identidade é byte a byte. A exclusão de `specs/orchestra-visual/` do formatador geral evita que `script/generate.ts` reescreva as normas/artefatos em segundo plano. Isso não dispensa seus geradores, validadores, testes ou revisão. O pacote continua editável intencionalmente pelos seus responsáveis.

**DoD:** entrada operacional descreve congelamento e mudança controlada; formatador geral preserva os insumos.
**Invariants:** alteração normativa pertinente continua invalidando prova; não há reset ou PASS automático.
**Quality standards:** uma fonte canônica e mudança explícita, sem compressão semântica ou novo registry.
**Completeness criteria:** norma comum, seção local, dependência cruzada, proteção de formatação e retomada.
**Success criteria:** frentes paralelas não sofrem alterações cosméticas involuntárias do contrato enquanto implementam.

## CI-01 — Atlas separado e reconciliado com trabalho concorrente

O reparo Atlas está na PR #234, separada do frontend e dos contratos. O workflow `36303751560` conferiu os três blobs Genesis declarados no snapshot contra a revisão alcançável `1a235323361717d13a44d3c184bad13649f59e60` e o checkout, compilou o contrato existente, reproduziu a falha antiga, executou o materializador oficial duas vezes com diff idêntico, passou o guard original e rodou Vitest. Uma primeira tentativa usou o runner errado para um teste Vitest; foi corrigida e repetida, não contada como aprovação.

Enquanto isso, a dev avançou para `b8f9b03...` com a mesma correção de procedência feita por outra frente. O subsequente `chore: generate` reformata os dois outputs; `verifyStaticOwnSnapshot` compara conteúdo exato e recusa esse drift. A PR #234 foi reconciliada preservando todas as mudanças da dev e mantendo somente os dois outputs do materializador e a exclusão estreita deles no `.prettierignore`. O snapshot da dev já concorda; nenhum fato ou source blob foi sobrescrito. Não se atribui autoria exclusiva à correção concorrente.

**DoD:** guard do candidato reconciliado e CI normal passam; regenerar e formatar não introduzem drift.
**Invariants:** não alterar guard, fatos, runtime, source blobs ou trabalho concorrente para obter verde.
**Quality standards:** origem verificada, geração oficial, idempotência e proteção do gerador contra formatação alheia.
**Completeness criteria:** ancestralidade, três âncoras, snapshot, coverage, skill, reconciliação e testes reais.
**Success criteria:** o bloqueio herdado é resolvido de forma estável, não escondido nem reintroduzido pelo gerador geral.

## Verificação e limites

A suíte local executou 280 testes únicos: 248 anteriores e 32 novas regressões em `tools/test_execution_repairs.py`. Os testes usam cópias e repositórios temporários; não populam o progresso real. A fixture Git antiga ganhou os diretórios exigidos pelo escopo real do censo e a fixture estrutural ganhou um marcador sintético; não foram removidas asserções anteriores. O ensaio da CLI estrita inclui seus arquivos normativos e marca oficiais, em vez de dispensar as verificações por falta de fixture.

O checkout real do GitHub deve repetir testes, validadores e geração de contexto das 66 tasks; os resultados observados são registrados em `VERIFICATION.json`. Este arquivo narrativo não substitui o resultado desse ensaio. Build do Orchestra, Electron, capturas do frontend e benchmarks no Mac não são alegados. A descoberta real S01 continua sem classificação/aprovação automática; S02 e piloto permanecem execução de produto, não tarefas concluídas pelo reparo dos validadores.
