# S2 Interfaces — retomada 2026-11-28

Estado: IN_PROGRESS. O prepare novo está comprovado; a travessia completa permanece aberta por dependência do release S4 compatível. `delivery_complete=false`.

## Identidade e resultado

- Execução local: `846d4f9c-fb77-4e21-aff6-1fffccc3132b`; branch `genesis-interfaces-resume`.
- HEAD inicial: `bb2a931301d541692b11e5a7f1eab234cd9ed2fd`. O diff inicial acrescentava somente S2-INTERFACES.md sobre `d1e635ed5e316b8d5d59650432268e3e81d8aff0`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- Pacote: SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`, 332.594 bytes, 13 artefatos L1–L4.
- Código efetivamente executado: `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, sem alterações.
- Corpus: checkout Git real `bb2a931301d541692b11e5a7f1eab234cd9ed2fd`. Nunca se atribuiu ao corpus o HEAD histórico da fonte.
- Prepare novo: exit 0; 13 artefatos; 626 observações; 667 arquivos consumidos sem drift; stderr vazio; 69 objetos CAS.
- Candidate ID novo: `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522`.
- Preparado: 344.738 bytes, SHA-256 `476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a`.
- Comprovação: `prepare-01/receipt.json`, `prepared.json`, `stdout.json`, `stderr.txt` e `integrity.json`; pacote completo de evidência em `prepare-01-evidence.zip`.

## Custódia histórica

`custody-search.json` registra as fontes consultadas, branches, árvores sem truncamento, CI e busca em 3.072 conteúdos da preservação, incluindo ZIPs. Os 1.109 arquivos originais foram conferidos contra os blobs públicos. O preparado r4, o stdout r4 e o recibo integral original continuam não recuperados. O mínimo de exportação original está no relatório, com as identidades fixas.

Esta execução é `NEW_EXECUTION_NOT_RECOVERED_R4`. O candidato histórico `f310ec9b…` e o preparado histórico `a4946200…` permanecem somente reportados pelo resumo derivado. A tentativa antiga falha e os pareceres históricos continuam intactos.

## Fila e limites

| Unidade | Estado atual | Evidência ou condição |
|---|---|---|
| Busca original r4 | Busca concluída; original pendente | custody-search.json |
| Bytes dos 13 e suas fontes | Conferidos | byte-verification-summary.json + relatórios integrais no ZIP |
| Prepare novo db9 | PREPARE_SUCCEEDED; diagnóstico não promovido | prepare-01/receipt.json |
| Release S4 compatível | Ainda não encontrado nos pontos de descoberta | runtime-status.json |
| Binding e publicação isolada | NOT_RUN | Exigem release e decisões novas exatas; nenhuma aprovação histórica foi convertida |
| Primeira travessia index/read/consumidor | NOT_RUN | Exige candidato publicado governadamente |
| 14 casos S2-C/S2-I | 0/14 executados | frozen-cases-status.json; perguntas e limites intactos |
| S2-U1 | NOT_RUN | Oracle intacto; nove alcançáveis são expectativa de grafo, não nove interpretações |
| Revisão desta unidade | PASS dos dois juízes | /root/s2_j1 e /root/s2_j2; custódia/diagnóstico em 8858e56, sem binding nem conclusão S2 |
| Gates S2 e fechamento | Parcial | Guards locais no payload 8858e56: exit 0, 0 gates/erros, 204 avisos; CI de qualificação S4 separado; fechamento operacional aberto |

Os três inputs acima do teto liberado histórico são `schema/tui.json` (1.131.057 bytes), `s2/inputs/app-session-tree.json` (369.462) e `s2/inputs/design-tui-tree.json` (390.775). O novo prepare observou os inputs completos sob o teto de 2 MiB do código db9. O release encontrado ainda anuncia r3/256.000 bytes e a amostra nativa de uma unidade.

## Retomada executável

1. Reler o release S4 nas branches `genesis-runtime-resume` e `genesis-fresh-s4`, fixando commit, bytes, candidato e capacidades. Conferir compatibilidade com os recibos desta execução.
2. Se o candidato/corpus/raiz/bytes continuarem exatos e o release autorizar essa capacidade, preparar o pacote de binding para o par independente. Mudança de qualquer identidade exige prepare/recibo novos. O adapter inclui raiz e HEAD no candidate ID e recalcula no publish.
3. Depois dos dois bindings válidos, configurar somente a política do estado isolado autorizada pela missão atual e executar a CLI original publish → index/read. O arquivo histórico de política S4 não é uma concessão S2.
4. Despachar primeiro consumidor fresco com uma pergunta congelada e somente respostas reais index/read. Preservar versões, chamadas e bytes; julgar com o mesmo par. Completar os 14 casos e depois S2-U1/recuperação/gates.

Comandos reais e análise da rota Actions: `runtime-readiness.md`. Para reproduzir prepare, criar checkouts novos nos dois SHAs acima, `npm ci` e `bun typecheck` em `modules/atlas`, e executar `record-prepare.py` com diretórios exclusivos. O recibo guarda argv/cwd efetivos; diretório diferente pode produzir outro candidate ID. O ZIP preserva CAS como evidência, sem conceder autoridade de projeção ou store servido.

## Contabilidade e isolamento

Sem testes de produto locais, alteração do runtime, modificação dos artefatos aceitos ou dos casos congelados. O prepare escreveu apenas CAS na raiz isolada e saídas fora dela. A conferência pós-execução encontrou 780 comparações coincidentes: candidato/stdout, 69 endereços CAS, 13 corpos/resultados, 626 observações e 40 referências preservadas. Não houve política, binding, publicação, index/read, consumidor ou manutenção.

Uso do provedor, tentativas físicas e cobrança: UNKNOWN; histórico: GLOBAL_UNRECONCILED. As tarefas `/root/s2_custody_search`, `/root/s4_compatibility` e `/root/s2_byte_audit` produziram buscas/verificações; nenhuma conta como consumidor ou juiz. Integração global e ativação permanecem com ROOT/Gustavo.

## Atualização de qualificação e auditoria

A S4 publicou a campanha de qualificação `genesis-runtime-qualification` em `09a4c4afc7aab2f9a153eb059d13df0ecf15595c`. O run `46114652347` terminou com sucesso executando o runtime `db9b423` em checkout separado. O artifact de prepare foi conferido integralmente: ZIP SHA-256 `f1747366c2312c80ff6cd071aea15693ceb14962b3e974f6614ddf450ac14606`, 23/23 membros do índice. O candidato S2 remoto difere do local somente em `repo_root` e `observed_head`; essas diferenças permanecem no ID de cada execução. Todos os demais campos são idênticos. O manifesto S4 lido nesse HEAD ainda é o r3, blob `7513fcca63664ca02094e9ed9b8fab090c20295d`. Ver `runtime-followup/`.

A conferência independente `binding-preflight/independent-mapping-check.json` encontrou 4.752 comparações coincidentes: 13 entries completas, 818 vínculos de input, 626 observações, 40 referências de 67 usos, 32 dependências, 30 navegações e 69 objetos CAS. Ela não é voto de binding nem leitor Atlas. A projeção explícita preserva metadata e relações sem inventar novas interpretações.

O par persistente está examinando a aplicabilidade do contrato de binding. O contrato herdado contém AC-01..AC-10; consumo e manutenção continuam não executados. Nenhuma interpretação do formato será usada para fabricar cumprimento dessas obrigações.

O executor comum de manutenção exige sua própria receita nos inputs e ordem definida dos inputs. A manutenção S2-U1 exigirá uma preparação adicional identificada, sem alterar o pacote congelado ou atribuir sua execução ao candidato 4a36. O oracle continua intacto.

Os guards foram executados também sobre o payload Git já publicado, incluindo o ZIP. Os 204 avisos se dividem em 203 fora desta retomada e um `binary-added` do arquivo de evidência intencional; nenhuma regra foi relaxada. O recibo em `gates/receipt.json` delimita esse resultado local.
