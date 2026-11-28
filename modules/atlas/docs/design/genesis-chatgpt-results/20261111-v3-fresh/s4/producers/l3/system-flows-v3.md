# Fluxos de dados, decisões e conhecimento na S4

Base aceita no payload `47eaa5322102910289cb56e2e07e9d3536ba1926`: A=`S4:L2:atlas-system`; C=`S4:L2:continuity-rag-operations`; G=`S4:L2:genesis-governance`; H=`S4:L1:atlas-host-genesis`; N=`S4:L1:native-runtime-delta`; HB=`S4:L1:host-boundaries`. Inspeção herdada; inferências marcadas; sem execução L3.

## Um host, três percursos de estado

| Percurso | Estado preservado | Uso sustentado |
|---|---|---|
| Session/Continuity | Session/Location; arquivo por sessionID | Recuperação com permissão/integridade. |
| RAG/Store | Fonte/chunk, revisão/snapshot, pergunta | Seleção/provas; revisão não congela texto. |
| Genesis/Atlas | Artifact/result, receipt, inputs e scope | Publicação e atualidade. |

**Inferência:** host/Location compartilhados não unem transações ou IDs. Conversa e prova RAG não são promovidas automaticamente a autoridade Atlas. [C § Mascaramento preserva uma cauda recuperável; C § Pipeline e revisão têm identidades distintas; A § Por que texto igual pode exigir outro resultado]

## Do turno à redução recuperável do pedido

O runner normal passa por governança/ferramentas, transformação/compactação/stream e uso/custo/snapshot antes de afterStep. O default SessionCompaction compacta, com transform identidade e afterStep vazio; Continuity declara substituição por Location, sem provar instalação global. Hospedado omite transform/compactIfNeeded; generate omite hooks/registro. Conferir a entrada em `packages/core/src/session/runner/llm.ts` antes de atribuir efeito à estratégia. [C § Session define quais hooks existem]

Máscara exige context_recall materializado e economia estimada. Arquivo precede máscara; máscaras persistem depois, sem alterar o histórico. A cauda normal protege cinco passos do assistente; urgência preserva a última mensagem, ferramentas protegidas e evidência de erro. Carga falha deixa máscaras vazias e loaded definido, sem retentativa. **Inferência:** pedido grande pode resultar de hook, recall, proteção ou carga; ampliar máscara não resolve tudo. Mutex/rename não provam atomicidade da Session. [C § Mascaramento preserva uma cauda recuperável]

## Da requisição RAG à evidência de seleção

Sem embedding, o handler hidrata memoryStore, chama noteBytes/operação em withStore e regrava estado da Location. SQL guarda caminho/hash/status das fontes, sem seu texto integral; chunks guardam texto e offsets. **Inferência:** ler HTTP pode regravar estado; isolamento não demonstrado. Extração precede admissão; allowExternal omitido nega. Recusa não exclui leitura prévia; prefixo não resolve symlink. [HB § 2. HTTP RAG → Store por requisição → SQLite]

noteBytes marca not_yet_read quando detecta conteúdo legível alterado; falha de leitura mantém a linha e pode conservar metadados/chunks antigos. Reparse atualiza texto/hash/status; rechunk exige reparse compatível; remover fonte deixa chunks. Revisão guarda parâmetros/membros/hashes; busca usa fontes/chunks atuais. setPipeline coage sem validar; strings parser/tokenizer não trocam a implementação inspecionada. Comparação exige proofSetId igual aos snapshots e um campo alterado, sem passes; flags falsos não provam equivalência/replay. Ask retém K sem modelo; trace usa revisionId, prova questionId, sem conversão no host. **Inferência:** hidratar sem avançar seq arrisca colisão. [C § Pipeline e revisão têm identidades distintas; C § Comparação exige uma mudança isolada; C § Diagnóstico e percurso de manutenção]

## Da autoria à leitura de conhecimento governado

Mineração/staging oferece candidatos. Prepare valida scope, bytes/fontes/inputs/deps e grava CAS/candidato. Aceite semântico, binding e publicação são distintos. Dois juízes distintos vinculam candidato/contrato/critérios/result/input. Publish refaz prepare; mudança exige novo binding, sem dispensar gates de política/ator/ratificação/provenance. [G § Da produção nativa à porta de consumo; G § Rotas históricas têm outra finalidade]

CAS precede projeção; gates ficam no commit que pode repetir. Accessor exige carrier publicado único, compatível com scope/provenance. Read exige orçamento positivo e key ou need exclusivos. Atlas chama modelos fora de Session pelo boundary: ID do gateway não cria Session durável nem hooks de Continuity. **Inferência:** contexto que circula não ganha autoridade pelo caminho. [A § O percurso até uma leitura utilizável; A § Fronteira externa e pontos de manutenção]

## Mudanças propagam por resultados e vínculos

Present divergente indica mudança; ausência exige corroboração; indisponibilidade preserva HOLD/incerteza. Members observa caminhos; file, conteúdo. Rebuild confere receita/versão, contrato, inputs/predecessores e membership; captura/reobserva, segue a ordem afetada e avalia o candidato. Receita/input alterado exige reavaliar o trabalho afetado; censo não cobre uma fonte omitida. [A § Como mudanças de fonte orientam a revisão; H § Ownership publication, observation and rebuild; G § Cobertura não é uma lista indiscriminada de inputs]

Resultado completo inclui corpo, autoridade, validade, gaps e evidência; receipt liga contrato/inputs, resultados dos predecessores e reviews. Prosa igual não basta. Rebuild pode evitar chamadas com hashes precisos de inputs/deps inalterados e relê o grafo. **Inferência contratual:** após reavaliar e validar o mesmo resultado completo sob receita/inputs atuais, a reinterpretação pode parar na aresta key/result se inputs, contrato e demais deps do dependente seguem válidos. Isso não dispensa novos receipts/vínculos afetados, conferir o grafo ou publicar pela porta governada; receita/candidato novo exige binding novo. [A § Por que texto igual pode exigir outro resultado; H § Ownership publication, observation and rebuild; N § Binding separado e publicação governada]

Build expressa impacto semântico; navegação é consulta, sem virar aresta no hash de inputs/deps. **Inferência:** unidades sem dependência afetada e com vínculos próprios válidos preservam resultados/receipts; proximidade ou navegação não exige refazer autoria. Fonte compartilhada declarada continua relevante. Essa separação evita invalidar indiscriminadamente arquivo de conversa, RAG e Atlas. [G § Dependências que tornam as camadas auditáveis; N § Validação que precede autoridade]

## Após falha, separar recuperação de nova publicação

Começar pela seleção corrente: HOLD/recusa não prova perda de CAS. Histórico exige historical:true e rótulo explícito; mostra o passado sem tornar inputs antigos atuais. Exit 2 conserva HOLD/recusa; exit 1 erro; exit 0 de prepare só preparação. Drift seguido de ativação falha pode deixar leitura corrente HOLD e histórica legível. [N § Consumo e manutenção pela porta real; N § Delta R1 e controles de recuperação]

Preservar candidato exato, CAS e recibos permite retomar resultados duráveis. NR1-01 descreve interrupção após CAS/antes da ativação: HOLD ou manifesto antigo válido; retomada desserializa candidato, reutiliza resultados e não repete autoria sintética. Reprepare/publicação conferem inputs e binding atuais: candidato alterado exige binding novo. Correção não reescreve recibos antigos. Os controles preservam estado anterior e scope independente. [N § Consumo e manutenção pela porta real; N § Delta R1 e controles de recuperação; N § Binding separado e publicação governada]

Retorno à publicação anterior exige compatibilidade com scope/seleção, inputs/contrato atuais, vínculos exatos e gates de política/provenance. Rollback incompatível é recusado no adapter e emit; histórico ou approval antigo não substitui candidato novo. Republicação compatível é decisão separada, sem autorização automática nem bloqueio cronológico universal. Esses controles sintéticos, com um Worker/writer, não provam toda falha, concorrência ou perda de energia. [N § Delta R1 e controles de recuperação; N § Limites e estado da evidência; N § Binding separado e publicação governada]

## Manutenção e alcance da evidência

Em `modules/atlas/packages/adapter-io/src/`, conferir `ownership-input.ts` e `ownership-rebuild.ts`; preparar/consumir em `modules/atlas/scripts/genesis-native.ts`. [H § Ownership publication, observation and rebuild; N § Consumo e manutenção pela porta real]

A/G reportam CI delimitado de 7102f2e3/run 43077975153; G preserva R2 de L1A anterior. Payload não é produto nem transfere binding. Instalação global, autenticação e atomicidade seguem lacunas. Bytes/reuso/chamadas lógicas não medem tokens, tentativas ocultas ou cobrança: não exposto fica UNKNOWN. Sem aceite/publicação L3. [A § Recibos e limites desta síntese; G § Ler recibos sem transportar autoridade entre revisões; G § Uso, tentativas e economia honesta]
