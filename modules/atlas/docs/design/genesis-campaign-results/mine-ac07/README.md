# AC-07 — mineração dos seis resíduos

Pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38` · branch de saída: `mine-ac07`.

**Seis casos minerados; nenhum novo cenário de produto executado.**
Cada arquivo congela antecedente, payload, ponto de falha/observação, oráculo, controles
propostos e evidência `path:blob` lida no pin. `INDETERMINATE` identifica o aceite
residual: não é red observado nem ausência de toda evidência mecânica.

| Caso | Arquivo | O que a mineração acrescenta |
| --- | --- | --- |
| AC07-M01 | [01-generation-activation.case.json](01-generation-activation.case.json) | Interrupção depois do candidato completo no CAS e antes do emit; reader separado não vê candidato privado nem incumbent stale. |
| AC07-M02 | [02-resume-durable-work.case.json](02-resume-durable-work.case.json) | Trabalho novo de z concluído, interrupção em a e reentrada com M0; dedução de repetição de z no caminho baseline-only. |
| AC07-M03 | [03-concurrent-reader.case.json](03-concurrent-reader.case.json) | Leitura em outro processo dentro do intervalo da ativação, com janela observada e limites do harness explícitos. |
| AC07-M04 | [04-failed-rebuild.case.json](04-failed-rebuild.case.json) | Drift mantido, resultado do predecessor alterado, avaliação do dependente recusada e reader/index ainda em HOLD após reopen. |
| AC07-M05 | [05-source-compatible-rollback.case.json](05-source-compatible-rollback.case.json) | A → B publicado → tentativa do mesmo manifesto A → restauração exata de A, sempre pela porta governada. |
| AC07-M06 | [06-labelled-history.case.json](06-labelled-history.case.json) | Conserva os dois resultados históricos reportados; distingue rótulo histórico, seleção governada e aceite nominal ainda ausente. |

## Erros do enquadramento

1. Candidato completo no CAS e publicação/reopen bem-sucedido não observam a falha entre
   geração e ativação. O executor atual não publica.
2. RB-19 usa outro `createStore()` em memória e reseed do baseline sem drift. Não recupera
   conclusões novas de um processo interrompido. O executor reinicia seus mapas a partir do
   manifest fornecido; dedup de puts não elimina chamadas anteriores.
3. Segundo store depois de settled não prova reader concorrente. Predecessor parseável
   é uma propriedade física; currentness ainda depende dos inputs, contratos e resultados
   requeridos. Uma resposta HOLD permitida também impede prometer que qualquer corrupção
   ou escrita in-place necessariamente reprovará o oráculo.
4. O teste anterior segue drift → HOLD → receipt renovado e publicado → candidato recusado
   → ready. O ready é do incumbent já renovado; não demonstra o rebuild falho que deixou
   somente a publicação stale.
5. Recusa de identity schema estrangeiro não substitui compatibilidade com source bindings.
   Rollback usa igualdade com a fonte atual, sem ordenar hashes ou supor semântica de versões.
6. A ausência de aceite nominal da leitura histórica não apaga execução arquivada. A flag
   `historical:true` não seleciona qualquer geração nem pula provenance, reviews ou integridade.

Os fatos e seus limites estão citados dentro de cada caso e em
[sources.json](sources.json). A correção do roteiro exige mudança do **resultado** de
z/base para atingir a barreira/recusa do dependente; mudança só dos bytes pode legitimamente
parar a propagação.

## Disposições preservadas

- G3-01 e G3-02 continuam `CONFERE`; G3-03 continua `NÃO CONFERE` histórico.
  Nenhum foi rejulgado. Fonte:
  `modules/atlas/docs/design/genesis-campaign-results/g3-disposition-v1.json:76576a4e6bffa28d6d3bd4f0e1b566da1c7de2ea`.
- A redação atual separa foreign identity e untrusted. Preservar os bytes não autoriza
  servi-los. Fonte:
  `modules/atlas/docs/design/genesis-g3-recovery-contract.md:508998c46060ffcd5eaeecdec6b068155c2b4999`.
- O mapa anterior conserva 1 COVERED de publication/reopen e 6 UNCOVERED; esse primeiro
  caso não entra novamente na contagem. Fonte:
  `modules/atlas/docs/design/genesis-campaign-results/ac07-recovery-map-v1.json:e18f6a780f95725892154551828fb6b5727d7b07`.
- AC-03 permanece fora da fatia; old-producer permanece `INDETERMINATE`.

## Execução e evidência histórica

Três subagentes fizeram leituras paralelas; o coordenador consolidou, verificou os blobs
e corrigiu os roteiros com revisão cruzada. Nenhum teste local, novo CI, produtor Atlas
ou juiz externo foi disparado. Não se declara custo zero: a medição monetária da
inferência de ChatGPT/subagentes não está exposta.

O caso M06 cita o [run histórico 42135009305](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42135009305),
head `0f21e6a20e9e57bf6d65d9b8e1438839f290968e`. O manifesto, o relatório por caso e os
metadados desse run foram lidos. Os dois testes têm o mesmo blob/texto no head histórico
e no pin desta fatia; isso não demonstra equivalência de toda a implementação nem execução
no pin atual. Os controles adicionais, inclusive historical sob provenance recusada,
permanecem propostas não executadas.

[receipt.json](receipt.json) registra método, revisão, contagem, limites e uso conhecido.
Não há implementação de mecanismo, alteração de G3, instalação, PR ou aceite global neste pacote.
