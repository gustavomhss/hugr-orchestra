# Delta literal L3 — revisão 2 → revisão 3

Anterior: 9301 bytes, SHA-256 `c140fb0bf9606079e91576b542ec82b3904583e7433a8fe297c886318649f478`.

Novo: 13657 bytes, SHA-256 `ba532f772f8f2f08be5938caf3ba9856c6f185e79d18fb0ed9d016b9d176f0bd`.

Diff SHA-256 `155ee780bbbdcd1b0e3768583300c4265d57189a22ab56dc1cad69473879a13f`.

```diff
--- revision-2/body.md
+++ body.md
@@ -1,13 +1,13 @@
 # L3 — impacto integrado de contratos e receitas
 
-`s1.subslice04.integrated-impact` · `orchestra.s1` · fonte API `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
+`s1.subslice04.integrated-impact` · `orchestra.s1` · fonte API/Core `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
 
-Este candidato compõe L2 aceito e cinco L1. Integra fronteiras API locais; não certifica o ciclo interno de Core. As regras de manutenção vêm da norma pública, sem execução do Atlas.
+Este candidato compõe L2 aceito, cinco L1 API e três L1 Core aceitos. Integra admissão/retry, execução local e persistência às fronteiras API, nos limites desses corpos. As regras de manutenção vêm da norma pública, sem execução do Atlas.
 
 ## Três relações diferentes
 
 - **Input de fonte/receita:** arquivo, membership relevante, intenção normativa, configuração de geração ou contrato de validação que sustenta a construção. Adição, remoção e alteração de receita também entram no impacto. O grafo de imports do produto ajuda a localizar consumidores, mas não é o grafo de conhecimento.
-- **Dependência de construção:** predecessor aceito cujo resultado foi usado para construir este artefato. Aqui são L2 e `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.session-contract`, `s1.api.client-projection` e `s1.api.codegen`, com hashes exatos. L2 conserva sua própria cadeia; não se inventa uma dependência Core para preencher ausência de conhecimento aceito.
+- **Dependência de construção:** predecessor aceito cujo resultado foi usado para construir este artefato. Aqui são L2; `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.session-contract`, `s1.api.client-projection`, `s1.api.codegen`; e `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.persistence`, com hashes exatos. L2 conserva sua cadeia; os três Core são dependências adicionais aceitas, sem incorporar os demais artefatos do pacote.
 - **Navegação:** referência que orienta uma consulta ou handoff. Um link, inclusive para Core, não invalida automaticamente o artefato. Se o conteúdo consultado passar a sustentar um claim, declarar sua dependência e satisfazer o gate pertinente.
 
 Dependências de construção devem ser acíclicas: rejeitar ciclos. A navegação pode conter ciclos, mas cada consulta deve ter limite definido de leituras/contexto e evitar revisitar artefatos já percorridos.
@@ -16,9 +16,9 @@
 
 | Mudança | Impacto local a examinar | Consequência para conhecimento e verificação |
 | --- | --- | --- |
-| Campo opcional de DTO/pedido | Schema possui o tipo compartilhado; Protocol possui a declaração HTTP. Em `session.prompt`, seguir `packages/protocol/src/groups/session.ts` → `packages/server/src/handlers/session.ts` e o serviço delegado. Client reflete `ClientApi`; SDK pode expor a chamada. | Revalidar semântica de ausência/valor, encaminhamento e projeções. `optional` filtra `undefined`; isso não determina sozinho defaults, `null` ou compatibilidade de registros antigos. Atualizar os L1 de valores, Session e projeção atingidos, depois seus dependentes. |
+| Campo opcional de DTO/pedido | Schema possui o tipo compartilhado; Protocol possui a declaração HTTP. Em `session.prompt`, seguir `packages/protocol/src/groups/session.ts` → `packages/server/src/handlers/session.ts` → `Session.prompt`/`SessionInput`. Client reflete `ClientApi`; SDK pode expor a chamada. | Revalidar ausência/valor, encaminhamento, identidade de retry e consistência da projeção nos contratos abaixo. `optional` filtra `undefined`; isso não determina sozinho defaults, `null` ou compatibilidade histórica. Atualizar os L1 API/Core atingidos, depois seus dependentes. |
 | Resposta, erro ou comportamento de handler | Conferir a declaração Protocol, o mapeamento específico Server e o tratamento Client. Para prompt, o conhecimento aceito demonstra `Admitted` e mapeamentos 409; não demonstra toda a execução. | Mudança observável pode exigir contrato e clientes novos; não deduzir status universal de erros Core. Revalidar apenas os adapters/contratos afetados e o conhecimento que depende deles. |
-| Evento ou forma de stream | Schema possui envelope, identidades e inventários; Protocol/Server expõem o transporte; Client projeta wire/Effect. O feed global vivo e a leitura durável de Session têm papéis distintos. | Reexaminar classificação público/durável, codecs e consumidores. Persistência/migração exigem o owner correspondente; envelope ou SSE não provam durabilidade, continuidade global ou replay compatível. |
+| Evento ou forma de stream | Schema possui envelope, identidades e inventários; Protocol/Server expõem o transporte; Client projeta wire/Effect. EventV2 fornece os contratos locais de persistência/projeção e subscrição abaixo. | Reexaminar público/durável, codecs, consumidores e evolução de dados. Usar a distinção entre commit durável, `persist:false` e notificação; não inferir continuidade global ou replay compatível de qualquer envelope/SSE. |
 | Receita do Client ou gerador genérico | `packages/client/src/contract.ts` possui nomes/omissões; `packages/client/script/build.ts` compõe os produtos; `tooling/httpapi-codegen` possui compilação/emissão/escrita. | A receita é input mesmo com API e bytes gerados iguais. Revalidar geração, bindings e os L1 de geração/projeção afetados; preservar contratos independentes que continuem válidos. |
 
 A mudança deve preservar Schema/Protocol separados dos serviços concretos. Importar Core/Server no runtime Client viola a autoridade de fronteira; essa composição pertence a Server/SDK. Inspeção de fonte não prova bundle/browser.
@@ -43,10 +43,24 @@
 
 Cada leitura apresentada como atual deve vincular as versões exatas dos artefatos a um manifesto aceito de escopo e de fechamento das dependências, válido para os inputs e contratos atuais. Sem esse vínculo, a leitura atual fica em HOLD. Uma consulta histórica deve ser identificada como histórica e não pode ser apresentada como atual apenas por ter sido aceita anteriormente.
 
-## Handoff Core e consulta proporcional
+## Contratos API/Core agora integrados
 
-A principal informou S1-01 em `genesis-s1-sessions`, head `45cf4cd48f2038dca56b859f763da2c28d862c12`, handoff `IN_PROGRESS`, sem pacote aceito. Esta é uma referência de coordenação, não fonte Core inspecionada nem dependência de construção aceita.
+O recheck atribuído à principal identifica S1-01 em `genesis-s1-sessions`, head `9fd024a34e76d2e9328e1f793ef1f69fbf606e51`, payload `a2a5de03d7b1034373eb877d8f03c4cecc772dde`, ainda `IN_PROGRESS`. A rodada 9 reconheceu o reúso exato de `s1.core.session-admission`, `s1.core.session-execution` e `s1.core.persistence`; todos observam o mesmo baseline API/Core. Isso substitui a ausência anterior de predecessores, preservada na revisão 2, e não aceita o restante do Core.
 
-O owner Core precisa fornecer conhecimento aceito sobre identidade de retry (message ID, prompt, delivery), relação entre admissão/resume/promoção, persistência e recuperação, e consequências dos erros para registros/execução. Os casos históricos O1/O2 apoiam essas perguntas; não fecham as garantias. A evidência API já permite localizar declaração, encaminhamento e erro HTTP. Exclusão entre hosts, efeitos externos exactly-once e comportamento de runner continuam fora do que este mapa demonstra. A ausência do pacote Core bloqueia esses claims, sem bloquear o mapa integrado API delimitado.
+**Admissão, identidade e mudança pública.** A fachada `SessionV2` devolve a Session já armazenada quando `create` recebe ID existente; campos diferentes pedidos nessa chamada não atualizam os valores registrados. No prompt, gera ou usa message ID, resolve o prompt e adota `steer` por padrão. Hooks precedem a admissão e são pulados quando o ID já identifica input/mensagem histórica; uma recusa nova não é admitida. `SessionInput.admit` publica `PromptAdmitted`, exige sequência/projeção e devolve o recibo armazenado. Só depois a fachada chama `execution.wake`; `resume:false` suprime esse wake da chamada. Um retry exato pode emitir novo wake sem inserir outro input. Admissão única não é execução única nem comprovação de turno concluído.
 
-Para uma mudança local, começar pelo L2 `s1.subslice04.local-contracts` e abrir só o L1 do assunto; a tabela indica quando cruzar a fronteira. Para detalhes de stream/SDK/domínio, usar a navegação de L2 e os gaps do domínio. Um conhecimento obrigatório faltante vira complemento inferior delimitado e julgado antes do claim dependente; não vira descoberta bruta automática. Os claims B3 retirados permanecem `RETIRED_EXTRA_CLAIM`. Não há declaração de publicação ou consumo real.
+Para o mesmo message ID, equivalência de retry compara Session ID, JSON do prompt canônico codificado e delivery. Trocar delivery produz `PromptConflictError`, mapeado pelo adapter HTTP ao conflito já descrito. `promptContext` e instante de criação pertencem à consistência da projeção, não à equivalência do retry do chamador. Retry de mensagem histórica consulta o `Prompted` durável original para recuperar delivery; só a projeção não basta. Portanto, campo público novo exige verificar se altera o prompt canônico/identidade, a projeção, ou apenas o controle de wake. O1/O2 apoiam essa distinção sem certificar efeitos externos.
+
+**Promoção e execução local.** `PromptAdmitted` cria o inbox; `Prompted` registra promoção e mensagem visível na transação de EventV2. `promoteSteers` respeita cutoff de admissão e ordem de sequência; `promoteNextQueued` escolhe o input queue pendente mais antigo. O runner inicializa System Context ausente antes da promoção; promoção de queue inclui uma queue e o lote steer elegível. Isso distingue retorno HTTP de admissão, visibilidade no histórico e tentativa do provider.
+
+O coordenador usa mapa em memória por Session: `run` inicia forçado ou se junta à entrada ativa; `wake` agrega trabalho e inicia drain não forçado quando ocioso. O drain obtém o runner pela Location armazenada; drain não forçado sem steer/queue pendente não trabalha. O caminho ordinário tem uma chamada explícita a `llm.stream` por turno; host selecionado usa seu stream e portas controladas, sem demonstrar os internos do engine. A coordenação local explica `active`, não uma lease distribuída. Interrupção preserva inputs admitidos para wake/resume posterior; não reexecuta silenciosamente efeitos abandonados. Limite de turnos não prova limitação geral de retries/loops de tools.
+
+**Persistência, projeção e transporte.** EventV2 durável usa transação imediata para validar identidade/sequência do agregado, executar projectors e eventual hook local, avançar sequência e inserir evento selado. `persist:false` é exceção explícita: projeta sem append/avanço de sequência e notifica sem envelope durável; não admite hook local de commit. Logo, notificação e projeção não bastam para afirmar persistência. A subscrição durável registra canal de wake antes de ler histórico e relê eventos armazenados após wakes, avançando pela sequência persistida; isso não transforma o SSE global vivo em feed durável sem perdas.
+
+Replay resolve definição durável versionada e tem ramos próprios de owner/reconciliação; `claim` altera owner de replay, não ownership de execução. Projectors são registrados por tipo, com vinculação exata tipo+versão ainda apontada como TODO: evolução arbitrária de payload histórico não é replay-safe por inferência. Seals são evidência de integridade do conteúdo encadeado, não autoria, autorização de replay ou lease. Alterações persistidas precisam preservar contratos de dados/migração; restauração de usuários existentes, locking entre processos e controles negativos de seals exigem evidência própria, além da leitura aceita do motor e das tabelas Session.
+
+## Handoff restante e consulta proporcional
+
+Os três L1 fornecem estes contratos locais de fonte; não há certificação de provider/SQL executados, recuperação automática após morte do processo, ownership durável entre hosts ou efeitos externos exactly-once. Internos de execution hosts pertencem ao owner do engine-adapter; migrações históricas e outros mecanismos não cobertos exigem o complemento pertinente. O estado incompleto do resto do Core não retira o conhecimento aceito acima.
+
+Para mudança API local, começar pelo L2 `s1.subslice04.local-contracts` e abrir só o L1 do assunto. Para identidade/admissão, execução local ou persistência, usar os três L1 Core agora declarados; para stream/SDK/domínio, usar a navegação de L2 e os gaps do domínio. Conhecimento obrigatório ainda ausente vira complemento inferior delimitado e julgado antes do claim dependente, sem descoberta bruta automática. Os claims B3 retirados permanecem `RETIRED_EXTRA_CLAIM`. Não há declaração de publicação ou consumo real.
```
