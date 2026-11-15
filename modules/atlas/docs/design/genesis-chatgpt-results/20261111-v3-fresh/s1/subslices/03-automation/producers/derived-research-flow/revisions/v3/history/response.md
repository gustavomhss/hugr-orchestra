# Entrega da correção RF-J2-F01 — L2 v2

Corrigi somente a frase de F3 e a linha correspondente de E1 em `s1.subslice03.research-flow`. O início de build agora depende de extrator presente, construção necessária e nenhum build em curso; o retorno building/unavailable não é tratado como prova de novo disparo.

## Identidades atuais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| body.md | 17113 | `f6dce8d080ff5bdd3a5409bd16b846c176c8270135eb51a6cd0329413e3d0994` |
| evidence.md | 11457 | `b7d51d3bab6f9d8538d6b6362953647eedfbc5fad905c69b5d3fd38b0ea75022` |
| apply.py | 19851 | `3404af9b477c4d07b170d03f7068d4152b2bd4cb76c607cf1a0f24320bd67bf8` |
| procedure-freeze.json | 15402 | `b2b63dbbe1ac9cfdeb619ba074d2e8b8abc809b00bf13a72aea7f6235e746356` |

O procedimento foi persistido e congelado antes da execução. O delta literal inclui offsets, hashes dos trechos e comprovação de prefixos/sufixos inalterados. `history/v1/` conserva body/evidence/manifest/response exatos; request, dispatch e receitas antigos permanecem intocados.

## Proveniência e limitações

Há 28 inputs integrais únicos: 17 herdados e 11 novos, incluindo aliases históricos dos quatro outputs antigos, controles da correção, dispatch, preservação, script e freeze. Leituras mecânicas foram incluídas; nenhum output corrente é auto-input. E3 do evidence permanece como registro literal de v1; contagens e hashes atuais estão nos registros de v2.

Verificação determinística do produtor concluída. A verificação independente da principal e a reavaliação dos mesmos juízes continuam pendentes. Não há PASS semântico autoemitido, produção/liberação L3/L4, raw source, oracle, parecer integral, rede, outro agente, teste de produto, runtime ou consumidor. Tentativas físicas, tokens e custo não expostos: UNKNOWN.

Este response foi preservado também em `revisions/v2/response.md`. Os hashes finais dos manifestos e deste response serão comunicados externamente, evitando autorreferência.
