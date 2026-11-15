# Suporte local de S1-03: entrada, geração, fixtures e evidência

| Campo | Valor |
|---|---|
| Nova chave local | `s1.subslice03.support` |
| Camada e necessidade primária | L1 — `entry` |
| Inventário reconciliado | 104 paths ainda atribuídos a S1-03 sob a chave histórica `s1.core.entry` |
| Fonte | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Kit | `70234d541a9a3539935ef16f19e33c8f2d5f30ec` |
| Estado | Candidato local; entrada global e união não aceitas por esta produção |

Este suporte explica como navegar e manter **o recorte local recebido**, sem reduzir a entrada do Core inteiro a 104 arquivos. O corpo herdado `s1.core.entry` foi copiado sem alteração para [history/entry.md](../history/entry.md): 7.312 bytes, blob `894266bd4543763fb1ee2a4dbf0ba749a244ec48`, SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`. Seu escopo Core de 1.441 fontes não é o inventário local nem a união S1 de 2.236 fontes. Preservá-lo não seleciona uma versão para a nova união. [H01; history/manifest.json; kit partition.json]

**Observação** significa conteúdo ou estrutura presente nos bytes lidos. **Intenção** significa plano/comentário da fonte, sem convertê-lo em implementação. **Inferência** indica a consequência delimitada dessa comparação. **Limite** mantém explícito o que precisaria de outra evidência. Todos os testes, comandos, instalações, downloads e providers citados neste corpo são conteúdo de fonte: **NOT_RUN nesta produção**.

## 1. Reconciliação das 104 fontes

| Família do inventário | Paths | Tratamento neste L1 |
|---|---:|---|
| `architecture-history` | 9 | Cards e qualificação com data/candidato; lidos como história e intenção, sem transferir PASS |
| `documentation` | 3 | Especificação visual, changelog e backlog; confrontados com a autoridade atual fornecida |
| `package` | 12 | Exports/configuração, geradores, snapshot SQL e vendorização; papel e caminho oficial de manutenção |
| `validation-support` | 80 | Testes, fixtures, dados gravados e harness; contratos observados e limites da simulação |
| **Total** | **104** | Uma disposição e uma justificativa por path em `coverage.jsonl` |

O [coverage.jsonl](../coverage.jsonl) contém também as 24 fontes de fronteiras, totalizando exatamente 128 linhas, sem absorver inventário de outro produtor. Para estes 104 paths, `legacy_artifact_key` preserva a origem `s1.core.entry` e `artifact` aponta para a nova chave local. `read_depth` distingue leitura integral, leitura dirigida, exame estrutural e arquivo binário; não transforma um cabeçalho de teste em compreensão integral da implementação. Fixtures legitimamente agrupados conservam path, hash e rationale individuais.

Os bytes capturados estão em `sources/` e [captures.json](../captures.json), com Git blob verificado contra o inventário e SHA256 calculado a partir dos bytes exatos. [evidence.md](../evidence.md) fornece trechos literais decisivos. O manifesto de captura mede identidade/transporte; não é parecer de juiz, evidência de execução nem versão Atlas de input.

## 2. A entrada pública do package é explícita

**Observação.** `packages/core/README.md` descreve serviços reutilizáveis de aplicação: sessões, ferramentas, configuração, providers, persistência e serviços de projeto. A fonte declara separadamente `Schema → Core` e `Protocol → Server`; também informa que Server expõe os serviços Core por HTTP. Core não deve importar Client/Server. O mapa de `package.json` tem **437 exports explícitos**, sem export raiz `.` e sem wildcard. Há caminhos de produção e caminhos de helper de teste exportados individualmente. Estar em `exports` autoriza resolução daquele specifier; não torna uma fixture API de produto. [S01–S02; S29]

**Observação.** Metadados indicam package privado, ESM e versão `1.18.27`. Os exports apontam para folhas em `src/` e, quando explicitamente escolhido, em `test/`. O censo estrutural registra os specifiers relacionados a Atlas, Relay, control plane, RAG e helpers em `records/structural-observations.json`. Ele não conclui que cada export foi importado com êxito em Bun/Node ou que as 437 folhas foram semanticamente revisadas. Esta produção leu integralmente as folhas de fronteira atribuídas, não todas as folhas exportadas. [S02; S29; boundaries.md]

**Intenção de manutenção.** O README manda regenerar exports por `script/explicit-exports.ts core --write` e identifica o bloco de contrato de módulo gerado por `script/module-readme.ts`/registro de arquitetura. Alterações de Protocol/Server devem usar os geradores de cliente indicados pela autoridade do repositório. Esses são pontos de manutenção declarados; nenhum gerador foi executado e não houve edição de produto ou de saída gerada. [S01; input AGENTS.md]

**Observação.** `bunfig.toml` declara os preloads de guard, controle Omni e `test/preload.ts`. O preload do Core coloca DB em memória, desativa herança de credenciais, fornece um caminho temporário para a chave de testes quando `ORCHESTRA_CREDENTIAL_KEY_FILE` ainda não está definida (`??=` preserva um valor previamente definido) e fixa fonte de modelos com fetch desativado. São escolhas implementadas no harness, não autorização para executar testes localmente nesta tarefa. `tsconfig.json` estende configuração Bun e define bibliotecas/checagens; o script de typecheck usa `tsgo --noEmit`. Não há resultado de typecheck neste pacote. [S03–S04; S02; captures dos dois arquivos de configuração]

## 3. Gerados e ferramentas de manutenção têm produtores próprios

### 3.1 Schema SQLite e migrações

**Observação.** `packages/core/schema.json` é um **snapshot gerado do banco**, com dialeto SQLite, versão de formato 7, ID e predecessor. O parser estrutural encontrou 63 entidades `tables`, além de colunas, PKs/FKs, índices e constraints; o documento usa lista `ddl`, não um objeto `tables`. Essa contagem descreve o snapshot, não prova migração, integridade de dados existentes ou configuração de usuário. `drizzle.config.ts` seleciona folhas SQL e saída de migrations; o caminho de `dbCredentials` na configuração de tooling não deve ser apresentado como localização runtime universal do banco. [S29; captura de drizzle.config.ts]

**Observação.** `script/migration.ts` constrói geração a partir do snapshot anterior, usa diretório temporário, exige no máximo uma nova migration, recusa sobrescrever nome existente, grava migration e snapshot e recompõe schema/registry em ordem. O modo `--check` compara geração com estado versionado e recusa obsolescência. O mecanismo observado estabelece onde regenerar; não autoriza renomear ou reordenar migrações já entregues. O excerto A4 do README de database registra exatamente a obrigação histórica de estabilidade desses paths, preservada como contexto em `history/a4-dossier-selected.md`. [S05; H01]

**Inferência.** Uma alteração de SQL em control plane ou RAG precisa ser encaminhada ao caminho oficial de migração do dono, não corrigida apenas no snapshot ou no documento. Isso é uma implicação local do gerador e do contrato de manutenção; o aceite completo de ownership/manutenção L4 permanece fora deste despacho.

### 3.2 Toolkit, floors e PTY

**Observação.** `script/toolkit-pack.ts` implementa operações de adicionar, atualizar e materializar skills de toolkit. Lê árvores/metadata de skills, escreve entrada gerada, scaffolding e recipes, procura pins/digests de releases e trata pins não resolvidos como `TODO-PIN`. Atualizar pode remover pin antigo quando o novo não é obtido; esse estado não deve aparecer em documentação como versão qualificada. O script pode chamar npm/GitHub e gerar conteúdo sob módulos de toolkits. A leitura do script não concede a S1-03 ownership desses engines nem executou qualquer integração. [S06]

**Observação.** `script/toolkit-floors.ts` mede requisitos estáticos em formatos ELF/Mach-O/PE, baixa/abre artefatos para inspeção e compara floors registrados quando solicitado. Há limites explícitos do parser e casos especiais de pacotes; um resultado vazio em modalidade não mensurada não é prova de suporte universal. Requisitos estáticos extraídos de binário e qualificação runtime de plataforma são evidências diferentes. [S07]

**Observação.** `script/fix-node-pty.ts` ajusta bit de execução de `spawn-helper` em prebuilds node-pty fora de Windows quando o helper existe. É manutenção de permissões de artefato instalado. Não demonstra que PTY de agente passa pelo sandbox, que Omni encerra descendentes ou que Windows tem a mesma implementação. A regra de PTY/sandbox permanece na autoridade específica de Core e a qualificação nativa no dono competente. [captura integral de fix-node-pty.ts; I01/AGENTS 186 como contexto fornecido]

### 3.3 Arquivo vendorizado não é fonte nova revisada por inteiro

**Observação.** `vendor/README.md` documenta `hugr-lean` 0.4.0, commit doador e árvore, nome do tarball e SHA256. O arquivo capturado tem **205.370 bytes** e SHA256 `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`, igual ao README. O exame de diretório de tar e `package/package.json` confirma nome/versão/licença e exports do pacote; não instala nem executa seu conteúdo. O README manda preservar LICENSE, NOTICE e fontes de licença e descreve limites de superfície, incluindo comportamento compatível com stamps antigos. [S08–S29]

**Limite.** Pin de archive e menção histórica a provenance/SLSA não equivalem a verificação ao vivo de todo o processo upstream. O código interno completo do tarball não recebeu revisão semântica neste L1. A disposição é `vendored_archive_metadata_and_hash_read`; a manutenção consiste em preservar bytes e proveniência e reexaminar a mudança de versão sob o dono competente.

## 4. Documentação histórica precisa manter tempo e autoridade

**Observação.** Os três cards `EXP-CORE`, `RD-CTRLPLANE` e `RD-SESSION` trazem um plano de transformação mecânica e redação sobre um baseline anterior. `EXP-CORE` fala em um conjunto esperado de aproximadamente 300 exports; o manifesto atual capturado contém 437. O card é evidência do motivo e da mecânica pretendida, não um inventário atual incorreto a ser “corrigido” apagando a história. `RD-CTRLPLANE` trata retirada de autoridade legada e deslocamento de contratos locais; `RD-SESSION` orienta documentação de admissão/execução/persistência. Eles direcionam releitura das fontes atuais, sem provar sua implementação. [S09; captures individuais dos três cards]

| Documento runtime-closure | O que conserva | Limite necessário para reuso |
|---|---|---|
| `PLAN.md` | Baseline, invariantes e WPs para CLI/WSL/SDK/Nix/OAuth | Plano e observações iniciais não são resultados de todos os WPs |
| `CHECKPOINT.md` | Recibos e casos com candidatos anteriores | O texto não declara CI integral do HEAD atual; lacunas de plataforma/fluxo continuam nomeadas |
| `ARCHIE-QUALIFICATION.md` | Qualificação histórica específica de caller/consumer e seus hashes | Não transfere aprovação para dual V2, W6, retry/background ou OAuth/Nix que o recorte exclui |
| `PRODUCER-BOUNDARY.md` | Exceção humana histórica de namespace controlado e controles preservados | A exceção exclui adversário de mesmo UID; não é nova permissão para esta tarefa |
| `SNAPSHOT-QUALIFICATION.md` | Comparação de updater/snapshot em candidatos determinados | Medida específica não significa closure universal; lacunas de Nix/Desktop/WSL/OAuth permanecem explícitas |
| `WAVE-2.md` | Cadência, owners e handoffs daquela onda | Preparação e conclusão de casos específicos não se tornam fechamento da execução atual |

As linhas decisivas de qualificação e exclusão estão em S10–S12, e a leitura dirigida dos demais paths está registrada por disposição. O conteúdo histórico pode sustentar uma pergunta de regressão; para sustentar um PASS atual precisa do candidato, caso, ambiente e recibo real compatíveis. Nenhum foi fabricado a partir de título, branch, nome de teste ou marcador “passed”.

**Observação.** `docs/specs/v2/api.html` é uma visão estática com mapa de contexto/rotas e áreas ainda “Needs team discussion”. Seu exemplo de prompt usa `immediate | deferred`, enquanto AGENTS fornecido define `steer` por padrão e `queue` explícito. A comparação prova um limite de autoridade da página, não decide sozinha o formato HTTP vigente: esse contrato pertence à leitura de schema/Server/SDK em S1-04. Não se deve orientar uma mudança de API apenas pelo mock visual. [S13; I01]

**Observação.** `schema-changelog.md` registra transições datadas e políticas de compatibilidade; `todo.md` distingue admissão/eventos duráveis de recuperação provider após crash, que aparece como trabalho futuro naquele texto. Um backlog antigo não prova que uma função ainda falta no baseline atual. Ele indica quais fontes/casos o dono deve reconciliar antes de repetir a afirmação. A distinção entre EventV2 replay e continuação de provider evita confundir durabilidade de evento com recuperação de execução. [S14; captura do schema-changelog.md]

## 5. O que as fixtures simulam e o que deixam real

Os 80 paths de validação formam suporte para múltiplos donos. Sua permanência em S1-03 é partição de inventário e navegação: não transfere para este produtor a implementação das capabilities, Session, Omni, LLM ou SDK que eles importam. Cada rationale individual em coverage explicita propósito e motivo de releitura. Os grupos abaixo explicam os contratos que fazem diferença ao usar essa evidência.

### 5.1 Actions, GitHub, Board e transporte

**Observação.** As fixtures de Actions misturam AppProcess/transport real com respostas locais controladas, CLIs de protocolo e dados sintéticos. `actions-transport.ts` faz o transporte usar spawner bruto herdado; `run`/`runStream` alternativos falham deliberadamente. Captura argv, stdin, bytes/digest, ambiente e cwd, permitindo observar o contrato de processo sem alegar compatibilidade com serviço real. `actions-network.ts` oferece rede TLS/HTTP controlada e `actions-resource-runtime.ts` serve recursos/GitLab locais. Nenhum processo foi lançado por esta produção. [S16; captures da família]

**Observação.** `github-read.ts` declara que os wire-shapes são exemplos oficiais sanitizados, sem promessa de compatibilidade ao vivo. `github-command*` acrescenta o protocolo sintético de operações; os nomes `gh`/`glab` são fixtures, não sessões autenticadas usadas aqui. `board-queue.ts` mantém Git real para commits/branches, mas GitHub, renderer Atlas, gates e certos registros de scoped pass são stand-ins. A função `passed` insere um registro “pass” sintetizado pelo teste; esse texto não é um recibo de Actions observado. [S17; S22]

**Manutenção local inferida.** Mudança no formato de argv/resposta/identidade do provider exige rever protocolo fixture e decoder de produção juntos. Mudança em queue, renderer ou regra de gate exige distinguir o real Git dos resultados remotos preparados. O dono de automação em S1-03 deve receber essa navegação; a validação de provedor real precisa de evidência própria.

### 5.2 Capability não é sinônimo de permissão ilimitada no fixture

**Observação.** As treze fixtures `capability-*` montam Database/Event/SessionProjector/ToolRegistry/serviços específicos, placements, regras e material sintético. Artifacts isola diretórios e insere dados de teste; children registra ferramenta canônica; policy prepara allow/deny e contexto de invocação; process-control usa criança controlada; services/discovery/service-call constroem schemas, limites, bindings e mudanças de seleção. Esses recursos existem para exercitar fronteiras, não para disponibilizar credenciais reais. [S19; captures individuais em coverage]

**Observação.** `capability-connection-management.ts` carrega a factory real de Store e falha se ela faltar, sem skip ou substituto. As fixtures de setup usam factories reais e tracing de SQL/reserva para contar tentativas, inclusive rollback. Isso fortalece a intenção do caso de teste, mas a existência do harness não informa seu resultado. [S19; fonte capability-connection-setup-sql.ts 30–58]

**Observação.** `capability-schedule.ts` usa ToolRegistry/settlement e banco reais do fixture, mas substitui `SessionExecution`: métodos de wake/resume/interrupt são vazios e `withRunner` falha com “No Session runner in this fixture”. Assim, um caso apoiado nesse fixture pode examinar admissão, ownership e idempotência de chamada sem provar execução até conclusão de Session. A fronteira é visível no código, não inferida de “schedule” no nome. [S18]

**Inferência.** O dono de capability/trust é S1-02, Session/runner é S1-01 e automação/schedule local é S1-03. Um contrato integrado precisa dos bindings aceitos desses donos; o suporte local não os declara satisfeitos.

### 5.3 Processo, sandbox e controle positivo

**Observação.** `omni-expect.ts` mantém uma única expectativa `open` e calcula a diferença do contador `Omni.snapshot().spawns` na janela entre `expectSpawn` e `settle`. O comentário declara a intenção de atribuir os spawns ao teste e descreve liquidação por `afterEach`; a folha isolada não demonstra atribuição individual de cada spawn nem exclusão de sobreposição. Interpretar a diferença como contagem exclusiva de um teste exige que essa janela não contenha spawns de outros testes ou trabalhos e que a integração ao runner delimite a janela corretamente. Caso filtrado/skipped que não chamou `expectSpawn` não abriu expectativa. Essa qualificação não afirma que tenha ocorrido uma falha real. `omni-effect.ts` fixa reexports de módulos reais para manter identidade. `process-tree.ts` identifica processos por nonce e instante de nascimento, evitando PID reutilizado. A fixture Windows tem broker/Node e lifetime de IPC/arquivos; o path hosted exige CI e atesta runtime nativo. Nenhum desses caminhos foi executado aqui. [S15; S23–S24]

**Observação.** `lib/sandbox-host.ts` consulta a capacidade de jail da plataforma e distingue AppContainer de probes Node; ausência de jail deve alimentar HOLD/fallback declarado pelo caso. `lib/rejection.ts` evita uma forma de espera que o comentário descreve como problemática no Bun/Windows, mantendo falha quando a promise resolve em vez de rejeitar. `tmpdir.ts` oferece cleanup com retry delimitado de EBUSY, sem mascarar outras falhas. As fixtures de flock, AppProcess, dialer Cassandra e processo em background possuem protocolos e cenários próprios, registrados em coverage; não se pode extrapolar deles um lifecycle universal. [S26; captures dos helpers e testes]

### 5.4 Distribuição, packaging e upstream

**Observação.** Os casos de distribution distinguem **ORCHESTRATION-ONLY**: AppProcess pode ser real, enquanto Bun/cargo e logs são sintéticos na borda do comando. Há parser de recibos, validação de seleção/workflow e testes de admission/deno, porém uma linha “1 passed” preparada em string não prova build nativo. A mesma distinção vale para test-ci-request/upload, setup-bun-cache e test-omni-control: observam seleção, workflow, parsing e controle, não substituem o job que deveriam validar. [S20–S21; coverage desses paths]

**Observação.** `packaged-skills.ts` preserva variações reais de bytes — UTF-8, CRLF e arquivo vazio — e reescreve specifiers AST no build de fixture para manter identidade dos módulos reais. `sdk-registry.ts` serve packuments/tarballs locais e inclui um módulo plantado que falha se executado; `ripgrep-release.ts` serve releases/archives locais com gates explícitos de ordenação. O zip de artefato fixado foi inspecionado como archive; os dois SCIP binários preservam símbolos/aliases observáveis por strings e hashes, sem decodificação semântica completa do protocolo. São dados de regressão a conservar junto da razão do caso. [S28–S29; coverage]

**Observação.** Testes de Maestro Arsenal e fixtures upstream vinculam pacote/factory reais com snapshots controlados e perturbações de registry; não é aceitável substituir o backend inteiro por uma aprovação fictícia. Os casos de settlement preservado têm comentário explícito “Prepared source cases, not executed”; o comentário é informação histórica da fonte, e esta produção também não os executou. O fixture de recording OpenAI conserva uma interação HTTP/SSE datada, não uma consulta ao modelo feita nesta sessão. [S27; captures upstream e recording]

### 5.5 Harness compartilhado e contratos canônicos

**Observação.** `lib/effect.ts` executaria cada efeito em scope, exibiria erros de Cause e fornece variantes TestClock/live e skip contado pelo runner. `lib/tool.ts` oferece identidade de caller diferente de Maestro para testar recusa; `location.ts` fornece placement controlado. `shared-schema.test.ts` contém comparações de identidade entre schemas Core e canônicos e casos de construção/decodificação; `task-governance.test.ts` prepara o caminho allowAll. Essas fontes dão ao mantenedor pontos concretos para diagnosticar regressão. Não são aceite de todas as schemas, tooling ou permissões. [S25; coverage]

## 6. Reuso histórico, contribuição para união e encerramento local

O corpo herdado de entrada e seus extratos A3/A4 foram reutilizados como mapa e evidência anterior, preservando os limites que já declaravam. A projeção histórica distinguia 2 fontes decisivas de 102 ainda não lidas na entrada e 4 decisivas de 20 nas fronteiras. Esta produção não carimba “compreendido” pelo censo: substitui a lacuna local por leituras com profundidade explicitada, corpo novo de suporte e evidência literal. Quando a leitura é estrutural/dirigida — especialmente fixtures extensas, snapshot SQL e archives — isso continua visível em coverage. [H01; history/coverage-needs-selected.json]

A [union-navigation-proposal.md](../union-navigation-proposal.md) relaciona necessidades, donos, subfatias e keys reais do kit. A entrada histórica `s1.core.entry` não foi renomeada, sobrescrita ou publicada como união pronta. Versões aceitas de artefatos externos permanecem **NOT_SELECTED**; apenas pins de fonte/kit e identidades históricas verificadas estão preenchidos.

Esta entrega não contém teste local, job remoto novo, instalação, provider pago, modificação de produto ou publicação. L2–L4, avaliação independente, escolha de roots/predecessores aceitos e aceite de união dependem do fluxo posterior da coordenação. O resultado concreto deste despacho é o candidato L1, a reconciliação dos 104 paths e uma proposta navegável cuja autoridade está declarada.
