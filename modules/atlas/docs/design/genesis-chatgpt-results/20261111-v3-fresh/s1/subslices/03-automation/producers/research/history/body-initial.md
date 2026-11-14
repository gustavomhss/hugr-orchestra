# Toolkits fixados e autoridade da evidência de pesquisa

**Artefato candidato:** `s1.core.research` · **L1** · necessidade `component` · escopo `orchestra.s1`  
**Fonte investigada:** `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`  
**Produção:** RESEARCH-L1, S1-03, execução local `34269cf4-d631-41c5-a30b-85b0ec217390`, produtor `/root/research_l1`.

## R0. Resultado, autoridade e navegação

**Observação de fonte.** O Core contém um ciclo comum de aquisição de ferramentas, um toolkit de pesquisa que o reutiliza com raiz própria, adaptadores de índice com camadas SCIP e estruturais, busca e localização verificadas contra conteúdo, probes com runners fechados e um sistema durável de evidências. O conjunto não reduz a autoridade a “arquivo existe” ou “processo terminou”: identifica contexto de execução, operações, bytes, recibos, revisões e falhas. Algumas fronteiras permanecem menos fortes que os comentários ou nomes sugerem. Este corpo explicita essas diferenças para impedir que instalação, disponibilidade, completude de pesquisa e verdade semântica sejam confundidas. [E02–E43]

**Limite desta produção.** São 130 fontes normativas: 59 da família backend-toolkit e 71 de research; 80 implementações, 41 arquivos de teste, sete locks, um gerado e um README. Todos os bytes foram obtidos pelo conector GitHub no blob fixado pelo inventário; SHA-256, tamanho e blob Git foram recalculados. Isso atesta identidade dos inputs, não correção do programa. Não houve instalação, download de engines, execução de produto, teste local, consulta HTTP de liveness, importação/publicação Atlas, consumo independente ou julgamento. Nenhum PASS é emitido aqui. As afirmações de comportamento são inspeções do baseline, não observações de uma plataforma funcionando.

**Reúso.** O corpo histórico de 3.942 bytes, SHA-256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`, já estabelecia os quatro pontos de entrada: backend index/README, research toolkit index e ledger. A3/A4 e a projeção registravam 39 folhas backend e 38 research ainda sem leitura substantiva; o rótulo histórico `supported` não equivalia a dois pareceres. Este L1 preserva o entendimento válido, acrescenta as folhas e conserva a lacuna de qualificação de runtime. O histórico não foi editado, reatribuído nem convertido em aceite novo. [E01]

Os rótulos usados neste corpo têm significados distintos:

- **Observação:** definição, fluxo ou condição presente nos bytes fixados.
- **Intenção:** comentário, documentação ou expectativa de teste; não demonstra que a execução ocorreu.
- **Inferência:** consequência delimitada do fluxo inspecionado, cuja base é indicada.
- **Limite:** lacuna de evidência, capacidade externa ou alcance que o fluxo não permite afirmar.

| Necessidade obrigatória | Onde começar | Fontes decisivas / evidência |
| --- | --- | --- |
| Escolher engine, runtime, receita e fronteira de ownership | R1–R3 | backend manifest, packs, runtimes, README; E02, E05, E11–E13 |
| Entender aquisição, dependências, retry, shim e readiness | R2 | backend index/acquisition/attempts/hosted/launcher, pinned-artifact; E03–E08 |
| Evitar geração com versão errada e entender compatibilidade Cassandra | R4 | project-version, cassandra-metadata/dialer; E09–E10 |
| Planejar e aquecer índice sem confundir status com execução | R5 | research index, extract toolkit, build/store; E14–E18 |
| Interpretar shard, parser, resolução, query e limitações | R6–R8 | code-index/*, search, locate, liveness; E16–E29 |
| Entender probes, orçamento, isolamento e retenção | R9–R10 | probe/*, process, allowance/binding; E30–E35 |
| Distinguir captura, fonte admitida, registro, revisão e recibo | R10–R12 | binding, ledger, artifacts, records, seat-tools; E34–E43 |
| Selecionar validação e preservar manutenção/escopo | R13–R14 | 41 contratos de teste, coverage.jsonl; E44–E46 |

Todos os paths abreviados a seguir são relativos a `packages/core/src/`, salvo quando começam por `test/`. `evidence.md` contém os trechos literais numerados e seus hashes; `captures.json` identifica cada fonte integral; `coverage.jsonl` liga cada um dos 130 paths ao papel, profundidade, necessidade e seção. Essa relação mecânica torna a revisão possível; o juízo de suficiência continua independente.

## R1. Quem possui o ciclo e o que um manifesto promete

**Observação.** `backend-toolkit/README.md` divide propriedade: o Core possui aquisição, cache, execução, readiness e interface; cada pack possui seus dados de aquisição, versão, licença, ambiente, fit e entry skills. O engine não deve importar produto. `manifest.ts` admite engines nativos ou hosted, com dependências próprias; hosted usa Node, Java, Python, Go ou Rust. A interface serve também a manifests externos ao backend. `research-toolkit/index.ts` injeta a raiz e o manifesto research nessa interface, sem copiar o instalador. [E02, E14]

**Intenção normativa do repositório.** `entry-skills.gen.ts` é gerado pelo mecanismo oficial citado no README, com sete entradas backend: api, check, codegen, concurrency, data, implement e refactor. Esse arquivo não é a fonte autoral das skills. Os locks são inputs de aquisição, não sugestões para resolver “latest”. Alterações de receita exigem atualizar os arquivos e geração do dono correspondente; esta produção não modifica nenhum deles. [E02]

**Observação.** Um `Pack.fit` descreve papel generator/check, input e skills servidas. Um `ResearchPack.fit` descreve indexer/oracle e linguagens. São declarações de aptidão e integração: não são autorização para executar uma ferramenta, prova de resultado, nem atestado de que um pacote upstream é seguro. Os comentários “measured floor” e “sample archives were downloaded” pertencem à história da fonte; não constituem medição desta execução. [E02, E11–E13]

**Limite de propriedade.** `ToolkitRuntime.ensure`, `AppProcess`, `MemoryCap`, `ToolSafetySandbox`, `EffectFlock`, `EventV2`, schemas de research, Session/Task e portas Atlas são dependências importadas fora destes 130 paths. O L1 explica como o componente as chama e valida os resultados; não apropria implementação, autorização, isolamento ou transações desses donos. Uma garantia atravessando essa fronteira precisa de fonte/artefato aceito do respectivo dono.

## R2. Aquisição, prontidão, falhas e plataformas

### R2.1 Estados e ordem de aquisição

**Observação.** O backend expõe cinco estados: `absent`, `fetching`, `ready`, `failed` e `unsupported`. Engines ficam por id e `version-target`; runtimes têm diretórios próprios, e launchers compartilhados ficam em `bin`. `ensure` detecta o host antes de solicitar a engine. `prefetch` tenta todas as selecionadas, absorve falhas individuais e devolve o estado de cada uma; não é sucesso coletivo pelo fato de retornar. [E03]

`dependencyOrder` resolve ids e ciclos antes do fetch e produz pós-ordem, com dependências adquiridas antes da engine. A verificação de floors considera engine, dependências e runtime. O código devolve a primeira incompatibilidade encontrada; o comentário sobre o floor máximo não significa que há um cálculo independente de máximo numérico agregado. Um id ausente, ciclo ou target explicitamente recusado não deve virar uma lista vazia de engines prontas. [E03, E05]

`prepare(command)` reconhece usos explícitos de `$BACKEND_TOOLKIT_BIN`, `${BACKEND_TOOLKIT_BIN}` e a forma PowerShell, extraindo os nomes de engines. Não instala tudo para uma linha de shell genérica. Garante as dependências dos nomes detectados; quando elas existem, acrescenta caminhos pertinentes ao PATH do filho. A espera do shell é de 60 segundos; a instalação compartilhada tem orçamento próprio de 30 minutos e pode continuar após o waiter desistir. Isso é uma distinção entre tempo de espera de um cliente e vida da aquisição. [E03–E04]

### R2.2 Concorrência, staging e diagnóstico

**Observação.** `acquisition.ts` mantém promises por chave. Waiters concorrentes compartilham a tentativa; a desistência de um não cancela automaticamente o trabalho dos demais. Sucesso remove a tentativa; falha fica em cooldown de cinco minutos. Defeitos, interrupções e rejeições do runner têm caminhos de falha, inclusive fallback se o formatador de diagnóstico falhar. O mapa é local ao processo; a publicação em diretório também trata concorrência via staging/rename, mas não implica coalescência distribuída universal. [E04, E06]

`PinnedArtifact.install` verifica o marcador `.complete` antes de baixar; constrói em staging; verifica integridade do download; materializa entradas; roda populate; grava marcador e renomeia. Se outro instalador completou o destino, pode aceitar o vencedor. O cleanup remove staging. Integridade usa sha256 ou sha512, e as entradas declaradas precisam permanecer relativas ao diretório de instalação. Download e extração têm timeout; os extratores são utilitários externos, e saída truncada deles é falha. [E06]

**Limites.** O marker não é rehash do cache a cada consulta. Uma instalação com marker e executável ausente pode falhar em readiness, sem download reparador automático: o instalador pode pular por `.complete`, enquanto o verificador recusa o executável. A validação de paths declarados não equivale a uma auditoria independente de todos os membros de um tar/zip antes do extrator materializar o arquivo. Essa é a fronteira observada, não uma alegação de exploit. [E03, E06, E44]

`diagnostics.ts` filtra texto raw e texto sem escapes de terminal contra credenciais reconhecidas, inclusive valores sensíveis do ambiente, antes de conservar a cauda de 4.096 caracteres. `ORCHESTRA_INHERIT_CREDENTIALS`, usado como booleano, não é tratado como segredo por si. O ambiente de instalação é construído com allowlist e HOME/configs privados para npm/pip; o resultado não herda livremente o ambiente de um usuário. Essas barreiras são parte do contrato local de diagnóstico e execução, não promessa de que todo segredo imaginável será detectado. [E08]

### R2.3 Readiness é uma conjunção

**Observação.** A consulta verifica dependências, tentativa em andamento/falha, instalação, executável e launcher. Um arquivo executável deve ser regular; POSIX exige X_OK, Windows F_OK. Hosted precisa também do runtime e de seu executável. No host, o shim deve corresponder exatamente ao texto esperado. Shims incorretos podem ser recriados por arquivo temporário, chmod e rename. Pip usa `.launchers` privado para evitar colisão com diretórios de distribuições; Go e Cargo têm posições de binário diferentes. [E03, E08]

| Sinal observado | O que permite concluir | O que não permite concluir |
| --- | --- | --- |
| Pack/version/target constam no manifesto | Existe receita fixada | Download acessível ou executável funcional |
| `.complete` existe | Instalador já publicou o marker | Dependência, runtime, shim ou binário ainda válido |
| Estado `fetching` | Tentativa compartilhada registrada | Engine pronta ou progresso garantido |
| Processo de build saiu 0 | Processo reportou sucesso | Executável obrigatório foi produzido; há verificação posterior |
| `ready` no host | Checks locais de readiness satisfeitos | Uso real da engine, compatibilidade integral ou saída semanticamente correta |
| Preparação para outro target | Artefatos daquele target tratados pela receita | Execução naquela plataforma ou shim local de plataforma alheia |
| `prefetch` retornou estados | Tentativas foram observadas | Todos os estados são `ready` |

### R2.4 Hosted e seus pré-requisitos

**Observação.** `hosted.ts` recusa execução de receitas não-JAR para cross-target. Npm usa o npm do runtime com `ci --ignore-scripts --no-audit --no-fund --offline=false`; “scriptless” não significa offline. Pip usa hashes obrigatórios, sem resolução de dependências e somente wheels. Java materializa JAR. Go compila com toolchain local, mod readonly, trimpath, checksum DB e CGO desabilitado; Cargo usa lock, features explícitas, sem features default e RUSTC do runtime. Builds source verificam que o executável existe e é executável antes de completar a instalação. [E07]

Cargo pode precisar de C/linker do host mesmo usando rustc privado. A aquisição de uma engine source tampouco certifica indexação offline de um projeto: o projeto pode requerer seu próprio toolchain/dependências. A compatibilidade Cassandra é permitida apenas no caso dedicado, em staging, não uma regra genérica de alteração de upstream. Execução usa limite de 30 minutos e até 64 MiB por stream; finalizadores de interrupção aguardam encerramento antes de remover staging. A eficácia do mecanismo de processos permanece com seu dono externo. [E07, E10–E13]

### R2.5 Targets e floors

**Observação.** O domínio de targets é fechado: Darwin arm64/x64, Linux arm64/x64 e Windows x64. Musl e Windows arm64 são recusados. Rosetta muda o alvo detectado para ARM antes dos floors. O baseline local considera macOS 11, Windows 10, glibc 2.28 e AVX2 para x64, além dos floors por artefato. A comparação de floors de outro sistema é omitida em cross-target. Detecção do host é memoizada. [E05]

**Limites decisivos.** Glibc ilegível não produz um número inventado: o check não acrescenta essa restrição. A verificação AVX2 em Windows sem Bun retorna permissivamente. O código tem conversão especial de kernel para macOS 26+. Nenhum desses caminhos mede a máquina desta produção; tampouco autoriza chamar o pack de qualificado para todas as cinco plataformas. Mudança de floor afeta admissão/readiness, mesmo se a versão do pack não mudar. [E05]

## R3. Receitas concretas e inputs de aquisição

### R3.1 Backend: 21 engines com papéis distintos

**Observação de manifesto.** A tabela conserva as versões literais do baseline. `native` significa artefato baixado com executable declarado; as demais linhas nomeiam runtime e mecanismo. A fonte de cada linha é o arquivo homônimo em `backend-toolkit/packs/`; os trechos de fit/receita estão em E11, e todos os pins integrais em `sources/`.

| Engine e versão | Aquisição | Finalidade e limite relevante |
| --- | --- | --- |
| ast-grep 0.45.3 | native | Gera rewrite por padrão sintático. Expõe somente `ast-grep`, evitando colisão com `sg` do sistema. |
| sqlc 1.31.1 | native | Gera a partir de SQL e schema DDL. A receita não fornece um banco ou prova o SQL. |
| buf 1.73.0 | native + dependência protoc-gen-es | Check de módulo Proto; dependência owned participa de readiness. |
| gitleaks 8.30.1 | native | Check de texto de Memory antes de armazenamento; fit sem entry skill, uso pelo host. |
| kiota 1.35.0 | native .NET self-contained | Gera OpenAPI; conserva appsettings.json, exclui símbolos de debug; ambiente declara offline e telemetry opt-out. |
| orval 8.39.0 | Node/npm + lock | Gera OpenAPI; lock inclui opcionais de plataforma esbuild. Instalação ignora lifecycle scripts. |
| protoc-gen-es 2.16.0 | Node/npm + lock | Geração Proto, também dependência do Buf. |
| openapi-generator 7.25.0 | Java/JAR | Gera OpenAPI; guard de versão do projeto é necessário antes da geração, R4. |
| datamodel-codegen 0.83.0 | Python/pip + wheels | Gera OpenAPI/JSON Schema; lista explícita de wheels e hashes, ambiente Python sem user site/safe path. |
| ogen 1.24.0 | Go/source | Gera OpenAPI; árvore de fontes selecionadas inclui go.mod/go.sum e o pacote compilado. |
| sqlx 0.9.0 | Rust/Cargo source | Gera a partir de migrations e DB descartável; features rustls/postgres/mysql/sqlite/sqlx-toml. Windows x64 recusado por linker. |
| controller-gen 0.22.0 | native raw | Gera a partir de tipos Go e marcadores kubebuilder atribuídos. |
| kubeconform 0.8.0 | native | Check de manifests Kubernetes usando os schemas fornecidos pelo pacote de trabalho. |
| kopium 0.24.1 | Rust/Cargo source | Gera a partir de CRD; feature cli, requer ferramentas C quando pertinentes; Windows x64 recusado. |
| squawk 2.67.0 | native | Check de migrations Postgres; não é execução da migração no banco. |
| postgres-language-server 0.27.1 | native raw | Check de SQL com PostgreSQL descartável fornecido pelo trabalho. |
| sqlglot 30.21.0 | Python/pip | Check de SQL/dialeto, wheel fixado sem dependências; ambiente Python controlado. |
| kysely-codegen 0.20.0 | Node/npm + lock | Geração com PostgreSQL/MySQL; pg 8.23.1, mysql2 3.24.5 e TypeScript 6.0.3. SQLite omitido por instalação sem scripts. |
| datafusion-cli 55.1.0 | Rust/Cargo source | Check de DDL/SQL; optLevel 0 reduz custo do cold build; Windows x64 recusado, C/linker continuam relevantes. |
| gocqlx-schemagen 3.0.4+orchestra.cassandra4 | Go/source + compatibilidade fixada | Gera a partir de Cassandra/Scylla descartável; overlay de driver e dialer é parte da identidade da receita. |
| modelina 5.10.1 | Node/npm + lock | Gera AsyncAPI com @asyncapi/modelina-cli; dependências bundled do npm seguem a integridade do tarball que as contém. |

**Limite.** Nenhuma linha desta tabela autoriza efeitos externos, cria o DB descartável, resolve privilégios ou comprova output. `fit` serve para escolher a receita e localizar suas dependências de entrada. Entradas substituídas, version bump, alterações em launch/env/features ou em files extraídos são impacto semântico, mesmo se o nome da engine permanecer.

### R3.2 Runtimes e pesquisa

**Observação de manifesto.** Os cinco runtimes são Go 1.25.14 (GOROOT completo), Temurin JRE 17.0.20.1+1, Node 22.23.2 com npm 10.9.8, CPython 3.13.16 standalone release 20261003 e Rust 1.99.0 com cargo/rustc/stdlib/sysroot. O runtime Python conserva a estrutura necessária ao stdlib, pip e DLLs; Node conserva intérprete, lib/npm e licença; Rust não fornece linker C do host. Cada runtime declara targets, executável e floors. [E12]

Os cinco packs research são separados dos backend: `scip-typescript 0.4.0` e `scip-python 0.6.6` usam Node/npm; `scip-go 0.2.7` é source compilado com Go; `rust-analyzer 0.3.3065` usa o VSIX do release 2026-09-28; `typescript 6.0.3` é oracle de typecheck. O compilador 5.x transitivo de scip-typescript não é o oracle TypeScript 6.0.3. Scip-python carrega o fork Pyright e não requer Python do host para indexar seus próprios arquivos; scip-go/rust-analyzer exigem toolchain Go/cargo do projeto/host no caminho de indexação. As bibliotecas de grammar tree-sitter e decoder SCIP são dependências do Core, não engines do manifesto. [E13, E19, E45]

### R3.3 Locks, wheels e integridade

**Observação de dados fixados.** Os sete locks npm foram decodificados como JSON e suas relações de package/root, versões, resolved/integrity e bundled/install scripts foram inspecionadas: backend kysely, modelina, orval, protoc-gen-es; research scip-python, scip-typescript, typescript. Isso confirma o contrato de aquisição representado pelos bytes, sem baixar nem executar dependência. Os locks de pesquisa têm entradas não-root com resolved registry e integrity; Modelina contém subpacotes bundled do npm sem integrity individual, cobertos pelo pacote pai. A presença de `hasInstallScript` em locks backend não cancela o `--ignore-scripts` do instalador. O arquivo de wheels do datamodel fixa o conjunto Python por versão/hash, sem delegar a escolha livre de dependências ao pip. [E07, E11–E13, E45]

**Limite de transporte informado.** O lock Modelina possui **266.885 bytes** e foi preservado integralmente. A principal informou que isso excede o limite de fonte de 256.000 bytes do release Atlas S4 r3, bloqueando a seleção integral naquele runtime. Este produtor não verificou a porta Atlas nem removeu, dividiu, resumiu ou substituiu a fonte por hash. A fonte permanece input obrigatório; identidade e suficiência semântica não implicam admissibilidade de transporte. A solução e o recibo de runtime pertencem à principal.

## R4. Guards de versão e compatibilidade Cassandra

### R4.1 OpenAPI Generator

**Observação.** `project-version.ts` inspeciona o caso owned de `generate`; comandos somente leitura como validate, version, help, list e config-help passam sem exigir metadados de geração. A gramática de flags é fechada, rejeita output ambíguo, caminhos/substituições adiadas, cwd fora do projeto e formas não reconhecidas. Resolve caminho físico, inclusive symlinks, e limita arquivos de configuração a 1 MiB. Ausência ENOENT é distinta de arquivo ilegível ou inválido. [E09]

Os dois registros relevantes são `openapitools.json → generator-cli.version` e `<output>/.openapi-generator/VERSION`. Qualquer versão presente deve corresponder ao bundle 7.25.0; ambas ausentes permitem primeira geração. Valores conflitantes ou stale não viram confiança no “binário mais novo”. JSON tem leitura estrita. YAML aceita um subconjunto de mappings/escalars, recusando aliases, tags, coleções e formas ambíguas: não é equivalência completa com o parser do gerador. [E09]

**Uso e impacto.** Para mudar versão, é necessário reconsiderar manifesto, registros de projeto/output, gramática e testes do guard. Um caminho que apenas adquira o JAR não prova que esse guard foi aplicado pelo chamador. O corpo não inventa uma integração além das chamadas visíveis na população.

### R4.2 Driver e rede da geração Cassandra

**Observação.** `cassandra-metadata.ts` aplica um overlay privado, hash-fixado, sobre scylladb/gocql 1.15.3 e gocqlx 3.0.4. Verifica bytes de go.mod, go.sum, gerador e driver antes da modificação; verifica resultados, adiciona replace local em staging e preserva licença/notices. A adaptação de metadata evita tratar tabela opcional do Scylla como requisito Cassandra; falhas verdadeiras de consulta não são apagadas. A receita não autoriza patch genérico para qualquer versão upstream. [E10]

`cassandra-dialer.ts` introduz um hook de rede com dois modos exclusivos: rotas por socket Unix ou proxy CONNECT. São no máximo 32 rotas, portas canônicas 1–65535, socket absoluto válido com tamanho limitado e sem duplicatas. CONNECT aceita proxy HTTP loopback, sem credenciais/path/query/fragment; o destino permitido pelo código é tcp para 127.0.0.1 na porta declarada. Lê uma resposta CONNECT 200 com headers limitados e deadline, fechando conexões em cancelamento/falha. A allowlist efetiva do proxy é responsabilidade externa; a existência do dialer não a amplia. [E10]

**Limite.** Os testes descrevem servidores controlados e diferenças Cassandra/Scylla, mas nada foi conectado nesta produção. Uma alteração de hash, API do driver ou protocolo requer rever o overlay completo e as duas pontas do túnel. Não há claim de compatibilidade com um serviço real a partir do nome `cassandra4`.

## R5. Orçamentos, planning e prewarm de pesquisa

**Observação.** `ResearchToolkit` tem raiz própria, default por ambiente/cache, e delega status/ensure/prefetch ao backend com manifesto research. Pack canônico ausente aparece `unsupported:pack-not-shipped`, inclusive quando o manifesto inteiro está vazio. Não existe inferência “nenhum pack na lista, logo tudo pronto”. [E14]

Os caps default são 2 GiB para indexer, 1 GiB para probe, 2 GiB de scratch e 4 GiB de índice, oito commits e 15 minutos por shard. `caps()` aplica `Math.min` a quatro limites de bytes; permite reduzi-los, não elevá-los. Essa função sozinha não valida positividade/finitude, e não reconfigura as duas outras dimensões. A validade de configuração e a propagação de caps aos chamadores são obrigações distintas. [E14]

**Observação que impede falso sucesso.** O adapter default de `Index` retorna plano vazio e falha `index-builder-unavailable` ao construir. Portanto, `shards=[]` ou warm sem trabalho não provam ausência de código nem execução do índice. O adapter real está em `code-index/extract.ts`: usa Git, CodeIndexBuild, engines reais e store. Seu mapeamento para prewarm filtra os ids que não são engines research; um shard estrutural tree-sitter pode ser construível pelo caminho direto e não aparecer nesse aquecimento. [E14, E18]

**Observação.** `prewarm` deduplica worktree no processo e inicia fibra detached; segunda chamada não recebe join da primeira. O warm planeja, ordena shards pendentes por rank descendente, garante cada engine e prossegue após skips/falhas. O adapter real fornece rank como contagem de arquivos do shard, embora o tipo comente aggregated file_rank. Builds usam singleFlight por shard e lock `research-toolkit:indexer` sob a raiz para serializar indexadores entre worktrees; tratam timeout/lock comprometido/falha de engine com razões. [E14–E18]

**Limite de status.** Erro de plan é convertido em lista vazia no warm. Estado auxiliar é persistido fora do worktree, com nome derivado do caminho; leitura inválida vira mapa vazio e falha de escrita é ignorada. `building` expira após o timeout; `ready` deriva do plano/store. Esse estado auxilia operação, mas não certifica um build concluído ou uma evidência de execução durável. A resposta vazia pode significar adapter default, erro de observação, nenhum shard elegível ou plano realmente vazio. Um consumidor precisa distinguir essas origens antes de alegar cobertura. [E14]

## R6. Identidade e persistência do índice

### R6.1 Partição e chave

**Observação.** `shard.ts` lê Git com variáveis potencialmente influentes removidas, prompts/configs globais desabilitados e limites de processo. `ls-tree` considera blobs e exclui submodules; status identifica modificados, adicionados, removidos e untracked. `cat-file --batch` respeita tamanhos em bytes. Erro/truncamento vira `source_unavailable`, não árvore vazia válida. [E16]

A descoberta usa projetos mais próximos por tsconfig, pyproject/setup, go.mod e Cargo.toml. TS configs que só estendem outro ou declaram files=[] sem include não são tratados da mesma forma que projetos com fontes próprias. JavaScript participa de TS. Python pode usar raiz de fallback quando não há projetos Python descobertos; se há projetos, arquivos fora deles não ganham automaticamente um projeto inventado. Órfãos ficam discriminados. `.pyi` é reconhecido pelo filtro/grammar, mas não está na função de linguagem usada para descoberta de shards; logo a presença de suporte no parser não implica inclusão autônoma no plano. [E16, E19–E22]

A chave SHA-256 incorpora id/versão de indexer, identidade do shard, pares path/blob das fontes e locks/configs do projeto/raiz, incluindo cadeia relativa de extends com proteção de repetição/profundidade. Não é simplesmente o HEAD: conteúdo idêntico pode reutilizar a mesma chave entre commits. Mudança de lock, config ou engine altera impacto mesmo sem mudança no arquivo consultado. Projeto aninhado tem ownership próprio. [E16]

### R6.2 Planejamento, build e retenção

**Observação.** `build.ts` memoiza até 16 planos por raiz/HEAD e conjunto de indexers. A identidade do repositório usa o caminho real do Git common directory. Constrói somente shards ausentes; singleFlight compartilha o trabalho em processo. Uma chamada com build já em curso pode devolver progresso vazio, não join nem sucesso coletivo. Falha de um shard não encerra todos os demais; razões ficam disponíveis. [E17]

`store.ts` usa SQLite por repoKey/shardKey com tabelas de documentos, símbolos, ocorrências, relações, imports, rank e FTS. Escreve banco temporário em transações e renomeia, sem WAL de longa duração. Leitura é readonly e scoped. `exists()` só verifica existência de arquivo, não saúde integral de schema/conteúdo. Falha de singleFlight fica registrada até sucesso posterior; interrupção tem motivo próprio. [E17]

A retenção mantém referências de commits e remove bancos não usados. O commit mais novo sempre fica, mesmo que ultrapasse o budget de bytes; oito commits e 4 GiB são política de retenção, não garantia rígida de que o disco jamais ultrapassa esse tamanho. Stat com falha contribui zero ao cálculo; manifesto ilegível vira lista vazia. Remoção de bancos precede persistência final do manifesto, e não há serialização multiprocesso explícita nesse arquivo para toda a retenção. Essas escolhas exigem cautela ao interpretar “cache existe” ou “budget aplicado”. [E17, E45]

### R6.3 Extração real e sua base

**Observação.** O adapter de extração aceita Linux/Darwin; pins Windows dos packs não criam suporte de indexação nesse caminho. Estados ready/absent/fetching podem tornar um indexer utilizável para planejamento/aquisição. Go e Rust podem cair para tree-sitter quando falta o indexer preciso ou toolchain; o motivo participa da versão estrutural e de `coverage.skipped`. Se nenhum indexer está disponível antes dessa etapa, o caminho pode falhar `index_unavailable`; a existência do fallback não é promessa de cobertura universal. [E18]

O build real recebe fontes do worktree, extrai estrutura, executa SCIP quando aplicável, decodifica e monta conteúdo no store. Confere HEAD antes de um build de shard disparado pelo toolkit, mas não produz snapshot imutável de todos os arquivos enquanto extrai. O texto e seu SHA-256 armazenado vêm da leitura efetiva; não é lícito afirmar que todos os bytes são exatamente os blobs do commit só porque o plano foi identificado por HEAD. [E18]

A invocação SCIP tem argv específico por engine, confine externo, timeout de 15 minutos, RSS e captura de logs delimitada. A função verifica exitCode; ela não transforma todos os flags de truncamento do resultado em erro explícito nesse local. As propriedades de rede/escrita dependem de confine, e não foram executadas aqui. [E18]

## R7. Parsers, símbolos, imports e relações

### R7.1 Camada estrutural

**Observação.** `filter.ts` seleciona linguagens suportadas e exclui vendor/build/generated, locks e binários com razões. Não impõe um censo artificial de 200 arquivos. Linguagem não suportada é excluída da seleção; essa exclusão não é contada como cobertura semântica do repositório inteiro. Tree-sitter limita cada arquivo a 2 MiB; falha de grammar, excesso de bytes e parse parcial têm razões. Parse com erro pode conservar definições úteis, mantendo complete=false. [E19]

A extração estrutural fornece tipos, funções, membros, enums, constantes e containers. Inclui função local, mas exclui variável local comum; export é heurística sintática: underscore em Python, maiúscula em Go, pub em Rust, com pub(crate) não equivalendo a export público. TS/JS conservam imports estáticos/reexports e dynamic import/require literais; Python tem extração de imports de topo. Wrappers/decorators e linhas de nome têm tratamento específico. Não se trata de typechecker nem de execução da linguagem. [E19, E22]

Go adiciona tipos/fields/métodos e aliases de import, com comando SCIP offline e GOTOOLCHAIN=local. Python define args de projeto/version/output e filtra símbolos de módulo `__init__`. Rust adiciona regras de impl/trait/mod e pub, comando `rust-analyzer scip` com cargo offline, e imports com crate/self/super. Os tests de cada linguagem congelam exemplos, inclusive funções aninhadas, unicode e aliases; não substituem revisão do limite do parser. [E22, E45]

### R7.2 SCIP, encoding e associação de ocorrências

**Observação.** `scip.ts` recusa entrada não regular antes de decodificar protobuf. Memoiza no máximo dois dumps por path, mtime e tamanho; isso não detecta reescrita de mesmo tamanho no mesmo timestamp. Extrações temporárias liberam explicitamente o memo. `readScipOrEmpty` existe para consumidores tolerantes e degrada erro a índice vazio, mas o adapter real usa o leitor que propaga falha. Não se deve projetar a semântica tolerante de um helper para todo build. [E20]

O leitor converte offsets UTF-8/UTF-32 para unidades UTF-16 quando encontra texto do dump ou callback de fonte; Go/Rust têm encoding default específico. Sem texto, conserva ranges emitidos: unicode pode permanecer deslocado. A validação de range reconhece formatos de três/quatro números e conta formas malformadas; não prova toda propriedade numérica ou ligação com conteúdo. As linhas expostas são 1-based e fechadas; a representação de início de coluna do leitor é 1-based, enquanto o store subtrai um para início 0-based e mantém fim exclusivo. Confundir esses espaços causa deslocamento. [E20, E18, E45]

`enclosing.ts` combina ranges SCIP com estrutura por nome e linha do nome quando falta intervalo preciso. Escolhe o container mais interno que envolve a ocorrência e impede que uma definição se contenha a si mesma. Imports ganham role próprio. É uma associação de posição e nome, não análise dinâmica. [E21]

`callers.ts` distingue definições globais, símbolos locais, referências resolvidas e casos opacos do scip-typescript. A canonicalização entre dist/.d.ts/src é heurística e pode não representar bundles de declaração arbitrários. Callers agrupam referências não-import por enclosing; “call” não é prova de chamada de runtime. [E21]

**Limite concreto de persistência.** Em `extract.ts`, a montagem descarta símbolos que não considera indexáveis e grava `opaque: false` nas ocorrências persistidas, mesmo existindo detecção de opacidade em Callers. O contador `opaqueSites` consultado depois não pode ser lido como certificado de que não existem lacunas opacas. A observação é sobre a ligação atual entre módulos; não foi corrigida para tornar a alegação mais forte. [E18, E21, E24]

### R7.3 Resolução de import e rank

**Observação.** `resolve.ts` usa a API TypeScript, tsconfig mais próximo e caminhos/workspaces. Erro de config cai em defaults Bundler/ESNext, allowJs/JSON. Alias/workspace conhecido mas quebrado fica unresolved; pacote bare desconhecido fica package. Esse contraste conserva uma lacuna que seria perdida ao chamar qualquer import de dependência externa. Python tenta src layout antes da raiz e formas .py/.pyi/__init__, respeitando imports relativos. Go resolve pacote do mesmo módulo para o primeiro arquivo não-test ordenado; não resolve “o símbolo exato” dentro dele. Rust resolve crate/self/super por layout Cargo/src e prefixo mais longo; macros, layouts customizados e resolução completa do compilador não são prometidos. [E22–E23]

`rank.ts` calcula PageRank de arquivos com damping 0,85 e 20 iterações, deduplicando arestas, sem self/outside-shard, redistribuindo dangling nodes. É um sinal de navegação, não confiança factual. Sua existência não significa que o prewarm usa esse score: o adapter descrito em R5 usa número de arquivos. [E23, E18]

## R8. Como interpretar consultas, busca, localização e liveness

### R8.1 Query: vazio, stale e dirty

**Observação.** `types.ts` declara definition, references, callers, callees, implementations, imports/importers, symbols e map, paginação default 50/máximo 200 e candidatos ambíguos limitados a 20. A base acompanha commit/dirtyDigest/shards, execução, cobertura, freshness e bounds. Esses campos precisam acompanhar a conclusão; não são decoração. [E24]

`query.ts` abre shard atual ou o mais novo retido de mesmo id quando o atual falta. Nesse segundo caso marca stale e pode informar changed-since-index. Se não há shard aberto, dispara build detached e devolve building/unavailable com motivo, sem fabricar resultado vazio limpo. O commit e versões em basis vêm do plano atual; numa resposta stale não se deve atribuir automaticamente aos rows antigos os bytes atuais. Erros de build anteriores e linguagens ausentes continuam relevantes. [E24]

A consulta normaliza path lexicalmente sob a raiz, não por realpath de cada caminho. Dirty overlay lê modificados/untracked e digest de conteúdo/removidos. A substituição está concentrada nas listagens/resolução por nome de símbolos: exclui rows armazenados de paths dirty e acrescenta estrutura atual. Não atualiza universalmente tables de imports/references/callers/callees/map; buscas por id/posição também não compartilham todos os filtros dirty. Assim, `dirty-overlay` não certifica reindexação semântica completa, e uma árvore de símbolos atual não torna todas as referências atuais. [E24–E25]

Definition pode resolver id preciso, nome/qualificado, posição ou FTS; ambiguidade retorna candidates em vez de escolher arbitrariamente. Referências globais ligam shards por símbolo SCIP. Callers agrupam ocorrências por container; callees coleta referências não-definição dentro do range, não somente expressões de chamada. Implementations usa relações do dump. Map agrega diretórios/arquivos/rank/LOC e pode paginar. Linhas e limites precisam ser preservados no uso posterior. [E25]

**Limite de completude.** `coverage.complete` é calculado de skips e linguagens ausentes; há caps de apresentação de skips e bounds separados para hits. Não expressa todas as limitações de grammar, resolução, opacidade ou dirty overlay. “Nenhuma referência retornada” só significa nada encontrado sob aquela base, query, projeção e limites; não prova que o símbolo não é usado em runtime, fora da linguagem suportada ou em conteúdo stale/omitido. [E24–E25]

### R8.2 Busca e localização

**Observação.** `search.ts` usa ripgrep bundled, argv fixo, `-e` para padrão e `-- .` para evitar interpretação do padrão como opção. Literal é default; regex/identifier são modos explícitos. Respeita ignore, inclui hidden e exclui .git; paths viram globs. Captura até 8 MiB e separa regex inválida de falha de busca ou saída parcial. Ordena/pagina, limita trechos a 300 caracteres sem cortar par UTF-16 e devolve truncamento/cobertura. O conteúdo é worktree atual, não necessariamente commit imutável. [E26]

Há uma segunda passada para contar binários. Seus erros/truncamentos não são tratados pelo cálculo principal de incomplete da mesma maneira que a busca textual. JSON inválido no stream também não é resultado vazio válido. Portanto, `binariesSkipped` é diagnóstico limitado, não auditoria completa de todos os arquivos. [E26]

`locate.ts` combina termos/símbolos/pergunta, mapa e buscas, com orçamento máximo de 32 buscas, no máximo dez buscas de vizinhos, cinco seeds e três snippets por arquivo. Usa RRF com constante 60 e sinal normalizado de rank; default 12 resultados, máximo 40. Se o índice está indisponível ou building, degrada explicitamente para busca lexical. `semantic: absent` permanece mesmo quando usa índice: não há embeddings/modelo semântico escondido. [E27]

Cada range candidato é conferido contra o conteúdo atual: linhas, substring/nome e bounds. Ranges inválidos são descartados e contados; snapshots de blocos mantêm coordenadas originais para retenção. A cobertura completa combina estado das consultas e do índice, com bounds/discarded separados; ela não deve ser interpretada como “todos os locais possíveis foram encontrados”. O mecanismo reduz evidência stale sem transformar heurística de ranking em prova. [E27]

### R8.3 Liveness de URLs

**Observação.** `liveness.ts` classifica LIVE, DEAD, LIKELY_HALLUCINATED e UNKNOWN. Deduplica URLs exatas; normaliza comparação removendo fragment e slash final; captura registrada com menos de 24 h pode produzir LIVE sem request. Fora desse atalho, há pool de oito, HEAD e GET range bytes=0-0 quando HEAD é rejeitado, timeout de oito segundos por request e limite de cinco redirects. 2xx é LIVE; 429 e timeout são UNKNOWN; DEAD fora do conjunto seen vira LIKELY_HALLUCINATED. Este último nome é heurística de proveniência, não conclusão de fabricação. [E28]

A helper `allowed` usa sufixo por label para domínios; `check` não chama essa helper automaticamente. A recusa de hosts privados/locais e schemes fora HTTP(S) acontece no caminho de probe. O atalho de captura recente confia na metadata recebida, e a checagem DNS precede fetch sem fixar o endereço resolvido para a conexão. Logo não se pode inferir isolamento de rede completo só desta função. O parâmetro privateNetwork é uma exceção explícita destinada a testes. LIVE significa reachability ou captura recente, nunca verdade ou autoridade do conteúdo citado. [E28]

## R9. Probes: experimento limitado, não retentor automático

### R9.1 Runner, snapshot e processos

**Observação.** `probe/types.ts` define uma união fechada: typecheck, teste de arquivo/nome e script TS/JS/Python. Não aceita argv arbitrário fornecido pelo modelo. Os defaults são heap de 1.024 MiB, RSS 1 GiB, scratch 2 GiB, 1 MiB por stream, tail 64 KiB, script 16 KiB, um probe por dispatch, dois por host e fila de 30 segundos. `run.ts` aceita apenas Darwin/Linux, limita timeout de execução ao menor entre pedido e allowance restante, e recusa limite esgotado. [E29–E30]

Snapshot commit usa revisão Git explícita, arquivos da árvore e estimativa de espaço; snapshot worktree copia tracked/unignored incluindo dirty/untracked e calcula dirtyDigest. Dependências como node_modules, .venv e target podem ser symlink para a árvore original mesmo em snapshot de commit. A intenção é leitura pelo jail, não snapshot hermético de todas as dependências. Arquivos que desaparecem durante cópia podem ser omitidos, e não há transação que congele o worktree inteiro. [E31]

`assets.ts` procura pacotes de projeto tsc/vitest/jest e confere package.json, bin regular e realpath dentro do pacote. Isso confere identidade estrutural local do runner, não confiança irrestrita no código do projeto. O fallback tsc usa pack research, com falha de aquisição convertida em unavailable. Paths de runner/input devem ficar dentro do snapshot, e seleção ambígua de projeto/runner é recusada. [E32]

`runners.ts` usa comandos fechados: Bun com --no-env-file e alvo exato; Vitest run; Jest runTestsByPath; pytest -B sem cache; Go test por pacote, não apenas pelo arquivo apontado, com toolchain local/proxy off; scripts escritos no scratch separado e limite UTF-8 de 16 KiB. Typecheck usa tsc -p --noEmit --pretty false e flags opcionais de unused, com memória Node definida. `typecheck.ts` converte diagnósticos TS em paths/ranges/códigos, mantém mensagens globais e continuações, resume causas e limita a apresentação a 200 diagnósticos. Isso não é avaliação geral de qualquer formato de compiler. [E32–E33]

`ResearchProcess.environment` parte do ambiente permitido pelo sandbox, remove Git/Node options e configura Git não interativo/sem configs externas. A execução usa AppProcess e serviço de memória, streams com hard cap e cauda, timeout e encerramento scoped. Flags de overflow/memória/timeout são retornadas separadamente; não se deduz pico de RSS medido a partir do nome do cap. [E30]

### R9.2 Resultado e limites de enforcement

**Observação.** `run` cria scratch temporário, snapshot, plano, chama `ToolSafetySandbox.confine` com lista write vazia e executa o comando lançado. Resultado inclui probeID, snapshot/revisão/dirtyDigest/files, runner/argv/version, verdict, exitCode, duração e saída resumida. A precedência trata timeout, memória, erro e a frase do guard de testes antes de classificar passed/failed ou reproduced/not_reproduced. “Reproduced” depende do expect declarado e não é sinônimo de exit 0. [E29–E33]

**Limites concretos.** O timeout de subprocesso não cobre todo preparo de snapshot/fila. Heap/RSS podem ser fornecidos no contexto sem `Math.min` local; a redução de `ResearchToolkit.Caps.scratchBytes` não é usada diretamente por `ProbeRun`, que passa `Probe.Limits.scratchBytes`. O semaphore de host é objeto no processo, não prova de coordenação distribuída entre processos. O jail/Omni/MemoryCap externos precisam de sua própria evidência. [E29–E31]

A função retorna resultado e oferece URI `probe:<executionSessionID>/<probeID>`; não captura, admite ou cobra automaticamente esse resultado no ledger aqui. O chamador deve debitá-lo e retê-lo pela porta nativa correta. Um objeto de resultado isolado não ganha autoridade de fonte, e os testes de probes não foram rodados nesta produção. O guard que proíbe testes locais é tratado como `blocked_by_repo_guard`; não há justificativa para contorná-lo. [E29, E34–E43]

## R10. Identidade nativa e orçamento durável

### R10.1 Quem pode produzir e reler

**Observação.** `binding.ts` exige Session existente do projeto, agent `jimmy`, relação de TaskBound única, identidade consistente de projeto/task, authorSession válida e associação de execução via sessão própria/parent. Worktree usa a raiz registrada mais longa que contém a sessão; fallback é seu diretório. `require` verifica frame de CapabilityInvocation, owner/agent/session/location, resolução atual do binding e igualdade com a identidade retida. Confere também a parte de mensagem/tool call persistida, tanto no formato legado quanto no novo. Dizer “sou Jimmy” não satisfaz o contrato. [E34]

Leitura humana retida não exige invocação ativa, mas revalida a localização nativa original. Fonte de outro task no mesmo projeto só é acessível pelas regras explícitas das APIs e com revalidação do binding da fonte; não há fallback para path arbitrário ou fonte de outro projeto. Session removida, binding divergente ou tool part ausente geram falha, não reconstrução silenciosa da autoridade. [E34, E36–E40]

`seat-tools.ts` declara o seat e listas de ferramentas próprias, de loop, de Claude e resultados que exigem retenção. As listas incluem code_query/search/locate e probe_run, além das portas research e Atlas. Elas descrevem fronteira e dispatch, não provam registro concreto de todas as capabilities numa instância. [E43]

### R10.2 Allowance e reconciliação

**Observação.** `allowance.ts` vincula limites duráveis ao dispatch antes de charge. Limite default/tier vem do schema externo; não se inventa quota numérica a partir do nome quick. Um bind repetido precisa ser idêntico; não amplia allowance. Compatibilidade com registros antigos preserva limites originalmente decodificados. [E35]

Charge tem operation id não vazio/limitado, valor inteiro não negativo, e provider/tool devem cobrar unidade um. Repetição da mesma operação e mesmos dados é idempotente; payload divergente conflita. A publicação reconsulta binding e gasto dentro do callback transacional de EventV2 para impedir disputa pelo saldo. Há quatro dimensões, provider calls, tool calls, source bytes e probe seconds. A garantia de transação do banco subjacente é do dono de EventV2, embora a intenção BEGIN IMMEDIATE esteja documentada na fonte. [E35]

Reserva de bytes é conservadora e irreversível; reconcile exige valor dentro da reserva e não devolve saldo, mesmo quando parte não foi usada. Tentativa com publicação incerta permanece debitada, evitando retry invisível. Deadline é metadata de bind aqui, não enforcement universal de tempo em todo caminho. Ledger inválido leva a `publication_uncertain`; interrupção propaga, não vira gasto zero. [E35]

**Consequência operacional.** Distinguir “operação foi cobrada”, “fonte foi adquirida”, “fonte foi admitida” e “artefato foi publicado” é obrigatório. Nenhum desses eventos permite deduzir automaticamente os outros. Para recomeçar depois de estado incerto, consulte a identidade e os eventos retidos; repetir uma ação externa sem esse vínculo perde idempotência.

## R11. Custódia, admissão, bytes e locators

### R11.1 Source artifact e evento de admissão

**Observação.** `ledger.ts` faz hash canônico com chaves ordenadas, arrays preservados e undefined omitido; operation vincula session/message/call/action, e ids de evento vinculam execução/chave. Os três tipos de entrada do corpus são SourceAdmitted, RecordCommitted e DocumentPublished. SourceAttempted e eventos Inquiry têm papéis separados. O default restringe à execução; lookup explícito por id pode cruzar tasks do mesmo projeto sob as regras da porta, com binding original revalidado. [E36]

`artifacts.put` guarda bytes e um manifest com binding, operation, ref/revision, representation, digest e comprimento. A identidade é determinística quando derivada da operação, e repetição com bytes diferentes conflita. Gravar o arquivo antes do evento é permitido para retomada; **arquivo em custódia não é fonte admitida**. `load` exige exatamente um evento de admissão pertinente, compara manifest e receipt, revalida binding e só então confere bytes/digest. Ausência de evento, arquivo removido, corrupção ou divergência não autoriza fetch live substituto. [E37–E38]

O store deriva paths privados de hashes de projeto/task, recusa diretórios symlink e arquivos não regulares, usa NOFOLLOW, tamanho limitado, escrita exclusiva com fsync e hardlink que não substitui um arquivo existente. Se o destino existe, bytes devem ser idênticos. A leitura detecta mudança de tamanho. Essas proteções locais não demonstram toda semântica de crash de filesystem; por exemplo, não se afirma fsync de cada diretório pai. [E38]

### R11.2 Representação, paginação e fonte parcial

**Observação.** `read` valida UTF-8 integralmente para leitura textual, prende cursor a binding/ref/revision/digest/representation/pageSize, valida offset e corta em limites de code point. A última página só é complete se a admissão original também era completa. Fonte parcial não vira completa por chegar ao fim dos bytes retidos. `verifySource` pode verificar custódia/digest de fonte binária parcial sem exigir decode textual; isso permite derivação explícita sem fingir que o original é texto. [E37]

`capture` recebe origin/media/content/complete/derivedFrom/transformation/observed/atlas; calcula digest e ref, preserva intent estável, grava bytes e só então publica SourceAdmitted. `complete` é metadata fornecida pelo host, não resultado de um auditor universal. Parent e transformação devem acompanhar uma fonte derivada; atlas-own exige metadados Atlas. Uma captura exata repetida pode devolver o receipt original sem revalidar naquele caminho a disponibilidade do arquivo; a leitura posterior continua responsável pela verificação. [E40]

### R11.3 O que um locator valida

**Observação.** `records.ts` lê integralmente a fonte retida paginada para validar evidence, sem truncar silenciosamente e sem readquirir a fonte ao vivo. Line locator exige range válido. Em fontes observadas com lineStart, remapeia coordenadas originais. Para blocos de Locate, conserva ranges originais e verifica contenção em algum bloco; esse locator por linha não distingue sozinho paths diferentes que compartilham o mesmo intervalo. Quote precisa corresponder ao texto exato, com prefix/suffix quando fornecidos; múltiplas ocorrências, inclusive sobrepostas, são ambiguidade. [E39]

JSON locator exige representação JSON estruturada e decode válido, aceita raiz vazia ou pointer canônico com escapes ~0/~1, só propriedades próprias e índices de array canônicos. `source_unavailable`, `reference_invalid` e `locator_ambiguous` preservam o motivo da recusa. Esses checks validam endereço e identidade da evidência; não provam que a proposição interpretou corretamente o trecho. Fonte hostil é conteúdo a citar/avaliar, nunca instrução para o produtor ou privilégio novo do leitor. [E39]

## R12. Registros, publicação incerta e inquiry

### R12.1 Revisões e documentos

**Observação.** `record` limita campos e input/event bytes, exige invocação nativa e faz replay por input hash. Findings validam evidence e contrary; relations validam refs admitidas; documentos só podem usar findingRefs de findings e citações válidas. Revisão usa id+baseRevision juntos, histórico da execução e CAS contra última revisão; mudança material de finding exige razão. Identidade de novo registro é determinística. [E39–E40]

`artifacts.prepare` conserva intent com metadata e timestamps estáveis em caso de falha entre arquivo e evento. Documento pode gravar corpo antes de publicar o evento. O commit reconsulta latest/event id como segunda barreira; após erro, só retorna sucesso se encontrar o exato evento persistido. Caso contrário, devolve conflito ou `publication_uncertain`. Assim, um retorno de erro não é prova de que nada foi publicado, e um arquivo solto não certifica publicação. [E38–E40]

Links Markdown `research:` normais precisam ter label/citação existente. A travessia cobre listas e tabelas; código fenced e HTML raw não se tornam citações por parecerem links. O validador não exige uma citação em cada frase e não verifica verdade proposicional do documento. “Documento aceito pelo parser de citações” não é “conhecimento semanticamente aceito”. [E42]

### R12.2 Aquisição e tentativa: retry visível

**Observação.** `attempt` grava SourceAttempted com outcome, separado do corpus admitido. `beginAcquisition` registra pedido durável antes de ação live; repetição deve ter identidade idêntica e outcome finalizado. Pedido anterior ainda incerto recusa readquisição live. Tentativa anterior sem fonte devolve source_unavailable, exigindo nova chamada nativa para nova tentativa; um novo operation id não é ocultado como replay do anterior. Só source admitida e retorno retido correspondente são reutilizados. [E41]

Essa separação preserva economia e causalidade: falha de observação não vira fonte vazia, e aquisição “talvez ocorreu” não justifica reexecutar invisivelmente. O fluxo não cria um protocolo universal de retry para qualquer provider fora das portas inspecionadas.

### R12.3 Views e inquiry

**Observação.** Views de corpus/attempts/records aplicam limites de bytes e linhas. Corpus lista total e complete=false quando recorta, sem cursor dessa coleção. Attempts e records têm cursor ligado ao binding, limite e snapshot hash dos ids ordenados; cursor stale conflita. Fonte/documento/artifact são consultados por ref/revision exatos. Find literal escapa regex, limita 100 matches procurando o 101º e só declara complete quando a fonte era completa e não excedeu o limite. Coordenadas de strings são UTF-16. [E42]

Inquiry tem eventos de abertura, checks e fechamento por dispatch, com replay exato e apenas um opened/closed; checks podem ser múltiplos e não há novos eventos depois de close. O código local não exige, por si, que todo check/close seja precedido por opened: a conversa/protocolo mais amplo precisa dessa disciplina. `dispatch` ancora entries ao evento de allowance e filtra charges do dispatch; `closed` usa o dispatch mais recente, impedindo um card antigo fechado de responder uma sessão retomada. [E36, E42]

**Consequência de autoridade.** A lista de ferramentas, o label de seat, o arquivo no disco, a captura, o receipt, o record e o resultado de uma inquiry são objetos com contratos distintos. Um consumidor seguro identifica qual possui, qual evento o admite, que bytes/revisão ele aponta e que conclusão a evidência sustenta. Persistência e validação de locator não dispensam confronto de fontes contraditórias ou abstenção diante de fonte missing/stale.

## R13. Disposição das 130 fontes e contratos de validação

**Observação de cobertura.** A expansão da leitura não deixou implementação substantiva no nível de “representante da família”. Os 80 arquivos de implementação foram inspecionados pelo fluxo/contrato que define seu comportamento; manifestos de dados repetitivos foram lidos por receita, targets, floors, entries, launch, dependências e restrições, com pins integrais preservados. Sete locks têm leitura de contrato/dados, sem interpretação independente de cada dependência transitiva upstream. O gerado tem leitura do contrato de geração. README tem leitura de ownership/intenção. Os 41 testes foram lidos como contratos e casos existentes, não rodados. A profundidade exata por path está em `coverage.jsonl`.

| Grupo de testes, relativos a packages/core/test/ | Necessidade que os contratos tornam verificável | Limite nesta entrega |
| --- | --- | --- |
| backend-toolkit-acquisition, hosted, process, source, source-readiness, backend-toolkit | Coalescência, cooldown, staging, interrupção, isolamento de runtime, executável obrigatório e shim/deps | Fixtures e expectations são intenção; zero execução |
| backend-toolkit-cassandra, project-version | Overlay pinado, metadados Cassandra/Scylla, proxy, versão/config/path/symlink | Nenhum serviço ou gerador foi invocado |
| backend-toolkit-cli, floors, packs, target, pinned-artifact | Interface CLI, packs/target/floor, integridade e falhas de aquisição | Não qualifica targets a partir do manifesto |
| research-toolkit, research-toolkit-packs, research-toolkit/capability, code-index-toolkit | Root próprio, pack missing, prewarm/ordem/lock, caps e adapter real | Expectativa de warm não é recibo desta execução |
| code-index-query, rank, store | Chaves, stale/dirty, paginação, build/singleFlight, graph rank e retenção com newest acima do budget | Não prova todas as consultas em worktree real |
| research-toolkit-callers, enclosing, scip, code-index-scip-encoding | Relações SCIP, enclosing, opacidade, memo e unicode UTF-8/16/32 | Não amplia semântica persistida além de extract |
| code-index-filter, go, python, resolve, rust, structural, tree-sitter | Linguagens, resolução, parse parcial, tamanho, fallback estrutural e nomes/exports | Fixtures pequenas não provam semântica de linguagem completa |
| research-search, research-locate, research-toolkit-liveness | Flags/injeção, bounds, ranking, verificação de ranges, liveness e rede privada | Nenhuma busca de produto ou URL foi executada |
| research-probe-units, research-probe | Snapshot/runners, diagnóstico, memória/timeout, write/network/guard e concorrência | Guard de testes locais respeitado |
| research-binding, allowance, artifacts, records, inquiry-ledger | Vínculo nativo, idempotência, concorrência, bytes/UTF-8, corrupção/symlink, citações/CAS e retomada | Sem eventos reais novos no produto |

Nos rows acima, os nomes que começam por `code-index-` na subpasta de research-toolkit são discriminados pelo path exato no inventário; não são testes ausentes com nomes aproximados. E44–E46 preservam as expectations decisivas, e a cobertura possui uma linha por arquivo para impedir que o agrupamento apague sua disposição.

**Limite de fidelidade dos dados.** Nenhuma das 130 fontes foi rejeitada ou substituída: todas correspondem ao blob normativo. “Fonte inválida” neste corpo descreve as recusas do componente a dados de pesquisa ou caches inválidos, não afirma que o inventário veio corrompido. Dados que referenciam fixtures/helpers, schemas, scripts geradores ou módulos fora da lista são tratados como dependências externas de implementação/validação; não foram incluídos silenciosamente na população e não sustentam qualificação que exigiria ler/executá-los.

## R14. Uso, impacto e obrigações ainda separadas

**Inferência de manutenção com base nas relações lidas.** Um consumidor pode começar pela tabela R0 e aprofundar somente a cadeia pertinente. Para mudar uma receita, reveja manifesto/pins/lock ou wheels, runtime/executable/layout, floors, launch/env, readiness e contratos de instalação; mudar só uma versão pode invalidar guard de projeto ou overlay Cassandra. Para mudar índice, reveja chave de shard/config/lock, versão de engine, extração/encoding, schema/store, query/freshness e projeção de basis. Para mudar autoridade, reveja binding, hash de operação, allowance, intent/bytes, evento de admissão, cursor/locator e CAS de revisão. Esses conjuntos são consequências documentadas da implementação; não substituem L3/L4 aceitos nem alegam uma simulação de manutenção executada. [E03–E43]

| Situação de consumo ou manutenção | Ação sustentada por este L1 | Motivo para abster-se de uma conclusão mais forte |
| --- | --- | --- |
| Engine listada, instalação ausente | Ler estado/razão, dependências e receita antes de aquisição autorizada | Pin não é qualificação |
| Warm retornou sem shards | Conferir adapter, falha de plan, linguagens e filtro estrutural | Vazio é ambíguo e status é best effort |
| Índice stale ou arquivo dirty | Preservar basis e usar leitura atual para validar range; solicitar rebuild autorizado quando necessário | Overlay não atualiza todas as relações |
| Nenhum hit ou opaqueSites zero | Restringir conclusão à query/base/limites efetivos | Skips, structural-only e ligação opaque limitam ausência |
| Probe devolveu resultado | Cobrar/reter pela chamada nativa e conferir receipt antes de usá-lo como fonte | Result object não é SourceAdmitted |
| Captura parcial/binária/derivada | Preservar representation, complete, parent/transformation e locator cabível | Terminar páginas não torna fonte completa |
| Arquivo presente mas evento/manifest/digest faltante | Tratar como indisponível/inadmitido conforme erro | Custódia não é autoridade |
| Publicação incerta | Consultar operação/evento exatos; não refazer ação live silenciosamente | Erro não prova ausência de efeito |
| Fontes contraditórias ou texto hostil | Registrar contrary/conflito e tratar texto como dado | Locator válido não julga verdade nem cria permissão |
| Fonte obrigatória maior que limite Atlas | Preservar bytes/dependência e reportar bloqueio concreto | Prepare não pode ser “consertado” removendo evidência necessária |

**Limites intencionais preservados.** Não há qualificação de host/engine/plataforma, disponibilidade upstream, execution receipt de teste, prova externa de jail/DB/Atlas nem consumo semanticamente julgado. L2–L4 não foram produzidos porque dependem de aceite e novo despacho. O L1 está produzido para revisão, não autoaceito. A revisão independente deve decidir suficiência por necessidade nos bytes desta versão; histórico supported, contagem de fontes, hashes, seções, testes e qualidade aparente de redação não substituem os dois pareceres.

**Escopo AC-01/AC-04.** As necessidades, fontes, artefato e desconhecidos públicos estão reconciliados nesta produção real e na receita. Casos/oracle reservados ficaram fora do contexto do produtor; não foram inventados casos adicionais nem resultados de consumidores. Esta entrega contribui conteúdo verificável de L1 para AC-01/04, CC-1/3/7, axiomas, invariantes e QS declarados; publicação, uso real, manutenção executada e fechamento da subfatia são obrigações posteriores da principal. O custo/token de modelo não exposto permanece UNKNOWN, e não zero.

