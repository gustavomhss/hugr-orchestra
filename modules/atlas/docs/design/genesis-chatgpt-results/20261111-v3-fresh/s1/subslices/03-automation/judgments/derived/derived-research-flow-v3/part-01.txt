# Reavaliação — research-flow L2 v3 completo

Mesmo par nativo independente, sem ferramentas. Execução 34269cf4-d631-41c5-a30b-85b0ec217390. Nenhum parecer corrente do outro juiz é fornecido.

Candidato s1.subslice03.research-flow, L2 flow: 17124 bytes, SHA256 f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7, Git blob 1ceb2496a2185042e3eb564e80828bd85ac08f7f. Corpo integral, evidência corrente e receita real seguem abaixo.

A última versão julgada foi v1 (16980 bytes, SHA256 a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044). A v2 foi preparada e verificada, mas NUNCA despachada aos juízes. A revisão atual é cumulativa v1→v3. Julgue explicitamente o corpo v3 completo, reutilizando somente seu próprio exame anterior e fechando ou mantendo RF-J2-F01. O L1 v4 aceito por você agora é a única autoridade semântica corrente; o L1 v3 permanece histórico, sem qualificação retroativa.

## Dois deltas do corpo desde v1

F3, reparo substantivo público RF-J2-F01:

ANTES:
`````text
Sem shard aberto, dispara build detached e responde building/unavailable com motivo.
`````
DEPOIS:
`````text
Sem shard aberto, só inicia build detached se houver extrator, construção necessária e nenhum build em curso; a resposta building/unavailable com motivo não comprova, por si, que a consulta iniciou novo trabalho.
`````

F0, atualização de identidade do predecessor:

ANTES:
`````text
`s1.core.research`, corpo de **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**
`````
DEPOIS:
`````text
`s1.core.research`, versão 4, corpo de **64.106 bytes**, SHA-256 **`c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`**
`````

A principal verificou ambas as composições e inversas; todos os demais bytes do body v1 permanecem iguais. De v2 para v3, F1–F8 estão byte-idênticos; somente F0 mudou. O mapa de evidência foi atualizado para a autoridade v4 e a proveniência cumulativa. A receita pública de v3 foi congelada antes do despacho; apply.py real tem 20110 bytes e SHA256 fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435. O freeze anterior à execução foi conferido, incluindo os inputs. Foram verificados 45 inputs integrais, 500591 bytes: 28 retidos, cinco registros v2 realmente lidos nas verificações anteriores e 12 desta revisão. Os cinco registros são outputs históricos consumidos; não são inputs retroativos de v2 nem self-inputs atuais. A v3 preserva os quatro outputs v2 e toda a linhagem anterior.

O FINAL nativo corrente foi capturado literalmente; o FINAL v2 anterior não foi capturado separadamente antes da compactação. O response.md original v2 e uma confirmação posterior explicitamente distinta estão preservados. Essa lacuna não foi apagada nem preenchida por reconstrução. Usage físico/tokens/custo UNKNOWN.

Critérios públicos mantidos: foco QS-1, CC-3, GO-A1/GO-A2/GO-A5 e AC-01 local. Sem binding, consumidor, manutenção ou aceitação operacional implícita. Pedimos decisão sobre o corpo completo identificado, não apenas aprovação dos dois trechos.

## Corpo corrente integral

# Research: aquisição, índice e autoridade da investigação

**Chave:** `s1.subslice03.research-flow` · **L2** · **need:** `flow` · **escopo:** `orchestra.s1` / S1-03.

## F0. Entrada, base aceita e alcance

Este L2 explica o caminho entre uma receita de ferramenta, a consulta de código e uma evidência retida utilizável. Seu único predecessor de construção é `s1.core.research`, versão 4, corpo de **64.106 bytes**, SHA-256 **`c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`**. A receita congelada informa PASS dos dois juízes para esses bytes. Esse gate é semântico; não comprova execução do produto. O L2 é candidato à revisão própria.

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

**Observação estática — L1 R7–R8.** Query devolve base, cobertura, freshness e bounds junto com os resultados. Sem shard aberto, só inicia build detached se houver extrator, construção necessária e nenhum build em curso; a resposta building/unavailable com motivo não comprova, por si, que a consulta iniciou novo trabalho. Pode usar primeiro shard retido de mesmo id quando falta o atual, marcando stale. Nesse caso, commit/versões em basis vêm do plano atual: não se deve atribuir automaticamente esses bytes aos rows antigos.

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

## Evidencia corrente integral

# Evidências — s1.subslice03.research-flow

## E0. Identidade e autoridade do predecessor

A única autoridade semântica corrente de construção é `s1.core.research`, L1/`component`, versão 4, em `producers/research/body.md`, **64.106 bytes**, SHA-256 **`c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`**, blob Git recalculado **`69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`**. A fonte investigada por esse L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; este produtor L2 não abriu essa fonte bruta, os captures, coverage ou evidence do L1.

A receita congelada desta revisão, `producers/derived-research-flow/revisions/v3/recipe.json`, 5.536 bytes, SHA-256 `6b77e699b909ae075954e1d0fb00cd205a4ada0f4cd5ed23eff6fdd350630eae`, declara que `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` aceitaram esse mesmo corpo L1 v4. As respostas originais são identificadas na receita por `f0aa061a964bc10e7429dde0b54c2f74c465bdb1e1a7198544541af0fc23218e` e `1d6caeecccc795766c71a3cb9822c8feb1939c8477d7c1d6c9d5ff90d96bea35`. São referências de proveniência fornecidas pelo gate; os pareceres integrais não foram lidos. Nenhuma decisão L2 é atribuída aos juízes por este autor; a v2 preparada não recebeu reavaliação semântica.

O novo body L1 v4 foi relido integralmente em duas exibições contíguas, linhas 1–230 e 231–378. O L1 v3 anterior, já consumido integralmente neste contexto, permanece byte-verificado no alias `producers/research/revisions/v4/history/body.md`, 63.841 bytes, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`; é proveniência histórica, não outro predecessor semântico corrente. As referências abaixo apontam às seções do L1 v4 aceito, sem fabricar linhas de código ou transferir autoridade de versões antigas.

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
| F3, query/stale/dirty | Build condicionado a extrator presente, construção necessária e nenhum build em curso; building/unavailable não comprova novo disparo; retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty | Observação; ausência de hit não prova ausência de uso |
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

**Histórico preservado.** A produção inicial registrou 17 inputs integrais; sua verificação de 14 pins, pedido/dispatch e a recuperação da exibição truncada de COMMON permanecem nas versões preservadas. A v2 registrou 28 inputs e a correção RF-J2-F01. Os quatro outputs v1 continuam em `history/v1/`; os quatro outputs v2 foram copiados byte a byte para `revisions/v3/history/` antes de qualquer alteração. Pedidos, dispatches, receitas e procedimentos anteriores não foram reescritos.

**Consumo cumulativo atual.** O manifesto v3 enumera **45 unidades integrais únicas**: 28 do manifesto anterior, cinco outputs v2 efetivamente lidos nas verificações de bytes/hashes e 12 unidades desta revisão. A inclusão dos cinco registros conserva leituras reais que eram verificações de outputs recém-produzidos na etapa anterior. Cada unidade tem local_path, tamanho, SHA-256 e blob Git; a linhagem de leitura original fica separada do alias retido. O L1 v3 usa seu alias histórico e não é predecessor corrente. Nenhum body/evidence/manifest/response atual é auto-input.

**Leitura e identidade.** Os sete inputs enumerados na receita v3 foram lidos integralmente ou, no caso do alias do L1 v3 já integralmente consumido, relidos em bytes e conferidos contra a mesma identidade. O L1 v4 inteiro foi relido nesta revisão. Os tamanhos, SHA-256 e blobs Git coincidiram com os pins. A verificação de completude de leitura é procedural, sem alegação de isolamento técnico do host.

**Mudanças e procedimento.** Foram quatro edições de metadata: identidade em F0, identidade/gate/leitura em E0, vínculo direto em E1 e registros atuais nesta E3. F3 e todos os bytes de F1–F8 permanecem idênticos à v2; nenhuma alteração substantiva adicional foi necessária. O script real e os inputs foram congelados antes da execução. O delta registra literais, offsets e segmentos inalterados; sua inversão recompõe body/evidence v2 byte a byte. O body atual contém nove cabeçalhos depth2 e 17.124 bytes UTF-8. A extensão acima da preferência usual conserva as qualificações já produzidas, sem reproduzir o catálogo integral do predecessor.

**Estado de revisão.** A principal informou verificação mecânica da v2; nenhum parecer L2 v2 foi inferido. A v3 exige conferência independente e reavaliação pelos mesmos juízes. Hashes, preservação e prova inversa não são PASS semântico.

**NOT_RUN:** instalação/download de engines, providers/rede, testes/typecheck/guards do produto, Atlas import/binding/publicação/index/read, consumidor independente e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. L3/L4 não foram produzidos; a principal mantém seus gates separados.

## Receita v3 congelada antes do despacho

{
  "schema": "s1-03-derived-parent-correction-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T04:19:15.936531+00:00",
  "state": "FROZEN_AFTER_PARENT_GATE_BEFORE_DISPATCH",
  "artifact": "s1.subslice03.research-flow",
  "version": 3,
  "prior_version": 2,
  "author_context": "Continue exactly the same oracle-blind native family author; no fork replacement, raw sources or judge prose. Retain cumulative actual input context.",
  "exclusive_output_directory": "producers/derived-research-flow",
  "revision_directory": "producers/derived-research-flow/revisions/v3",
  "new_predecessor": {
    "key": "s1.core.research",
    "layer": 1,
    "version": "4",
    "body_bytes": 64106,
    "body_sha256": "c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1",
    "body_git_blob_sha": "69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b",
    "local_body_path": "producers/research/body.md"
  },
  "predecessor_acceptance_gate": [
    {
      "judge_id": "parallel-v3-fresh/S1-03/J1",
      "status": "PASS",
      "body_sha256": "c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1",
      "original_response_sha256": "f0aa061a964bc10e7429dde0b54c2f74c465bdb1e1a7198544541af0fc23218e"
    },
    {
      "judge_id": "parallel-v3-fresh/S1-03/J2",
      "status": "PASS",
      "body_sha256": "c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1",
      "original_response_sha256": "1d6caeecccc795766c71a3cb9822c8feb1939c8477d7c1d6c9d5ff90d96bea35"
    }
  ],
  "read_exactly": [
    {
      "local_path": "producers/derived-research-flow/body.md",
      "bytes": 17113,
      "sha256": "f6dce8d080ff5bdd3a5409bd16b846c176c8270135eb51a6cd0329413e3d0994",
      "git_blob_sha": "2bd9021ea932e9afb5fdd8619b5b6b16e4bfc440"
    },
    {
      "local_path": "producers/derived-research-flow/evidence.md",
      "bytes": 11457,
      "sha256": "b7d51d3bab6f9d8538d6b6362953647eedfbc5fad905c69b5d3fd38b0ea75022",
      "git_blob_sha": "18797d0844d84082dc39e99acbc10f9de03c46ea"
    },
    {
      "local_path": "producers/derived-research-flow/production-manifest.json",
      "bytes": 34692,
      "sha256": "32c07a3198dfd1bcada8d932e2a61d6dc09c129f6a53fd0c42467611cc7a9831",
      "git_blob_sha": "6a8563a63ff00393e2497f95313df53caf80bd00"
    },
    {
      "local_path": "producers/derived-research-flow/response.md",
      "bytes": 2016,
      "sha256": "553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90",
      "git_blob_sha": "e3e6ca3002c8d235f59537e5c5175461fda03c0b"
    },
    {
      "local_path": "producers/research/body.md",
      "bytes": 64106,
      "sha256": "c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1",
      "git_blob_sha": "69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b"
    },
    {
      "local_path": "producers/research/revisions/v4/history/body.md",
      "bytes": 63841,
      "sha256": "f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f",
      "git_blob_sha": "72bdc55fdf2dbda97e84c87111be73fa49aceeb4"
    },
    {
      "local_path": "producers/derived-research-flow/revisions/v3/public-findings.md",
      "bytes": 1210,
      "sha256": "e1f6536c5f2ca30f7ddb215fe5f0c888d1b7da01c29c437ee2cdb099077be1a7",
      "git_blob_sha": "7b9778189193884b684f309cada1851b03f8abb0"
    }
  ],
  "other_actual_inputs": "This recipe, its request and the exact visible dispatch; own pre-execution procedure and freeze if used. Retain previously consumed full files with stable aliases, including prior accepted parent version.",
  "instructions": [
    "Read all enumerated files in full, avoiding truncated outputs. Do not read full judges/oracle/raw source/sibling data, invent inputs or create another agent.",
    "Before editing, preserve the four current outputs body/evidence/manifest/response byte-identically in revision history. Do not overwrite old frozen revisions. Capture actual procedure and input identities before executing it once; preserve request, recipe, findings and dispatch.",
    "Apply only the public findings and necessary predecessor/identity updates. Keep exact before/after literals and offsets, inverse verification and unchanged segments; distinguish substantive and metadata edits. New output manifest is not a retroactive recipe.",
    "Write body.md, evidence.md, production-manifest.json and response.md current plus revision records: dispatch-message.txt, actual apply.py, procedure-freeze.json, history/, delta.json, review-supplement.md, input-manifest-extension.json and producer-verification.json. A delta patch is useful if deterministic.",
    "The current production-manifest.json must enumerate all cumulative actual input units, with byte length, SHA256 and Git blob; use local_path consistently. Prior versions changed in place get retained_alias paths, never current outputs as self-inputs. Do not erase earlier public procedure/recipe/request context or genuinely read hash/preservation inputs. Preserve original read-path lineage separately from retained transport aliases.",
    "Evidence current must map claims to the new accepted predecessor. Historical evidence/manifest/request remain unchanged in preserved prior versions. The prior parent alias is earlier context provenance, not another current semantic build predecessor.",
    "No product/network/Atlas/test/remote operation. No L3/L4 release or self-PASS. Deliver one complete correction and stop for the same two judges. Unexposed physical attempts/tokens/cost remain UNKNOWN."
  ]
}
