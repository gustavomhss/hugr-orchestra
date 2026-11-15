# Fronteiras Core: Atlas, Relay, RAG e mudança de sessão

| Campo | Valor |
|---|---|
| Chave estável | `s1.core.boundaries` |
| Camada e necessidade primária | L1 — `component` |
| Responsável por esta produção | S1-03 / BOUNDARIES-SUPPORT-L1 |
| Fonte examinada | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Kit da divisão | `70234d541a9a3539935ef16f19e33c8f2d5f30ec` |
| Estado | Candidato L1; aceite e seleção de versão pendentes |

Este corpo descreve a responsabilidade do **lado Core** em quatorze implementações e dez fontes de teste. Todas as quatorze folhas de implementação foram lidas integralmente; os testes receberam leitura de contratos e asserções pertinentes, sem execução. Os bytes, blobs e SHA256 estão em [captures.json](../captures.json); a disposição de cada path está em [coverage.jsonl](../coverage.jsonl). As referências B/T/S apontam para intervalos literais em [evidence.md](../evidence.md), suficientes para distinguir implementação observada, comentário e teste preparado.

**Observação** identifica algo presente nos bytes examinados. **Intenção** identifica contrato ou comentário declarado pela fonte. **Inferência** explicita uma consequência limitada dessa leitura. **Limite** identifica o que a leitura não estabelece. Nenhum desses rótulos equivale a aceite semântico por juiz ou a teste/runtime executado.

## 1. O que o Core fornece na fronteira

**Observação.** O README situa Core como serviços reutilizáveis: Schema e Protocol fornecem contratos; Server consome Core, e Core não deve depender de Client ou Server. Atlas e Relay entram por imports/ports de seus módulos, enquanto Core injeta Location, projeto, processo, configuração, identidade e persistência locais. A regra de dependência é também intenção arquitetural do README; ler este conjunto de folhas não demonstra a ausência de qualquer import indevido em todo o monorepo. [S01; B01; B07; B15]

| Folha ou conjunto | Autoridade observada no Core | Limite de responsabilidade |
|---|---|---|
| `atlas.ts` | Abre a superfície para a raiz e projeto locais; traduz falhas; executa indexador e drafting delegado | Sem garantia apropriada do engine Atlas/S4, indexação correta ou aceitação do conteúdo |
| `relay.ts`, `relay-commands.ts` | Vincula ports ao host; paths/chave/ambiente; gates, trial e sugestões de comandos | Sem herdar qualificação do engine Relay/S3 ou de um shell/plataforma não executados |
| `relay-hook-install.ts` | Admite e grava installs pinados; ordena, pausa, repara explicitamente | Pin/checksum não prova, sozinho, que um snapshot veio de publicação autorizada |
| `relay-hook-shipper.ts`, `relay-hook-recovery.ts` | Converte decisão durável em recibo por install e recupera escopo local | Evento, tentativa e recibo são objetos distintos; recuperação não é garantia distribuída |
| `relay-workflow-*` | Liga publicação, skills e conhecimento; projeta passo; autentica settlement nativo | Não introduz uma nova identidade de drain nem substitui regras de execução da Session |
| `control-plane/move-session.ts` | Resolve destino, transfere alterações e publica mudança de localização | Quiescência do runner é obrigação do caller; não existe transação única arquivo/evento |
| `control-plane/workspace.sql.ts`, `rag-studio/sql.ts` | Define registros e índices persistentes | Tabelas não implementam coordenação remota, retrieval ou embedding |

## 2. Atlas: disponibilidade, identidade e proposta de conhecimento

**Observação.** `Atlas` usa `@orchestra/atlas-boundary/surface` e `@orchestra/atlas-boundary/mine`. O adaptador envolve chamadas de superfície síncronas e traduz exceções em `AtlasSurface.Unavailable`; o comentário alerta que a chamada pode ocupar a fiber. A raiz escolhida é o worktree quando o projeto não é raiz, ou o diretório da Location no caso raiz. `open` recebe raiz e `projectID`; a identidade do projeto é acrescida pelo host à chamada de território, não extraída da resposta do modelo. O caminho legado de mine devolve conjunto vazio quando não há `.atlas`. Esses fatos delimitam disponibilidade e identidade local, não validam o armazenamento interno do módulo. [B01, `atlas.ts` 38–48 e 103–148]

**Observação.** O indexador escolhe TypeScript antes de Python entre planos configurados, resolve executável pela versão do plano e usa AppProcess para execução. A folha limita tempo e coleta de saída e devolve diagnóstico abreviado; a leitura de saúde posterior é um retorno da superfície. A inferência permitida é que Core impõe limites e materializa o comando do plano. Não se conclui que um SCIP produzido é completo ou que a linguagem, pacote nativo e plataforma estão qualificados. A implementação completa encontra-se na captura `atlas.ts` 152–195; esse trecho é leitura de código, não log de indexação.

**Observação.** A delegação de respostas valida que a pergunta pertence ao lote atual e faz falhas por pergunta retornarem diagnóstico. O esquema pede strings `answer` e `why`, mas a condição explícita de não vazio testa `answer.trim()`; o leitor não deve acrescentar uma garantia de justificativa não vazia. O host envia à superfície resposta, justificativa e identificação do modelo; a decisão final pertence ao protocolo da superfície. [B02, 208–218 e 239–280]

**Intenção e limite.** O comentário de `atlas.ts` 301–304 chama o fluxo de “Genesis mining from the screen” e descreve respostas passando pelo gate/admission do Atlas até o staging, sem promoção. Essa é a atribuição textual sustentada; “legado” era uma classificação interpretativa do corpo histórico, não uma distinção declarada por esse comentário. O teto é limitado a 1–200, a concorrência é quatro e respostas que falham são omitidas/abstidas. Gerar ou staged uma proposta não equivale a promovê-la. Esta produção não executou provider, não publicou no Atlas e não reutiliza o nome “mine” como prova de import/publication Genesis. [B02, 301–321; captura integral 301–347]

## 3. Relay no host: comandos, ambiente, ledger e gates

### 3.1 Sugestões e execução têm autoridades diferentes

**Observação.** `relay-commands.ts` lê manifests e sugere comandos: scripts de `package.json`, marcadores em `pyproject.toml`, comandos convencionais de Cargo/Go e targets de Makefile. A classificação pelo nome é heurística. A preferência de runner examina lockfiles na ordem Bun, pnpm, Yarn, npm. O reconhecimento de arquivos pytest visita somente raízes previstas e tem limite de 200; erros de leitura de diretório podem virar lista vazia. A detecção não executa o comando e, por isso, o próprio comentário não requer trust nesse passo. Nenhum nome “test” ou “lint” prova a qualidade do comando sugerido. [B06]

**Observação.** `relay.ts` mantém dados em `<Global.data>/relay/<projectID>`: banco de authoring, arms, hooks e chave de ledger. Installs usados para paths passam por formato restrito; as rotinas verificam diretórios/arquivos e recusam symlinks onde explicitamente programado. A chave de ledger é gerada a partir de 32 bytes aleatórios, preservada em arquivo de formato validado, com modo restrito e criação temporária/link para concorrência. Um arquivo existente inválido não é silenciosamente regenerado. Isso protege a continuidade da identidade de assinatura; não é declaração de imunidade a adversário com todas as permissões do mesmo usuário. [B07]

**Observação.** A execução de gates remove variáveis de startup do shell e usa ambiente explicitamente composto; `extendEnv` é falso e stdin é ignorado. O comando passa por `ToolSafetySandbox.wrap` com perfil do caller, tem prazo e sinal de término, limites de saída e sanitização. Valores de parâmetros com comprimento pelo menos oito são substituídos na saída por `[redacted]`. Isso não é um redator universal de segredos nem prova que toda plataforma oferece o mesmo jail. O helper Git, por sua vez, remove variáveis `GIT_*`, desativa locks opcionais/fsmonitor e limita execução/coleta, mas o trecho lido não o passa explicitamente pelo mesmo `wrap`. O comentário “sandboxed” não autoriza apagar essa distinção de implementação. [B08]

### 3.2 Uma avaliação aprovada precisa do registro correspondente

**Observação.** `record` valida installID, fixa o timestamp do host e chama `LedgerChain.append` com chave e geração. O caller não pode sobrescrever o timestamp. `verify` serializa chamadas com semáforo de capacidade um, recusa comando vazio e trata indisponibilidade de execução e de registro separadamente. Um resultado de gate aprovado cujo registro não foi produzido vira `unavailable/unrecorded`; aprovação calculada e recibo persistido são condições distintas. Uma reprovação continua sendo reprovação mesmo se o caminho de registro não produz o recibo esperado. [B09]

**Observação.** A recuperação de arm examina locks anteriores ao `performance.timeOrigin` do processo e que não estejam retidos em `ArmState.held`. Um lock mais recente desconhecido é deixado intacto. Ela escreve `gate-recovered` antes de remover o diretório do lock. Essa seleção é local e temporal; não demonstra morte de outro host ou processo arbitrário. [B10, 374–418]

**Observação.** `trial` exige trust de configuração antes de executar comandos. Seu caráter de dry grading evita avanço/ledger, mas o shell executado pode produzir efeitos no mundo. O tail de saída de trial não deve ser automaticamente descrito com todas as regras de sanitização do executor de gates, pois usa outro caminho da folha. `check` sem state directory também pode avaliar sem registrar. No caminho genérico, tokens inválidos são recusados e metadata de workflow retorna `WORKFLOW_NATIVE_SETTLEMENT_REQUIRED`; workflow precisa do adaptador nativo descrito adiante. [B10, 420–439 e 491–515; captura integral 420–481]

**Limite.** Semáforos, checks e chamadas ao engine observados no Core não transferem a este corpo as garantias de ArmEvaluate, GateControl, HMAC ou reparo interno de S3. Este L1 descreve como o caller exige essas capacidades e quando suspende o fluxo.

## 4. Hooks: instalação, decisão e shipping

### 4.1 Instalação pinada e escrita deliberada

**Observação.** `relay-hook-install.ts` mantém arquivo `hooks.json` próximo às preferências de perfil. A folha impõe máximo de 512 KiB, IDs de instalação, ordem explícita e um install por documento. Instalar recebe snapshot/version/digest; atualizar preserva ID, ordem e habilitação. Pausar publicação mantém pin e preferência de enabled; republicar o mesmo pin pode restabelecer a instalação sem inventar novo ID. Remover documento passa por retirada de installs antes da exclusão pelo caller. As operações retornam dados de recibo, não equivalem automaticamente a uma append no ledger. [B11–B12; captura integral 1–215]

**Observação.** O snapshot é compactado pelo mecanismo RelayJson, decodificado estritamente e verificado contra digest. O grafo admite até mil nós, exige IDs/nomes únicos, um trigger e uma ação, arestas/ports válidos, no máximo uma saída por port, nenhum ingresso no trigger, ausência de ciclo e alcance de todos os nós. `block`/`approve` só são admitidos para trigger anterior à execução. Essas regras validam estrutura e pin; a proveniência “foi publicado pelo autor autorizado” permanece responsabilidade do port/caller que fornece o snapshot. [B11, 314–335; B12, 254–295]

**Observação.** A leitura verifica arquivo regular, limite de bytes, realpath esperado, estabilidade de metadados antes/depois, UTF-8 válido, esquema e unicidade. A escrita valida a nova serialização, escreve temporário exclusivo com modo restrito e faz rename. O lock declarado é **somente no processo**; dois servidores no mesmo diretório de dados estão explicitamente fora do escopo. [B11, 300–335 e 454–474; captura integral 337–410]

**Observação e limite.** Reparo é uma operação explícita que pode preservar arquivo regular corrompido/oversized em backup e gravar estado vazio; caminhos não seguros, symlink, diretório ou leitura instável não são reinterpretados como “nenhum install”. Rename de backup seguido de nova gravação não constitui uma transação única infalível. Alterar manualmente `hooks.json` para fazer uma documentação “ficar verdadeira” violaria a separação entre leitura e produto. Nenhuma alteração foi feita. [B11, 217–252]

### 4.2 Decisão durável não é recibo de ledger

**Observação.** `relay-hook-shipper.ts` lê eventos em ordem de sequência e tenta escrever uma linha de ledger por decisão/install. A decisão durável já existe antes do shipping; o recibo é consequência separada. A seleção considera decisões devidas até a decisão corrente; itens de outro trabalho marcado `inFlight` são excluídos, e o controle é de processo. Um semáforo serializa consulta e append por grupo. O recibo conserva IDs de decisão, install, versão, nó, ação, trigger, sessão, chamada e outcome; atraso é identificado quando aplicável. [B14]

**Observação.** O cache de IDs usa stamp de inode/tamanho/mtime do ledger. Arquivo ausente pode ser interpretado como vazio, enquanto outras falhas de leitura interrompem aquele grupo; os efeitos do grupo podem ser absorvidos para que outros continuem. Falha de shipping não reverte a decisão durável. Portanto, ausência de erro visível ao caller não basta para afirmar que todos os recibos foram enviados. [B14, 67–130]

**Observação.** `relay-hook-recovery.ts` recusa explicit workspace sem consultar DB. Para implicit-local, filtra projeto, diretório exato e `workspace_id` nulo, junta eventos a Session ainda existente e pagina 64 IDs. Sessões órfãs e de outro lugar não integram o lote. `attemptedSessions` é contagem de tentativas, não de recibos. A rotina observa erros de DB/ship/record, mas falhas de leitura de ledger absorvidas no shipper não necessariamente aparecem como `errors`; zero não é prova de fechamento integral. [B13–B14]

**Limite.** Os testes de startup, recuperação, sessão e shipping preparam cenários de exclusão, retry, `inFlight` e indisponibilidade. As fontes foram lidas como contratos de validação. Este pacote não produz qualquer recibo de execução desses cenários. [T03; coverage dos cinco paths correspondentes]

## 5. Workflow nativo: cadeia de identidade e settlement

### 5.1 Publicação e materialização são adquiridas por port do host

**Observação.** `relay-workflow-binding.ts` recebe `PublicationPort` de um host confiável, com consulta a documentos/versões/skills, resolução de conhecimento quando necessária e checks de aceitação. Isso evita colocar import de Server dentro de Core. Aquisição verifica projeto, documento, publicação viva não arquivada, identidade da versão e checksum; exige workflow executável e compilável. Conteúdo de skills é materializado com SHA256. Checks de aceitação entram de forma determinada, com deduplicação de identidade e associação ao último work package quando a regra o exige. [B15; captura integral 50–126]

**Observação.** Conhecimento pode incluir referências globais e por WP, deduplicadas. Quando necessário, a aquisição exige resolver e autor; valida esquema, projeto, autor, referência, unicidade de unidades, hash de corpo, referência canônica e limites de unidades/bytes. Esta verificação é sobre âncoras entregues pelo resolver. Não é prova de que o engine Atlas produz conhecimento correto ou de que qualquer texto deve ser obedecido como instrução do sistema. [B16; captura integral 149–261]

**Observação.** A publicação é reconsultada ao final da aquisição. Para uma execução já pinada, draft save ou nova publicação não religam silenciosamente o binding; unpublish produz hold. Revalidação readquire a versão pinada e compara skills, materialização e conhecimento. Essas condições impedem usar “mesmo documento” como substituto de “mesma versão e mesmos bytes”. [B15, 106–147]

### 5.2 Ler o passo não o executa

**Observação.** `relay-workflow-currentstep.ts` se define como view pura: não migra `ArmState.position`, não cria entrada/retry e não recupera runlock por escrita. Confere metadata, projeto/sessão/holder quando informado, digest/comprimento do sprint, estado, posição/attempt/ledgerSeq e compatibilidade de pending. A projeção entrega conhecimento global e do WP atual; expansão de parâmetros incide em macro/instruções/checks autorais, sem expandir conteúdo Atlas como template. Feedback é limitado ao attempt e estado pertinentes. Texto de fonte/saída de checks é marcado como não confiável; escalada fica `awaiting-human`. [B17]

**Observação.** `relay-workflow-session.ts` tem registro de host nativo com identidade única e finalizer para liberação. Lê até dois bindings duráveis da Session para detectar multiplicidade; nenhuma ligação significa sessão ordinária, duas ou identidade inválida significam hold. Falta de host não é substituída por fake. Reconcile/settle usa `assistantMessageID` e posição/attempt/ledgerSeq esperados; apenas disposições reconhecidas autorizam continuação. Ler/resumir sessão não implica avançar workflow. [B18]

### 5.3 Fence, checkpoint e recibo autenticado têm funções distintas

**Observação.** `relay-workflow-transition.ts` deriva o nome do checkpoint de SHA256 do `assistantMessageID`. Sob o lock do engine, revalida antes da leitura de checkpoint e exige identidade exata de binding/settlement. Um resultado já settled pode ser retornado sem regrading; pending pode ser reconciliado. Para uma nova tentativa, compara o passo com a tripla esperada e **grava o fence pending global antes do checkpoint da identidade individual**. Depois da avaliação grava settled e só então limpa pending com identidade compatível. As gravações usam temporário exclusivo/rename; não inventam novo mecanismo de durabilidade da Session. [B19]

**Observação.** `relay-workflow-evaluator.ts` envolve `ArmEvaluate`, utiliza o lock existente e recusa falta de identidade, modo incompatível ou chave ausente. Verifica metadata/projeto/sessão/sprint e cadeia HMAC. Um checkpoint com resultado salvo só pode ser reutilizado com recibo autenticado de disposition correspondente. O recibo inclui checkpoint, avaliação, conjunto de writes e sequência fonte. No reparo, exige lock retido, revalidação, fence/binding exatos e evidência de disposition única com writes permitidos/necessários e próximo WP coerente. Chama repair sem executar grading novamente. [B20]

**Inferência delimitada.** “Há um PASS antigo no ledger” e “há JSON com o mesmo nome de assistant message” são insuficientes: nenhum desses fatos contém, sozinho, a identidade e o recibo exigidos. Interrupção antes de disposition autenticada completa conserva hold. Busy, defect, refused, noop, parked e revision drift não viram sucesso por tradução do Core. Essa conclusão é do controle de entrada/retorno observado; correção interna do engine e resistência criptográfica não foram reprovadas nem aprovadas aqui. [B20; T02]

## 6. Control plane e RAG: persistência versus ação

**Observação.** `move-session.ts` resolve origem/destino, exige que o projeto da Session corresponda ao destino e só transfere alterações quando solicitado e os roots resolvidos diferem. A sequência substantiva é capturar alterações de origem, aplicá-las no destino, publicar `Session.Moved` e depois descartar alterações no diretório de origem da Session, com `index: "preserve"` e `untracked: "remove"`. O código do teste de sessão aninhada prepara alterações em `packages/` e contém asserções de preservação do arquivo staged nesse path e de arquivos alterados na raiz, fora de `packages/`. Esse caso preparado não exercita alterações concorrentes posteriores à captura dentro do mesmo diretório. A chamada `discard` recebe diretório e opções, sem receber o patch capturado. O trecho literal do teste está em `suplemento-boundaries-1.md`, RE-BND-06/BT01. Falha no reset de origem produz `ResetSourceChangesError` **depois** de destino/evento poderem ter mudado. Não há transação abrangendo os três meios. [B03; T01]

**Observação e limite.** O evento constrói `Location.Ref` com diretório. Este código não autoriza inferir uma migração completa de identidade de workspace nem paralisa o runner: suas dependências são Git/Event/Project/SessionStore. A regra de chamar sob exclusão/quiescência, e a relação com Context Epoch e drain, precisam da autoridade S1-01 e de versão aceita para uma alegação integrada. `workspace.sql.ts` define ID, tipo, nome, branch/diretório/extra, projeto com cascade e tempo de uso; isso não implementa warp/sync nem executor remoto. [B03–B04; I01]

**Observação.** `rag-studio/sql.ts` persiste fontes com localização/path/hash/status, chunks com texto/linhas/hash/boundary, revisions e associação de fontes, perguntas e traces; também mantém configuração de pipeline. Índices e chaves compostas organizam essas relações. Chunks deliberadamente não têm FK para permitir limpeza de órfãos no caminho indicado pelo comentário. O índice location/path não é uma declaração de unicidade. A folha não contém coluna de embedding ou tabela vetorial; comentários de pipeline distinguem lexical de embedding. [B05]

**Limite.** Ausência de implementação de retrieval nesta folha não significa ausência de todo retrieval no produto. Significa que esta evidência é de persistência, e a capacidade/qualidade/qualificação de retrieval, embedding, indexador ou engine precisa de fonte e dono próprios, sobretudo S4. Um schema estável não prova busca correta.

## 7. Reuso, deltas e navegação ainda não aceita

O corpo herdado [history/boundaries.md](../history/boundaries.md), no commit `a8df22ae3a140c58c63f62ce2a634c84f415c943`, foi preservado sem mudança de bytes. Seus limites — engine externo, move não atômico e RAG como persistência — foram mantidos e confrontados com todas as quatorze folhas atuais. Os excertos A4 de move/RAG/README/AGENTS e a projeção de cobertura são entradas históricas verificáveis em [history/manifest.json](../history/manifest.json). Este corpo é o delta de leitura/descrição, não uma nova autoria de parecer histórico.

O histórico `s1.core.entry` descreve o Core inteiro. Permanece em [history/entry.md](../history/entry.md), byte-idêntico, sem ser transformado em uma entrada global aprovada. As 104 fontes de suporte de S1-03 recebem [s1.subslice03.support](support.md). A [proposta de navegação](../union-navigation-proposal.md) aponta para missões/keys reais do kit e declara versões externas **não selecionadas**. As referências desta seção são navegação; não constituem predecessores aceitos no build graph.

Para integrar alegações, a coordenação ainda precisa selecionar versões/pareceres de S1-01 (Session/admissão/estado), S1-02 (trust/capability/sandbox), S1-04 (contratos e adaptação API), S1-05 (LLM/SDK/persistência compartilhada), S3 (Relay) e S4 (Atlas/Omni/qualificação). Nenhum aceite desses donos, resultado pago, execução de produto, L2, L3 ou L4 é declarado neste corpo. A produção encerra no L1 e na proposta preparatória autorizados.
