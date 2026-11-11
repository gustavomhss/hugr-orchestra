# PREP-S2-04 — revisão técnica do patch v1

**Uma correção obrigatória antes da integração: o patch excede o teto de linhas do guard Atlas.** Não encontrei outro defeito concreto nas alterações funcionais examinadas. Isso é revisão técnica estática de preparação, não julgamento S5, aceite de Genesis, resultado de typecheck ou testes.

Patch revisado: `4ba38502520f1c5a5be35ff3e4350a914610cd04a22a76c34152b6a8843e6677`.
Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Achado RUP-01 — teto de linhas bloqueia o gate

**Local:** adição de RB-21/22/23 a `modules/atlas/packages/adapter-io/test/ownership-rebuild.test.ts`, linhas propostas 506–540.

O original tem 574 quebras de linha; o patch acrescenta 35. O guard calcula `.split("\\n").length`, portanto o candidato mede **610**, acima de **HARD = 600**. `modules/atlas/harness/gates/godfile-guard.mjs` inclui todos os `packages/**/*.ts`, inclusive testes, e sua lista fechada de waivers não contém esse arquivo. Blob do guard: `27891a73f04cdfdd2944e281cb59e59a7f8e10d5`.

**Correção necessária:** reorganizar os testes/fixture em unidades coesas abaixo do teto, preservando os controles. Não aumentar o limite nem acrescentar waiver. `update_fit` e a raiz receberam o achado; o autor informou que prepara um v2 com fixture compartilhada e arquivo separado de testes de fronteira. Esse v2 ainda não foi revisado aqui.

A previsão de bloqueio resulta da aritmética do diff e do código do guard; **o guard não foi executado**.

## Foco solicitado: RB-23 e cache sem mudanças

O original já chama `readCapturedBytes` para todos os arquivos presentes antes da saída de cache (linhas 180–184 e 213 de `ownership-rebuild.ts`). O patch acrescenta a recusa quando esse callback devolve `undefined`; não acrescenta uma nova leitura de host.

A interface, nas linhas 73–75, exige os bytes da mesma captura que produziu a versão e descreve `undefined` para bindings não arquivo. O contrato G2.2 §2.3(2) exige preservar bytes/listas no wrapper; §2.3(5) permite verificações mecânicas dos independentes. Assim, **não demonstrei regressão de reuso válido segundo a interface declarada**: `present(version)` acompanhado de bytes ausentes é uma captura inconsistente.

O alcance é deliberadamente global: um adapter personalizado que forneça só versões será recusado inclusive sem mudanças e sem chamada de receita. O contrato não obriga a nova checagem especificamente antes do cache; ele permite essa checagem e exige consistência da captura. O RB-23 proposto cobre uma receita afetada; sozinho não caracteriza o caso sem mudanças. Não o trate como prova executada de nenhuma das duas situações.

## Foco solicitado: RB-22 e a recusa correta

A construção do fixture é estruturalmente válida no caminho inspecionado:

- `artifact()`, linhas 64–85 do teste original, recria reviews sobre `id({inputs, dependencies})`, o result e o contrato efetivos.
- Os novos `a` e `i` usam o mesmo corpo, scope, authority basis, validade, gaps e evidence anteriores; os respectivos result refs permanecem iguais. Portanto o binding `m → a.result` não quebra.
- `i` declara o input extra `file:recipe-a.ts`, dando ao mapa global a observação que mascarava a omissão em `a`.
- `a` mantém esse input em `declaredInputs`, mas o retira de `mandatoryInputs` e do receipt; isso atravessa a validação antiga e deve ser recusado pela nova regra.
- O planner valida historicamente formatos/reviews/resultados nas linhas 43–56; o reader exige reviews exatos nas linhas 50–59 e confere dependências por result nas linhas 80–82. Não encontrei uma recusa anterior por binding alheio ao defeito alvo.

A conclusão acima é inspeção estática, não execução do teste.

## Escopo e registros

Verifiquei os blobs dos oito arquivos decisivos, o patch exato, as interfaces/declarações, o isolamento dos mapas por candidateInputs, a cópia de bytes/listas/dependencies e os três controles propostos. Nenhuma escrita GitHub, edição de fonte compartilhada, suite, typecheck, guard, produção ou acesso a respostas reservadas ocorreu.

Registros em `/workspace/scratch/ea607dbcbf72/preparation/review-update/`: `request.json`, `visible-findings-v1.md`, `reviewed-input-v1.patch`, `source-references.json`, `static-checks-v1.json`, `additional-source-fetches.json` e `review-receipt-v1.json`.

**Estado técnico de v1: CHANGES_REQUIRED por RUP-01.** O parecer não autoriza integração nem substitui os dois juízes da S5.
