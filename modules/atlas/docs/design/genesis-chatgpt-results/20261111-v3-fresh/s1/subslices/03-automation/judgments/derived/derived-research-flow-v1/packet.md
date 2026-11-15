# s1.subslice03.research-flow — revisão semântica L2 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.research-flow, 16980 bytes, SHA256 a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044, Git blob 8b7c702e3d5d6e0d9a8f303136a9d97ac280d82c. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 17 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-research-flow-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Research: aquisição, índice e autoridade da investigação

**Chave:** `s1.subslice03.research-flow` · **L2** · **need:** `flow` · **escopo:** `orchestra.s1` / S1-03.

## F0. Entrada, base aceita e alcance

Este L2 explica o caminho entre uma receita de ferramenta, a consulta de código e uma evidência retida utilizável. Seu único predecessor de construção é `s1.core.research`, corpo de **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**. A receita congelada informa PASS dos dois juízes para esses bytes. Esse gate é semântico; não comprova execução do produto. O L2 é candidato à revisão própria.

**Base de afirmação:** os mecanismos abaixo são observações estáticas relatadas pelo L1 sobre a fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Consequências de uso aparecem como inferência; expectativas de testes continuam intenção. Não houve leitura adicional de código, execução de engines, testes, portas Atlas ou consumidores nesta derivação.

| Pergunta local | Seção deste L2 | Aprofundamento no predecessor |
| --- | --- | --- |
| O que precisa estar pronto antes de usar a ferramenta? | F1 | R1–R4 |
| Como plano e build se tornam um índice consultável? | F2 | R5–R6 |
| O que uma resposta vazia, stale ou dirty permite concluir? | F3 | R7–R8 |
| Quando um experimento pode sustentar uma conclusão? | F4–F5 | R9–R10 |
| Como bytes, registros e investigação ganham vínculo durável? | F6–F7 | R11–R12 |
| Que provas continuam fora desta leitura? | F8 | R0, R13–R14 |

Cada seção F é uma entrada independente para leitura delimitada. As referências R são navegação dentro do mesmo predecessor; não criam dependências de outras famílias.

## F1. Da receita à prontidão local

**Observação estática — L1 R1–R4.** O Core possui aquisição, cache, execução, readiness e interface; os packs declaram versão, aquisição, ambiente, fit e entradas. Research injeta raiz e manifesto próprios na interface backend. `fit` orienta a seleção, sem conceder autorização de execução ou certificar o resultado. Versão, locks, wheels, runtime, floors, layout e launcher compõem a receita; escolher apenas um nome de engine perde esse contrato.

`ensure` detecta o host; dependências e ciclos são resolvidos antes do fetch. Os estados são `absent`, `fetching`, `ready`, `failed` e `unsupported`. `prefetch` absorve falhas individuais e devolve estados: seu retorno não declara todas as engines prontas. `prepare(command)` adquire os nomes explicitamente referenciados pela variável do toolkit, sem instalar tudo para qualquer shell genérico.

Waiters compartilham tentativa no processo. O waiter do shell espera 60 segundos; a aquisição tem orçamento próprio de 30 minutos e pode continuar após essa desistência. Falha entra em cooldown de cinco minutos. Staging, integridade, marcador `.complete` e rename sustentam instalação; o marcador não revalida todo o cache. Com marcador e executável ausente, a instalação pode ser pulada e readiness falhar, sem reparação automática.

Readiness combina dependências, estado da tentativa, instalação, executável e launcher; hosted acrescenta runtime/executável. No host, o shim deve coincidir com o esperado. `ready` sustenta esses checks locais, sem provar que a engine foi usada ou que sua saída é correta. Aquisição para outro target não é execução nele. Targets/floors e exceções precisam da leitura R2.5; pins Windows, por exemplo, não estabelecem suporte dos caminhos de índice/probe.

**Decisão local, inferida desses contratos.** Antes de atribuir uma falha à pesquisa, identificar a engine e a razão de readiness. Antes de geração OpenAPI ou Cassandra, consultar R4: o guard de versão do projeto e o overlay Cassandra fixado têm condições próprias; adquirir o pacote não prova sua aplicação pelo chamador. Receitas hosted também têm fronteiras próprias: npm ignora scripts, mas não é offline; Go/Rust podem depender de toolchain ou linker externos.

## F2. Do planejamento ao índice persistido

**Observação estática — L1 R5–R6.** O adapter default retorna plano vazio e falha `index-builder-unavailable` ao construir. O adapter real usa Git, engines, extração e store. Portanto, warm sem shards pode representar adapter default, falha de plan, nenhum shard elegível ou plano realmente vazio. Falha de plan é convertida em vazio no warm; esse retorno sozinho não discrimina a causa. Pack canônico ausente resulta em `unsupported:pack-not-shipped`, mesmo com manifesto vazio.

`prewarm` deduplica por worktree no processo, inicia fibra detached e não entrega join da primeira chamada à segunda. Ordena pendentes por rank, que nesse adapter é contagem de arquivos, não o PageRank do grafo. Adquire engines e continua após skips/falhas. O filtro de prewarm pode excluir shard estrutural tree-sitter construível diretamente. Estado auxiliar é best effort: leitura inválida vira mapa vazio, falha de escrita é ignorada e `building` expira; não é recibo durável de execução.

A chave do shard reúne indexer/versão, identidade do shard, pares path/blob e locks/configs relevantes, inclusive extends. Não é apenas HEAD: fontes equivalentes podem reutilizar chave entre commits. Projetos aninhados têm ownership próprio; arquivos órfãos e linguagens omitidas não viram cobertura implícita. Falha/truncamento na observação Git é `source_unavailable`, sem equivaler a árvore vazia.

Build trata shards ausentes, compartilha trabalho por singleFlight e serializa indexadores por lock sob a raiz. Uma chamada concorrente pode retornar progresso vazio, sem join nem sucesso coletivo. O adapter de extração aceita Linux/Darwin. Go/Rust podem usar fallback estrutural com razão e `coverage.skipped`; se nenhum indexer está disponível antes dessa etapa, ainda pode ocorrer `index_unavailable`.

O build confere HEAD, mas lê o worktree sem congelar atomicamente seus arquivos. Texto e digest retidos correspondem à leitura efetiva; o HEAD do plano não certifica todos os bytes extraídos. O store grava SQLite temporário e renomeia; `exists()` verifica arquivo, não saúde integral do índice. Retenção de oito commits/4 GiB mantém o mais novo mesmo acima do budget. **Inferência de uso:** plano, aquisição, build, existência do banco e qualidade da resposta são etapas distintas; nenhum status intermediário deve substituir a base da consulta.

## F3. Da consulta à evidência localizada

**Observação estática — L1 R7–R8.** Query devolve base, cobertura, freshness e bounds junto com os resultados. Sem shard aberto, dispara build detached e responde building/unavailable com motivo. Pode usar primeiro shard retido de mesmo id quando falta o atual, marcando stale. Nesse caso, commit/versões em basis vêm do plano atual: não se deve atribuir automaticamente esses bytes aos rows antigos.

Dirty overlay substitui sobretudo listagens e resolução por nome de símbolos. Não atualiza universalmente imports, references, callers, callees ou map; consultas por id/posição também têm diferenças. A estrutura de símbolos atual não torna todas as relações atuais. `coverage.complete` não abrange toda limitação de grammar, resolução, opacidade ou overlay. A extração persiste ocorrências com `opaque: false`; `opaqueSites=0` não comprova inexistência de lacunas opacas.

Ambiguidade pode retornar candidates. Callers agrupam referências por container; callees coleta referências no range, sem demonstrar chamadas de runtime. Ranges/encoding e a resolução estrutural têm limites específicos em R7. **Inferência:** ausência de hits significa ausência sob aquela query, base, projeção e limites; não prova ausência de uso em runtime ou conteúdo omitido.

Search consulta o worktree atual com ripgrep, distingue regex inválida/falha/parcialidade e conserva bounds. Locate combina busca, mapa e ranking; sem índice utilizável, degrada explicitamente para busca lexical. `semantic: absent` permanece mesmo quando usa índice. Confere ranges contra conteúdo atual e descarta inválidos, sem prometer encontrar todos os locais. Seu orçamento também tem uma exceção concreta: se a sondagem map já ocorreu antes do fallback lexical, 16 termos distintos podem gerar 33 consultas internas, apesar da referência nominal a 32.

Liveness classifica alcance de URL ou captura recente; LIVE não verifica verdade do conteúdo. UNKNOWN e a heurística LIKELY_HALLUCINATED não devem ser convertidos em prova de inexistência ou fabricação. A helper de domínios permitidos não é chamada automaticamente por `check`; os limites de rede/DNS de R8.3 permanecem. Nesta autoria não houve consulta de URL.

## F4. Do probe ao resultado que ainda precisa ser retido

**Observação estática — L1 R9.** Probe aceita união fechada de typecheck, teste por arquivo/nome e script TS/JS/Python, sem argv arbitrário do modelo. O caminho aceita Darwin/Linux, aplica limites e usa snapshot, runner escolhido, scratch e confine externo. Snapshot de commit ainda pode referenciar dependências do projeto por symlink; o snapshot de worktree inclui dirty/untracked, sem transação que congele a árvore inteira. Não é uma promessa de ambiente hermético.

O timeout de subprocesso não cobre todo preparo/fila. O semaphore de host é local ao processo. Caps declarados, propagação de caps e eficácia de jail/memória são questões diferentes: `ProbeRun` não usa diretamente a redução de scratchBytes do toolkit. As garantias externas de sandbox, processos e memória não são apropriadas por este fluxo.

O resultado identifica probe, snapshot, revisão/dirtyDigest, runner, argv, versão, verdict e saída limitada. Timeout, memória e guard têm precedência; `reproduced` depende do expect, sem equivaler simplesmente a exit 0. `blocked_by_repo_guard` conserva a recusa de testes locais. Os testes citados pelo L1 descrevem contratos; nenhum foi executado aqui.

**Fronteira decisiva.** O retorno e a URI `probe:<executionSessionID>/<probeID>` não cobram, capturam nem admitem automaticamente a evidência. O chamador precisa debitá-la e retê-la pela porta nativa pertinente; somente depois é possível usá-la sob o contrato de fonte. Resultado de processo isolado não é SourceAdmitted.

## F5. Identidade nativa e orçamento da investigação

**Observação estática — L1 R10.** A invocação depende de Session do projeto, agente exigido, TaskBound único, task/authorSession e relação de execução consistentes. `require` revalida frame de CapabilityInvocation, owner/agent/session/location, binding atual e parte persistida de mensagem/tool call. Uma declaração textual de papel não satisfaz essas condições. Leitura humana retida dispensa invocação ativa, mas revalida a localização original; acesso entre tasks do mesmo projeto segue regras explícitas, sem fallback para path arbitrário ou outro projeto.

Allowance é vinculada ao dispatch antes da cobrança; novo bind deve ser idêntico, sem ampliação de limites. Charge usa operation id, valores inteiros não negativos e unidade um para provider/tool. Mesma operação e mesmos dados permitem replay idempotente; divergência conflita. As dimensões são provider calls, tool calls, source bytes e probe seconds. A publicação reconsulta binding e gasto no callback de EventV2; a garantia transacional subjacente continua com esse dono.

Reserva de bytes é conservadora e irreversível. Reconcile confere uso dentro da reserva, sem devolver saldo. Publicação incerta continua debitada; ledger inválido gera `publication_uncertain`, sem converter tentativa em gasto zero. Deadline no bind não demonstra enforcement universal de tempo. **Inferência:** cobrança, aquisição, admissão e publicação devem ser identificadas separadamente para que retry não apague custo nem causalidade.

## F6. Da aquisição à fonte admitida e ao locator

**Observação estática — L1 R11 e R12.2.** `beginAcquisition` registra o pedido antes da ação live. Replay requer identidade igual e outcome finalizado; aquisição anterior incerta recusa readquisição live. SourceAttempted tem outcome próprio e não pertence ao corpus admitido. Tentativa finalizada sem fonte devolve `source_unavailable`; nova tentativa exige nova chamada nativa, sem ocultá-la como replay.

`capture` conserva origem, representation, digest, complete e metadata; fonte derivada precisa de parent/transformation e atlas-own exige metadata Atlas. `complete` é informado pelo host, sem auditoria universal. Bytes/manifest podem ser gravados antes do evento SourceAdmitted para retomada. **Custódia não é admissão:** `load` exige um evento pertinente único, compara manifest/receipt, revalida binding e confere bytes/digest. Falta ou corrupção não autoriza fetch live substituto. Replay de captura exata pode devolver receipt sem revalidar arquivo naquele caminho; leitura posterior verifica disponibilidade.

Read textual valida UTF-8, corta páginas em code points e prende cursor a binding/ref/revision/digest/representation/pageSize. A última página só é complete se a fonte admitida era completa. Fonte binária parcial pode ter custódia/digest verificados sem fingir decode textual. Chegar ao fim dos bytes retidos não completa uma captura parcial.

Records valida evidência na fonte retida integralmente, sem readquisição live. Line locator confere ranges/coordenadas; em blocos Locate, contenção por linha não distingue sozinha paths diferentes com intervalo igual. Quote exige correspondência exata e recusa ambiguidade. JSON exige representação/decode compatíveis e pointer canônico. `source_unavailable`, `reference_invalid` e `locator_ambiguous` conservam razões diferentes. Locator válido demonstra endereço/identidade, sem julgar verdade proposicional; texto hostil permanece dado.

## F7. Registros, publicação e fechamento de inquiry

**Observação estática — L1 R12.** Findings validam evidence e contrary; relations usam refs admitidas; documentos usam findingRefs e citações válidas. Revisão exige id+baseRevision e CAS contra última revisão; mudança material de finding exige razão. Replay usa input hash. Intent e timestamps estáveis permitem retomar falha entre arquivo e evento. Após erro, sucesso só pode ser reconhecido pelo exato evento persistido; em sua ausência, há conflito ou `publication_uncertain`. Erro não prova ausência de efeito, e arquivo solto não prova publicação.

O corpus contém SourceAdmitted, RecordCommitted e DocumentPublished. Attempts e eventos Inquiry permanecem distintos. Views têm limites; corpus recortado informa complete=false e não tem cursor de coleção. Cursors de attempts/records vinculam binding, limite e snapshot hash; cursor stale conflita. Citações Markdown verificadas e retenção durável também não conferem aceite semântico ao documento.

Inquiry conserva abertura, checks e fechamento por dispatch, replay exato, checks múltiplos e recusa de novos eventos após close. O código local não exige sozinho que cada check/close tenha abertura anterior: essa disciplina depende do protocolo mais amplo. `closed` considera o dispatch mais recente, impedindo que um fechamento antigo responda por sessão retomada. Lista de ferramentas de seat não comprova seu registro numa instância. **Inferência de leitura:** antes de concluir uma investigação, identificar o dispatch, a fonte/revisão admitida, a evidência contrária e o evento efetivamente retido; um objeto não empresta autoridade aos demais.

## F8. Limites preservados e provas separadas

O L1 inspecionou contratos e testes; esta derivação compôs esse conteúdo e verificou identidades de arquivos. Não houve execução de produto, qualificação de provider/host/engine/plataforma, comprovação de jail/DB, binding ou publicação Atlas, consumo independente ou manutenção executada. Freshness, suficiência semântica e autoridade continuam distintas. Os dois juízes ainda precisam avaliar este L2; testes listados e hashes não emitem PASS.

O L1 R3.3 conserva um impedimento de transporte informado pela principal: lock Modelina de 266.885 bytes supera o limite de fonte de 256.000 bytes do release S4 r3 citado. A porta não foi verificada nesta autoria, e a fonte obrigatória não foi removida ou substituída. Essa limitação não transforma fonte unavailable em absent nem invalida automaticamente a explicação local.

R13 preserva a disposição das 130 fontes e dos 41 arquivos de teste; R14 oferece o detalhe das consequências já sustentadas pelo L1. Este artefato entrega somente entendimento local L2. Relações de impacto L3, manutenção L4 e fechamento de S1-03 permanecem fora deste despacho. Uso físico, tokens e custo de modelo não expostos são **UNKNOWN**.

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidências — s1.subslice03.research-flow

## E0. Identidade e autoridade do predecessor

A única autoridade semântica de construção é `s1.core.research`, L1/`component`, em `producers/research/body.md`, **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**, blob Git recalculado **`72bdc55fdf2dbda97e84c87111be73fa49aceeb4`**. A fonte investigada por esse L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; este produtor L2 não abriu essa fonte bruta, os captures, coverage ou evidence do L1.

A receita congelada `payload/recipes/derived/research-flow.json`, 8.423 bytes, SHA-256 `543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1`, declara que `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` aceitaram esse mesmo corpo. As respostas originais são identificadas na receita por `e52fc2d9eb369da417d7ea035ec641839ca4714be9f75b4b0f2ac4bab35e3cc7` e `8dd9f7ae58de3cda63482558e2940931b185a644bcbd8cafd0b7d5463ea835c6`. São referências de proveniência fornecidas pelo gate; os pareceres integrais não foram lidos. Nenhuma decisão L2 é atribuída aos juízes por este autor.

O body do predecessor foi consumido integralmente em duas exibições contíguas, linhas 1–230 e 231–378. As referências abaixo apontam às seções desse arquivo exato, sem fabricar linhas de código ou substituir sua autoridade por referências externas.

## E1. Mapa das afirmações e qualificações

Todas as linhas desta tabela usam a chave e o SHA-256 de E0. “Observação” significa observação estática relatada no predecessor, não execução desta produção. “Inferência” é consequência delimitada desses mecanismos.

| Trecho L2 | Afirmações abrangidas | Seção exata do L1 | Natureza e limite conservado |
| --- | --- | --- | --- |
| F0 | Ciclo de aquisição/índice/evidência; fonte fixada; ausência de execução no predecessor | R0. Resultado, autoridade e navegação | Observação e limite; aceitação anterior vem da receita, não da autoavaliação do L1 |
| F1, abertura | Ownership Core/pack; research reutiliza interface; fit não autoriza execução | R1. Quem possui o ciclo e o que um manifesto promete | Observação/intenção distintas; fronteiras externas não são apropriadas |
| F1, estados e prepare | ensure, dependências/ciclos, cinco estados, prefetch, espera 60 s versus aquisição 30 min | R2.1 Estados e ordem de aquisição | Observação; retorno não é sucesso coletivo |
| F1, concorrência/cache | Coalescência local, cooldown cinco minutos, staging, marcador e ausência de reparação automática | R2.2 Concorrência, staging e diagnóstico | Observação; marker não rehasha cache |
| F1, readiness e targets | Dependências/runtime/executável/shim; ready e cross-target não qualificam uso real | R2.3 Readiness é uma conjunção; R2.5 Targets e floors | Observação e limites |
| F1, receitas/guards | Locks, versão, runtime, hospedagem; npm scriptless não offline; OpenAPI e Cassandra têm condições próprias | R2.4 Hosted e seus pré-requisitos; R3. Receitas concretas e inputs de aquisição; R4. Guards de versão e compatibilidade Cassandra | Inferência de seleção fundamentada; detalhes são navegação ao L1, sem execução alegada |
| F2, adapter/warm | Default indisponível, pack ausente, empty plan ambíguo, detached/deduplicação, rank por contagem e filtro estrutural | R5. Orçamentos, planning e prewarm de pesquisa | Observação; estado auxiliar best effort não certifica cobertura |
| F2, identidade | Chave indexer/shard/path/blob/config/lock, projetos/órfãos e source_unavailable | R6.1 Partição e chave | Observação; HEAD não é toda a identidade |
| F2, construção/store | Shards ausentes, singleFlight, progresso vazio, arquivo versus saúde, retenção com newest acima do budget | R6.2 Planejamento, build e retenção; R5. Orçamentos, planning e prewarm de pesquisa | Observação; lock de indexer é o caminho do toolkit descrito em R5 |
| F2, plataforma/conteúdo | Linux/Darwin, fallback Go/Rust condicionado, nenhuma disponibilidade universal, worktree não congelado | R6.3 Extração real e sua base | Observação; digest do texto lido não prova igualdade a todos os blobs do HEAD |
| F3, query/stale/dirty | building/unavailable, retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty | Observação; ausência de hit não prova ausência de uso |
| F3, relações/opacidade | Callers/callees não demonstram runtime; ranges/encoding; opaque false persistido | R7.2 SCIP, encoding e associação de ocorrências; R8.1 Query: vazio, stale e dirty | Observação e inferência limitada; zero opaqueSites não certifica cobertura |
| F3, search/locate | Worktree atual, falhas e bounds, fallback lexical, semantic absent, range verificado e exceção de 33 consultas | R8.2 Busca e localização | Observação; ranking não é prova de completude |
| F3, liveness | LIVE/UNKNOWN/LIKELY_HALLUCINATED, helper allowed e fronteira DNS/rede | R8.3 Liveness de URLs | Observação; classificação não julga verdade/fabricação; nenhuma URL consultada |
| F4 | Runner fechado, snapshots/dependências, timeouts/caps/host, verdict e guard; retorno não debita/admite | R9.1 Runner, snapshot e processos; R9.2 Resultado e limites de enforcement | Observação; intenção de teste não é execução e serviços externos exigem evidência própria |
| F5, identidade | Session/task/agent/authorSession, CapabilityInvocation, parte persistida, revalidação e leitura entre tasks | R10.1 Quem pode produzir e reler | Observação; declaração textual não é binding |
| F5, orçamento | Bind idêntico, charge/replay/conflito, dimensões, reserva irreversível, reconciliação e incerteza | R10.2 Allowance e reconciliação | Observação; efeito transacional externo não apropriado; consequência de causalidade é inferência |
| F6, aquisição | Pedido antes de live, replay finalizado, tentativa incerta, SourceAttempted e nova tentativa nativa | R12.2 Aquisição e tentativa: retry visível | Observação; tentativa não equivale a fonte admitida |
| F6, custódia | Manifest/receipt/evento/binding/digest; arquivo antes do evento, falta/corrupção sem fetch substituto | R11.1 Source artifact e evento de admissão | Observação; custódia e admissão permanecem distintas |
| F6, captura/páginas | Metadata complete, derivedFrom/transformation, atlas-own, replay sem check de arquivo, UTF-8, cursor, parcial/binária | R11.2 Representação, paginação e fonte parcial | Observação; fim dos bytes não completa fonte parcial |
| F6, locator | Leitura integral retida, lines/blocos Locate, quote, JSON pointer, razões de recusa | R11.3 O que um locator valida | Observação; endereço e identidade não provam proposição nem concedem autoridade ao texto |
| F7, records/publicação | Evidence/contrary, findingRefs, CAS de revisão, intent, evento exato, erro/efeito e citações | R12.1 Revisões e documentos | Observação; parser de citações não emite aceite semântico |
| F7, corpus/views/inquiry | Três eventos do corpus, limites e cursors, inquiry/dispatch, disciplina de abertura e fechamento atual | R11.1 Source artifact e evento de admissão; R12.3 Views e inquiry; R10.1 Quem pode produzir e reler | Observação; lista de ferramentas não prova capabilities registradas; conclusão final é inferência de leitura |
| F8 | Provas não executadas, dependências externas, 130 fontes/41 testes, L2 limitado e uso desconhecido | R0. Resultado, autoridade e navegação; R13. Disposição das 130 fontes e contratos de validação; R14. Uso, impacto e obrigações ainda separadas | Limites do predecessor e desta autoria; sem autoaceite L2 ou fechamento S1 |
| F8, transporte | Modelina 266.885 bytes versus limite 256.000 do S4 r3 informado | R3.3 Locks, wheels e integridade | Relato delimitado da principal preservado no L1; nenhuma inspeção independente da porta |

## E2. Receita, critérios e fronteiras de camada

O contrato comum efetivo é `payload/recipes/derived-contract.json`, SHA-256 `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588`. Seu papel L2 é explicar fluxo local e decisões a partir de L1 aceito. O plano `payload/artifact-plan.json`, SHA-256 `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad`, exige somente `s1.core.research` para este nó. Nenhum irmão, fonte bruta ou nível posterior foi incorporado como input semântico.

As seções F0–F8 oferecem conteúdo revisável para GO-A1/2/3, QS-1/2 e CC-1/3; a separação entre estados e tipos de autoridade preserva GO-A5, GO-I2/7/8. As fronteiras de reúso e identidade em F1–F3/F5–F7 contribuem explicações para GO-A4, sem alegar os ensaios operacionais de CC-4. GO-A6/7, QS-3/4/6 e GO-I1 são atendidos no procedimento delimitado, preservação e hashing descritos, sem nova plataforma. AC-01 e QS-5 ainda dependem do juízo do conteúdo; AC-02/03 e os resultados runtime/consumidores não são certificados por este autor. Isso é um mapa de contribuição, não uma matriz de PASS.

AGENTS, COMMON, mission, SKILL e as seis referências públicas foram consumidos somente como autoridade/procedimento. Seus links a outros arquivos não autorizaram leitura adicional. `derived-public-criteria.json` foi lido integralmente; sua referência à fonte normativa não foi expandida. O manifesto registra a identidade integral de cada input realmente consumido.

## E3. Verificação realmente realizada

Foram comparados tamanho, SHA-256 e blob Git recalculado dos 14 inputs enumerados com a receita congelada; todos coincidiram. Pedido, receita e dispatch são três unidades adicionais, totalizando **17 inputs integrais únicos**. O pedido foi preservado no hash `351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee`. O dispatch exato, sem newline acrescentado, tem 1.511 bytes e SHA-256 `2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf`.

A primeira exibição agrupada excedeu o limite de saída da ferramenta e truncou a parte intermediária de COMMON; COMMON foi reapresentado integralmente em chamada separada. Nenhuma conclusão dependeu de trecho truncado. Os demais arquivos e o predecessor completo foram expostos integralmente antes da autoria. A verificação de completude de leitura é procedural, não uma prova de isolamento técnico do host.

O body contém nove cabeçalhos depth2 independentes e 16.980 bytes UTF-8. Excede a preferência usual de 6.000–14.000 bytes para conservar as qualificações que alteram decisões entre aquisição, plano/build, stale/dirty, probe, orçamento, custódia e inquiry. Não reproduz o catálogo completo do predecessor. Hashing, UTF-8/JSON e consistência do conjunto de arquivos são verificações determinísticas, sem execução de teste de produto ou julgamento semântico.

**NOT_RUN:** instalação/download de engines, providers/rede, testes/typecheck/guards do produto, Atlas import/binding/publicação/index/read, consumidor independente e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. L3/L4 não foram produzidos; a principal mantém seus gates separados.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T03:12:26.819122+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.research-flow",
    "layer": 2,
    "need": "flow",
    "required_build_predecessors": [
      "s1.core.research"
    ],
    "purpose": "Entendimento local da aquisição, índice, custódia e investigação"
  },
  "predecessors": [
    {
      "key": "s1.core.research",
      "local_body_path": "producers/research/body.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/research/body.md",
      "body_bytes": 63841,
      "body_sha256": "f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f",
      "body_git_blob_sha": "72bdc55fdf2dbda97e84c87111be73fa49aceeb4",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f",
          "original_response_sha256": "e52fc2d9eb369da417d7ea035ec641839ca4714be9f75b4b0f2ac4bab35e3cc7"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f",
          "original_response_sha256": "8dd9f7ae58de3cda63482558e2940931b185a644bcbd8cafd0b7d5463ea835c6"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Fresh native fork none for this family; no oracle, no judge prose and no raw source. Later family layers reuse this author only after their gates. Do not delegate.",
  "retained_family_context": null,
  "exclusive_output_directory": "producers/derived-research-flow",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-research-flow",
  "read_exactly": [
    {
      "local_path": "inputs/AGENTS.md",
      "bytes": 16501,
      "sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f",
      "git_blob_sha": "ef3b523b0c00aed722582b870c1919188edc4c4f",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/COMMON.md",
      "bytes": 12959,
      "sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7",
      "git_blob_sha": "893cbb5f5eda2d0c19753606a50d1c482523f0c8",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/mission.json",
      "bytes": 6006,
      "sha256": "32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75",
      "git_blob_sha": "48fa8da131e97c50110ee76e41e79283cd9a0ac4",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/SKILL.md",
      "bytes": 8143,
      "sha256": "f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029",
      "git_blob_sha": "852e1d66539be5df895ba4cdbd2f9ab6e2331877",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/principles.md",
      "bytes": 6010,
      "sha256": "f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230",
      "git_blob_sha": "3b4122705ef4ae4bda66fe7b5be4c93d55d32765",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fatia-1.md",
      "bytes": 3987,
      "sha256": "152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae",
      "git_blob_sha": "78482ad7c72ec275fadb26ebece1c30bc1e5ccb9",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fresh-start.md",
      "bytes": 4983,
      "sha256": "c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166",
      "git_blob_sha": "ca485b25e43293a309c5489279dce80ce1441ed0",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/orchestration.md",
      "bytes": 4408,
      "sha256": "b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb",
      "git_blob_sha": "4ffd37ea0015eb1d7529e23a2762aa2cec3dc8ac",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/judging.md",
      "bytes": 5787,
      "sha256": "c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb",
      "git_blob_sha": "452dc16776f84a6b0010dafa217564fc6411f183",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/transport.md",
      "bytes": 8478,
      "sha256": "02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c",
      "git_blob_sha": "e9a98619f3b0759ead0287fa54fe3ef2f22137d5",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/artifact-plan.json",
      "bytes": 5017,
      "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad",
      "git_blob_sha": "8dba81b59cd093d28ea07cf4369d5842b6bdee68",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-contract.json",
      "bytes": 4017,
      "sha256": "bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588",
      "git_blob_sha": "b0687d5855dd78d7ce1959d217b4ad15143565cd",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-public-criteria.json",
      "bytes": 16244,
      "sha256": "1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e",
      "git_blob_sha": "d4f6b765e6d78341ba2b77186c77b9177cf3156c",
      "whole_file_identity": true
    },
    {
      "local_path": "producers/research/body.md",
      "bytes": 63841,
      "sha256": "f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f",
      "git_blob_sha": "72bdc55fdf2dbda97e84c87111be73fa49aceeb4",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.core.research"
    }
  ],
  "other_actual_inputs": "This frozen recipe, the request file and the visible dispatch. Record their full identities. If an extra source is needed, ask principal before reading.",
  "instructions": [
    "Read the listed public authority, plan, common recipe and criteria in full unless already completely read in this same family context, then the exact accepted predecessor body. Avoid output truncation. Retain all earlier actual context inputs in the new manifest. Do not open any oracle, judgment response, unlisted sibling file or recursive directory inventory.",
    "Produce only this artifact and its evidence/manifest. Do not preproduce a later layer. Use the accepted body as semantic authority, preserving its qualifications. The normative recipe states the role of this layer.",
    "Write a coherent useful Portuguese reference, normally 6000–14000 UTF-8 bytes, with independent depth2 headings for bounded Atlas read. This is a sizing preference, not permission to omit necessary meaning.",
    "Explain the defined need, mechanisms, decision boundaries and relevant limitations without copying the full predecessor. Distinguish static findings, contract-test expectations, inference and actual execution.",
    "Map claims to exact predecessor keys/hashes/sections in evidence.md. Navigation is not a build edge. Do not claim provider qualification, runtime binding, live consumers, maintenance success or global S1 acceptance.",
    "Store body.md, evidence.md, production-manifest.json, response.md and the exact visible dispatch record in the exclusive directory. Preserve existing request.txt. Include every actual consumed whole-file unit and provenance in production-manifest.json; do not call a postproduction manifest an earlier recipe.",
    "No network, GitHub writes, product tests or product changes, policy/guard changes, sibling mutations or other agents. Python/file tools may read the enumerated inputs and write your outputs; deterministic hashing is permitted.",
    "Stop after this one authoring delivery and report hashes, input/output counts and limitations. The principal obtains the same two native judges before releasing a dependent."
  ],
  "outputs": [
    "body.md",
    "evidence.md",
    "production-manifest.json",
    "response.md",
    "dispatch-message.txt"
  ],
  "reserved_answers_included": false,
  "usage_fields": "Physical attempts, tokens and billing UNKNOWN when not exposed."
}

## END_RECEITA_DE_TAREFA_EXATA

## BEGIN_RECEITA_COMUM_EXATA

{
  "schema": "s1-03-derived-public-authoring-contract/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "purpose": "Actual common recipe for future L2-L4 derivation; frozen before those author dispatches. Not semantic output or acceptance.",
  "scope": "S1-03 only",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_revision": "ee2521a5b966bd505cc95bd1c733e09e12f33531",
  "kit_revision": "70234d541a9a3539935ef16f19e33c8f2d5f30ec",
  "artifact_plan": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/artifact-plan.json",
    "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad"
  },
  "author_context": "fresh fork none; no reserved answers; read exactly listed accepted predecessor bodies plus public task/recipe/authority inputs; new raw-source needs return to principal before use",
  "gate": "Only dispatch a derived artifact after the same two current native judges accept every declared required predecessor at exact bytes. Recipe preparation does not release the gate.",
  "layer_roles": {
    "2": "Explain local working flow and decision boundaries from accepted L1, giving useful direct entry points into the detailed contracts.",
    "3": "Explain relationships, change impact and which knowledge/consumers need re-evaluation; distinguish build dependencies from navigation and independent families.",
    "4": "Ownership, maintenance/diagnosis, verification and escalation; entry gives shallow orientation and concrete deeper navigation while preserving the historical Core entry."
  },
  "quality_rules": [
    "Write a usable Portuguese reference with clear depth2 section headings so a consumer can request a bounded section through ownership.read.",
    "Make distinct the source-supported mechanism, authorized intent, inference and remaining gap. Do not upgrade tests listed to executions.",
    "Cite exact accepted predecessor keys, bytes/hashes and relevant sections. Do not invent line evidence, raw source details or external engine guarantees.",
    "Avoid reprinting the full predecessor or adding a file per source; satisfy the defined need with a compact coherent explanation.",
    "Describe known failures and authority boundaries explicitly. A proposed operational action does not prove it was executed.",
    "Do not include reserved oracle answers or infer a consumer PASS; public questions are needs, not outcomes.",
    "No product edits, local tests, network/provider calls, GitHub writes, policy/guard changes or external messages.",
    "Preserve exact visible request/response and body bytes; retain every revision and actual input identity, including genuine procedures used. No private reasoning.",
    "Use only authorized exclusive producer directory. No sibling payload/producer mutation or recursive filesystem discovery. If an extra input is necessary, identify it before reading.",
    "The actual authoring recipe is this contract plus the per-task frozen recipe and visible dispatch. A descriptive output manifest created afterwards is not a preexisting executable recipe."
  ],
  "public_criteria": [
    "GO-A1",
    "GO-A2",
    "GO-A3",
    "GO-A4",
    "GO-A5",
    "GO-A6",
    "GO-A7",
    "GO-I1",
    "GO-I2",
    "GO-I7",
    "GO-I8",
    "QS-1",
    "QS-2",
    "QS-3",
    "QS-4",
    "QS-5",
    "QS-6",
    "CC-1",
    "CC-3",
    "CC-4",
    "CC-7",
    "AC-01"
  ],
  "outputs": [
    "body.md",
    "evidence.md mapping claims/sections to exact accepted predecessor sections",
    "production-manifest.json listing actual consumed whole-file units and the scope of each, output hashes, gaps and procedure provenance",
    "request.txt exact visible dispatch",
    "response.md original visible result and limitations"
  ],
  "not_outputs": [
    "No oracle copy",
    "No new AGENTS or authority file",
    "No claimed runtime receipts or semantic verdicts",
    "No replacement of historical s1.core.entry"
  ]
}

## END_RECEITA_COMUM_EXATA

## Inputs reais — projeção mecânica do manifesto

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | Repository instructions within the delegated authoring boundary |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | Public S1 subdivision authority and preservation rules |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | S1-03 scope and ownership |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | Public execute-genesis procedure, specialized by the frozen task |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | Public principles and criteria |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | Public S1 contract, specialized by S1-03 |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | Public context/provenance rules |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | Public producer and principal responsibilities |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | Public separation of authorship and semantic judgment |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | Public transport identity and dependency rules |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | Frozen graph; only the L2 research node released |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | Actual common authoring recipe and layer role |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | Public fixed criteria; no reserved answers |
| producers/research/body.md | 63841 | f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f | Exact accepted L1 semantic predecessor |
| payload/recipes/derived/research-flow.json | 8423 | 543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1 | Frozen per-task recipe read before authoring |
| producers/derived-research-flow/request.txt | 850 | 351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee | Frozen task request, preserved without modification |
| producers/derived-research-flow/dispatch-message.txt | 1511 | 2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf | Exact visible native dispatch, captured as UTF-8 without an added newline |

Manifesto original posterior: producers/derived-research-flow/production-manifest.json; 19363 bytes; SHA256 363c7e06f9ec4f0ea2165c81204c238f2972d702875b2d2d445607c0d2e66fcf. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.
