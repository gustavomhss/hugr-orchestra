Auditoria mecânica concluída. A proposta de correção permanece **não aplicada**; nenhum assemble, prepare, consumidor, teste de produto, publicação ou juízo foi executado. Não há declaração de runtime PASS.

## Entregas

- [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/final-mechanical-audit/REPORT.md) — achados, evidências locais, identidades e pendências.
- [proposed.patch](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/final-mechanical-audit/proposed.patch) — correção proposta para o montador e criação de uma ponte v2, preservando integralmente a ponte v1.
- [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/final-mechanical-audit/response.md) e [FINAL.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/final-mechanical-audit/FINAL.md) — capturas idênticas desta resposta original.

## Achados concretos

1. **Bloqueio de canonicalização:** os quatro manifests derivados disponíveis usam `inputs/mission.json`, enquanto o mapa compartilhado registra outro `capture_archive`. O montador atual recusa esse caminho. Os bytes inteiros coincidem: 6.006 bytes, SHA-256 `32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75`. O patch resolve o alias por identidade completa e origem única, mantendo o caminho de autoridade original.
2. **Perda de evidências em timeout da ponte:** `subprocess.run(timeout=60)` pode lançar antes de persistir streams e recibo. A ponte v2 proposta registra a ocorrência verdadeira, `exit_code: null`, saídas parciais e estado de resposta incompleta; preserva bytes mesmo se o timeout interromper UTF-8. Não fabrica resposta Atlas nem altera perguntas ou quotas. A v1 permanece intacta e nunca foi executada por esta auditoria.
3. **Referência opaca ausente da conferência final de snapshot:** `contract.oracle_ref` não entra na comparação de identidades com o mesmo P publicado. A proposta a inclui nessa conferência mecânica. O conteúdo reservado não foi aberto, e nenhum desvio de bytes foi presumido.

## Verificado e pendente

Foram conferidos **646 inputs L1**, **196 inputs dos quatro manifests derivados disponíveis** e **399 arquivos capturados do runtime**, sem divergência de tamanho, SHA-256 ou Git blob nas verificações realizadas. O alias de support continua apontando para **boundaries v2**, retido em `producers/boundaries/revisions/boundaries-v3/history/body.md`: 23.665 bytes, SHA-256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`.

O plano conserva **12 artefatos e fontes inteiras**. Os argumentos dos wrappers correspondem à CLI local consultada. Os textos propostos foram somente parseados para sintaxe, sem importar ou executar os módulos.

Permanecem pendentes os gates legítimos ausentes no snapshot documentado, a aplicação e verificação das correções pelo principal, os pins de publicação efetivos e a execução autorizada completa. A auditoria não preenche essas lacunas nem presume sucesso futuro.

**SHA-256 das entregas principais:**

- `REPORT.md`: `e592c4819b51ae3f4dfaeb3bde504c900d61d47061a3481b9dc2e1cd266f955d`
- `proposed.patch`: `911f16d004a6eea69ca34d428c053f1994d58ac81bf1c952dcd52337ad7df3fe`
