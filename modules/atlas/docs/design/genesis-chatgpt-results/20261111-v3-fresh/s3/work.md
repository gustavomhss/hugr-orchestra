# S3 — Maestro, Relay, especialistas e integrações

Estado: IN_PROGRESS. Execução local `bdac971f-e4ee-40e5-ad9b-30d659303bab` (UUID, não ID de conversa).

- Sessão: S3; modo fresh_chat; history_required=false.
- Branch exclusiva: genesis-fresh-s3; escritora remota única: orquestradora.
- Fonte: 1cde2ff7a71bcf7aecb5d030917b577165135d38.
- Protocolo: parallel-v3-fresh, ee2521a5b966bd505cc95bd1c733e09e12f33531; resultados 20261111-v3-fresh.
- HEAD de início observado: d2d985c28947c7f984a36b07ad34ede3d4d2d6b4; pai direto do HEAD é o protocolo.
- Comparação baseline→HEAD: somente 35 arquivos do kit; produto inalterado. work.md ausente (404) no HEAD inicial.
- População: 4553 entradas únicas, paths SHA256 6ca1aca1f8a1da4bf4061c67f06f983f0b676e6d90a7f2af945cb57a7f76c4f1, records SHA256 f9130f5eaa900907cefacb284974dabfeb22970e1e391f5eb0a567175e9f46c2. Travessia de subárvores pelo conector, sem truncamento.
- Áreas isoladas: genesis-s3/{sources,agents,candidate,corpus,cas,store,projection,out}; nenhuma escrita em área de outra sessão.
- Subagentes nativos e shell disponíveis. GitHub somente pelo conector. Tokens/cobrança/tentativas físicas não expostos: UNKNOWN.

## Fila finita

| Unidade | Necessidade / output | Dependência | Estado |
| --- | --- | --- | --- |
| L1-A | Base factual Maestro, coordenação e suas specs/guides; fontes e limites | Fonte fixa | PENDING |
| L1-B | Base factual Relay e famílias de golden/fixtures; contratos de teste | Fonte fixa | PENDING |
| L1-C | Base factual especialistas, adapters, assets, Dock, janitor, discovery e specs | Fonte fixa | PENDING |
| L1-UNION | Classificação de todas as 4553 entradas e reconciliação de necessidades | L1-A/B/C | PENDING |
| L2 | Entendimento local dos três grupos, comportamento e contratos | L1 completo aceito pelos dois | PENDING |
| L3 | Fluxos, autoridade, impacto entre componentes e independência | L2 completo aceito pelos dois | PENDING |
| L4 | Ownership/manutenção operacional, diagnóstico e orientação executável | L3 completo aceito pelos dois | PENDING |
| REVIEW | Dois juízes persistentes novos; correções e reavaliações de cada camada | Primeiro pacote julgável | PENDING |
| CONSUME | Importação/casos próprios por ownership.index/read e consumidor independente | Runtime S4 exato e pacote aceito | PENDING |
| UPDATE | Mudança própria, afetados e preservação de independentes | Runtime S4 compatível | PENDING |
| VERIFY | Gates atribuídos, accounting, critérios e handoff selado confirmado | Demais obrigações | PENDING |

Cada unidade herda GO-A1..7, GO-I1..8, QS1..6, CC1..7, SC1..5 e DoD1..7. Oracle é congelado e hasheado antes de cada produtor; respostas reservadas ficam fora dele. L1→L4 libera somente camada local completa aceita. Parecer semântico não é binding runtime. Produto não é alterado sem necessidade demonstrada.

## Limites atuais e obrigações

Nenhum consumidor, gate de CI ou publicação Atlas foi executado até este registro. Testes do produto seguem AGENTS.md (GitHub Actions); não executar bun test local nem contornar guardas. Descobrir e usar runtime-release.json de S4 quando necessário. Integração global pertence a ROOT; não absorve pendências locais. Histórico 20261111-v1 permanece UNRECONCILED_BY_ROOT, sem custo/reservas zerados.

Este registro inicial não é handoff final nem DELIVERY_COMPLETE. Continuar toda a fila.
