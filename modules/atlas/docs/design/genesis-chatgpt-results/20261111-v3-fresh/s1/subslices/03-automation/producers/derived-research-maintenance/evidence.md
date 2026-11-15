# Evidências — s1.subslice03.research-maintenance

## E0. Autoridade semântica e gate

O único predecessor semântico corrente é **`s1.subslice03.research-impact`, L3 v1**, `need=operational`, em `producers/derived-research-impact/body.md`: **13.972 bytes**, SHA-256 **`4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f`**, blob Git **`f85d2a546afb51d148c4f748d5f49c7a9c6727f8`**. Foi relido integralmente nesta tarefa. As referências I0–I7 do guia apontam a suas seções exatas.

A receita `payload/recipes/derived/research-maintenance.json`, **9.481 bytes**, SHA-256 `01cdad4971a1098115e9533d034b2d9af45836bfa37fbbb15d85144be389aa09`, fornece os PASS completos de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para esses mesmos bytes. Os hashes das respostas originais informados são `d6a6cd73c1e6beb595f152d1ee3699b4980f7805910e7988f4bb5c225402fbb5` e `6845fb21de1489d7be922e1e8aacec043bbba1e3a2f00d1682a65fa896f56857`. Nenhum parecer integral foi aberto. O estado autoral histórico do L3 não substitui esse gate posterior; o gate não é PASS do L4 nem prova operacional.

L1/L2 e produções anteriores permanecem contexto real cumulativo, sem novas leituras ou arestas semânticas somente pela retenção. O manifesto L3, **82.077 bytes**, SHA-256 `abdedb32a0c69cb170c3484d1e24cc5f7ac71fb9c89630b3229b6dee8a428b95`, foi lido como proveniência expressamente autorizada. É registro posterior, não receita anterior ou outro predecessor semântico.

## E1. Derivação dos procedimentos do L3 aceito

Todas as linhas abaixo usam a chave e o hash fixados em E0. Uma ação prescrita é orientação derivada para uma tarefa futura; não significa que o produtor executou a verificação ou observou seu resultado.

| Trecho L4 | Contrato ou decisão operacional | Seções exatas do L3 | Natureza e limite |
| --- | --- | --- | --- |
| M0 | Necessidade, versão exata, distinção de autoria e operação | I0. Decidir o impacto com uma base exata; I7. Limites e abstenção | Autoridade/limite; uso das portas também depende do protocolo público em E2 |
| M1 | Fixar decisão, identidade, sinal, afetados/independentes e evidência faltante | I0; I3. Probes e a passagem para evidência retida; I4. Autoridade muda mesmo com texto igual; I6. Alvos de reavaliação e registro de impacto | Procedimento derivado dos campos/contratos; não é trace de triagem executada |
| M2, receita | Pack versus mecanismo compartilhado, runtime/dependências, target/floor/layout/launcher e readiness | I1. Receita local ou mecanismo compartilhado | Base estática com aplicação diagnóstica derivada; não qualifica a ferramenta |
| M2, estados | Waiter/aquisição, prefetch individual, marcador/executável, guard OpenAPI/overlay Cassandra | I1. Receita local ou mecanismo compartilhado | Orientação preserva as diferenças de autoridade; nenhum download/reparo efetuado |
| M2, reparo e alcance | Evitar remoção indiscriminada, atribuir candidato/prova ao dono e preservar pares independentes | I1; I5. Construção, navegação e independência | Orientação de manutenção inferida; não afirma política automática de reparo |
| M3, vazio/indisponibilidade | Origens de vazio, source_unavailable, início condicionado de build | I2. Inputs do shard e conteúdo servido | Mantém extrator/necessidade/ausência de build em curso e não deduz disparo de building/unavailable |
| M3, stale/dirty/ausência | Basis/rows, overlay limitado, cobertura/opaqueSites, fallback e semantic absent | I2. Inputs do shard e conteúdo servido | Critério para limitar conclusões; sem cobertura ou reconstrução certificada |
| M3, conjunto de rebuild/store | Inputs de shard, partição, HEAD/worktree, existência versus saúde | I2. Inputs do shard e conteúdo servido | Delimitação candidata, sem worklist calculada, rebuild ou verificação de banco |
| M4, probe | Snapshot/runner/verdict/limites; retorno não cobra/captura/admite | I3. Probes e a passagem para evidência retida | Procedimento de conferência de vínculo; não executa probe nem impõe enforcement externo |
| M4, custódia/locator | Manifest/receipt/evento/binding/digest, parcialidade, representação, metadata e locator | I4. Autoridade muda mesmo com texto igual | Aplicação diagnóstica; arquivo e endereço não ganham autoridade ou verdade por si |
| M4, orçamento/retry | Operação/payload, replay/conflito, reserva e efeito incerto | I4. Autoridade muda mesmo com texto igual | Orientação de reconciliação; nenhuma allowance alterada nem ação live repetida |
| M4, revisão/inquiry | Evidence/contrary, baseRevision/CAS, dispatch e fechamento | I4. Autoridade muda mesmo com texto igual | Preserva revisão e identidade; não forja publicação/fechamento |
| M5, congelamento/impacto | Inputs antes/depois, contrato, afetados/independentes e incógnitas | I1–I4; I6. Alvos de reavaliação e registro de impacto | Protocolo proposto com base nas relações estáticas; não é manutenção executada |
| M5, cadeia/reúso | Predecessores, navegação, receita/intenção, autoridade/gaps, receipt-only e parada de propagação | I5. Construção, navegação e independência | Exigência pública explicada no L3; comportamento real exige prova separada |
| M5, testes e gerados | Gates atribuídos, execução CI, typecheck/guard e geração oficial | I6–I7 para necessidade de prova; AGENTS/COMMON para procedimento normativo | Expectativas e regras, nenhuma execução de produto nesta autoria |
| M6, responsáveis | Distinção pack/comum/índice/research e limites de sandbox/memória/DB/Atlas | I1; I3–I7 | Encaminhamento por papel, sem inventar pessoa, serviço disponível ou autoridade externa |
| M6, transporte | Modelina/S4 r3 informado, fonte preservada e indisponibilidade diferente de ausência | I7. Limites e abstenção | Relato herdado, não diagnóstico de runtime reaferido |
| M7 | Estados separados, pacote de entrega, casos públicos e abstenção | I0; I4–I7 | Condições para relatar trabalho futuro, sem encerramento global ou autoaceite |

## E2. Autoridades públicas aplicadas

`payload/recipes/derived-contract.json`, SHA-256 `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588`, define o papel L4: ownership, manutenção/diagnóstico, verificação e encaminhamento. A receita específica libera somente research-maintenance.

`payload/artifact-plan.json`, SHA-256 `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad`, fixa o predecessor research-impact e o gate separado da entrada local. Sua navegação e os casos A-IMPACT/R-FAILURE não são arestas novas ou resultados executados.

`inputs/references/principles.md` e `inputs/references/judging.md` sustentam o consumo progressivo, a separação de papéis e as portas `ownership.index`/`ownership.read`. `inputs/references/transport.md` distingue conhecimento nativo, binding, publicação e versões de inputs Atlas. Seus hashes integrais constam do manifesto; nenhum documento referenciado por esses arquivos foi aberto adicionalmente.

`inputs/AGENTS.md`, SHA-256 `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`, e `inputs/COMMON.md`, SHA-256 `ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7`, sustentam testes de produto via CI, typecheck/guard aplicáveis, disciplina de gerados, ownership e encaminhamento fora do escopo. A menção a `bun run test:ci` é instrução futura; nenhum comando de produto foi executado.

Os critérios públicos congelados em `payload/recipes/derived-public-criteria.json`, SHA-256 `1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e`, sustentam as condições de mudança/reúso/recusa de stale, prova por candidato e aceites separados. O guia contribui para GO-A1/2/3/4/5, GO-I1/2/7/8, QS-1/2/3/4/5/6, CC-1/3/4/7 e AC-01 local. Isso é mapeamento de contribuição, não decisão PASS.

## E3. Inputs e preservação cumulativa

São **65 unidades integrais únicas**, **797.294 bytes de contexto**: 58 unidades do manifesto anterior, quatro outputs L3 realmente lidos durante sua verificação e três controles L4 novos. **18 arquivos autorizados foram lidos/conferidos nesta tarefa**, totalizando **210.668 bytes**; **47 unidades foram retidas sem reabertura**. Essa diferença está explícita em cada item. Nenhuma unidade foi dividida para reduzir contagens; chunks históricos de exibição continuam uma identidade de arquivo integral.

Os 15 pins enumerados coincidiram em tamanho, SHA-256 e blob Git. Autoridades públicas já integralmente lidas neste contexto foram reutilizadas; o L3 aceito foi relido integralmente e seu manifesto foi analisado como JSON completo de proveniência. Não foram reabertos irmãos não enumerados. Inputs retidos não viraram novas leituras ou predecessores.

O pedido L4 permanece **878 bytes**, SHA-256 `aaa18954282dd9b9b7b3bac4e3db9ed8076e0311dd07f231219e205db0598471`. O dispatch literal tem **1.720 bytes**, SHA-256 `c7691d761d2e0221b4cd609a69b3ba14ec9747e03220b0e87eac45d9d4d4b2a2`, sem newline adicional. Controles visíveis históricos foram retidos pelo manifesto anterior; o FINAL L2 v2 ausente não foi reconstruído como verbatim. Response original e confirmação posterior continuam distintos.

## E4. Verificação efetiva e limites

O corpo final contém **13.958 bytes UTF-8** e oito seções depth2. Foi condensado em memória antes da primeira gravação: os tamanhos intermediários de 16.240, 14.421 e 14.043 bytes não geraram body em disco; uma checagem de tamanho de 14.043 abortou antes da escrita. Isso é procedimento de autoria, não teste de produto nem impedimento do host. O body final foi escrito uma vez.

A verificação determinística cobre identidades autorizadas, request/dispatch, arquivos regulares UTF-8, JSON, hashes dos outputs e ausência de auto-inputs. Não é julgamento semântico, validação do runtime ou execução das rotinas propostas. O manifesto é posterior à produção e identifica as receitas efetivamente congeladas; não se apresenta como receita anterior.

**NOT_RUN:** aquisição, reparo, probes, produto/testes/typecheck/guards, rede/provider, Atlas/binding/importação/publicação/leitura, consumidores e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. Somente o L4 research-maintenance foi produzido; a entrada local permanece fora da autorização e não foi redigida. Sem self-PASS, qualificação externa nova ou conclusão S1/global.
