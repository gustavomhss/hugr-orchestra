# Fundamento compilável — rodada FND

## Autorização, recorte e estado

Após a revisão documental, o proprietário disse **“ok pode seguir”**. Esta rodada começa a materialização de B-CONTRACT: primeiro os valores de referência e observação de C01/C02 em Schema, com testes de contrato. Não congela a API inteira, não habilita Studio, não fecha requisitos de produto ou autoriza acesso ao tenant. Specs anteriores continuam propostas com os gates restantes abertos.

**Estado: fatia FND concluída e aprovada pelo lead, com CI após restore e revisão independente. Não é freeze geral de B-CONTRACT.** A implementação desta fatia foi sequencial pelo lead, sem arquivos de código concorrentes. Críticos independentes receberam somente a demanda limitada e a suite; um revisor novo verificou o delta de código em snapshot isolado. Modelos padrão; pacotes de crítica ≤20K tokens, total ≤35K; revisão de código ≤25K/40K; retornos compactos. Não há commit/push/PR de produto nesta etapa. Testes rodam apenas por `test:ci`; nenhuma variável de liberação de testes locais.

## Demanda da fatia

Materializar os contratos browser-safe e serializáveis ContextRef, ResourceRef, CapabilityRef, ObservationScope, ObservationMeta, Availability, EvidenceKind/Mode e Problem de C01/C02. Objetos fechados também nos níveis aninhados; nenhum campo de autoridade/segredo. Gerações são inteiros positivos seguros; permissionEpoch e tempos/delays são inteiros não negativos seguros; revisão de capacidade é string não vazia sem coerção, conforme PR01. Contexto e conexão têm IDs locais distintos e não são recursos Microsoft. Scopes connection/workspace/resource representam a raiz real sem recurso sintético. Decodificar uma referência nunca é prova de acesso, existência ou readiness operacional.

Seam desta fatia: namespaces `FabricContext`, `FabricResource`, `FabricCapability`, `FabricObservation` com exportação direta e pelo root do Schema, mantendo a mesma identidade. Context ID `fctx_` + 26 alfanuméricos; Connection ID `fconn_` + 26 alfanuméricos, com construtores `create()` e validação exata do prefixo/sufixo. ConnectionID é canônico em FabricResource e deve ser reusado pelo futuro domínio de conexão, não duplicado ou confundido com Capability.ConnectionID do subsistema genérico. IDs remotos são strings não vazias sem inferir formato universal; cada adaptador futuro validará seu formato e destino efetivos. Novos IDs não tornam existentes registros, contas ou grants.

Não entram nesta fatia: manifesto/compiler/renderer, handles de resultado, comandos/approval/jobs/checks, HttpApi, instalação de ferramentas, runtime Fabric, MSAL/driver, DB/proteção, rebind e acesso. Não criar schema de domínio amplo por conveniência nem evento sem consumidor. HttpApi público permanece inalterado: não há Client a regenerar por esses valores isolados.

## Âncora de aceitação

`packages/schema/test/fabric-foundation.test.ts` é a fonte executável das quatro aceitações FND01–FND04, não uma nova definição dos 200 requisitos. Os testes exercitam os schemas reais; não copiam decoder, não usam mock de autorização e não anunciam requisitos de segurança cumpridos por parse.

1. FND01: IDs exatos, gerações seguras, revisões string e identidade canônica de exports.
2. FND02: recurso/scope estritos, roundtrip e rejeição de kind/campos/IDs/coerções inválidos.
3. FND03: metadados/problemas preservam proveniência/mode, opcionais omitidos e falhas explícitas.
4. FND04: conjuntos fechados, identificadores públicos estáveis/únicos e import graph compilável para browser.

Baseline do código: `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`. Typecheck inicial não pôde iniciar: tsgo ausente (exit 127), não erro de código. Dependências de Schema instaladas com `bun install --filter @orchestra/schema --frozen-lockfile --ignore-scripts`; sem habilitar scripts ou alterar versões. Depois disso, o typecheck alcançou os novos testes e identificou os contratos/exports ausentes; também detectou uma opção inválida do Bun.build no teste, corrigida antes de implementar.

## Preparação e crítica

- `plan-check`: quatro aceitações FND01–FND04 pertencem à única WP `schema-foundation`; mapping total/disjunto, sem conflito. `conflict-map` não encontra par de código concorrente: implementação sequencial pelo lead, críticos sem write em código.
- Primeira baseline CI: [41938821689](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41938821689), zero pass/quatro fail, todos por ausência dos módulos novos. Não é falha genérica de setup tomada como red funcional: os quatro corpos foram atingidos individualmente.
- A primeira crítica encontrou lacunas reais: readonly/noAny/distinção de tipos; gramática completa de ConnectionID; fronteiras/coerções de todos os contadores; campos obrigatórios e objetos aninhados; exatidão dos conjuntos fechados; identidade canônica dos subpaths e import graph de todos os entrypoints. Removida uma expectativa de grafia de identificador além da demanda; mantida qualificação/unicidade.
- Suite reforçada, mesmos quatro nomes de aceitação. Snapshot externo v2 SHA-256 `e74db6199940b93f67b2031ba5e527d0a7388c5d590d69158b751787019922f6`; dois críticos examinaram essa versão antes da implementação. As assertivas de tipos dependem de `bun typecheck`, não da execução Bun que apaga tipos. Um build browser real em CI verifica o import graph, sem mock.
- Relays de críticos armados; hook enforcement não demonstrado. Relatórios/snapshots e logs RED ficam no diretório temporário aprovado `opencode/fs-fnd-suite` e seus relatórios irmãos; não substituem as verificações do lead.

As críticas seguintes fecharam as fronteiras de encode e optionals populados, constraints em cada scope inline, IDs com underscore, não atribuibilidade nas duas direções e Any também no AST de entrada/encoding. Os conjuntos são comparados sem ordem. O lead fixou explicitamente a grafia estável dos identificadores como `namespace.member` dos quatorze schemas públicos desta fatia; o teste correspondente é um golden dessa decisão, não uma escolha de nome atribuída ao crítico.

Uma revisão retornou `covers` para v3; a outra encontrou que o root era importado pelo arquivo, não pelo package root. v4 mudou uma única importação em FND04 para `@orchestra/schema`; FND01 conserva o source index, cobrindo ambos. Snapshot v4 SHA-256 `e4032c9938b52664a92ed970cc96262307de8d4590c8b76d8edf00cf0a9b54b6`, reconferido pelos dois críticos. A segunda baseline CI (v2), [41939533864](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41939533864), também atingiu os quatro casos e falhou pela ausência dos contratos.

Verificação de fronteiras usa o gate existente `bun run check:boundaries --scope packages/schema` e revisão do diff completo, não um detector paralelo de código arbitrário. Primeiro run não pôde iniciar por TypeScript ausente; instaladas também as dependências do root com frozen lockfile e scripts desligados. Depois, o gate encontrou precisamente os quatro novos subpaths ainda ausentes (R6b), um controle real de que lê estes testes. Não se afirma que o bundle browser sozinho prove ausência de toda lógica de domínio.

## Materialização e verificações

Dois críticos retornaram `covers` sobre v4; relatórios `fs-fnd-critic-one-round4-return.json` e `fs-fnd-critic-two-round3-return.json`, preservados com os demais artefatos. O lead conferiu os veredictos e o escopo antes de implementar. A baseline exata de v4, [41940210205](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41940210205), atingiu novamente os quatro testes e falhou pela ausência dos módulos.

Implementados somente os quatro módulos `packages/schema/src/fabric-{context,resource,capability,observation}.ts`, seus exports/subpaths e documentação do pacote. Nenhuma dependência ou versão mudou. Reutilizados `ascending`, `statics`, `PositiveInt`, `NonNegativeInt` e `optional`; o Int do Effect fixado usa Number.isSafeInteger, não mera truncagem. Os quatorze schemas públicos têm identidades estáveis; ID não é bearer e Availability não é autorização.

Typecheck local do pacote passou. O controle por mutação removeu temporariamente **somente** a brand de FabricContext.ID: `bun typecheck` falhou na asserção de não atribuibilidade de IDs. A linha foi restaurada e o mesmo typecheck voltou a passar; o hash restaurado coincide com o pré-probe. Nenhum teste foi executado localmente.

Primeira CI de implementação + testes existentes: [41940766451](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41940766451), 38 pass/um fail. FND01–FND03 passaram; FND04 encontrou um erro no próprio oracle de annotations: a brand do Effect não exige identificador em `ast.annotations` direto. Corrigido para `SchemaAST.resolveIdentifier`, como o teste de Capability existente faz, mantendo o golden exato e todas as asserções. Fixtures também receberam apenas literal typing/`satisfies` e conversão String no comparador Bun de IDs branded para compilar sem casts/supressões. Os runs corrigidos estão registrados abaixo, sem atribuir verde a esse run falho.

O gate de fronteiras passou depois dos exports: 123 arquivos do pacote, zero violações novas/stale. O guard local passou então com 78 regras/51 caminhos; ambos foram repetidos após as mudanças finais. Esses gates não fecham isolamento, cache OAuth, egress, durabilidade, persistência, endpoints ou qualificação real.

### Revisão independente e provas adversariais

O novo revisor examinou todos os sete arquivos de código/testes/exports no snapshot SHA-256 `b82e34b308c353f3b73edc0aa4f16e7a6da116536380cf53961e4809459e63c4`, sem editar nem executar testes locais. Retornou FIX-FIRST somente para o oracle de identificador já detectado pela CI. Após comparar o artefato corrigido SHA-256 `527371073bea2ddf0316027317fadf99e054af28d80f2af37f4659528e75bf2c`, confirmou a substituição exata de uma linha, todas as assertivas preservadas, e fechou o finding com APPROVE limitado à fatia. Relatórios externos:

- `fs-fnd-code-review-return.md`, SHA-256 `5b539fdcba9e99f85f4fd94d5402a2eb3542b5a34b77547278431ca36b109f5c`.
- `fs-fnd-code-review-correction-return.md`, SHA-256 `8201dcb17395fc627e507cd155947170f185ffac293ebe2a94c01a96f7cd7f9d`.

O lead leu os dois pareceres e conferiu hashes, delta e cláusulas; não tomou o APPROVE como resultado de teste. A resposta de framing é explícita: validade wire não é autoridade atual. Os quatro arquivos de produção permanecem exatamente os do snapshot revisado; só o oracle de teste mudou depois dele.

CI corrigida [41941193216](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941193216): **39 pass, zero fail**, nos três arquivos selecionados, em Linux. Logs completos foram confrontados por nome com a baseline v4: os mesmos quatro FND passaram de failed para passed, sem caso ausente/skip contado como sucesso. Não é suite completa do produto ou qualificação Windows/macOS/Fabric.

O comparador do lead exigiu exatamente quatro nomes iguais nos dois logs e a direção failed→passed para todos; leituras ausentes ou conjunto divergente falham. O script `acceptance-gate.py` citado pela skill não está disponível no diretório instalado consultado; não se registra execução fictícia desse comando. Estados foram extraídos dos logs dos runs concluídos, não de resumo autoatribuído do agente, e preservados como `red-final.json`/`green-initial.json` junto aos logs externos.

Mutação de runtime [41941685962](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941685962): mudar somente `FabricContext.Ref` de excess-property `error` para `ignore` fez **FND01 falhar**, precisamente porque `authority` deixou de ser rejeitado. Três outros casos ficaram filtrados por `-t FND01`, não verdes. Restore por patch devolveu todos os bytes de produção ao snapshot revisado e o teste ao artefato corrigido. Typecheck voltou a passar.

Os dois worktrees de críticos foram removidos após estado vazio e baseline verificados. O worktree de revisão de código teve seu write set exato e hashes conferidos; sete cópias arquivadas, somente essas cópias removidas/restauradas por patch, depois remoção do worktree limpo sem force. Snapshots e relatórios externos permanecem disponíveis.

## Fechamento e limites

CI após restore: [41942117600](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41942117600), snapshot commit `b7d7d1c7b444e4cce6cf1ec3db38483e0332c299`, **39 pass, zero fail** em Linux. O lead releu o log completo: 39 nomes efetivamente executados, os quatro FND correspondendo à baseline RED. Evidências em `green-restored.json`/`.log`; o snapshot temporário de `test:ci` não é commit ou push da branch de produto. Os dois probes foram revertidos, e os hashes restaurados coincidem com o código revisado.

**Disposição do lead: APPROVE somente FND01–FND04 neste recorte.** Typecheck do pacote e testes de contrato, oracle corrigido reconferido, dois controles adversariais que falharam e voltaram ao estado validado, revisão de dependências/exports e scope verificados. Guard local final: 78 regras/52 caminhos/zero findings e erros. Fronteiras scoped: 123 arquivos/zero violações novas ou stale. Fontes congeladas de desenho/requisitos preservadas, links locais resolvidos, nenhuma alteração em lockfile/versões ou API pública. Sem testes locais, restart, segredo de tenant ou chamada Fabric.

Não foram entregues um renderer, compositor, catálogo operacional, login, autorização contextual, storage cifrado, comando/job ou qualificação Fabric. Continuam abertos B-CONTRACT e os demais gates de BLOCKERS. A próxima fatia coerente é o contrato declarativo e sua validação sem efeitos de S04, antes de qualquer montagem Solid ou operação dependente; ela precisa de sua própria aceitação e revisão, não herda os quatro verdes daqui.
