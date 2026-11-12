# Final staging: suporte concluído

Entregues `assembly-tools/stage_final_native.py` e `assembly-tools/final_staging.md`. O utilitário planeja ou sela os arquivos finais, sem executar runtime. A principal deve rodá-lo novamente após concluir os 13 artefatos, seus manifests aceitos e raízes.

A inspeção real somente leitura terminou com código **0**, sem erros de referência nem novas capturas públicas necessárias para o pacote observado. Foram resolvidos **1315 arquivos** e conferidos/preservados **641 originais**. Pacote auditado: `32b6cba13b3f4c5c6bb3e068ddda2c2aa41fcacab7883da51ee6255f07ce0270`; seis artefatos existentes e seis supported (L1/L2). O pacote ainda não contém L3/L4/entry; os resultados não antecipam as futuras referências. A primeira tentativa de inventário foi preservada; a segunda corrigiu a resolução contextual dos envelopes de captura e fechou sem erros.

A forma final de raiz exigida para a decisão da principal é `{"entry":"s2.l4.entry"}`; a utility não a escreve. Verifica o artefato entry real e alcance dos 13 nomes por navigation/build, predecessores ordenados e referências de decisão. Com roots vazio, a condição final permanece aberta.

O plano atual registra o comando prepare exato, seus caminhos de saída/log/recibo e hashes de implementação, mas é um inventário de um pacote incompleto. Deve ser regenerado para o SHA final. O CLI cria/escreve CAS antes de tentar a saída exclusiva; falhas tardias podem deixar CAS. O recibo de execução permanece template NOT_RUN com campos observados nulos.

Permanece `HOLD_KNOWN_R1_INPUT_LIMIT`: schema/tui.json (1131057 bytes), árvore app-session (369462) e árvore design-tui (390775) excedem 256000 bytes. Todos são preservados; nenhum cap ou runtime foi alterado. Não houve staging, prepare, criação de CAS, testes, escrita remota, mudança de autoridade ou alteração de autor/review/oracle.

## Evidência

- Inventário/fechamento: `final-staging-inspection-02/inventory/staging-plan.json`.
- Comando real de inspeção, stdout/stderr e saída: `final-staging-inspection-02/command.json`, `stdout`, `stderr`.
- Pedido planejado: `final-staging-inspection-02/inventory/prepare-request.json`.
- Recibo vazio para futura operação: `final-staging-inspection-02/prepare-execution-receipt-template.json`.
- Texto recebido: `final-staging-request.md`.
- Utility auditada SHA256: `7444339116752f208b0043c99e0b6ee52d3a13bf90ccc6887bc993c3dc46d2d8`.

A execução `--apply` está implementada, mas não foi exercida, por instrução. A principal verificará o staging concreto quando os arquivos finais existirem. Não foram criados testes que espelhem a implementação.
