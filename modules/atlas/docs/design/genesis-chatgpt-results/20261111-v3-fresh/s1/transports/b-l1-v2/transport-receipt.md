# S1-L1-B-v2 — recibo de transporte

Foram concluídas 12 chamadas reais de `collaboration.followup_task`: seis partes para `/root/judge1` e as mesmas seis partes para `/root/judge2`. A reconstrução local é idêntica ao dossiê congelado de 208309 bytes, SHA-256 `42c2595c2e243b3612a13b7ed615c5bfbeb731706f760119c1f7fd6719541def`.

Cada alvo recebeu requisições contendo 208309 bytes de DATA e 215608 bytes de mensagens com envelopes. O total dos dois alvos foi 416618 bytes de DATA e 431216 bytes de requisições. Esses totais descrevem os argumentos enviados; não são um byte echo do receptor.

As chamadas 1–11 exibiram resultados vazios, sem erro explícito. A chamada 12, J2 parte 6, exibiu apenas `Output exceeded the available model context and was truncated`. Esse limite foi preservado em `delivery-results.json`; não foi tratado como falha explícita nem originou duplicação. Nenhum ACK nativo B foi recebido diretamente pelo transportador. No fechamento, a principal informou ter recebido o veredicto nativo integral de J1, FIX-FIRST, e determinou a conclusão do transporte. O retorno de J2 permanecia pendente nesse relato. A mensagem exata está em `principal-completion-report.txt`; o transportador não leu nem produziu o veredicto. A principal foi informada do truncamento.

## Identidade e verificação

- Pin da fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- SHA-256 do pacote agregado: `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`.
- SHA-256 do freeze JSON: `c98c05d0a4a6c5413f49b9a3251896c0e76925a9a849d5478e4e17023742fbf9`.
- Os dois inputs congelados foram conferidos e permanecem idênticos às cópias locais.
- As seis partes são UTF-8 válidas, contíguas, sem omissão de bytes; o DATA de cada request é exatamente sua parte raw.
- A transcrição dos argumentos efetivos foi comparada manualmente com os requests preservados. Nenhuma diferença foi detectada. A verificação mecânica local não certifica bytes recebidos pelo host.

## Partes preservadas

| Parte | Bytes DATA | SHA-256 DATA | Bytes request | SHA-256 request |
|---|---:|---|---:|---|
| 1/6 | 34631 | `edec3c05d2012d75cca24ab55e7151c5a4b3ff038be8f11b1779a130804c046f` | 35843 | `d809f0a4fe7a1c192115521ce165c069ac87a6868daadb800a75bc308ce020e1` |
| 2/6 | 34642 | `b7620316065e69e37a5ee091f411a2d3db7274faeb366ecaaa026bea75893652` | 35858 | `ad9bf96781519737b64b2aa914e2a7edb8aff7a607a21aa3c75f3ad8220c311a` |
| 3/6 | 35273 | `354d6c47cce787664d07bda39bc0cc756464ddc7c5533093302a1f86c155ce81` | 36490 | `908f387fcf4cc2543f21cdff137b27ab3411020dbf3461b6b7b679464978d4ce` |
| 4/6 | 34482 | `ace8e872cf782ab7487ea92e084ea2e5a8d68feabf3ce8c468f1b6477d9947e0` | 35700 | `62b8ebe0d6d8bc95c71aae173896b624c1e887e6605c3910996e5ab4ce1dbb04` |
| 5/6 | 34551 | `41dd19ace3360b008a8b0babd6f1a4254f3f39261385f671248d5b293ab3353f` | 35769 | `e3dbd0739468f3171ac07846b3d05c087643d7a0e444ba470e6e884686aafd29` |
| 6/6 | 34730 | `711e1c2c9eae583db40731dea52adb35ad78092bd91b4aea6da1fb1fc5c98c92` | 35948 | `a8becb3b412276a02c1bf9d356b375f98aa90c7fd42fec8eb673ac2e8dfe92ed` |

## Arquivo de entrega

`transport-plan.json` mapeia offsets e identidades. `part-01.raw.md` a `part-06.raw.md` preservam as partes; os seis arquivos `.request.txt` correspondentes preservam os literais usados para ambos os alvos. `delivery-results.json` registra cada chamada real e sua saída visível. `verification.json` registra a conferência local. `transport-receipt.json` contém os totais, alvos e limites. `delivery-manifest.json` vincula os arquivos por tamanho e SHA-256.

Não houve retransmissão, erro de transcrição detectado ou helper neste lote. Não foi exposto request ID do host, byte echo, hash recebido, token ou custo. Este recibo registra transporte; não estabelece veredito ou liberação de camada.
