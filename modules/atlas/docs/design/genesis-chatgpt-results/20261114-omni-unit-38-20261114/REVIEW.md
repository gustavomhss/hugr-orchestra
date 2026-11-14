# GENESIS / OMNI — revisão documental da posição 38

**Status: PARTIAL — revisão técnica consultiva concluída; julgamento dual J1/J2 e aceite formal não disponíveis.**

## Identidade e escopo

- Repositório: `gustavomhss/hugr-orchestra`
- Branch: `genesis-omni-unit-38-20261114`
- Base da branch: HEAD reconciliado da `genesis-omni-review-5-20261114`, `75df3f4ad95e33829442e3be5f223f16d3c4e7ba`
- Snapshot da partição: `343d056ffef7f4a0052da8e2e55559c95169f462`
- Baseline de fontes: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Corpo: `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-10.json`
- Body blob SHA: `8000364589af4cb55c73fc8de693771ffd065549`
- Contagem real: **16 registros**, não 15.

## Reconciliação de ownership e não duplicação

A reconciliação publicada em `b3fe7f8e46791ed7cbcd841e2bf3ae99b7c4b62d` registra a faixa 32–38 sob S5 e identifica o HEAD da branch `genesis-omni-review-5-20261114` como `75df3f4ad95e33829442e3be5f223f16d3c4e7ba`. O handoff mais recente desse HEAD, `HANDOFF-RODADA-2-20261114.md` (blob `8256f1b2e48c47aa340688c3ce1b5c6458defbeb`), conclui apenas as verificações documentais das posições 34–35; diz que 36–38 continuam não revistas e recomenda verificar ownership antes de continuar. O handoff anterior preservado também registra 32–33 como verificações preliminares, sem aceite dual.

A posição 38 não tinha parecer publicado no handoff S5 consultado nem no relatório de reconciliação. A solicitação explícita desta tarefa cria uma unidade documental separada para somente a posição 38. Isso não altera a reserva nem os artefatos da S5; posições 32–37 e a autoridade privada de autores/courier/juízes permanecem fora deste escopo. Não foi inferida inatividade de ninguém a partir de silêncio no Git. A branch dedicada não existia na busca de branches antes de sua criação.

## Integridade de corpo e fontes

- O corpo foi lido do checkpoint externo `genesis-external-omni-393` no HEAD `bdfebdb9fe6b5f2a921aef207cebe33b65cd6d20`.
- Os 16 caminhos-fonte foram recuperados no baseline imutável.
- **16/16 Git blob SHAs** retornados pelo GitHub coincidem exatamente com os campos `git_blob_sha` do corpo.
- Todos os trechos de evidência citados pelos 16 registros foram encontrados nos respectivos bytes textuais retornados para os blobs fixados.
- As contagens `line_count` declaradas são consistentes com a convenção de linhas sem contar a linha vazia terminal; a representação retornada pelo fetch inclui a quebra de linha final.
- Não foram alterados corpo, fontes ou checkpoint.

## Parecer técnico

O corpo descreve o harness QA de Omni (principalmente implementação Rust, fixtures, workloads e projeto Vite), com 16 registros cobrindo:

1. `agent.rs`: ciclo QA-E, concorrência em chunks, cancelamento determinístico, scratch projects e limites de entrada confiável.
2. `arm.rs`: abstração Omni/std, pipe/PTY, normalização de resultados e operações de processo.
3. `arm/seen.rs`: filtragem incremental de escapes e cursor de consumo; corretamente limita a semântica a stripper, sem alegar terminal emulator, e registra crescimento sem limite.
4. `ask.rs`: protocolo de pergunta/resposta ao oracle, timeout de 90 s e retenção possível de entradas pendentes no mapa de espera após timeout.
5. `misbehave.rs`: workloads adversariais QA-D, limites internos e bound externo, com a ressalva sobre Git síncrono.
6. `mod.rs`: hosts de workload, identidade de task, limites, K1 posterior e abort; registra que corpo pode continuar enquanto a observação do oracle ocorre.
7. `perf.rs`: K4/K6, thread de medição e soak; limita corretamente a ausência de join/cancel explícito da thread de medição após timeout.
8. `stdlib.rs`: braço de comparação root-only, sem atribuir ao std garantias de árvore ou PTY; registra leitura truncada/ausente em erro e armazenamento sem limite.
9. `suites.rs`: suite real e dev server Vite, com bound e retenção do processo até inspeção K1.
10. `term.rs`: interação de shells/REPL via PTY, limites por passo/tarefa e skips de executáveis ausentes.
11. `setup.rs`: dimensionamento e serialização de ambiente; distingue constantes declaradas de amostras realmente executadas.
12. `vite/README.md`: orientação do fixture e atualização conjunta de manifest/lock; a afirmação sobre ausência de workflow é qualificada como afirmação documental, não como inventário CI independente.
13. `vite/package-lock.json`: grafo npm pinado; não extrapola leitura do lock para auditoria de implementação, instalação ou supply chain.
14. `vite/package.json`: projeto privado ESM e dependência Vite, sem alegar que manifest prova startup.
15. `workloads/agent.json`: plano QA-E compartilhado, concorrência, timeout e ciclo de comandos.
16. `workloads/shells.json`: seis scripts interativos, marcadores anti-echo, sequências de interação e pré-requisitos externos.

Os campos de propósito, comportamento, dependências, contratos e limitações são, nos trechos amostrados, compatíveis com os bytes-fonte e com a evidência localizada. O corpo mantém separação entre intenção/cenário declarado e resultado observado: os registros indicam `runtime_status: NOT_RUN`; este parecer não converte isso em prova de execução.

### Pontos de atenção preservados (não são findings novos)

- O harness pressupõe entradas de workload confiáveis em alguns caminhos: lista de comandos vazia e divisores de cancelamento inválidos podem levar a divisão/modulo por zero. O corpo explicita o limite; não há base nesta revisão documental para declarar que a configuração fixa atual o aciona.
- Timeout do oracle pode deixar sender no mapa de espera até uma resposta posterior; isso é limitação de lifetime explicitamente registrada.
- `Seen` mantém texto acumulado e não é parser/emulador de terminal.
- O host de tasks pode observar timeout enquanto o corpo ainda está sendo abortado; a ordenação está descrita como comportamento/limite, não como prova de cleanup bem-sucedido.
- O lock Vite não foi tratado como auditoria de dependências, nem a frase do README sobre workflows como verificação independente de CI.

**Conclusão consultiva:** não identifiquei contradição material entre os 16 registros e os trechos-fonte fixados que foram conferidos. A integridade de identidade e os excertos de evidência passaram nesta verificação documental. Isso é um parecer do principal, não um PASS formal nem aceite L1.

## Limites do protocolo

O `SKILL.md` e `references/judging.md` exigem dois juízes persistentes independentes, handles reais, pacote exato com corpo/evidências/oracle, decisões por critério e reavaliação pelo mesmo par após correção. A superfície autorizada nesta tarefa é Chat + GitHub MCP; ela não expõe criação/follow-up desses subagentes nem os handles privados. Não substituí o par por mim, não criei terceiro voto e não aleguei dual acceptance. O estado privado dos juízes/courier permanece UNKNOWN.

Não foram executados testes, CI, workflows, shell, Codex ou Work. Não houve PR, merge, alteração de outras branches, nem escrita em corpo/fonte/checkpoint.

## Próximo passo

O owner/courier deve reconciliar a atividade e os handles reais do par J1/J2 e encaminhar a ambos o pacote exato desta posição (corpo integral, 16 fontes/trechos decisivos, critérios/oracle e hashes independentes). Só decisões originais vinculadas a este body blob podem elevar o estado para dual-accepted; qualquer correção exige versão/delta preservando o original e reavaliação pelo mesmo par.
