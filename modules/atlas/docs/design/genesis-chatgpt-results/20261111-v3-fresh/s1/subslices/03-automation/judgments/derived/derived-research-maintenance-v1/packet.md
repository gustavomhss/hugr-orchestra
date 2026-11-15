# s1.subslice03.research-maintenance — revisão semântica L4 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.research-maintenance, 13958 bytes, SHA256 b57970febca6ecd87e6df64586e8a1bf557e112a0761ddc3afc58a92f4fc8025, Git blob 9fd888ebd44a07eba2724423d8cfb5e8e89a9dd1. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 65 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-research-maintenance-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Research: manutenção, diagnóstico e verificação

**Chave:** `s1.subslice03.research-maintenance` · **L4** · **need:** `maintenance` · **escopo:** S1-03 / `orchestra.s1`.

## M0. Quando usar e como consultar

Use este guia para diagnosticar toolkits, índice, probes e evidências e preparar mudanças limitadas. Seu único predecessor semântico corrente é **`s1.subslice03.research-impact`, L3 v1**, **13.972 bytes**, SHA-256 **`4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f`**. O gate fornecido aceita esse L3, sem aprovar este L4 ou demonstrar manutenção executada.

As referências I0–I7 são do predecessor. Os procedimentos são **orientação derivada**, sem verificações operacionais executadas nesta autoria.

Na consulta Atlas autorizada, comece por `ownership.index` e leia M1/seção pertinente por `ownership.read`, dentro dos limites da tarefa. Aprofunde no L3 a relação que decide o caso; seus vínculos orientam o L2. São portas do protocolo público, sem disponibilidade presumida aqui. Falha de acesso, versão incompatível ou suporte faltante exige registrar a limitação, sem usar fonte arbitrária ou histórico como atual.

## M1. Triagem antes de alterar estado

1. **Nomeie a decisão:** ferramenta utilizável, resultado de consulta atual, experimento reproduzível, fonte admitida ou documento/dispatch publicado.
2. **Fixe a identidade:** projeto/task/Session e operação pertinentes; versão do artefato consultado; receita/candidato e observação que motivou o caso. Preserve o retorno original, inclusive razão, cobertura e incerteza.
3. **Classifique o sinal:** estado de aquisição, base de índice, resultado de probe, bytes em custódia, evento de admissão, revisão de record ou fechamento de inquiry. Encaminhe à seção correspondente.
4. **Delimite o efeito:** use I6 para registrar afetados, independentes e evidência faltante. Ausência de observação não é conjunto afetado vazio.

Registre os identificadores pertinentes: pack/receita/estado; shard/basis/freshness; probe/snapshot/runner/verdict; ou operação/dispatch/ref/revisão/digest/receipt. Preserve razão, cobertura e limites junto do resultado.

Reúna somente o necessário para a pergunta. Estado ready, arquivo existente, exit de processo, cursor no fim ou card fechado não substituem a identidade e o contrato que tornam a evidência utilizável. [I0, I3–I4, I6]

## M2. Diagnosticar aquisição e prontidão

Comece pela receita e razão do estado. Research reutiliza backend apesar da raiz própria; distinga falha de pack e do mecanismo comum. [I1]

| Sinal | Verificação que decide | Ação sustentada e condição de parada |
| --- | --- | --- |
| Pack listado, mas não utilizável | Conferir versão/lock/wheels, dependências/runtime, target/floor, layout e launcher da receita selecionada | Identificar qual condição de prontidão falta; listagem não qualifica instalação ou uso |
| Waiter desistiu e estado permanece fetching | Distinguir término da espera do cliente e vida da aquisição compartilhada | Preservar estado/razão; não iniciar aquisição duplicada apenas pela desistência do waiter |
| `.complete` presente, executável ausente | Confrontar marcador, executável e shim esperados | Registrar inconsistência; não declarar ready nem presumir reparação automática; encaminhar a correção do cache/receita ao dono |
| Prefetch retornou | Conferir o estado individual da engine e suas dependências | Prosseguir somente pela conclusão específica sustentada; retorno coletivo não é sucesso de todas |
| Versão igual, disponibilidade diferente | Comparar floor/target, runtime, dependências e verificação de executável/shim | Incluir o input alterado no impacto; não reduzir a identidade ao número da engine |
| Uso OpenAPI ou Cassandra | Confirmar o guard de projeto ou overlay fixado pertinente, seguindo o aprofundamento de I1 | Aquisição do pacote não demonstra aplicação do guard nem compatibilidade externa |

Não apagar cache/marcador/histórico como atalho. Identifique o reparo autorizado, candidato e prova necessária. Encaminhe ao dono do pack ou do mecanismo comum; preserve pares sem dependência do input alterado.

## M3. Diagnosticar vazio, stale e dirty no índice

Conserve a resposta inteira relevante, com basis, cobertura, freshness e bounds. Compare a pergunta feita com a base efetivamente servida antes de solicitar reconstrução ou concluir ausência de uso. [I2]

| Sinal | Como discriminar | Resultado permitido |
| --- | --- | --- |
| Warm/plano sem trabalho | Distinguir adapter default, falha de plan, filtro de prewarm e plano realmente vazio | Registrar a origem; vazio sozinho não demonstra ausência de código ou índice concluído |
| `source_unavailable` | Preservar falha de observação e identificar o input não observado | Manter decisão dependente aberta; não converter em remoção nem worklist vazia |
| building/unavailable sem shard aberto | Verificar necessidade de construção, extrator e ausência de build em curso | Não afirmar que a consulta disparou novo build apenas pelo erro/estado |
| Resposta stale | Identificar base/rows retidos e texto usado para a conclusão | Rotular a limitação; a base atual não torna rows antigos atuais |
| Arquivo dirty com símbolos atuais | Verificar se a pergunta depende de imports/references/callers/callees/map ou de outro caminho do overlay | Não estender atualização de símbolos a todas as relações |
| Nenhum hit ou opaqueSites=0 | Conferir seleção, linguagens/limites, cobertura e tipo de relação buscado | Restringir a conclusão à busca realizada; não provar inexistência de uso ou cobertura total |
| Banco existe, mas leitura falha | Distinguir existência do arquivo, saúde do índice e escolha/retenção do shard | Registrar falha precisa; presença física não autoriza resultado limpo |

Use os inputs de shard de I2 para justificar o conjunto candidato à reconstrução; evite invalidar tudo ou limitar-se ao arquivo do diff. HEAD não é toda a identidade e worktree não é snapshot atômico.

Conserve base, descartes e limites dos ranges. Fallback não elimina lacunas; `semantic: absent` não promete embeddings. Sem a cobertura exigida, abstenha-se da conclusão negativa.

## M4. Diagnosticar probes, custódia e publicação incerta

Trate separadamente resultado de experimento, cobrança, captura, admissão e publicação. A tabela orienta leitura/reconciliação pela porta existente, sem autorizar uma nova ação live ou inventar eventos. [I3–I4]

| Situação | Procedimento de diagnóstico | Não concluir nem fazer automaticamente |
| --- | --- | --- |
| Probe devolveu resultado | Conferir snapshot/runner/verdict/limites; identificar operação, cobrança e retenção/admissão associadas | Resultado ou URI isolados não são SourceAdmitted; não cobrar de novo sem verificar replay |
| Fonte tem arquivo, mas leitura/admissão falha | Confrontar manifest, receipt, evento, binding e digest pertinentes | Usar arquivo órfão como fonte ou substituir por fetch live |
| Captura parcial, derivada ou com representação diferente | Preservar complete, representation, bytes e metadata de derivação; escolher locator compatível | Tornar parcial completa pelo fim da paginação ou recodificar apagando a origem |
| Quote/range/pointer inválido ou ambíguo | Conservar a recusa e confrontar coordenada/representação da revisão correta | Escolher ocorrência arbitrária ou tomar endereço válido como prova de verdade |
| Binding/operação diverge | Conferir projeto/task/Session/location e payload da operação exata | Reutilizar autoridade de outra identidade ou ocultar tentativa nova como replay |
| Erro depois de captura/publicação | Consultar a identidade e o evento exatos pela porta apropriada; registrar o que foi ou não observado | Deduzir ausência de efeito ou refazer aquisição incerta silenciosamente |
| Revisão conflita ou finding mudou | Conservar baseRevision, razão, evidence/contrary e vínculo ao documento | Sobrescrever revisão, apagar contrários ou atribuir suporte antigo à conclusão nova |
| Inquiry parece fechada | Conferir dispatch pertinente e evidência de fechamento | Fazer card antigo responder por um dispatch novo |

Reserva não devolve saldo; incerteza não vira gasto zero. Sem reconciliação sustentada, encaminhe identidade e pergunta pendente; não amplie allowance nem forje replay.

Snapshot pode referenciar dependências externas; timeout não cobre todo preparo/fila; coordenação de host é local. Cap não comprova enforcement. `blocked_by_repo_guard` exige parar, sem alternativa local disfarçada.

## M5. Preparar uma mudança e sua verificação

Procedimento futuro dentro da autoridade atribuída; nenhuma etapa de produto/Atlas foi executada nesta autoria. [I1–I6; contratos públicos]

1. **Congele o caso:** comportamento/condição antes e depois, fonte/receita/candidato exatos, pergunta que a mudança resolve e desconhecidos. Preserve o estado anterior e os recibos; não apresente intenção como observação.
2. **Delimite impacto:** registre afetados e independentes com os motivos de I6. Inclua adição/remoção, config/lock, intenção/documentação e receita de autoria pertinentes. Distinga pack local de runtime/aquisição compartilhados.
3. **Atribua a alteração:** faça a correção somente no escopo do dono. Fora da autoridade local, entregue proposta/patch delimitado e evidência ao dono; não edite uma fronteira alheia para fabricar a garantia desejada. Gerados seguem o gerador oficial e seu responsável.
4. **Atualize conhecimento na ordem correta:** reveja o predecessor afetado e só libere seu dependente após o gate exigido. Este L4 depende de research-impact; a navegação a L2/L1 não elimina a cadeia. Preserve versões anteriores com rótulo histórico.
5. **Selecione provas pelo risco:** use os contratos existentes pertinentes e os gates do repositório. Testes de produto seguem GitHub Actions por `bun run test:ci`; typecheck pertence ao pacote e o guard aplicável segue AGENTS. Não executar localmente o teste proibido, duplicar implementação em fixture ou registrar comando não executado como verde.
6. **Verifique o efeito e os independentes:** confronte o conjunto esperado com o observado, a validade das bases/locators e os usos afetados. Se a obrigação envolver Atlas, use o candidato/release e as portas reais compatíveis, com recibos próprios. Revalide consumidores exigidos sem lhes fornecer oracle ou fonte proibida.

Resultado/prosa iguais não bastam se autoridade, validade ou lacunas mudaram. Em contraste, input/receita inalterados e resultado ainda válido devem permitir reúso; links de navegação não criam reconstrução. Alteração somente de recibo de transporte pode demandar atualização de bindings sem nova interpretação conforme o contrato público, mas não transforma publicação research incerta em detalhe descartável. Cache hit, parada de propagação e preservação de independentes precisam de observação real.

Falha de atualização após mudança de input não autoriza servir a versão histórica como atual. Se impacto ou leitura válida não puderem ser demonstrados, mantenha a parte dependente aberta; preserve trabalho independente com vínculo válido.

## M6. Encaminhar com evidência suficiente

Encaminhe identidade/candidato, retorno original, hipótese, verificações/afetados, pergunta pendente e condição de desbloqueio. Distinga proposta, NOT_RUN e resultado; não invente recibo ou responsável. [I1, I3–I7]

| Fronteira | Destino por responsabilidade | Evidência que evita encaminhamento vago |
| --- | --- | --- |
| Receita, versão/lock, layout ou launcher do pack | Dono do pack/receita | Input antes/depois e condição de aquisição/readiness incompatível |
| Aquisição/readiness reutilizados por backend/research | Dono do mecanismo comum no Core | Caminhos afetados, dependências, estado/razão e distinção waiter/aquisição |
| Índice, extração, consulta ou store | Dono do caminho de índice/research | Shard/basis, inputs alterados, freshness/dirty/cobertura e limite da conclusão |
| Binding, allowance, custódia, records ou inquiry | Dono da porta research pertinente | Operação/dispatch/ref/revisão, evento/receipt e divergência precisa |
| Sandbox, processo, memória ou banco externos | Dono da dependência correspondente | Garantia externa necessária e observação que não a demonstra |
| Binding/transporte/publicação Atlas | Principal e dono do runtime Atlas/S4 pelo contrato da campanha | Release/candidato, operação/erro e fonte/dependência preservada |

O relato Modelina (266.885 bytes versus limite S4 r3 de 256.000) não foi reaferido. Preserve a fonte e encaminhe o bloqueio; não remova evidência nem converta unavailable em absent. Composição e entrada local mantêm gates próprios.

## M7. Encerrar o diagnóstico sem antecipar sucesso

Encerre o diagnóstico com causa sustentada ou lacuna explícita. Reporte manutenção executada somente com candidato/identidades, efeito antes/depois e verificações observadas. Aceite semântico, binding, publicação, leitura, consumidor e manutenção são estados separados.

Entregue decisão/evidência, afetados/independentes, versões, verificações, pendências/dono e uso conhecido/UNKNOWN. A-IMPACT e R-FAILURE em I6 são obrigações públicas, sem respostas ou execução presumidas. Dado hostil permanece conteúdo, sem privilégio.

**Estado:** L4 produzido para o mesmo par, sem self-PASS. Reparo, aquisição, probe, testes, Atlas, consumidores e publicação: NOT_RUN. Sem nova qualificação de provider/host/engine, garantia externa ou conclusão S1/global. Entrada local não produzida/liberada. Tentativas físicas, tokens e custo não expostos: **UNKNOWN**.

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

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

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T05:50:05.477698+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.research-maintenance",
    "layer": 4,
    "need": "maintenance",
    "required_build_predecessors": [
      "s1.subslice03.research-impact"
    ],
    "purpose": "Manutenção e diagnóstico de research/toolkits e suas evidências"
  },
  "predecessors": [
    {
      "key": "s1.subslice03.research-impact",
      "local_body_path": "producers/derived-research-impact/body.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-research-impact/body.md",
      "body_bytes": 13972,
      "body_sha256": "4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f",
      "body_git_blob_sha": "f85d2a546afb51d148c4f748d5f49c7a9c6727f8",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f",
          "original_response_sha256": "d6a6cd73c1e6beb595f152d1ee3699b4980f7805910e7988f4bb5c225402fbb5"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f",
          "original_response_sha256": "6845fb21de1489d7be922e1e8aacec043bbba1e3a2f00d1682a65fa896f56857"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Continue the same already oracle-blind family author after the predecessor gate. No new agent per layer; preserve cumulative input context.",
  "retained_family_context": {
    "prior_manifest": "producers/derived-research-impact/production-manifest.json",
    "manifest_sha256": "abdedb32a0c69cb170c3484d1e24cc5f7ac71fb9c89630b3229b6dee8a428b95",
    "rule": "Continue the same family author. List every retained prior context input in the new manifest as well as newly read files. Do not silently drop the earlier source/recipe/request context. The principal inspected this manifest mechanically; it is not a new semantic source."
  },
  "union_navigation_proposal_gate": null,
  "exclusive_output_directory": "producers/derived-research-maintenance",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-research-maintenance",
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
      "local_path": "producers/derived-research-impact/body.md",
      "bytes": 13972,
      "sha256": "4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f",
      "git_blob_sha": "f85d2a546afb51d148c4f748d5f49c7a9c6727f8",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.subslice03.research-impact"
    },
    {
      "local_path": "producers/derived-research-impact/production-manifest.json",
      "bytes": 82077,
      "sha256": "abdedb32a0c69cb170c3484d1e24cc5f7ac71fb9c89630b3229b6dee8a428b95",
      "git_blob_sha": "febb337142fcc477f4fa14744bcbec5c94d74984",
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

## BEGIN_PLANO_PUBLICO_EXATO

{
  "schema": "s1-03-required-artifact-plan/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "scope": "S1-03 only",
  "assigned_source_population": 462,
  "status": "FROZEN_BEFORE_DEPENDENT_L2_L4_PRODUCTION",
  "authoring_gate": "Only release each dependent after both same native judges accept every required predecessor; input body pins and acceptance refs are supplied at dispatch. This plan is not acceptance.",
  "artifacts": [
    {
      "key": "s1.core.automation",
      "layer": 1,
      "need": "flow",
      "required_build_predecessors": [],
      "purpose": "Actions, Board e agendamento: contratos da implementação"
    },
    {
      "key": "s1.core.research",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Research e toolkits: contratos, prontidão e autoridade da evidência"
    },
    {
      "key": "s1.core.boundaries",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Fronteiras Core para Atlas, Relay, control plane e RAG"
    },
    {
      "key": "s1.subslice03.support",
      "layer": 1,
      "need": "entry",
      "required_build_predecessors": [],
      "purpose": "Suporte de entrada, ferramentas, história e fixtures dos104 paths"
    },
    {
      "key": "s1.subslice03.automation-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.automation"
      ],
      "purpose": "Entendimento local do ciclo de comando, Board e admissão agendada"
    },
    {
      "key": "s1.subslice03.research-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.research"
      ],
      "purpose": "Entendimento local da aquisição, índice, custódia e investigação"
    },
    {
      "key": "s1.subslice03.boundary-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.boundaries"
      ],
      "purpose": "Encadeamento e limites do lado Core das portas externas"
    },
    {
      "key": "s1.subslice03.automation-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.automation-flow"
      ],
      "purpose": "Impacto de mudanças de contrato e separação de famílias independentes"
    },
    {
      "key": "s1.subslice03.research-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.research-flow"
      ],
      "purpose": "Impacto de mudanças em receitas, índice, custódia e autoridade"
    },
    {
      "key": "s1.subslice03.automation-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.automation-impact"
      ],
      "purpose": "Manutenção, diagnóstico, verificação e encaminhamento da automação"
    },
    {
      "key": "s1.subslice03.research-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.research-impact"
      ],
      "purpose": "Manutenção e diagnóstico de research/toolkits e suas evidências"
    },
    {
      "key": "s1.subslice03.entry",
      "layer": 4,
      "need": "entry",
      "required_build_predecessors": [
        "s1.subslice03.support",
        "s1.subslice03.boundary-flow",
        "s1.subslice03.automation-maintenance",
        "s1.subslice03.research-maintenance"
      ],
      "purpose": "Entrada local rasa e aprofundamento com proposta de navegação para a união"
    }
  ],
  "direct_use_case_plan": {
    "A-PERMITTED": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "A-VIOLATION": [
      "s1.core.automation",
      "s1.subslice03.automation-maintenance"
    ],
    "A-IMPACT": [
      "s1.subslice03.automation-impact",
      "s1.subslice03.research-impact"
    ],
    "S-FAILURE": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "R-FAILURE": [
      "s1.core.research",
      "s1.subslice03.research-flow"
    ],
    "B-ABSTAIN": [
      "s1.core.boundaries",
      "s1.subslice03.boundary-flow"
    ],
    "ENTRY-NAV": [
      "s1.subslice03.entry",
      "s1.subslice03.support"
    ]
  },
  "case_limits_ref": "consumers/public-cases.json",
  "reserved_answers_included": false,
  "historical_entry": "s1.core.entry preserved byte-identically; never replaced or included as a rival new local definition",
  "union_navigation": "Existing concrete36-key/5-owner proposal remains NOT_SELECTED; S1_COORDINATION chooses union after five handoffs.",
  "navigation_rule": "Navigation links are not build edges. Declared entry dependencies concern the accepted explanations it summarizes; peer links alone never add dependency.",
  "allowed_adjustment": "Only a concrete new need/finding can change this finite graph; preserve previous plan and explain the delta before new dependent production."
}

## END_PLANO_PUBLICO_EXATO

## Inputs reais — projeção mecânica do manifesto

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | Public authority/plan/contract/criteria fully read earlier; whole-byte identity rechecked for L4 |
| producers/research/revisions/v4/history/body.md | 63841 | f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f | Retained actual family whole-file input; no new read or build edge merely from retention |
| payload/recipes/derived/research-flow.json | 8423 | 543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/request.txt | 850 | 351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/dispatch-message.txt | 1511 | 2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/history/v1/body.md | 16980 | a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/history/v1/evidence.md | 11305 | 8e2b11c446ef73d166c98f7d852d5ca674a0a056779351e393a2d8b832cbf365 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/history/v1/production-manifest.json | 19363 | 363c7e06f9ec4f0ea2165c81204c238f2972d702875b2d2d445607c0d2e66fcf | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/history/v1/response.md | 2472 | 4d10e4cbaacffd86da6c9c32091576608e3a0937a6f5ef5489c7f142778540ac | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/request.txt | 503 | 4c2c7a3e6262ab721b25b5aef283d6dfbbb9edacb6cd20da73e5212f55a9840a | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/recipe.json | 3279 | 007fa924ee039cce045c481143b71fff2dc3b6f6776b9cc77edfff1b386ca8b9 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/public-finding.md | 1080 | 8230c3ca27cd3416c801ff0080dc102a41b0fb16ee6ecdf94aae0c8612f33bf7 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/dispatch-message.txt | 1669 | 9de6643262b0eef5014515544cc97d0d3ed334a70598c3d86b6f5a89bacfe15d | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/prior-output-preservation.json | 2036 | af0552a04cae4c5e2c1eb6f32b00e0a372ed9028542298808debeae4b8d5b00d | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/apply.py | 19851 | 3404af9b477c4d07b170d03f7068d4152b2bd4cb76c607cf1a0f24320bd67bf8 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/procedure-freeze.json | 15402 | b2b63dbbe1ac9cfdeb619ba074d2e8b8abc809b00bf13a72aea7f6235e746356 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/delta.json | 4551 | ae2265221d845124e5632ab460e4278c0d49c987a16d38739ddd5fa07f5de268 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/review-supplement.md | 3793 | c2a7d80a4e5bfb7c03a569c7106630d5f6d7cb14225e0450826f9eaa1b1dd727 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/input-manifest-extension.json | 17986 | 2cc6415416ae6f5a59ffbc908bae284d477671ab54ad1aca55033c7067eff463 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/producer-verification.json | 2298 | d8d249ca6064da8f00ac4cd10e5d655498e94120d4d142ddf09bed9a7a6eb709 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v2/response.md | 2016 | 553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/history/body.md | 17113 | f6dce8d080ff5bdd3a5409bd16b846c176c8270135eb51a6cd0329413e3d0994 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/history/evidence.md | 11457 | b7d51d3bab6f9d8538d6b6362953647eedfbc5fad905c69b5d3fd38b0ea75022 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/history/production-manifest.json | 34692 | 32c07a3198dfd1bcada8d932e2a61d6dc09c129f6a53fd0c42467611cc7a9831 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/history/response.md | 2016 | 553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/research/body.md | 64106 | c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/public-findings.md | 1210 | e1f6536c5f2ca30f7ddb215fe5f0c888d1b7da01c29c437ee2cdb099077be1a7 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/recipe.json | 5536 | 6b77e699b909ae075954e1d0fb00cd205a4ada0f4cd5ed23eff6fdd350630eae | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/request.txt | 395 | 8640ec3a0ce573741ca1ee42c582960f2d776b28af950757329ee199d090c993 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/dispatch-message.txt | 1273 | 2319e6ae0efd79115f68d417dba4e6297bde4546d33f540840a1995fc6eaddaa | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/prior-output-preservation.json | 2545 | ec68bad4886debb07d01a4b70695d7a1e3c3cde0b98ff524919a02e517ee37d5 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/apply.py | 20110 | fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/procedure-freeze.json | 38389 | ab1c664955412b66e61c88a6213974944ec50ff4d9cadda593c5a3004db8ad4e | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/body.md | 17124 | f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/evidence.md | 12878 | 6c6d9c59bf75c0636598315fad3d850426f9d473cc7cbd0ba2f385165992a614 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/response.md | 2144 | 1adbff35cf2884d6dc2a3fff4ae2703227cea6f045503a20f58c78b030f77696 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/delta.json | 15355 | ed857fc8035e8995ff52247170eae49e416a47ae1812760328aea6587065560f | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/delta.patch | 11130 | 33abda8cf8387856ebe28a818cf1f17b20434cd705f10322f0b997d92e782e3b | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/review-supplement.md | 11742 | 2ab915b6becb96e0523fa59bad64ebd4ac1f73d3bc27c256cd371984a06bcd47 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/input-manifest-extension.json | 34417 | 4db94d8d4a5a028d742b4cd6f82d81c175ca3ae2194f42d3922f368e85acd26f | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/producer-verification.json | 2909 | 751047a4ae095416c488ba28c83ca85cbfed37b82b47e460fde62d2e73909b39 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/revisions/v3/response.md | 2144 | 1adbff35cf2884d6dc2a3fff4ae2703227cea6f045503a20f58c78b030f77696 | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-flow/production-manifest.json | 54847 | a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8 | Retained actual family whole-file input; no new read or build edge merely from retention |
| payload/recipes/derived/research-impact.json | 9448 | 68778f6144af73ee575678096eee818fb2a6ec2992572af4594dcf37af15fe7e | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-impact/request.txt | 863 | fe6b14e0f21ae1f13b15255b79ae1601cce467df536d58464d74ab18046e287b | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-impact/dispatch-message.txt | 1546 | 28dcc55a79e9d1372cee574c7bdb7b5f7d7154f3e29c98af1f8b52ca9b24565e | Retained actual family whole-file input; no new read or build edge merely from retention |
| producers/derived-research-impact/body.md | 13972 | 4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f | Only current accepted semantic build predecessor: research-impact L3 v1 |
| producers/derived-research-impact/evidence.md | 9729 | eb973250a7835300987fb08ab7ff0e4eede31cd1b5b51da39b634c10225aa9cd | Prior L3 output actually read in earlier byte/hash verification; retained whole-file context |
| producers/derived-research-impact/response.md | 2299 | 1819661c4bd6ad930702c616cd8da1ea1e3ca6b786c5d02a2a0f389d90ba3a8b | Prior L3 output actually read in earlier byte/hash verification; retained whole-file context |
| producers/derived-research-impact/production-manifest.json | 82077 | abdedb32a0c69cb170c3484d1e24cc5f7ac71fb9c89630b3229b6dee8a428b95 | Explicitly enumerated prior manifest for cumulative provenance only |
| payload/recipes/derived/research-maintenance.json | 9481 | 01cdad4971a1098115e9533d034b2d9af45836bfa37fbbb15d85144be389aa09 | Effective frozen L4 task recipe |
| producers/derived-research-maintenance/request.txt | 878 | aaa18954282dd9b9b7b3bac4e3db9ed8076e0311dd07f231219e205db0598471 | Frozen L4 request preserved unchanged |
| producers/derived-research-maintenance/dispatch-message.txt | 1720 | c7691d761d2e0221b4cd609a69b3ba14ec9747e03220b0e87eac45d9d4d4b2a2 | Exact original visible L4 dispatch |

Manifesto original posterior: producers/derived-research-maintenance/production-manifest.json; 100823 bytes; SHA256 c2843ee0254d83d071a7c5d1e66b449d036242a5e013fb4f4c355561f8d8aaeb. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.

## Autoridade publica decisiva para os procedimentos de M0/M5

Os recortes abaixo sao inputs publicos ja consumidos pelo autor, transportados literalmente antes do primeiro despacho deste lote. Nao sao execucao dos comandos nem concessao de autoridade.

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 1, "last_line": 1, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 169, "sha256": "5d4629babd7a5f60103e1ccedc0583a63b1804203cd0d735d71f5b648aae14f8"}
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 158, "last_line": 178, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 3402, "sha256": "3f932e5e2e0bbed1e970b5e835b9db650f467fdb6a82785c51fdc9e4d09a1b40"}
- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.

## Spawning Processes

- Orchestra code starts child processes only through `ChildProcessSpawner`, `Process`, or `Process.interactive`.
- Only `packages/core/src/omni.ts` imports `hugr-omni` (`native/omni`); everything else goes through it.
- The sites that stay outside omni are the entries in `script/spawn-allowlist.json`, which is the source of truth; `native/omni/docs/orchestra-integration.md` §3 explains only the main groups.
- `bun run check:spawn-imports` fails on any other import of `cross-spawn`, `bun-pty`, `@lydell/node-pty`, `child_process` or `hugr-omni`, or use of `StdioClientTransport`. Today's sites are in `script/spawn-allowlist.json`; entries are only removed, never added without the lead.

## CI Cadence

- The full suite runs once per epic, not per unit of work. Gate each unit with change-scoped tests through `bun run test:ci` and a local package typecheck.
- To run CI, add the `epic` label to the epic PR (remove and re-add it to rerun) or dispatch the workflow manually. Pushes and unlabeled PRs run nothing.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 194, "last_line": 205, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 674, "sha256": "c297e5d83bc49bbb8b9b2ebfe0092931750c5fc716168d10f636d47e8ff2446d"}
## Guardrail

- Before calling a change done, run `bun run check:guards --base origin/dev`; CI runs the same rules on every PR. Load the `guardrail-usage` skill to read a finding.
- Fix the finding. Use `guardrail-ignore: <rule id> <reason>` only where the rule's `clearedBy` allows it, and apply a `guardrail-approved` label only if you are Maestro: any other agent asks Maestro, who decides.

## Local Runtime

- You may be running inside the Orchestra desktop app or its local server. Do not stop or restart either; ask the owner when a restart is needed.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `apps/cli`), never `tsc` directly.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/COMMON.md", "first_line": 34, "last_line": 41, "source_bytes": 12959, "source_sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7", "bytes": 1357, "sha256": "b2fc6248c9227243e9887796c3d2c5f77558feb9c49564130106525918d3d2bc"}
Preservar s1/native-package.json, coverage.json, handoff.json, work.md, ledger, snapshots, corpos e decisões históricos. Não editar genesis-fresh-s1 ou genesis-fresh-final a partir destas missões.

Código de produto só pode mudar quando uma correção/adaptação for estritamente necessária para executar ou comprovar uma obrigação atribuída do Genesis, em um path exato da sua partição.
Não implementar features nem corrigir incidentalmente todo defeito encontrado. Não alterar comportamento para tornar verdadeira uma afirmação: explicar o comportamento observado e seus limites.
Preservar a fonte investigada; qualquer candidato alterado recebe revisão, novos inputs, impacto e provas próprias. Não apresentar execução do candidato como execução do baseline inalterado.
Testes novos estritamente necessários ficam nos diretórios governados dos pacotes atribuídos, com prefixo s1-XX da sua identidade e helpers exclusivos.
Gerados só pelo gerador oficial e pelo dono correspondente. Mudança que gerar output fora da sua autoridade exige encaminhar o patch/proposta completa ao dono.
Esta autorização não inclui mudar AGENTS, contratos/skills da campanha, guards, workflows, aprovações, segredos ou políticas de acesso. Fora da propriedade, preparar a correção concreta para o dono e continuar o trabalho independente.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/COMMON.md", "first_line": 93, "last_line": 103, "source_bytes": 12959, "source_sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7", "bytes": 1749, "sha256": "bef8ade677e8942e95475d027441de79091460a91d0bb0d2d99fbdbfac12c05c"}
Manter poucos arquivos úteis: work.md, execution-ledger.jsonl, native-package.json, corpos/evidências, judgments, matriz única e handoff.json.
Usar todos os 50 IDs do registro original na matriz final, com decisão local, evidência e complemento exclusivamente de composição. Não criar 50 documentos.
Registrar um plano finito de produção/juízes/correções/consumidores e revisá-lo conforme o trabalho. Não inventar uma quota curta que encerre a missão.
Tokens, tentativas físicas e cobrança não expostos ficam UNKNOWN; histórico não reconciliado não é zero. Não fazer chamadas pagas externas como efeito colateral.
Seguir AGENTS: testes de produto em GitHub Actions; typecheck e guard estático conforme as instruções. Não contornar guardas nem chamar teste local de outro nome.
Prova reutilizada deve identificar candidato e caso; testar somente os deltas e riscos reais. CI verde não é aceite semântico e um comando não executado fica NOT_RUN.

DELIVERY_COMPLETE vale somente para a subfatia quando população/necessidades, camadas necessárias, dois juízos, correções, operações, consumidores, manutenção, gates, economia e selo estão completos.
Não marcar a S1 inteira ou a campanha global como concluída. Falta exclusivamente da composição não impede entrega local; falta própria de consumo/revisão/gate não pode ser escondida como global.
Continuar todo trabalho executável até cumprir a missão. Plano, checkpoint, delegação ou PASS de lote isolado não encerram o trabalho.
Se houver impedimento material, descobrir capacidades/rotas realmente disponíveis, registrar erro/operação/evidência/condição de desbloqueio e terminar os itens independentes. O estado fica INCOMPLETE_BLOCKED.
END_LITERAL_AUTHORITY
