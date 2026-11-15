# Helper determinístico de consolidação dos consumidores

Este helper prepara o relatório mecânico depois das consultas reais e dos sete FINALs preservados pela principal. Ele não faz consultas Atlas, não chama colaboração, não avalia respostas contra oracle e não emite PASS de domínio ou critério.

## Estado desta entrega

Preparação de código apenas. Foi permitida somente análise sintática com ast.parse; o helper não foi importado ou executado, inclusive com --help, e não recebeu fixtures ou recibos simulados. Sua execução futura exige os recibos reais.

Foram lidos somente os seis arquivos originalmente autorizados e os dois arquivos adicionais explicitamente autorizados pela principal: direct-read-supplement-v1.json e prepare-consumer-dispatch-v2.py. As identidades exatas estão fixadas em PINS no script. O dispatcher v1 permanece como autoridade histórica; as capturas de consumidores exigidas são v2, com o suplemento.

O dispatch-message.txt conserva literalmente o pedido inicial visível, sem LF terminal. É uma captura do texto visível consumido; não se alega checksum independente do wire do host. O suplemento posterior não substitui nem modifica esse arquivo.

## Uso futuro

Apenas depois das consultas reais e das capturas finais, a principal poderá executar:

~~~sh
python assembly-native-descriptors/consumer-summary-helper/summarize_consumers.py EXECUTION_ROOT NEW_DESTINATION
~~~

EXECUTION_ROOT é a raiz original que consta do recibo real da preparação. NEW_DESTINATION deve ser um diretório inexistente, com pai já existente, sem symlinks ou componentes "..". O helper aborta se o destino existir.

Depois de verificar os sete casos e a estabilidade dos inputs, cria somente:

- consumer-summary.json
- consumer-summary.md

Nenhum arquivo de entrada é alterado. O relatório é determinístico para os mesmos bytes, paths e metadados; não acrescenta relógio atual nem números estimados de uso. Falhas de verificação terminam com exit code 2 e mensagem clara em stderr, antes da criação do diretório de saída. Uma falha de I/O durante a escrita pode deixar uma saída parcial nova; o helper não apaga arquivos nem sobrescreve um destino anterior.

## Entradas reais exigidas

1. Os oito arquivos públicos/de procedimento fixados em PINS, sem drift.
2. payload/receipts/native-prepare-final.json e seus stdout/stderr originais. O recibo precisa descrever a tentativa real da seleção de 12 artefatos, o candidato/release fixado, o comando e a raiz efetivos. PREPARED, BLOCKED_ACTUAL_PREPARE e NOT_COMPLETED_TIMEOUT são estados distintos; um bloqueio não é transformado em sucesso.
3. Para cada um dos sete casos públicos, request.txt e request-freeze.json produzidos pela versão 2 do procedimento. As identidades dos controles, do pedido e da preparação são conferidas. O texto do pedido precisa ser o texto exato do procedimento público, incluindo a pergunta congelada e o suplemento.
4. Para cada caso, bridge/call-NN.json, query-NN.json, call-NN.stdout, call-NN.stderr e forward-NN.json, em sequência contígua a partir de 01, sem órfãos.
5. Para cada caso, final-response.md e final-capture.json mantidos pela principal.

A preparação pode ter sido efetivamente bloqueada. Os recibos de consulta ainda são necessários e seus HOLDs/erros permanecem resultados de acesso, não respostas de domínio.

## Formato da captura final adotado

final-capture.json contém um objeto capture com estes campos obrigatórios:

| Campo | Regra |
|---|---|
| file | final-response.md, ou seu path equivalente relativo ao payload/raiz, ou seu absoluto exato |
| bytes | Quantidade inteira real de bytes do arquivo |
| sha256 | SHA-256 real dos bytes preservados |
| literal | true |
| agent_id | ID nativo realmente observado pela principal |

case_id pode constar do objeto externo; se existir, precisa corresponder ao diretório. Não é exigido um timestamp inexistente nem um ID de mensagem não exposto. Os sete agent_ids capturados devem ser distintos, conforme o requisito público de contextos novos.

O texto final precisa ser UTF-8 não vazio. O helper confere os bytes sem retirar ou acrescentar LF. O hash do final-capture.json também entra nas provas. A captura da principal é a base da identidade; o helper não afirma uma verificação independente por logs do host.

## Mapa direto exigido

O conjunto exigido combina artifact-plan.json original com direct-read-supplement-v1.json, sem alterar perguntas, quotas, grafo ou corpos:

| Caso | Chaves exigidas para tentativa direta de read |
|---|---|
| A-PERMITTED | s1.core.automation; s1.subslice03.automation-flow |
| A-VIOLATION | s1.core.automation; s1.subslice03.automation-maintenance |
| A-IMPACT | s1.subslice03.automation-impact; s1.subslice03.research-impact |
| S-FAILURE | s1.core.automation; s1.subslice03.automation-flow |
| R-FAILURE | s1.core.research; s1.subslice03.research-flow; s1.subslice03.research-maintenance |
| B-ABSTAIN | s1.core.boundaries; s1.subslice03.boundary-flow |
| ENTRY-NAV | s1.subslice03.entry; s1.subslice03.support |

Os 12 artefatos têm uma exigência direta explícita. Cada caso começa por index; cada chave exigida precisa ter uma tentativa de read com key explícita. Não há exigência de exatamente três operações: R-FAILURE possui três chaves; aprofundamentos e um segundo index são admitidos dentro de 2 index, 5 read e 60.000 bytes UTF-8 por caso.

A falta de uma tentativa direta exigida aborta a consolidação. Um read por need não é convertido silenciosamente em tentativa explícita de uma key.

## Verificações mecânicas

O helper compara:

- Identidades dos controles originais, das perguntas e do suplemento.
- Preparação real: schema, 12 artefatos, comando, root, candidato/release, horários, timeout, exit code, estado e identidades de streams.
- Ordem contígua dos recibos, inexistência de órfãos e início por index; horários de início/fim por caso após preparação e congelamento.
- Query exata, scope, seleção única, campos permitidos, maxBytes positivo e saldo da quota.
- Procedimento da ponte v2 por path, bytes e SHA-256, comando/cwd reais e vínculo ao mesmo recibo de preparação.
- Streams originais por tamanho/hash, texto UTF-8 ou base64 canônico, sem troca de bytes por caracteres/tokens.
- Envelope inteiro reconstruído mecanicamente segundo a ponte congelada, incluindo timeout e a substituição por metadados quando excede o saldo.
- Bytes efetivamente representados no forward, seu hash e o total acumulado, contando inclusive envelope e base64.
- FINAL literal e agent_id por caso.
- Estabilidade dos bytes e inventários antes da criação da saída.

Um arquivo query, forward, ACK ou índice não cria uma chamada adicional. A unidade mecânica é um recibo call-NN com seus arquivos correspondentes. Recusas anteriores à criação de um recibo não podem ser inferidas de arquivos inexistentes.

## Conteúdo devolvido e UNKNOWN

Tentativa de read, conclusão de processo, envelope completo, conteúdo de corpo e entrega nativa são conceitos separados no JSON.

Timeout, resposta suprimida por quota, exit code não zero, HOLD literal ou erro não são consumo de corpo. Bytes parciais e não UTF-8 continuam preservados pelos arquivos e, quando aplicável, pelo base64 do envelope. O helper não os interpreta como resposta Atlas concluída.

Limitação real: os arquivos públicos autorizados não fornecem o schema formal de resposta de ownership.read. O helper não inventa campos de sucesso, conteúdo ou key resolvida. Para uma saída estruturada completa de exit 0 que ainda não possa ser classificada por esse contrato ausente, consumed_body é UNKNOWN e a key fica em direct_keys_with_unknown_body_content. direct_keys_with_confirmed_body_content permanece vazio, sem transformar essa lista vazia em prova de que nada foi retornado.

O JSON preserva as observações estruturadas dos stdout/stderr para revisão posterior, além dos hashes e paths dos originais. Para certificar conteúdo de um formato de sucesso futuro, será necessário fornecer o contrato oficial dessa resposta e revisar explicitamente o helper. Essa insuficiência não impede relatar fielmente HOLD, erro, timeout, quotas e tentativas.

A existência de forward-NN.json prova o envelope preservado; os inputs autorizados não incluem um recibo independente de sua entrega ao consumidor por colaboração. A entrega nativa fica UNKNOWN. O helper não usa o texto do FINAL como prova automática de recebimento ou correção semântica.

Tokens, tentativas físicas de modelo e custos ficam UNKNOWN. Não há cálculo de tokens a partir de bytes. Os corpos de conhecimento, fontes de produto, CAS, pacote nativo e conteúdo reservado não são abertos diretamente pelo helper.

## Identidades e procedência

Os hashes do script, deste README e do dispatch inicial constam de response.md. O próprio response.md é gravado sem LF terminal e será o texto integral do FINAL nativo. Seu hash é exibido como metadado na entrega, fora do conteúdo do próprio arquivo, evitando uma referência autorreferente impossível.

