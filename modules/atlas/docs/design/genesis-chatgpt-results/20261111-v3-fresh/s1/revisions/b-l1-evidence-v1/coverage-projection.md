# Projeção exata de cobertura e necessidades — L1 B

Dossiê-base verificado: `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`. Fragmento-base: `1d018091d48893b69d390db03c01d39d785ce58c1a52230471308a1bfacab98b`. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`, protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`, scope `orchestra.s1`. Esta revisão adiciona evidência e uma única correção autorizada; não julga o candidato e não altera os originais.

## CC-1 e limite desta projeção

Fonte normativa identificada pelo registro público de critérios: `modules/atlas/docs/design/genesis-ownership-plan.md`, blob `b45a73f17c34341097a8c8725a1df6260cd273b5`, SHA-256 `6164db5c520fd86f12f36b0165bae8cd5b4091a62d7b80596b77774f9a26d697`, linha 159:

```
| CC-1 | Scope, sources, gaps, existing/missing knowledge and the finite required-artifact inventory are frozen. | AC-01, AC-04 |
```

O inventário finito deste fragmento contém nove L1 obrigatórios, todos com corpo; missing_required_artifact_keys está vazio. Isso não significa que toda a população tenha conhecimento semântico completo nem que CC-1 de S1 inteiro esteja satisfeito. Há 472 entradas atribuídas, 52 famílias, 68 grupos de disposição, 289 fontes atribuídas capturadas e duas autoridades de fronteira externas. A classificação é copiada sem promoção de profundidade.

## Os nove keys obrigatórios

| ID | Key | Need | Entradas primárias | Full / representative / surface / captured / inventory | Corpo candidato |
| --- | --- | --- | ---: | --- | --- |
| A01 | `s1.api.boundaries` | `ownership` | 16 | 16 / 0 / 0 / 0 / 0 | Original intacto |
| A02 | `s1.api.schema-contracts` | `component` | 19 | 19 / 0 / 0 / 0 / 0 | Original intacto |
| A03 | `s1.api.session-contract` | `flow` | 5 | 5 / 0 / 0 / 0 / 0 | Nova versão separada, somente logging MCP |
| A04 | `s1.api.server-edge` | `operational` | 22 | 22 / 0 / 0 / 0 / 0 | Original intacto |
| A05 | `s1.api.stream-contract` | `flow` | 3 | 3 / 0 / 0 / 0 / 0 | Original intacto |
| A06 | `s1.api.client-projection` | `component` | 68 | 17 / 2 / 0 / 2 / 47 | Original intacto |
| A07 | `s1.api.codegen` | `maintenance` | 32 | 8 / 0 / 0 / 0 / 24 | Original intacto |
| A08 | `s1.api.sdk-composition` | `component` | 6 | 5 / 0 / 1 / 0 / 0 | Original intacto |
| A09 | `s1.api.surface-disposition` | `entry` | 301 | 0 / 0 / 189 / 0 / 112 | Original intacto |

Entradas primárias são uma partição de coverage, não o número de source_refs: fontes de fronteira e referências compartilhadas sobrepõem-se entre artefatos. A entrada `packages/sdk-next/src/tool.ts` continua surface, embora seu key primário seja sdk-composition. Os demais 189 surface são 94 Schema + 44 Protocol + 51 Server.

### Identidades de corpos

| Key | Corpo original SHA-256 / bytes | Corpo candidato SHA-256 / bytes |
| --- | --- | --- |
| A01 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 |
| A02 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 |
| A03 | `f0b4af4b966886be0858cc9ab27c8ec1f481ef8093018a567d8e08b071c52db5` / 5130 | `22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc` / 5155 |
| A04 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 |
| A05 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 |
| A06 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 |
| A07 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 |
| A08 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 |
| A09 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 |

## Matriz need × profundidade

| Need | full | representative | surface | captured | inventory | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `entry` | 0 | 0 | 189 | 0 | 112 | 301 |
| `ownership` | 16 | 0 | 0 | 0 | 0 | 16 |
| `maintenance` | 8 | 0 | 0 | 0 | 24 | 32 |
| `operational` | 22 | 0 | 0 | 0 | 0 | 22 |
| `flow` | 8 | 0 | 0 | 0 | 0 | 8 |
| `evidence` | 0 | 0 | 0 | 0 | 0 | 0 |
| `component` | 41 | 2 | 1 | 2 | 47 | 93 |

`evidence` é um need legal sem key primário neste fragmento; a evidência é vinculada aos nove artefatos, e não foi inventado um décimo key. Totais atribuídos: 95 full, 2 representative, 190 surface, 2 captured-only, 183 inventory. As duas autoridades externas full elevam o registro global de leitura a 97 full.

## Justificativas exatas do original

- **R01:** Exact source read for this bounded L1 contract; no execution and no semantic acceptance implied.
- **R02:** Generated bytes preserved and hash-verified; content not semantically read. Authority is the generator, Client build and output manifests.
- **R03:** Handwritten production source captured; literal imports/exports/route or handler declarations indexed. Domain implementation internals not semantically reviewed.
- **R04:** Large generated client: runtime and decisive endpoint regions read; generation authority and manifest own remaining output. Not every generated method inspected.
- **R05:** Pinned generated-family membership recorded; source not read. Regeneration authority and representative outputs are separately evidenced.
- **R06:** Pinned support-file membership recorded; contents not read and configuration semantics not inferred.
- **R07:** Pinned verification/fixture membership recorded; no assertion or fixture behavior inferred from an unread file and no test executed.

## Grupos exatos por família, tipo, profundidade e key

As 68 linhas abaixo particionam as 472 entradas sem perda. `coverage-projection.json` preserva todos os membros e todos os campos originais; cada membro herda os sete campos common. Reconstituir common + member reproduz a linha original exatamente.

| Grupo | Família | Tipo | Count | Profundidade | Key / need | Razão |
| --- | --- | --- | ---: | --- | --- | --- |
| G01 | `architecture.historical-intent` | `documentation` | 4 | `full` | A01 / `ownership` | R01 |
| G02 | `client.build-support` | `build-script` | 1 | `full` | A07 / `maintenance` | R01 |
| G03 | `client.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G04 | `client.documentation` | `documentation` | 1 | `full` | A06 / `component` | R01 |
| G05 | `client.fixtures` | `fixture` | 1 | `inventory` | A09 / `entry` | R07 |
| G06 | `client.generated-effect` | `generated` | 1 | `full` | A06 / `component` | R01 |
| G07 | `client.generated-effect` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G08 | `client.generated-effect` | `generated` | 12 | `inventory` | A06 / `component` | R05 |
| G09 | `client.generated-effect` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G10 | `client.generated-promise` | `generated` | 2 | `full` | A06 / `component` | R01 |
| G11 | `client.generated-promise` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G12 | `client.generated-promise` | `generated` | 2 | `captured` | A06 / `component` | R02 |
| G13 | `client.generated-promise` | `generated` | 35 | `inventory` | A06 / `component` | R05 |
| G14 | `client.generated-promise` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G15 | `client.handwritten` | `production` | 6 | `full` | A06 / `component` | R01 |
| G16 | `client.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G17 | `client.verification` | `test` | 3 | `full` | A06 / `component` | R01 |
| G18 | `client.verification` | `test` | 5 | `inventory` | A09 / `entry` | R07 |
| G19 | `codegen.production` | `production` | 5 | `full` | A07 / `maintenance` | R01 |
| G20 | `httpapi-codegen.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G21 | `httpapi-codegen.documentation` | `documentation` | 1 | `full` | A07 / `maintenance` | R01 |
| G22 | `httpapi-codegen.fixtures` | `fixture` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G23 | `httpapi-codegen.generated-test-fixtures` | `generated-fixture` | 13 | `inventory` | A07 / `maintenance` | R05 |
| G24 | `httpapi-codegen.package-authority` | `manifest` | 1 | `full` | A07 / `maintenance` | R01 |
| G25 | `httpapi-codegen.verification` | `test` | 7 | `inventory` | A07 / `maintenance` | R07 |
| G26 | `httpapi-codegen.verification` | `test-support` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G27 | `protocol.composition` | `production` | 1 | `full` | A01 / `ownership` | R01 |
| G28 | `protocol.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G29 | `protocol.documentation` | `documentation` | 1 | `full` | A01 / `ownership` | R01 |
| G30 | `protocol.domain-surfaces` | `production` | 44 | `surface` | A09 / `entry` | R03 |
| G31 | `protocol.edge-adapters` | `production` | 9 | `full` | A04 / `operational` | R01 |
| G32 | `protocol.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G33 | `protocol.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G34 | `protocol.session-adapter` | `production` | 2 | `full` | A03 / `flow` | R01 |
| G35 | `protocol.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G36 | `protocol.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G37 | `schema.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G38 | `schema.documentation` | `documentation` | 1 | `full` | A02 / `component` | R01 |
| G39 | `schema.domain-surfaces` | `production` | 94 | `surface` | A09 / `entry` | R03 |
| G40 | `schema.instructions` | `instruction` | 1 | `full` | A01 / `ownership` | R01 |
| G41 | `schema.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G42 | `schema.session-event-foundation` | `production` | 15 | `full` | A02 / `component` | R01 |
| G43 | `schema.verification` | `test` | 3 | `full` | A02 / `component` | R01 |
| G44 | `schema.verification` | `test` | 7 | `inventory` | A09 / `entry` | R07 |
| G45 | `sdk-next.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G46 | `sdk-next.documentation` | `documentation` | 1 | `full` | A08 / `component` | R01 |
| G47 | `sdk-next.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G48 | `sdk-next.verification` | `test` | 1 | `full` | A08 / `component` | R01 |
| G49 | `sdk-next.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G50 | `sdk-next.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G51 | `sdk.embedded-composition` | `production` | 3 | `full` | A08 / `component` | R01 |
| G52 | `sdk.embedded-composition` | `production` | 1 | `surface` | A08 / `component` | R03 |
| G53 | `server.build-support` | `test-support` | 1 | `inventory` | A09 / `entry` | R07 |
| G54 | `server.composition` | `production` | 2 | `full` | A01 / `ownership` | R01 |
| G55 | `server.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G56 | `server.documentation` | `documentation` | 1 | `full` | A04 / `operational` | R01 |
| G57 | `server.domain-surfaces` | `production` | 51 | `surface` | A09 / `entry` | R03 |
| G58 | `server.edge-adapters` | `production` | 12 | `full` | A04 / `operational` | R01 |
| G59 | `server.exercise-harness` | `fixture` | 3 | `inventory` | A09 / `entry` | R07 |
| G60 | `server.exercise-harness` | `test-support` | 45 | `inventory` | A09 / `entry` | R07 |
| G61 | `server.fixtures` | `fixture` | 6 | `inventory` | A09 / `entry` | R07 |
| G62 | `server.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G63 | `server.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G64 | `server.session-adapter` | `production` | 3 | `full` | A03 / `flow` | R01 |
| G65 | `server.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G66 | `server.verification` | `test` | 1 | `full` | A05 / `flow` | R01 |
| G67 | `server.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G68 | `server.verification` | `test` | 26 | `inventory` | A09 / `entry` | R07 |

### Resumo das 52 famílias

| Família | Count | Profundidades e counts |
| --- | ---: | --- |
| `architecture.historical-intent` | 4 | full=4 |
| `client.build-support` | 1 | full=1 |
| `client.configuration` | 2 | inventory=2 |
| `client.documentation` | 1 | full=1 |
| `client.fixtures` | 1 | inventory=1 |
| `client.generated-effect` | 15 | full=2, representative=1, inventory=12 |
| `client.generated-promise` | 41 | full=3, representative=1, captured=2, inventory=35 |
| `client.handwritten` | 6 | full=6 |
| `client.package-authority` | 1 | full=1 |
| `client.verification` | 8 | full=3, inventory=5 |
| `codegen.production` | 5 | full=5 |
| `httpapi-codegen.configuration` | 2 | inventory=2 |
| `httpapi-codegen.documentation` | 1 | full=1 |
| `httpapi-codegen.fixtures` | 2 | inventory=2 |
| `httpapi-codegen.generated-test-fixtures` | 13 | inventory=13 |
| `httpapi-codegen.package-authority` | 1 | full=1 |
| `httpapi-codegen.verification` | 9 | inventory=9 |
| `protocol.composition` | 1 | full=1 |
| `protocol.configuration` | 2 | inventory=2 |
| `protocol.documentation` | 1 | full=1 |
| `protocol.domain-surfaces` | 44 | surface=44 |
| `protocol.edge-adapters` | 9 | full=9 |
| `protocol.package-authority` | 1 | full=1 |
| `protocol.raw-transfer-boundary` | 1 | full=1 |
| `protocol.session-adapter` | 2 | full=2 |
| `protocol.stream-adapter` | 1 | full=1 |
| `protocol.verification` | 3 | inventory=3 |
| `schema.configuration` | 2 | inventory=2 |
| `schema.documentation` | 1 | full=1 |
| `schema.domain-surfaces` | 94 | surface=94 |
| `schema.instructions` | 1 | full=1 |
| `schema.package-authority` | 1 | full=1 |
| `schema.session-event-foundation` | 15 | full=15 |
| `schema.verification` | 10 | full=3, inventory=7 |
| `sdk-next.configuration` | 2 | inventory=2 |
| `sdk-next.documentation` | 1 | full=1 |
| `sdk-next.package-authority` | 1 | full=1 |
| `sdk-next.verification` | 5 | full=2, inventory=3 |
| `sdk.embedded-composition` | 4 | full=3, surface=1 |
| `server.build-support` | 1 | inventory=1 |
| `server.composition` | 2 | full=2 |
| `server.configuration` | 2 | inventory=2 |
| `server.documentation` | 1 | full=1 |
| `server.domain-surfaces` | 51 | surface=51 |
| `server.edge-adapters` | 12 | full=12 |
| `server.exercise-harness` | 48 | inventory=48 |
| `server.fixtures` | 6 | inventory=6 |
| `server.package-authority` | 1 | full=1 |
| `server.raw-transfer-boundary` | 1 | full=1 |
| `server.session-adapter` | 3 | full=3 |
| `server.stream-adapter` | 1 | full=1 |
| `server.verification` | 28 | full=2, inventory=26 |

## Obrigações futuras já decorrentes dos limites congelados

Estas condições não são novos artefatos L2–L4 nem testes impostos por esta revisão. Os nomes dos artefatos futuros não foram observados no fragmento; permanecem null no JSON. A principal deve fixá-los no trabalho correspondente, sem copiar um PASS de inventário ou de hashing.

| ID | Condição | Obrigação preservada | Dependentes ainda bloqueados |
| --- | --- | --- | --- |
| F01 | Antes de liberar L2–L4 dependente dos nove L1 | A principal precisa dos dois juízos aplicáveis aos bytes e evidências exatos; esta projeção e a correção não constituem aceite. | Explicações locais L2, relações/impactos L3 e ownership/manutenção L4 que usam estes L1. |
| F02 | Antes de afirmar entendimento semântico completo dos módulos de domínio | Tratar as 190 fontes apenas indexadas (94 Schema, 44 Protocol, 51 Server e SDK tool.ts) com a profundidade justificada para a necessidade real. O inventário não prova regras internas. | Explicações ou procedimentos sobre regras/efeitos/falhas dos domínios ainda não lidos semanticamente. |
| F03 | Antes de elevar inventário de gerados/testes/fixtures/configs a prova de comportamento | Manter as 183 entradas inventory-only e os 2 gerados capturados sem leitura distintos de fonte lida. Agrupamento por autoridade de geração continua válido para disposição; não exige ler todos os gerados por rotina. | Alegações de comportamento ou sucesso derivadas apenas desses arquivos não lidos. |
| F04 | Antes de afirmar ciclo de sessão, persistência, agendamento ou recuperação ponta a ponta | Vincular evidência aceita dos donos Core às delegações observadas. Os adaptadores por si só não provam transação, execução exatamente uma vez, recuperação distribuída ou isolamento sob toda concorrência. | Fluxos integrados de sessão, impacto de mudanças de runtime e diagnósticos de recuperação. |
| F05 | Após mudança pública de HttpApi ou antes de alegar frescor/import boundary executado | Seguir a autoridade de regeneração e obter as verificações reais pertinentes. Este trabalho executou zero geração/build/testes; não transforma testes lidos em PASS. | Procedimento de mudança segura com frescor de gerados, prova de bundle/browser e interoperabilidade executada. |
| F06 | Antes de afirmar comportamento operacional observado | Produzir a prova de runtime correspondente quando autorizada. Manter distintos origem/autoridade, live versus durable, limite de fila e ausência de reconnect automático; os testes existentes aqui são apenas fonte. | Garantias operacionais de autorização, boot, socket, overflow/replay, transporte e concorrência SDK. |
| F07 | Ao manter as superfícies onde fonte e intenção divergem | Preservar e resolver com o dono a divergência README/fs.read, o upload sem declaração no grupo/handler inspecionado e os identificadores V2. Não alegar que esta revisão os corrigiu. | Manutenção que pressupõe alinhamento total de documentação, nomes e transporte de upload. |
| F08 | Antes de binding do input generated/types.ts no runtime atual | Resolver explicitamente o limite de 256.000 bytes para o arquivo capturado de 462.732 bytes, ou manter o binding bloqueado. Não omitir, subdividir disfarçadamente ou fabricar versão observada. | Import/binding/publicação que dependem da observação fiel desse input. |
| F09 | Antes de declarar entrega S1 inteira ou publicação consumível | A principal completa o inventário finito das camadas posteriores e os recibos separados de revisão, binding, publicação e consumo. As chaves futuras não foram inventadas neste suplemento. | Declaração de completude de S1 e aceitação/publicação operacional além deste L1 B. |

### Gaps por key, copiados literalmente

#### s1.api.boundaries

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Package declarations and inspected imports do not prove the complete transitive browser dependency graph.

#### s1.api.schema-contracts

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Most non-session domain schema modules received literal surface indexing only.
- V2 annotations/brands remain despite unversioned naming intent.

#### s1.api.session-contract

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Core persistence, scheduling, execution and recovery internals are delegated boundaries, not independently proven here.

#### s1.api.server-edge

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- No runtime authorization, location, provider or socket checks; PTY output queue is unbounded in source.

#### s1.api.stream-contract

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- No replay/overflow/network experiment; global live readiness is not durable replay or automatic reconnect.

#### s1.api.client-projection

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Generated freshness unverified; most generated modules are inventory-only.
- generated/types.ts is 462732 bytes; current runtime observer refuses inputs above 256000 bytes, so its binding remains unresolved.
- README raw-file omission conflicts with generated fs.read; handwritten upload route lacks a corresponding declaration in the inspected Actions transfer group/handler.

#### s1.api.codegen

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Regeneration/freshness and generator test fixtures were not executed.
- Line-bounded selected type modules do not guarantee every generated input is below the runtime observer byte limit.

#### s1.api.sdk-composition

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Embedded tests were read but not run; Core lifecycle/recovery and all concurrency isolation remain unproven.

#### s1.api.surface-disposition

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- 183 assigned entries are inventory-only; 190 captured source modules have literal surface depth, not full semantic reading.
- Required oversized generated input retained; no unavailable runtime observation is relabeled absent or supplied with a fabricated version.

## Evidência e estado de revisão

O suplemento adiciona apenas linhas decisivas ausentes do compacto, com pin, blob, SHA-256 do arquivo, linha e SHA-256 do trecho. Não tenta transformar toda fonte capturada em semântica aceita. A única mudança de corpo é a correção MCP autorizada. Os build_dependencies continuam vazios; não há predecessor L2 inventado. Os refs de revisão/runtime do fragmento congelado estão vazios; a principal é quem incorpora juízos novos e autoriza dependentes. Nenhum oracle foi lido ou parecer enviado nesta preparação.
