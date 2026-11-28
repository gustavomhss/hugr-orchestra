# Pedido de exportação — executor original S3

Exportar os bytes e recibos da execução original, preservando nomes, caminhos e revisões. Não substituir pelo pacote público parcial nem pelos oito corpos da recuperação concorrente.

```text
Execução: bdac971f-e4ee-40e5-ad9b-30d659303bab
Pacote SHA-256: 0f9444211faa6a20ff7d56bd583e784e62b1393708d90c046d2028e95964a400
Candidato: a32c0f65a6126be4ba6fa4c558bd3859598baf64e4bb11401e5dcacc5fe389d4
Runtime: e3a8ab8cf56dbff1ee91272df51ffa398d882aa1
Par histórico: /root/judge_j1 e /root/judge_j2
```

Base conhecida no executor original: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/`.

```text
native-package.json
bodies/l1-maestro.md
bodies/l1-relay.md
bodies/l1-integrations.md
bodies/l2-maestro.md
bodies/l2-relay.md
bodies/l2-integrations.md
bodies/l3-flows.md
bodies/l4-entry.md
bodies/l4-ownership.md
bodies/l4-maintenance.md
bodies/l4-operational.md
judgments/
review-packets/
receipts/
evidence/
execution-ledger.jsonl
```

Incluir manifesto por corpo (key, nível, revisão, SHA-256, bytes e vínculo aos dois pareceres), pedidos/respostas originais J1/J2, findings, correções e reavaliações. Incluir candidato preparado, recibo prepare com argv/CWD/código/pacote/stdout/stderr/exit/observações/readback CAS, decisões de binding e invocação/desfecho da publicação com identidade do estado isolado e eventuais index/read. Incluir também os oracles/receitas/expected sets originais de manutenção M0–M3, se foram fixados, sem reconstituí-los retroativamente como provas.

Os nomes locais do manifesto individual, candidato preparado e recibos operacionais não foram publicados nas fontes consultadas. Preservar seus nomes reais e incluir um mapa caminho original → arquivo exportado. Não criar recibos ausentes nem substituir log integral por resumo.

Material privado permanece na custódia autorizada; para o repositório, exportar apenas o que puder ser compartilhado. O relatório público distingue recibos indisponíveis de operações não executadas.
