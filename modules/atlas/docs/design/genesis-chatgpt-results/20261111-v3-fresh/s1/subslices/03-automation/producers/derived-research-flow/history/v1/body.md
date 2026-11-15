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
