**WP-MAINTENANCE-DRIVER entregue para revisão estática.** O script completo está em [maintenance-operation.mjs](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/maintenance-operation.mjs): **22.051 bytes, 317 linhas**, SHA-256 `a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f`.

A composição usa as portas existentes para rederivar o target, validar o binding, preservar as decisões literais no CAS e chamar `rebuildOwnershipUpdate`. O registry cobre todas as entries; `run` importa somente outputs nativos aceitos para a captura e as dependências exatas; `evaluate` só retorna as duas reviews correspondentes ao envelope do target. O modo `rebuild` permanece privado. O modo `publish` valida todas as entries, confere o baseline publicado e passa pelo grounding, check e handler nativos.

Conferi o retorno do handler real. O driver preserva `emission` integral e exige simultaneamente `ok:true` e `data.emitted:true`. Recusa de emissão permanece HOLD mesmo que o manifesto desejado já exista. O readback posterior informa a correspondência observada, separado de `manifest_changed` e do boolean real `emitted`.

**Verificação realizada:** `node --check`, exit code 0, sem avaliar imports ou executar o corpo. Runtime, testes, build, typecheck, guards de produto, publicação e controles sintéticos permanecem **NOT_RUN**. Campos de modelo e tokens não expostos permanecem **UNKNOWN**. Não houve leitura de corpos L2 em produção, oracles reservados ou pareceres, nem edição do produto.

Arquivos de apoio:

- [usage.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/usage.md) — seis argumentos, pré-condições, saídas, efeitos e limites.
- [static-review.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/static-review.md) — observações limitadas à composição e ao parser, sem veredicto independente.
- [source-observations.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/source-observations.json) — bytes, hashes, localizações e limites das fontes consultadas.
- [request.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/request.md) — pedido original preservado; os dois adendos estão no mesmo diretório.
- [hash-receipt.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/hash-receipt.json) — identidade dos entregáveis e registro da checagem estática.
- [manifest.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/maintenance-driver/review-packets/manifest.json) — pacote literal de revisão, com partes de até 32.000 bytes, incluindo o script integral, relatório estático e trechos decisivos das portas. **Nenhuma parte foi enviada aos juízes.**

Para a execução posterior, o driver precisa estar vinculado como input de todas as entries antes da primeira publicação. Baseline e target precisam preservar estrutura e ordem dos bindings; inputs `members:` e mudanças de topologia são recusados. As reobservações continuam reais, sem promessa de lock global. A publicação conserva os efeitos e as recusas do runtime, inclusive seus registros nativos; o driver não cria logs próprios fora do CAS. Esses limites estão detalhados no usage.
