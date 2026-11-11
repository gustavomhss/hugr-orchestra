# Recibo de transporte — S1-L1-C-v1 / c-l1-evidence-v1

As seis partes canônicas foram enviadas mediante chamadas reais de `collaboration.followup_task` para cada um dos dois alvos existentes: `/root/judge1` e `/root/judge2`.

O suplemento contém 203.995 bytes UTF-8, SHA-256 `10b7e677eba2129608f7d4dde3edeaa6f9d1e5d5fef819babb737b7a0ada46e7`. A concatenação local das seis partes e os segmentos DATA dos requests reproduzem exatamente esse arquivo. São 209.452 bytes de requests canônicos por alvo, incluindo cabeçalhos e delimitadores, e 418.904 bytes para ambos.

## Chamadas e ocorrências

| Alvo | Chamadas reais | Partes canônicas | Bytes de requests canônicos | Bytes de todas as tentativas |
| --- | ---: | ---: | ---: | ---: |
| `/root/judge1` | 7 | 6 | 209452 | 245669 |
| `/root/judge2` | 7 | 6 | 209452 | 247715 |

Das 14 tentativas, 13 foram feitas pelo transportador principal e uma pelo helper interrompido. A chamada do helper falhou explicitamente com `collab tool failed: agent thread limit reached` e não conta como entrega. O request incorreto da primeira tentativa da parte 2 para J1 está preservado; ele omitiu três bytes do pin C06/executor. A parte 2 inteira foi reenviada com o request canônico. A tentativa incorreta não conta como transporte literal do congelado.

A saída da parte 1 de J1 foi truncada nesta janela; a principal relatou seu ACK nativo. As demais chamadas canônicas retornaram com resultado visível vazio e sem erro explícito. Os ACKs reportados e seus limites estão separados em `acknowledgment-reports.json`.

## Limites de confirmação

Os hashes e contagens dos requests foram verificados localmente. As chamadas não expuseram byte echo, hash recebido ou identificador de recibo do host. O recibo não transforma retorno vazio em certificação criptográfica do destinatário ou decisão semântica. A evidência original, os corpos e o suplemento permaneceram inalterados.

`transport-receipt.json` registra os hashes por parte, os alvos e as contagens; `delivery-results.json` preserva os resultados visíveis de todas as tentativas, além dos registros originais de cada alvo. `verification.json` registra a conferência determinística local. Os arquivos raw e os requests literais permanecem neste diretório.

## Fechamento atribuído à principal

A principal informou que recebeu o texto nativo integral do julgamento suplementar de J2, relativo ao suplemento completo, e determinou fechar o transporte sem aguardar outro ACK. A mensagem integral está preservada em `acknowledgment-reports.json` e `request-steering.txt`. O transportador registra esse relato com atribuição, sem revisar ou emitir veredito.
