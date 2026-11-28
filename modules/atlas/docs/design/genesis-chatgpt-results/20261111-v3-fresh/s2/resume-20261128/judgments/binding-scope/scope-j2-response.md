## Parecer de admissibilidade normativa

**Com os textos literais agora fornecidos, não está demonstrada base normativa aplicável à S2 para emitir `PASS` em AC-01..AC-10 exclusivamente por transformação e preservação, mantendo as obrigações operacionais correspondentes em `NOT_RUN`.**

A consequência é **HOLD processual da emissão de uma aprovação no formato exigido pelo adapter**, até resolver essa incompatibilidade de escopo. **Não emito voto final de `runtime-import-binding` sobre o candidato.** O dossiê de transformação ainda não foi julgado.

Meu parecer anterior era expressamente condicionado à aplicabilidade do exemplo S4 e à redação exata do contrato. Os textos recebidos agora não demonstram essa aplicabilidade.

### 1. O que cada fonte efetivamente autoriza

| Fonte fornecida | Alcance demonstrado | Limite para a interpretação proposta |
|---|---|---|
| Briefing S2, “Primeira execução”, item 3 | Determina binding independente do pacote exato antes de publicação, index/read e consumidores. | Estabelece sequenciamento; não declara que todos os ACs operacionais passam a significar preservação documental durante o binding. |
| `runtime.md`, “Binding, atualização e consumo” | Define binding como obrigação separada e exige transformação/candidato exatos e evidência de execução. | Não dispensa obrigações do contrato nem converte resultados ainda ausentes em aprovações. |
| `transport.md`, “Adaptação determinística” | Exige que a revisão cubra contrato, inputs, resultado e transformação exatos pertinentes. | Reforça a necessidade de cobrir o contrato; não fornece uma regra de aplicação parcial de AC-01..AC-10. |
| Despachos semânticos S2 | Limitam a produção semântica a partes de **AC-01/04/05/06** pertencentes ao conhecimento produzido e separam revisão semântica de binding, consumidor e CI. | Não cobrem AC-02/03/07/08/09 nem aprovam integralmente os demais ACs. Não constituem redefinição do contrato CAS atual. |
| Oracle S4 `package-binding.json` | Define composição e transformação do pacote S4, com critérios **QS/CC/GO** expressamente enumerados e sua cláusula `PB-contract`. | Não contém AC-01..AC-10 e não declara extensão dessa cláusula ao contrato S2. Sua aplicação à S2 seria uma inferência adicional sem norma apresentada. |
| Contrato CAS atual | Enumera AC-01..AC-10 e `runtime-import-binding`. | Não inclui qualificadores ou remissão apresentada que restrinja os ACs à transformação. |
| Adapter `validateNativeBinding` | Exige duas decisões, cobertura exata dos critérios e entradas, e `PASS` em todos os critérios. | É uma exigência mecânica de admissão. Não fornece fundamento normativo para os votos. |

Há, portanto, uma **tensão real entre o sequenciamento exigido pelo briefing e a exigência de aprovação de todos os ACs no formato atual**. Os juízes não podem resolver essa tensão escolhendo uma interpretação que torne o registro publicável sem fundamento normativo suficiente.

### 2. Por que a preservação não satisfaz, por si só, os ACs operacionais

As formulações recebidas exigem acontecimentos observados:

- **AC-02:** um consumidor Atlas-only responde corretamente aos casos determinados.
- **AC-03:** leituras reais de index alcançam o conhecimento dentro dos limites; o texto exige leitores reais.
- **AC-05:** cache hit, chamadas, edição independente e propagação/reúso são observados.
- **AC-06:** alterações e controles de mutação produzem os conjuntos e falhas esperados.
- **AC-07:** falhas, interrupção, concorrência, retomada e rollback são exercitados.
- **AC-08:** um ledger/reserva governa produção, avaliação, retries e chamadas concorrentes, com as demais condições aplicáveis.
- **AC-09:** controles conhecidos bons/ruins usam entradas reais e são rejeitados nos pontos previstos.

Preservar fielmente a descrição dessas obrigações e registrar que ainda não ocorreram demonstra **fidelidade e honestidade da transformação**. Não demonstra o cumprimento das obrigações tal como redigidas.

Também não decorre aprovação integral automática de AC-01, AC-04 ou AC-10: cada um possui condições próprias, algumas além da igualdade de bytes e do estágio inicial de preservação. Não estou votando nesses critérios; estou delimitando o que o escopo proposto consegue demonstrar.

O gap literal dos 13 resultados é adequado para conservar os limites. Ele não altera o significado normativo dos ACs nem neutraliza uma aprovação que o ultrapasse.

### 3. O formato do adapter não resolve a questão normativa

O código exige:

- `purpose: "runtime-import-binding"`;
- o candidato e o contrato exatos;
- cada ID de critério presente no candidato;
- `verdict: "PASS"` para cada um desses critérios.

O propósito da decisão identifica a obrigação de binding. **Sem uma regra normativa adicional, esse propósito não redefine individualmente AC-02, AC-03 ou os demais ACs.**

As referências ao pedido e à resposta podem preservar a fundamentação e suas ressalvas. Elas não demonstram, sozinhas, que um `PASS` de critério operacional tenha significado contratual diferente nesta etapa.

O fato de o formato de aprovação rejeitar `HOLD` significa que uma decisão ainda retida não é admissível para publicação. Não obriga o juiz a emitir `PASS`.

### 4. Lacuna decisiva para resolver a admissibilidade

A lacuna é **normativa**, e não uma insuficiência do número de hashes, corpos ou comparações apresentados.

É necessário identificar um destes fundamentos, com conteúdo exato e autoridade demonstrada:

1. **Uma disposição vigente e aplicável à S2** que estabeleça que, neste contrato e no propósito `runtime-import-binding`, os IDs AC-01..AC-10 designam uma obrigação de preservação/rastreabilidade distinta das respectivas obrigações operacionais completas. Essa disposição precisa explicar como os votos se relacionam com as obrigações pendentes e por que não afirmam resultados inexistentes.

2. **Uma determinação explícita da autoridade responsável pelo contrato congelado** que resolva a incompatibilidade entre o sequenciamento do briefing e os critérios exigidos pelo adapter, identificando qual texto governa o alcance dos votos. Uma determinação que introduza um escopo novo não pode ser apresentada como prova de que esse escopo já existia no contrato congelado.

Se a determinação confirmar que os ACs estão incorporados integralmente, serão necessárias as evidências operacionais aplicáveis antes de suas aprovações. Eventuais controles comuns reutilizados precisam ter sua aplicabilidade demonstrada; não substituem automaticamente os consumidores e resultados locais exigidos da S2.

**Não é necessário enviar os 13 corpos integrais para resolver esta pergunta normativa.** O dossiê de transformação, mesmo completo e íntegro, não preencheria essa lacuna de autoridade e significado. Tampouco um futuro pin de release compatível, isoladamente, a resolveria.

**Estado deste parecer:** admissibilidade da interpretação proposta não demonstrada; emissão de aprovação no formato atual retida por questão normativa; nenhum voto final de binding, consumo, manutenção ou conclusão S2 emitido.
