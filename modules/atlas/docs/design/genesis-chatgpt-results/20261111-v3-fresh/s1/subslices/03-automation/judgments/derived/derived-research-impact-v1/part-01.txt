# s1.subslice03.research-impact — revisão semântica L3 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.research-impact, 13972 bytes, SHA256 4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f, Git blob f85d2a546afb51d148c4f748d5f49c7a9c6727f8. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 58 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-research-impact-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Research: relações e impacto de mudanças

**Chave:** `s1.subslice03.research-impact` · **L3** · **need:** `operational` · **escopo:** S1-03 / `orchestra.s1`.

## I0. Decidir o impacto com uma base exata

Este L3 delimita explicações e usos que precisam de reavaliação quando mudam receitas, índice ou autoridade da investigação. Seu único predecessor semântico corrente é **`s1.subslice03.research-flow`, L2 v3**, **17.124 bytes**, SHA-256 **`f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7`**. A receita fornece os dois PASS para esses bytes; não comprova execução do produto nem aceite deste L3.

As referências F0–F8 apontam a esse predecessor. **Base estática** resume seus mecanismos; **impacto inferido** indica consequências a verificar; **contrato público** identifica exigências do plano e dos critérios da campanha. A execução desta entrega limita-se à autoria e à verificação de arquivos. Não foi calculada worklist pelo runtime, reconstruído índice ou avaliado consumidor.

Impacto exige identificar o input alterado, a condição que controla e a conclusão extraída. Mesmo nome, prosa igual, arquivo presente ou ready não demonstram validade isoladamente. I1 trata aquisição; I2, índice; I3, probes; I4, autoridade; I5–I6, dependências e consumo.

## I1. Receita local ou mecanismo compartilhado

**Base estática — F1.** Research possui raiz/manifesto próprios e reutiliza a interface backend. Versão, locks/wheels, runtime, floors, layout, executável e launcher compõem a receita. Readiness combina instalação, dependências, tentativa, executável e shim; hosted inclui runtime. O alcance depende da parte alterada.

| Mudança | Impacto inferido | Limite de alcance |
| --- | --- | --- |
| Versão, lock/wheels, ambiente, layout ou launcher de um pack | Receita, aquisição, readiness e usos daquela engine | Não estender a packs sem esse input; conferir dependências |
| Runtime ou dependência compartilhada | Engines que a utilizam e usos dependentes de sua prontidão | O alcance segue a relação real, não proximidade de nomes ou cache |
| Floor/target ou verificação de executável/shim | Admissão no host, estados/razões e decisões de disponibilidade | Versão de engine igual não preserva condição de admissão alterada |
| Aquisição/readiness comuns | Caminhos backend e research que reutilizam o mecanismo | Raízes próprias não demonstram independência do código comum |
| Versão de geração OpenAPI ou receita Cassandra | Guard de projeto ou overlay fixado e compatibilidade pertinente | Não generalizar para todas as engines nem inferir aplicação do guard pela aquisição |

Espera, cooldown e estados também afetam consumidores. O waiter pode desistir enquanto a aquisição continua; prefetch devolve estados individuais; `.complete` pode coexistir com executável ausente. **Inferência:** reavaliar decisões de uso/retry que dependem desses sinais. `ready` conserva alcance local; mudança de receita não qualifica provider, plataforma ou saída.

## I2. Inputs do shard e conteúdo servido

**Base estática — F2–F3.** A chave reúne indexer/versão, shard, pares path/blob e locks/configs, inclusive extends. Não é simplesmente HEAD. O texto retido vem do worktree, sem snapshot atômico de todos os arquivos. Base, cobertura, freshness e bounds participam do significado da consulta.

| Mudança ou observação | Superfície a reavaliar | Conclusão indevida |
| --- | --- | --- |
| Código, adição/remoção de fonte ou mudança de projeto/ownership | Membership, pares path/blob, seleção e consultas dependentes | Limitar tudo ao arquivo do diff ou invalidar todos os shards sem verificar a partição |
| Lock, config/extends ou indexer/versão | Identidade do shard e atribuição dos resultados à base | Declarar índice atual porque o arquivo consultado parece igual |
| Extração, ranges ou filtros de consulta | Símbolos/relações, cobertura e conclusões de presença/ausência | Tratar estrutura, callers/callees ou opaqueSites=0 como cobertura total ou execução |
| Worktree dirty ou shard retido stale | Texto atual, rows retidos, basis e alcance do overlay | Atribuir automaticamente a base atual aos rows antigos |
| Retenção/store/status | Disponibilidade, escolha de retido e interpretação de existência | Banco existente como índice saudável ou budget como teto rígido de disco |

**Impacto inferido:** começar pelos shards cujos inputs relevantes mudaram e pelos usos que dependem de seus resultados/bases. Isso delimita uma investigação, sem fornecer uma lista calculada nesta produção. Consultas com resultados de bases diferentes exigem conferir as bases pertinentes; um diff de arquivo não demonstra sozinho o conjunto completo.

Vazio precisa conservar sua origem: adapter default, falha de plan, filtro de prewarm e plano realmente vazio podem deixar ausência de trabalho. `source_unavailable` na observação Git não equivale a remoção. Sem shard aberto, F3 condiciona novo build a extrator, construção necessária e ausência de build em curso; building/unavailable não prova novo disparo. Resposta vazia não demonstra impacto inexistente nem estado building demonstra reparo iniciado.

Dirty overlay não atualiza universalmente imports/references/callers/callees/map. Locate confere ranges no conteúdo atual, mas fallback, limites e seleção não certificam ausência de usos. Mudanças nessas condições exigem reavaliar conclusões negativas. Conservar razões de cobertura e `semantic: absent`; não atribuir embeddings ao fluxo descrito.

## I3. Probes e a passagem para evidência retida

**Base estática — F4–F5.** Snapshot, revisão/dirtyDigest, runner, argv, versão, verdict e saída limitada identificam o resultado. Snapshot de commit pode referenciar dependências por symlink; timeout de subprocesso não cobre todo preparo/fila; coordenação de host é local ao processo. Garantias de sandbox/memória continuam externas.

**Impacto inferido:** alteração de runner, snapshot, dependências, verdict ou limites pode mudar o que passed/reproduced/blocked sustenta. Reavaliar F4 e os usos desse resultado, incluindo limites de reprodução. Não transportar resultado antigo para nova base nem confundir cap declarado com enforcement demonstrado.

Objeto de resultado e URI de probe não cobram, capturam ou admitem automaticamente evidência. Mudança na retenção pelo chamador atinge a associação entre resultado, cobrança, captura e SourceAdmitted, além dos registros que usam a fonte. Mudança apenas de aquisição não demonstra alteração da admissão. `blocked_by_repo_guard` permanece recusa; análise de impacto não autoriza contornar o guard.

## I4. Autoridade muda mesmo com texto igual

**Base estática — F5–F7.** Identidade nativa, operação, orçamento, bytes, admissão, locator, revisão e fechamento têm contratos diferentes. Suas relações localizam propagação; um evento não substitui os demais.

| Contrato alterado | Relação afetada e consequência inferida |
| --- | --- |
| Session/task/authorSession, location ou CapabilityInvocation | Quem pode produzir/reler e o binding das fontes/records; texto igual não supre vínculo divergente |
| Operation id, payload de charge ou allowance | Replay/conflito, gasto e incerteza; reserva não devolve saldo e publicação incerta não vira gasto zero |
| Bytes, digest, representation, complete ou metadata derivada | Manifest/receipt/admissão, leitura e fontes derivadas dependentes; fim de página não completa captura parcial |
| Coordenadas, quote, JSON pointer ou cursor | Locators e usos que citam a passagem; endereço válido não prova verdade |
| Finding, evidence/contrary, citação ou baseRevision | Revisões e documentos dependentes; manter conflito, razão e CAS |
| Dispatch, views ou inquiry | Completude e fechamento; card antigo fechado não responde pelo dispatch novo |

A cadeia inferida de uma fonte alcança sua identidade/bytes admitidos, locators pertinentes, findings/relations e documentos/citações dependentes. Isso não afirma que um mecanismo já marcou ou reconstruiu cada objeto. Fonte retirada, corrompida, parcial ou com binding inválido exige conservar a razão e delimitar quais conclusões perderam suporte. Preservação histórica não confere atualidade à versão antiga.

Falta de evento ou divergência de digest não permite fetch live substituto. Aquisição anterior incerta não permite readquisição invisível. Erro de publicação não prova ausência de efeito: o evento exato pode existir. Portanto, mudar retry/idempotência afeta causalidade, orçamento e autoridade, além da mensagem exibida.

**Contrato público de conhecimento.** Mudança de autoridade, validade ou lacunas deve propagar mesmo com prosa igual. Locator/citação válido não encerra revisão semântica; texto hostil não recebe permissão. Essa exigência da campanha não demonstra invalidação automática de research/Atlas já executada aqui.

## I5. Construção, navegação e independência

**Contrato público — plano e critérios de reúso.** A única dependência corrente deste L3 é `s1.subslice03.research-flow`. O L1 permanece contexto cumulativo e aprofundamento herdado pelo L2, sem segunda aresta direta para este L3. O manifesto anterior registra proveniência, sem autoridade semântica adicional.

O plano declara `research-flow` → `research-impact` → `research-maintenance` → `entry`, com chaves `s1.subslice03.*`. São dependências planejadas, sem afirmar que L4 exista, esteja aceito ou liberado. Mudança relevante no L2 requer decidir seu suporte e reavaliar este L3 antes de liberar descendentes; não saltar o predecessor porque um trecho de L1 está no contexto.

Research-impact não é predecessor de automation-impact: o plano liga este último à própria automation-flow. Link de consulta, caso público compartilhado ou futura entrada comum não criam aresta entre famílias. Mudança exclusiva de receita/indexação research não exige, por si, reconstruir a explicação de Actions. Essa independência é **do grafo declarado**, sem garantir isolamento universal do produto. Alteração de infraestrutura compartilhada exige identificar seus usos/dono, sem presumir inocuidade ou afetar todos por conveniência.

Inputs/receita inalterados e resultado válido devem permitir reúso conforme os critérios públicos. Receita de autoria alterada pode exigir recompor este L3 sem mudança de produto; edição apenas de navegação não invalida explicações independentes. Mudança pertinente de intenção/documentação também entra na análise, sem ser reduzida a diff de código.

O contrato público distingue mudança no resultado visível de alteração somente de recibo: bindings podem precisar de atualização sem nova interpretação; resultado válido consumido inalterado deve interromper reconstrução a jusante. Essa regra não equipara SHA-256 de transporte a versão de input Atlas, nem transforma receipt research incerto em detalhe de binding Atlas. Cada porta conserva seu contrato. Cache hit, zero chamadas e parada de propagação exigem prova real separada.

## I6. Alvos de reavaliação e registro de impacto

As linhas indicam alvos, não testes ou consumidores executados.

| Mudança | Conhecimento pertinente | Uso a reavaliar |
| --- | --- | --- |
| Pack/runtime/readiness | F1; I1 e relações com I2/I3 quando usadas | Seleção e interpretação de ready/failed/unsupported |
| Fonte/config/engine/consulta | F2–F3; I2 | Vazio/stale/dirty, localização e conclusões sobre referências |
| Probe/retenção | F4–F6; I3–I4 | Base do experimento e uso como fonte admitida |
| Binding/allowance/retry | F5–F7; I4 | Identidade, gasto, replay e efeitos incertos |
| Captura/locator/revisão/citação/inquiry | F6–F7; I4 | Sustentação, contrários e fechamento do dispatch correto |
| Receita/autoridade do conhecimento | F0/F8; I5 | Atualidade da cadeia aceita e preservação dos independentes |

O plano atribui **A-IMPACT** ao uso direto de research-impact junto de automation-impact e **R-FAILURE** a research L1/L2. Esses nomes localizam obrigações futuras; não são respostas esperadas, execuções ou PASS. Declarar outros usos afetados exige dependência demonstrável, sem inventar testes a partir de títulos.

Uma decisão verificável registra: identidade antes/depois do input/receita; condição alterada; artefatos/usos afetados e motivo; independentes preservados e sua base; incertezas; versões necessárias à reavaliação; provas obtidas. O conjunto é candidato até confronto com contratos/evidência. Fonte não observável exige indisponibilidade explícita e decisão dependente aberta, sem worklist vazia apresentada como sucesso.

## I7. Limites e abstenção

A autoridade estática vem do L2 aceito. As tabelas são inferências e exigências públicas, sem ensaio de manutenção. Nesta produção foram verificadas autoria, identidades dos inputs autorizados e integridade dos outputs. Não há prova nova de engine/provider, sandbox, memória, banco, publicação/leitura Atlas, consumidor ou reconstrução incremental.

F8 conserva o relato sobre o lock Modelina de 266.885 bytes e o limite de fonte de 256.000 bytes do S4 r3 citado. Ele não foi reaferido. A obrigação de transporte permanece separada; não autoriza retirar fonte necessária, chamar unavailable de absent ou aceitar o fechamento dependente.

Ausência de hits, cobertura declarada, marcador, evento isolado ou hash atual não bastam para completude. Preservar perguntas e donos nos limites externos; este L3 não apropria garantias não demonstradas. Entrega para revisão pelo mesmo par, sem self-PASS, L4, manutenção executada ou conclusão global S1. Tentativas físicas, tokens e custo não expostos: **UNKNOWN**.

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidências — s1.subslice03.research-impact

## E0. Predecessor e gate exatos

O único predecessor semântico corrente é `s1.subslice03.research-flow`, L2 v3, `need=flow`, em `producers/derived-research-flow/body.md`: **17.124 bytes**, SHA-256 **`f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7`**, blob Git **`1ceb2496a2185042e3eb564e80828bd85ac08f7f`**. O corpo foi relido integralmente nesta autoria.

A receita efetiva `payload/recipes/derived/research-impact.json`, 9.448 bytes, SHA-256 `68778f6144af73ee575678096eee818fb2a6ec2992572af4594dcf37af15fe7e`, fornece PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para esses mesmos bytes. Identifica as respostas originais pelos hashes `488cc1430936a338edb5075ce43e24a059f0667804fcecbd61ef3bd0a55eb7d7` e `3a8274022dc6bf53c8e95e00b9bd4e327885848a87dc9622ea73805cc2815f47`. Nenhum parecer integral foi aberto. O estado autoral histórico no texto do L2 não substitui esse gate posterior, e o gate não aprova automaticamente este L3.

O L1 e versões anteriores persistem como contexto cumulativo real, sem aresta semântica direta adicional. O manifesto L2, SHA-256 `a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8`, foi consumido como proveniência expressamente autorizada, não como receita original nem novo predecessor semântico.

## E1. Mapa das afirmações ao L2 aceito

Todas as referências F abaixo são seções da chave e do hash fixados em E0. A coluna de natureza distingue mecanismos relatados de inferência de impacto; nenhuma linha representa execução do produto.

| Trecho L3 | Afirmação ou consequência | Seção exata do predecessor | Natureza e limite |
| --- | --- | --- | --- |
| I0 | Base exata, leitura estática, diferença entre aceite e execução | F0. Entrada, base aceita e alcance; F8. Limites preservados e provas separadas | Autoridade e limite; gate posterior fornecido pela receita |
| I1, base e tabela | Research reutiliza interface backend; receita, dependências, runtime/floors/layout/launcher e readiness | F1. Da receita à prontidão local | Base estática; conjuntos de usos afetados são inferência delimitada |
| I1, compartilhamento | Mudança comum pode atingir caminhos backend/research; pack específico não invalida pares sem relação demonstrada | F1. Da receita à prontidão local | Inferência a partir de reúso e dependências; sem isolamento universal alegado |
| I1, estados/guards | Waiter versus aquisição, cooldown, prefetch, marker, executável; OpenAPI/Cassandra e ausência de qualificação | F1. Da receita à prontidão local | Mecanismos/limites preservados; consequência para decisão de uso é inferência |
| I2, identidade | Chave indexer/shard/path/blob/config/lock/extends, projetos, worktree e ausência de snapshot atômico | F2. Do planejamento ao índice persistido | Base estática; membership/uso a reavaliar não é worklist calculada |
| I2, query e store | Bases/freshness/bounds, rows stale, dirty overlay, existência versus saúde e retenção | F2. Do planejamento ao índice persistido; F3. Da consulta à evidência localizada | Base estática; propagação para consumidores é inferência |
| I2, vazio e build | Origens de warm vazio, source_unavailable e início condicionado de build; erro não prova novo disparo | F2. Do planejamento ao índice persistido; F3. Da consulta à evidência localizada | Preserva literalmente o caráter condicionado de RF-J2-F01, sem nova afirmação de execução |
| I2, conclusões negativas | Limites de overlay, opaqueSites, relações, Locate e semantic absent | F3. Da consulta à evidência localizada | Impacto inferido sobre conclusões de ausência; sem cobertura total ou embeddings |
| I3 | Snapshot/runner/verdict/caps e fronteiras externas; resultado não cobra/captura/admite | F4. Do probe ao resultado que ainda precisa ser retido; F5. Identidade nativa e orçamento da investigação | Base estática; usos a reavaliar são inferência, guard preservado |
| I4, binding/allowance | Identidade nativa, operação, charge, replay/conflito, reserva e publicação incerta | F5. Identidade nativa e orçamento da investigação | Base estática; alcance nos registros dependentes é inferência |
| I4, custódia/locators | Bytes/digest/admissão, representação/parcialidade/derivação, paginação e validação de locator | F6. Da aquisição à fonte admitida e ao locator | Base estática; cadeia de suporte não é invalidação automática observada |
| I4, revisões/inquiry | Evidence/contrary/citações, CAS, evento exato, dispatch e fechamento | F7. Registros, publicação e fechamento de inquiry | Base estática; reavaliação dos dependentes é inferência |
| I4–I5, recibos | Cobrança, aquisição, admissão e publicação distintas; erro não prova ausência de efeito | F5–F7, títulos acima | Não confunde receipt research com binding de transporte Atlas |
| I5, única aresta | O contexto L1 e o manifesto anterior não criam outro predecessor L3 | F0. Entrada, base aceita e alcance; receita L3 e plano público | Regra de construção da tarefa; detalhes do grafo vêm do plano, não de artefatos irmãos |
| I6 | Relação entre tipo de mudança, explicação pertinente e usos a reavaliar | F1–F8, conforme cada linha da tabela do corpo | Síntese inferida; nenhum consumidor/caso foi executado |
| I7 | Limites externos, Modelina/S4 r3 informado, indisponível versus ausente e ausência de provas operacionais | F8. Limites preservados e provas separadas | Limites herdados; relato de transporte não foi reaferido |

## E2. Bases públicas que não são predecessores semânticos

O plano `payload/artifact-plan.json`, SHA-256 `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad`, sustenta em I5 o grafo declarado research-flow → research-impact → research-maintenance → entry e a separação da cadeia automation-flow → automation-impact. Sustenta em I6 os vínculos públicos A-IMPACT e R-FAILURE. Nenhum corpo irmão, caso reservado ou resposta esperada foi consultado. As referências a níveis posteriores descrevem o plano, sem produzi-los ou liberá-los.

O papel L3 vem de `payload/recipes/derived-contract.json`, SHA-256 `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588`: relações, impacto e conhecimento/consumidores a reavaliar, com independência entre famílias e navegação distinta de build.

`payload/recipes/derived-public-criteria.json`, SHA-256 `1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e`, sustenta as obrigações de I4–I6: GO-A4/5, GO-I3/4/5, AC-05/06 e CC-4. Em particular: autoridade/validade/gaps propagam mesmo com prosa igual; receipt-only pode atualizar bindings sem nova interpretação; resultado válido consumido inalterado interrompe reconstrução; receita, intenção e adição/remoção de fonte entram no impacto. O corpo identifica isso como contrato público, sem declarar que o runtime já passou nesses ensaios.

A distinção entre SHA-256 de transporte e versão real de input Atlas vem de `inputs/references/transport.md`, SHA-256 `02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c`. Essas autoridades públicas compõem a receita e os critérios; não acrescentam uma segunda aresta semântica de produto.

## E3. Proveniência cumulativa e execução efetiva

Foram lidos/conferidos os 15 arquivos enumerados e as três unidades adicionais permitidas: receita L3, request e dispatch original. Tamanhos, SHA-256 e blobs Git dos 15 pins coincidiram. As autoridades públicas já haviam sido lidas integralmente neste mesmo contexto; o L2 aceito foi relido integralmente. O manifesto anterior foi analisado integralmente como JSON de proveniência. Nenhum irmão não enumerado foi reaberto nesta etapa.

O manifesto novo conserva **58 unidades integrais únicas**, **677.138 bytes de contexto**: 45 do manifesto anterior, dez outputs L2 v3 já efetivamente lidos nas verificações daquela etapa e três controles L3 novos. Dessas unidades, **18 foram lidas/verificadas nesta tarefa**; **40 foram conservadas sem reabertura**, com identidades herdadas e esse limite explícito. Bytes de contexto não são tokens/custo. Os aliases históricos e caminhos originais permanecem distintos; nenhum output deste L3 é auto-input.

O request permanece SHA-256 `fe6b14e0f21ae1f13b15255b79ae1601cce467df536d58464d74ab18046e287b`. O dispatch original tem 1.546 bytes e SHA-256 `28dcc55a79e9d1372cee574c7bdb7b5f7d7154f3e29c98af1f8b52ca9b24565e`. Os controles posteriores de continuação/status foram conservados literalmente no manifesto como contexto visível, sem criar parecer ou novo gate e sem substituir o dispatch original.

Dois rascunhos tiveram a gravação barrada por checagem de tamanho (16.999 e 14.013 bytes); nenhum body foi escrito por essas tentativas. O body final foi gravado uma vez, com **13.972 bytes** e oito cabeçalhos depth2. Isso é verificação de autoria, não teste de produto ou falha de capacidade do host. Não houve reinício ou produtor duplicado.

## E4. Escopo de revisão e limites

O conteúdo contribui para GO-A1/2/3/4/5, GO-I1/2/7/8, QS-1/2/3/5/6, CC-1/3/4/7 e AC-01 local. O mapa permite julgar suporte e utilidade; não é uma matriz de PASS. Reúso, propagação, independência operacional e consumidores exigem suas provas próprias. Não há self-PASS nem aceite global.

**NOT_RUN:** produto, testes/typecheck/guards, rede/provider, runtime/binding/importação/publicação/leitura Atlas, consumidores e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. Somente o L3 solicitado foi produzido; nenhum L4 foi liberado ou redigido.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T05:07:54.118636+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.research-impact",
    "layer": 3,
    "need": "operational",
    "required_build_predecessors": [
      "s1.subslice03.research-flow"
    ],
    "purpose": "Impacto de mudanças em receitas, índice, custódia e autoridade"
  },
  "predecessors": [
    {
      "key": "s1.subslice03.research-flow",
      "local_body_path": "producers/derived-research-flow/body.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-research-flow/body.md",
      "body_bytes": 17124,
      "body_sha256": "f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7",
      "body_git_blob_sha": "1ceb2496a2185042e3eb564e80828bd85ac08f7f",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7",
          "original_response_sha256": "488cc1430936a338edb5075ce43e24a059f0667804fcecbd61ef3bd0a55eb7d7"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7",
          "original_response_sha256": "3a8274022dc6bf53c8e95e00b9bd4e327885848a87dc9622ea73805cc2815f47"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Continue the same already oracle-blind family author after the predecessor gate. No new agent per layer; preserve cumulative input context.",
  "retained_family_context": {
    "prior_manifest": "producers/derived-research-flow/production-manifest.json",
    "manifest_sha256": "a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8",
    "rule": "Continue the same family author. List every retained prior context input in the new manifest as well as newly read files. Do not silently drop the earlier source/recipe/request context. The principal inspected this manifest mechanically; it is not a new semantic source."
  },
  "union_navigation_proposal_gate": null,
  "exclusive_output_directory": "producers/derived-research-impact",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-research-impact",
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
      "local_path": "producers/derived-research-flow/body.md",
      "bytes": 17124,
      "sha256": "f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7",
      "git_blob_sha": "1ceb2496a2185042e3eb564e80828bd85ac08f7f",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.subslice03.research-flow"
    },
    {
      "local_path": "producers/derived-research-flow/production-manifest.json",
      "bytes": 54847,
      "sha256": "a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8",
      "git_blob_sha": "1d08a666508f8a94c41708b19e9d4ecd74547df0",
      "whole_file_identity": true,
      "role": "Prior family output manifest now explicitly authorized as a provenance input for this next layer; not an original recipe or a new semantic predecessor."
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
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | Public authority/plan/contract/criteria already fully read in family; identity rechecked for L3 |
| producers/research/revisions/v4/history/body.md | 63841 | f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f | Retained actual family input; historical context for this L3 |
| payload/recipes/derived/research-flow.json | 8423 | 543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/request.txt | 850 | 351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/dispatch-message.txt | 1511 | 2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/history/v1/body.md | 16980 | a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/history/v1/evidence.md | 11305 | 8e2b11c446ef73d166c98f7d852d5ca674a0a056779351e393a2d8b832cbf365 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/history/v1/production-manifest.json | 19363 | 363c7e06f9ec4f0ea2165c81204c238f2972d702875b2d2d445607c0d2e66fcf | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/history/v1/response.md | 2472 | 4d10e4cbaacffd86da6c9c32091576608e3a0937a6f5ef5489c7f142778540ac | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/request.txt | 503 | 4c2c7a3e6262ab721b25b5aef283d6dfbbb9edacb6cd20da73e5212f55a9840a | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/recipe.json | 3279 | 007fa924ee039cce045c481143b71fff2dc3b6f6776b9cc77edfff1b386ca8b9 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/public-finding.md | 1080 | 8230c3ca27cd3416c801ff0080dc102a41b0fb16ee6ecdf94aae0c8612f33bf7 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/dispatch-message.txt | 1669 | 9de6643262b0eef5014515544cc97d0d3ed334a70598c3d86b6f5a89bacfe15d | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/prior-output-preservation.json | 2036 | af0552a04cae4c5e2c1eb6f32b00e0a372ed9028542298808debeae4b8d5b00d | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/apply.py | 19851 | 3404af9b477c4d07b170d03f7068d4152b2bd4cb76c607cf1a0f24320bd67bf8 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/procedure-freeze.json | 15402 | b2b63dbbe1ac9cfdeb619ba074d2e8b8abc809b00bf13a72aea7f6235e746356 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/delta.json | 4551 | ae2265221d845124e5632ab460e4278c0d49c987a16d38739ddd5fa07f5de268 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/review-supplement.md | 3793 | c2a7d80a4e5bfb7c03a569c7106630d5f6d7cb14225e0450826f9eaa1b1dd727 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/input-manifest-extension.json | 17986 | 2cc6415416ae6f5a59ffbc908bae284d477671ab54ad1aca55033c7067eff463 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/producer-verification.json | 2298 | d8d249ca6064da8f00ac4cd10e5d655498e94120d4d142ddf09bed9a7a6eb709 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v2/response.md | 2016 | 553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/history/body.md | 17113 | f6dce8d080ff5bdd3a5409bd16b846c176c8270135eb51a6cd0329413e3d0994 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/history/evidence.md | 11457 | b7d51d3bab6f9d8538d6b6362953647eedfbc5fad905c69b5d3fd38b0ea75022 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/history/production-manifest.json | 34692 | 32c07a3198dfd1bcada8d932e2a61d6dc09c129f6a53fd0c42467611cc7a9831 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/history/response.md | 2016 | 553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90 | Retained actual family input; historical context for this L3 |
| producers/research/body.md | 64106 | c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/public-findings.md | 1210 | e1f6536c5f2ca30f7ddb215fe5f0c888d1b7da01c29c437ee2cdb099077be1a7 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/recipe.json | 5536 | 6b77e699b909ae075954e1d0fb00cd205a4ada0f4cd5ed23eff6fdd350630eae | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/request.txt | 395 | 8640ec3a0ce573741ca1ee42c582960f2d776b28af950757329ee199d090c993 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/dispatch-message.txt | 1273 | 2319e6ae0efd79115f68d417dba4e6297bde4546d33f540840a1995fc6eaddaa | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/prior-output-preservation.json | 2545 | ec68bad4886debb07d01a4b70695d7a1e3c3cde0b98ff524919a02e517ee37d5 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/apply.py | 20110 | fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435 | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/revisions/v3/procedure-freeze.json | 38389 | ab1c664955412b66e61c88a6213974944ec50ff4d9cadda593c5a3004db8ad4e | Retained actual family input; historical context for this L3 |
| producers/derived-research-flow/body.md | 17124 | f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7 | Only current accepted semantic build predecessor, research-flow L2 v3 |
| producers/derived-research-flow/evidence.md | 12878 | 6c6d9c59bf75c0636598315fad3d850426f9d473cc7cbd0ba2f385165992a614 | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/response.md | 2144 | 1adbff35cf2884d6dc2a3fff4ae2703227cea6f045503a20f58c78b030f77696 | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/delta.json | 15355 | ed857fc8035e8995ff52247170eae49e416a47ae1812760328aea6587065560f | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/delta.patch | 11130 | 33abda8cf8387856ebe28a818cf1f17b20434cd705f10322f0b997d92e782e3b | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/review-supplement.md | 11742 | 2ab915b6becb96e0523fa59bad64ebd4ac1f73d3bc27c256cd371984a06bcd47 | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/input-manifest-extension.json | 34417 | 4db94d8d4a5a028d742b4cd6f82d81c175ca3ae2194f42d3922f368e85acd26f | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/producer-verification.json | 2909 | 751047a4ae095416c488ba28c83ca85cbfed37b82b47e460fde62d2e73909b39 | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/revisions/v3/response.md | 2144 | 1adbff35cf2884d6dc2a3fff4ae2703227cea6f045503a20f58c78b030f77696 | Prior L2 v3 output already read during actual earlier byte/hash verification; retained context |
| producers/derived-research-flow/production-manifest.json | 54847 | a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8 | Explicitly enumerated prior manifest for cumulative provenance only |
| payload/recipes/derived/research-impact.json | 9448 | 68778f6144af73ee575678096eee818fb2a6ec2992572af4594dcf37af15fe7e | Effective frozen L3 task recipe |
| producers/derived-research-impact/request.txt | 863 | fe6b14e0f21ae1f13b15255b79ae1601cce467df536d58464d74ab18046e287b | Frozen L3 request, preserved unchanged |
| producers/derived-research-impact/dispatch-message.txt | 1546 | 28dcc55a79e9d1372cee574c7bdb7b5f7d7154f3e29c98af1f8b52ca9b24565e | Exact visible original L3 dispatch |

Manifesto original posterior: producers/derived-research-impact/production-manifest.json; 82077 bytes; SHA256 abdedb32a0c69cb170c3484d1e24cc5f7ac71fb9c89630b3229b6dee8a428b95. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.
