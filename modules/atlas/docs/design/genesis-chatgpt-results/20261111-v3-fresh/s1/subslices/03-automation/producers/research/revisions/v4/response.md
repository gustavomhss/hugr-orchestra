# Resposta original — correção L1 research v4

Concluída a correção documental de ROOT-R-L1-F01 por uma substituição literal única na linha 225 de R8.1. O texto conserva a condição `missing && !building && ctx.extract`, inclui falta e stale, distingue building/unavailable do disparo efetivo e registra a saída antecipada sem shards. Nenhuma outra frase foi alterada.

Pedido, receita prévia, dispatch literal e achados públicos permanecem preservados. O procedimento real `apply.py` foi gravado e congelado por `procedure-freeze.json` antes de uma execução. A cópia integral v3 foi comparada antes de escrever v4. A receita v3 e sua extensão de inputs continuam históricas e inalteradas. Nenhuma receita posterior foi apresentada como anterior.

## Identidades

| Objeto | Bytes | SHA-256 |
| --- | ---: | --- |
| V3 preservada em `history/body.md` | 63841 | `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f` |
| V4 corrente em `../../body.md` | 64106 | `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1` |
| Procedimento prévio `apply.py` | 17467 | `5bfdf994e961bdac05212b2a981aa8f50fcdf60bd5d440988fca5247e4bab89b` |
| Freeze anterior à execução | 5148 | `6cd8fcb3642f22bf1f6831047db7e4ecc7b4e782c1681ccec4e400f798858a48` |

Blob Git da v4: `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`. `delta.json` registra literais, offsets UTF-8, prefixo/sufixo e inversão exata; `delta.patch` conserva o diff independente. `review-supplement.md` contém o delta e as linhas 176–225 de query.ts, sem decisões ou opiniões de juízes.

## Inputs e preservação

A extensão declara dez unidades integrais realmente consumidas: os cinco inputs da receita, pedido, receita, dispatch, procedimento e freeze. A unidade body-v3 possui o alias preservado; a v4 não é seu próprio input. query.ts foi relido integralmente; as demais 129 capturas não foram reabertas. A extensão v3 e seu vínculo ao inventário histórico v2 são retidos sem transformar referências históricas em novas leituras. Leituras de outputs para verificação são verificações de outputs, não dependências retroativas.

O bootstrap inicial falhou na análise sintática antes de qualquer instrução ou escrita. O incidente consta do freeze. A gravação corrigida produziu e congelou o procedimento antes de sua execução única. A ordem efetiva está em `producer-verification.json`. As verificações locais abrangem preservação, hashes, fonte fixada, diff e inversão; não são testes de produto nem aceite semântico.

## Limites

Nenhuma rede, publicação, alteração de produto, teste de produto, delegação ou L2–L4. Nenhum oracle, juiz, descendente ou novo material fora do conjunto autorizado foi lido. Tokens, tentativas físicas de modelo e custo permanecem UNKNOWN por não estarem expostos. O mesmo par deve reavaliar esta revisão; a entrega não emite PASS nem libera camada posterior.
