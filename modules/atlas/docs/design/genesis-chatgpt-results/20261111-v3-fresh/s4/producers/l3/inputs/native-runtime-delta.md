# Runtime nativo Genesis: base verificável do delta S4

**Scope:** `atlas-continuity-rag-genesis`. **Chave:** `S4:L1:native-runtime-delta`.
Este corpo descreve código novo da execução S4 e os limites dos seus controles.
O adapter não existia no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
A primeira revisão remota informada pelo principal é
`e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`; o delta R1 recebe outro commit real
antes da selagem. Os `source_refs` do pacote distinguem esses pins. Não atribuir
as novas portas ao baseline, nem substituir os bytes do candidato v1 pelos de R1.

## Necessidade e responsabilidade

O pacote comum `genesis-native-package/v1` conserva produção nativa, fontes,
pedidos, respostas e pareceres. Ele é transporte: sua existência e um PASS de
conteúdo não publicam conhecimento no Atlas. O novo adapter resolve a passagem
determinística desse pacote para os tipos e portas de ownership já existentes.
O piloto histórico `ownership-pilot.ts` permanece intacto, incluindo seus
reviewers e seu corpus. Não há uma segunda base de conhecimento ou autoridade.

O entrypoint é `modules/atlas/scripts/genesis-native.ts`. A implementação fica
em `adapter-io/src/genesis-native.ts`; validação de formato, leitura limitada de
arquivos e binding estão nos módulos irmãos `genesis-native-format.ts`,
`genesis-native-io.ts` e `genesis-native-binding.ts`. A alteração no barrel de
`knowledge/src/index.ts` apenas exporta o predicado já existente
`isOwnershipNeed`, evitando um segundo enum de necessidades.

## Transformação e identidades

`prepare` valida o pacote, lê os corpos exatos e persiste no CAS existente:

| Dado de entrada | Representação de ownership |
| --- | --- |
| Bytes UTF-8 do corpo | `OwnershipBody`, com array de bytes. |
| Autoridade, validade, gaps e evidência | `OwnershipResult`, com referência ao corpo. |
| Critérios do pacote e `runtime-import-binding` | `OwnershipContract`. |
| Inputs realmente observados e predecessores | Inputs e dependências a vincular no receipt. |
| Metadados e navegação | Candidato de `OwnershipArtifact`, ainda sem receipt aceito. |
| Artefatos requeridos e roots | Seleção completa proposta para o scope. |

O candidato retém também o pacote bruto, os bytes das referências, o HEAD
efetivamente observável da cópia — ou `null` — e os hashes dos módulos executados
do adapter. Seu `candidate_id` vem do kernel/CAS real. Preparação grava objetos
endereçados por conteúdo e um arquivo de candidato criado com `wx`; ela não
escreve a projeção servida.

Existem três identidades diferentes. SHA-256 comprova os bytes de transporte.
O Git blob SHA confere a identidade Git dos bytes capturados. A versão de um
`OwnershipInput` vem de `observeOwnershipInput`, que usa `id(...)` do kernel
sobre bytes ou membership. O adapter observa a cópia real, compara uma leitura
limitada com essa versão e com o digest capturado e observa novamente os inputs
ao final. Nenhum SHA de transporte é apresentado como versão do runtime.

O adapter verifica conteúdo local e blob IDs, mas não prova sozinho que o blob
pertence ao commit declarado. O candidato conserva o marcador
`external-capture-evidence-required`; a associação ao commit precisa da captura
real de fonte e do binding correspondente. Uma cópia reconstruída não recebe
um HEAD fictício com aparência do baseline.

## Validação que precede autoridade

O formato exige campos completos, chaves únicas, layers numéricos de 1 a 4 e o
enum de needs do Atlas. Escopos de artefato e autoridade devem coincidir com o
scope do pacote. `supported` e `blocked` continuam distintos. Comprimento,
SHA-256 e UTF-8 dos corpos são verificados sem normalizar BOM, Unicode ou newlines.
Metadados não NFC são recusados para respeitar os shapes existentes.

O caminho de corpo é relativo à pasta do pacote; fontes e refs são relativos à
raiz isolada. Absolutos, travessia, segmentos proibidos e symlinks são recusados.
As leituras usam descriptor, limite de bytes e verificações de identidade dos
componentes antes/depois. Isso não promete travessia adversarialmente atômica
contra troca hostil simultânea de diretórios: a execução exige raiz isolada e
estável.

Cada source ref precisa de um `file:` input, e a receita também precisa ser
declarada como input. A referência de protocolo vira input vivo de cada artefato.
Inputs suportados continuam `file:` e `members:`; membership requer observação
Git completa. Ausência e indisponibilidade interrompem a operação com motivos
distintos; falha de observação não vira lista vazia de trabalho.

Todos os artefatos obrigatórios devem existir e ser alcançáveis pelos roots.
Roots precisam apontar para artefatos do need correspondente. Dependências de
build têm predecessores existentes, anteriores e supported; ciclos e duplicatas
são recusados. Navegação permanece uma relação de consulta e não entra no hash
dos inputs/dependências como uma aresta de build inventada.

## Binding separado e publicação governada

Depois da preparação, o mesmo par local independente recebe o candidato e a
transformação exatos. O registro `genesis-native-binding-approval/v1` deve nomear
os dois IDs reais e distintos desta execução, com propósito
`runtime-import-binding`. Cada decisão cobre o candidate ID, o contrato, todos
os critérios e todos os pares de result/input dos artefatos. O adapter não
deduz PASS lendo prosa e não converte aceitação semântica antiga em binding novo.

Pedidos e respostas originais ficam preservados por referência e corpo CAS.
Quando o host não expõe um message ID, `decision_id_kind:response-sha256`
identifica os bytes da resposta; o valor deve coincidir com seu digest. Esse
identificador não é telemetria de mensagem. O provenance gerado diz que é um
registro do adapter, não a fala original do juiz. IDs e transcrição fiel da
decisão são fornecidos pelo operador; esta porta não autentica identidades.

`publish` refaz a preparação. Qualquer mudança no candidato, incluindo fontes,
corpos, refs, receita, HEAD observado ou código do adapter, exige novo binding.
Em seguida monta `OwnershipReview`, `OwnershipReceipt`, `OwnershipArtifact` e
`OwnershipManifest` nos tipos existentes. Cada artefato passa por `readOwnership`,
inclusive os alcançados somente por navegação: blocked não é promovido a supported.
O carrier usa a derivação de grounding existente e percorre
`composeRuntime.check` e `atlas-emit`. Não há publicação direta de projeção.

Política, ator, provenance do store e ratificação continuam portas independentes.
No baseline, `ATLAS_ACTOR` e `ATLAS_RATIFY_TOKEN` são declarações locais; o segundo
nomeia quem assume a ratificação, não constitui segredo ou autenticação. Uma
execução isolada explicitamente autorizada pode configurar sua política normal
e nomear seu principal real, preservando a origem da autorização. Não pode
imitar um ator histórico, copiar autoridade de fixture ou alegar autorização de
produção. O adapter não cria política nem modifica essas variáveis. Binding PASS
não remove uma recusa do gate.

## Consumo e manutenção pela porta real

Do diretório `modules/atlas`, as quatro operações são:

```sh
bun scripts/genesis-native.ts prepare <repo-isolado> <pacote-relativo> <novo-arquivo-candidato>
bun scripts/genesis-native.ts publish <repo-isolado> <arquivo-candidato> <approval-relativo>
bun scripts/genesis-native.ts index <repo-isolado> <arquivo-query>
bun scripts/genesis-native.ts read <repo-isolado> <arquivo-query>
```

`index` exige scope e need exatos. `read` exige scope, `maxBytes` positivo e
exatamente key ou need; section é opcional, e histórico só é pedido explicitamente
com `historical:true`. Campos desconhecidos ou limites inválidos são recusados.
As respostas vêm das portas reais `ownership.index/read`. Abertura direta de
Markdown não conta como consumo Atlas. Exit 2 conserva HOLD/recusa; exit 1
registra erro de entrada/execução. Exit 0 de prepare comprova somente preparação.

Para alterar o adapter, mantenha fonte, candidato, CAS e projeção isolados; fixe
as versões efetivamente executadas. Rode typecheck pelo comando do pacote e
testes do produto apenas na rota remota autorizada de `AGENTS.md`. Alterações de
gerados pertencem ao gerador correspondente. O delta R1 não edita bundles à mão.
Uma correção de fonte ou de binding tem identidade nova e não reescreve o recibo
de uma revisão anterior.

## Delta R1 e controles de recuperação

R1 mantém toda a validação de v1 e troca três casts duplos por um cast do valor
original já validado para seu tipo nomeado. Não adiciona um mecanismo de runtime.
O novo `genesis-native-recovery.test.ts` apenas dirige portas existentes com
fixtures explicitamente sintéticas:

- **NR1-01:** uma interrupção na fronteira real de sidecar, depois do CAS durável
  e antes da ativação, deixa HOLD ou o manifesto antigo ainda válido. A retomada
  desserializa o candidato preservado, usa seus mesmos resultados e não repete
  o callback de autoria sintética. Essa contagem não é telemetria de modelo.
- **NR1-02:** após drift da fonte e falha de ativação, a leitura atual fica HOLD;
  a histórica permanece explicitamente rotulada. A retomada aceita a nova
  seleção, e tentativas de rollback incompatível são recusadas tanto no adapter
  como no emit governado. Estado antigo e scope independente permanecem preservados.
- **NR1-03:** transporte v0, rebinding de scope, approval antigo para candidato novo
  e relocalização pelo emit não substituem o scope aceito. Isso não inventa um
  bloqueio cronológico universal por versão de produtor: republicação compatível
  de um candidato antigo é uma decisão separada de rollback.
- **NR1-04:** um Worker usa o runtime compilado da mesma revisão e lê a porta real
  continuamente enquanto outra thread ativa o sidecar pelo emit governado.
  Barreira e intervalos monotônicos exigem leitura sobreposta à serialização,
  link e commit depois de liberar a barreira, e não apenas reopen posterior.
  Cada resposta ready deve corresponder integralmente a um dos manifestos aceitos;
  o scope independente continua legível.

As semânticas de CAS-before-projection, geração imutável, fallback de predecessor
legível e recusa de store totalmente corrompido já pertencem ao sidecar/G3.
R1 não duplica os testes existentes de cache, rebuild ou update-input e não
transforma o antigo G3-02 sequencial em prova de sobreposição real.

## Limites e estado da evidência

Esta revisão trabalha com um pacote completo e um scope. Build dependencies
externas por `package_ref` e navegação para fora do pacote são explicitamente
recusadas. Arquivos de transporte/ref/corpo têm limite de 8 MiB; inputs vivos de
fonte/receita/protocolo mantêm o limite existente de 256.000 bytes e as exclusões
de `.git`, `.atlas` e symlinks. Entradas grandes, geradas ou de `.atlas` continuam
na cobertura S4 com pendência explícita; não são apagadas do inventário para passar.

Os testes R1 foram escritos para execução remota; nenhum teste do produto foi
rodado localmente por este produtor. O principal informou typecheck R1 com exit
0; o recibo exato do principal decide a evidência final. Não se declara aqui PASS
de execução R1, aceite semântico, binding, ativação em produção ou conclusão de
AC-07/AC-10. Interrupções controladas na porta não demonstram queda arbitrária
do processo ou perda de energia. O controle concorrente é um Worker leitor e um
writer na mesma máquina, com limites explícitos; não prova concorrência universal.
Migração geral, composição entre scopes e recuperação em todas as falhas continuam
obrigações separadas. O release deve declarar somente as capacidades realmente
observadas e seus pins, depois dos juízos e recibos correspondentes.
