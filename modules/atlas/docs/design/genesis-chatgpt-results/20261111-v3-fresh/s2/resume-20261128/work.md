# S2 Interfaces — retomada 2026-11-28

Estado: IN_PROGRESS. Esta execução retoma as obrigações operacionais da S2; não constitui entrega completa.

## Identidade

- execution_id: `846d4f9c-fb77-4e21-aff6-1fffccc3132b` (UUID local; não é ID de conversa).
- Branch exclusiva: `genesis-interfaces-resume`.
- HEAD inicial observado: `bb2a931301d541692b11e5a7f1eab234cd9ed2fd`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- O HEAD inicial é um commit à frente de `d1e635ed5e316b8d5d59650432268e3e81d8aff0`; o único arquivo acrescentado é o briefing S2-INTERFACES.md.
- Escopo: namespace S2, estado de execução isolado; integração global e ativação permanecem com ROOT/Gustavo.

## Fila finita

| ID | Trabalho | Estado | Critério de encerramento |
|---|---|---|---|
| S2-R01 | Recuperar original r4 por identidade | RUNNING | Busca registrada; recibo/candidato conferidos ou lacuna delimitada |
| S2-R02 | Verificar bytes do pacote e insumos congelados | RUNNING | 13 corpos/manifests vinculados; hash do pacote e dos casos conferido |
| S2-R03 | Fixar release S4 e superfície executável | RUNNING | Release/candidato/capacidades/recibos compatíveis fixados por SHA |
| S2-R04 | Prepare novo se necessário | PENDING | Execução distinta, entradas exatas, argv/stdout/stderr/candidato/CAS e recibo próprios |
| S2-R05 | Binding independente e publicação isolada | PENDING | Par novo julga transformação exata; autoridade e publicação verificadas |
| S2-R06 | Primeira travessia Atlas e consumidor fresco | PENDING | index/read reais, versões e limites, caso congelado e par de avaliações |
| S2-R07 | Completar 14 casos S2-C/S2-I | PENDING | Todos executados em contextos sem fonte/oracle, traces e duas decisões |
| S2-R08 | S2-U1 e manutenção/recuperação pertinente | PENDING | Mutação/invalidação/restauração/reúso/chamadas medidos; controles compatíveis vinculados |
| S2-R09 | Gates, revisão e selagem | PENDING | Recibos verdadeiros, dois pareceres pertinentes, payload e handoff relidos no GitHub |

## Regras desta execução

Preservar os 13 artefatos aceitos, pacote, perguntas, oracle e registros históricos. O resumo r4 derivado não é recibo integral nem binding. Reexecução autorizada pela missão atual é uma nova execução e não recupera a anterior. Não executar testes de produto localmente; GitHub Actions continua a rota. Não usar credenciais do dono, máquina do dono, `gh`, fontes privadas indisponíveis, bypass de gates ou publicação de material interno. O sandbox contém ferramentas de inspeção, mas não foi observado checkout nem Bun no PATH. A rota executável ainda está sendo investigada.

## Trabalho delegado e uso

- `/root/s2_custody_search`: busca histórica somente leitura.
- `/root/s4_compatibility`: release, comandos e superfície de execução, somente leitura.
- `/root/s2_byte_audit`: conferência determinística de bytes públicos, sem execução de produto.

Tokens, tentativas físicas do provedor e cobrança: UNKNOWN. Histórico: GLOBAL_UNRECONCILED. Nenhum despacho é contabilizado como consumidor ou juiz. O par de juízes novo será criado com contexto limpo para o primeiro pacote julgável. Não há novo parecer, prepare, binding, publish, index/read ou caso executado neste checkpoint.
