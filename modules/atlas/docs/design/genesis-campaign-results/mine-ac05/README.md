# Mine AC-05

Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`, branch base `genesis-economy-green`. Destino: `mine-ac05`.

Este diretório contém **seis registros**, um por caso pedido. São corpos existentes minerados e ligados ao mecanismo e ao aceite histórico; não são seis execuções novas. RP-5 e RB-08 são compartilhados entre registros, com essa reutilização explícita. Nenhum aceite global é emitido.

| Registro | Corpo principal | O que a evidência permite registrar |
| --- | --- | --- |
| AC05-1 | RB-01 / RB-19 | Retorno inalterado e receita sem chamadas na fixture; avaliação separada e cache durável de produção não demonstrados. |
| AC05-2 | RB-06 / RP-5 | Identidades independentes preservadas, receita limitada a a/m e aceite delimitado de leitura em escopo independente. |
| AC05-3 | RP-5 / RB-12 | Autoridade diferente com a mesma prosa muda o resultado, recusa binding antigo e propaga no executor. Aceite histórico explícito de autoridade. |
| AC05-4 | RP-5 / RB-08 | Recibo do pai muda; resultado e dependentes podem permanecer iguais. Zero downstream não significa zero no rebuild inteiro. |
| AC05-5 | RB-09 / RB-10 | Resultado validado igual interrompe propagação; alteração própria do filho ainda exige execução. |
| AC05-6 | RB-02 / UP-8 / RB-15 | Dependências de construção propagam; navegação não cria aresta; required omitida é recusada. |

Cada `*.case.json` contém o `path:blob` lido nesse SHA, linhas, trechos exatos, mecanismo, crédito histórico, contraexemplo e prova que falta. `mine.json` contém proveniência, contagem, limites e os dois runs históricos conferidos.

## Correção do enquadramento

O mapa anterior já preserva crédito mecânico parcial; não é correto dizer que ele apagou todos os controles. Também não cabe transformar sua lista de obrigações completas abertas em ausência de corpos mineráveis.

Receitas determinísticas que transformam entradas e exercitam o executor são admitidas pelo contrato F1 §2.5. Seus reviews sintéticos não provam cache hit de produção, mas não anulam as propriedades mecânicas verificadas. O caso estreito de autoridade tem aceite histórico explícito; outras variantes não são adicionadas a esta fatia.

`affected` é o conjunto conservador. `calls` é a lista de receitas executadas. RB-01 deixa de contar avaliações separadamente; RB-19 cria um store em memória e o repovoa com o baseline. Esses limites impedem promover tais controles a uma retomada durável de produção ou a zero interpretação medido em todas as rotas.

## Vinculação histórica

O run [42135009305](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42135009305) terminou com sucesso no head `0f21e6a20e9e57bf6d65d9b8e1438839f290968e`. O corpo de `ownership-update.test.ts` tem o mesmo blob no head histórico e no pin.

O run [42684897357](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42684897357) terminou com sucesso no head `c67e97cf78b266d36cecd6a4b1e6b6b65639795b`. O executor tem o mesmo blob. O arquivo de testes tem uma diferença na linha 417, em RB-14; a fixture e os corpos aqui minerados permanecem iguais. Nenhum desses runs executou o pin deste mine.

Os hashes de decisões, relatórios, contratos e corpos estão no índice e em cada caso. Não houve teste local, corrida de CI nova ou chamada aos producers/evaluators externos do repositório. Não se infere custo monetário a partir das chamadas desta sessão.

AC-03 não é reaberto. Old-producer permanece `INDETERMINATE`. Não há ordem de versão inferida, sidecar untrusted servido, PR, merge, ativação ou publicação de conhecimento.
