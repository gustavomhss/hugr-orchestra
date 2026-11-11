**WP-R1 entregue.** Os três arquivos de código/teste permanecem congelados no commit informado pelo principal, `9a2be7fa2d0d54b0000657a0060cb0a200e04bb0` (tree `a7472b5a9f8bab6bcaaa6789a4b54b7aa3838d5e`). Os oito arquivos e hashes de v1 foram preservados. Não houve execução local de testes do produto, escrita remota por este produtor ou leitura dos oracles.

## Código e controles remotos

As mudanças de runtime são somente os três retornos com cast único do parâmetro `unknown` original já validado. Todas as validações e sua ordem permanecem. O novo arquivo de testes dirige CAS, sidecar, política, observador, emit governado e leitores existentes.

| Arquivo em `modules/atlas/packages/adapter-io` | SHA-256 final |
| --- | --- |
| `src/genesis-native-binding.ts` | `ef424a0b5bdb9590f48b8b21b418de1aa033189578790c0bb93a92e1c1d38021` |
| `src/genesis-native-format.ts` | `fe68c090812df6c15fc2dab9d36ec79315e8198908bc7e8570859454da600e21` |
| `test/genesis-native-recovery.test.ts` | `79872860b0734aa1add07519cce558a0314014b5d472d3816857690f296dc387` |

Os quatro títulos exatos e o mapeamento para as exigências estão no [implementation-report.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/implementation-report.md). Eles cobrem interrupção e retomada durável, drift e rollback incompatível com histórico explícito, transporte/scope/approval antigos e leitura concorrente real durante a ativação. NR1-04 usa um Worker leitor com o runtime compilado da mesma revisão; exige um intervalo de leitura sobreposto à ativação depois da liberação da barreira. Ausência de sobreposição falha o controle. Cada resposta ready deve ser uma resposta completa aceita; o scope independente permanece legível.

O manifesto [implementation-files.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/implementation-files.json) tem SHA-256 `0b6a5033c565c36bedfa3186500fcca7e5b5e101a170134934f3939ef6350baf`. O [source-delta.patch](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/source-delta.patch) contém somente os dois arquivos corrigidos e o novo teste. O workflow precisa compilar/typecheck antes do teste porque o Worker usa `dist/src/compose.js` da revisão candidata; o principal informou que incluiu o arquivo na rota remota existente.

## Artefato L1

O [native-runtime-delta.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/payload/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/bodies/native-runtime-delta.md) tem **11.980 bytes**, SHA-256 `398f61ce3af0a5a72871a8c3c381e542815e857dcf20bde08d34550a2650a3a8`, chave `S4:L1:native-runtime-delta`, scope `atlas-continuity-rag-genesis`, layer 1, need `evidence` e `build_dependencies: []`.

O [native-runtime-delta.artifact-draft.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/payload/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-r1/native-runtime-delta.artifact-draft.json) registra fontes diretas com bytes, SHA-256, Git blob e commits reais distintos para baseline, v1 e R1. Pedidos e respostas preservados usam `payload_path`. O draft continua **blocked/incompleto para revisão**: faltam os dois pareceres semânticos reais e, depois da preparação, o binding exato separado e os recibos de publicação/consumo. O código novo não é atribuído ao baseline.

## Evidência e limites

O principal informou typecheck R1 PASS, exit 0, sessão `45697`, completion `f5b70f`. A execução dos novos controles remotos permanece **NOT_RUN na evidência deste produtor** até o recibo observado. A aprovação semântica não é binding, e nenhum resultado de v1 é apresentado como execução dos controles R1.

A interrupção é uma exceção controlada na porta real de ativação; não prova perda de energia ou queda arbitrária de processo. A concorrência testada é um writer e um Worker leitor na mesma máquina. O contador de autoria da fixture não é telemetria de modelo. A autoridade e os reviewers das fixtures são explicitamente sintéticos. O teste de produtor antigo cobre recusas concretas de formato, inputs, binding e relocalização; não inventa um bloqueio cronológico universal de produtores compatíveis. Não alterei engine, trust, store, política, piloto histórico ou bundles gerados.

O [payload-files.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/r1/payload-files.json) identifica os bytes do body, draft e proveniência preservada. A verificação remota e os juízos reais ficam com o principal.
