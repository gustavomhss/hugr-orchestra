# Atlas: da evidência ao conhecimento servido

Síntese dos L1 aceitos no payload `8a041ca66982dcc2b89aaed46ebe347cb3de57db`. **Observado** remete à inspeção L1; **inferência**, a consequências; execução, a recibo identificado. Esta L2 não executou o produto.

Referências: O=`S4:L1:ownership-boundaries`; E=`S4:L1:atlas-engine`; H=`S4:L1:atlas-host-genesis`; N=`S4:L1:native-runtime-delta`; B=`S4:L1:host-boundaries`. CI é `runtime/ci-r2b/receipt.json` do payload S4.

## Responsabilidades do motor e do host

Atlas liga afirmações, fontes e decisões à leitura verificável e manutenção. O índice fornece endereços e dependências; grounding calcula deriva e atualidade; knowledge valida formas, roteia e recalcula status; o host fornece filesystem/Git, política, persistência e publicação. CAS identifica objetos, sem escolher o que está publicado. [E § What the engine is for, and which kind of evidence this is; H § Purpose: bind a real repository to the pure engine without handing it authority]

Isso separa perguntas que parecem iguais: endereço estável não comprova bytes atuais; `FRESH` não implica `HOLDS`; tier não autentica o ratificador. A canonicalização omite os campos auxiliares `grounding/status/freshness`, normaliza texto NFC e rejeita números não inteiros. Já `OwnershipBody` guarda octetos para conservar exatamente o texto revisado. **Inferência:** alterar representação ou campos de identidade exige avaliar compatibilidade dos objetos e recibos existentes, não apenas a aparência da saída. [E § Contracts and kernel: canonical identity is deliberately narrower than arbitrary JavaScript; O § What each identity means]

## Por que texto igual pode exigir outro resultado

O corpo responde “quais bytes?”. `OwnershipResult` acrescenta autoridade, validade, gaps e evidência. O receipt liga contrato, inputs, resultados dos predecessores e reviews; o artifact acrescenta chave estável, layer/need e navegação; o manifest seleciona artifacts e roots do scope. Assim se preserva o passado e identifica a mudança. [O § What each identity means]

**Inferência aplicada:** corrigir uma lacuna ou a base de autoridade pode mudar o resultado mesmo com Markdown idêntico; o dependente precisa considerar o resultado completo. Inversamente, um caminho de navegação novo não vira automaticamente dependência de build. SHA-256 de transporte, Git blob e versão de input calculada pelo kernel têm finalidades diferentes: igualdade de um não fornece o outro nem prova pertencimento ao commit declarado. O adapter conserva essa obrigação de captura externa. [O § What each identity means; N § Transformação e identidades]

## Como mudanças de fonte orientam a revisão

O observador distingue `present(version)`, ausência corroborada e indisponibilidade. Comparar uma versão presente com o receipt diagnostica mudança; `stale` não é um quarto retorno do observador. Falha de Git, arquivo recusado ou leitura incompleta não autorizam concluir remoção ou “nenhum trabalho afetado”. `members:` detecta alterações de caminhos; conteúdo de cada membro exige seus `file:` relevantes. [O § How current inputs are observed]

O planejamento propaga mudanças pelas dependências declaradas e produz uma fronteira topológica. O rebuild confere receita, contrato, inputs e predecessores, captura dados e reobserva; pode reutilizar um resultado quando esses vínculos não mudam. Sua saída continua sendo candidato. **Inferência:** inputs omitidos podem ocultar trabalho necessário; dependências indiscriminadas podem refazer trabalho sem relação semântica. A manutenção precisa justificar cada vínculo, mantendo navegação como consulta. [E § Knowledge: shape, routing, human ratification, and ownership results; H § Ownership publication, observation and rebuild]

## O percurso até uma leitura utilizável

A publicação governada grava CAS antes de ativar a projeção e avalia gates dentro da decisão de commit, que pode repetir. O accessor procura exatamente um carrier publicado e compatível com o scope na visão filtrada por provenance; só então o leitor de ownership confere objetos, reviews, inputs e dependências. Portanto, objeto presente no CAS e Markdown legível não bastam para uma leitura Atlas corrente. [H § Storage, governed emission and committed replay; H § Ownership publication, observation and rebuild]

No delta nativo, `prepare` transforma bytes em candidato, sem ativação; `publish` refaz a preparação, exige binding exato e cruza `check`/`atlas-emit`. Para consumir, `read` pede scope, orçamento positivo e exatamente key ou need; `section` seleciona um H2 único. HOLD e leitura histórica explícita preservam diagnósticos. `index` evita devolver corpos, mas verifica seus bytes internamente: não é promessa de custo sem leitura. [N § Binding separado e publicação governada; N § Consumo e manutenção pela porta real; E § Knowledge: shape, routing, human ratification, and ownership results]

Retrieval tem outra finalidade: montar contexto de consulta. O caminho ativo usa `adapter-io/src/retrieval-model.ts`; alterar apenas o modelo de referência `retrieval/src/pack.ts` pode não mudar o comando. Own mantém orçamento, ponteiros e conteúdo excedente recuperável. Memory filtra injeção por owner, mas os registros em texto no repositório não oferecem confidencialidade por esse filtro. Essas responsabilidades não devem ser confundidas com aceitação/publicação de ownership. [E § Retrieval: reference pack policy, live Own, and reproducible host artifacts; E § Memory: owner filtering and recoverable history, without a confidentiality claim]

## Fronteira externa e pontos de manutenção

O servidor Atlas chama `surface`/`mine` via boundary gerado. Resolve modelos fora de Session; o identificador usado no gateway não cria uma Session durável nem comprova hooks de Continuity. Rascunho de modelo permanece distinto de proposta e ratificação. Ator/token locais expressam responsabilidade declarada, sem demonstrar autenticação HTTP. [B § 3. Atlas host → pacote boundary → origens de domínio]

| Mudança ou sintoma | Começar pelos paths documentados |
|---|---|
| Identidade, bytes ou resultado incompatível | `modules/atlas/packages/kernel/src/canonical.ts`; `modules/atlas/packages/knowledge/src/ownership/shape.ts` e `read.ts` |
| Atualidade ou conjunto afetado inesperado | `modules/atlas/packages/adapter-io/src/ownership-input.ts` e `ownership-rebuild.ts`; `modules/atlas/packages/knowledge/src/ownership/update-plan.ts` |
| CAS existe, mas a porta não serve | `modules/atlas/packages/adapter-io/src/ownership-access.ts`, `read-access.ts`, `governed-emit.ts` e `policy.ts` |
| Comportamento externo ou bundle divergente | `packages/core/src/atlas.ts`; `packages/server/src/handlers/atlas.ts`; `modules/atlas/boundary/script/build.ts` |

Conferir a porta efetiva evita confundir export ou mock com execução. [E § Maintenance starting points and bounded gaps; H § Maintenance and remaining uncertainty]

## Recibos e limites desta síntese

O baseline dos L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; o adapter nativo é delta posterior. CI registra, para o candidato `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553` e run `43077975153`, 220 testes aprovados, 22 controles de mutação e paridade de 18 gerados. Isso limita a lacuna de paridade àquela revisão; não demonstra toda integração externa. O recibo conserva dois avisos de arquivos grandes e limita a concorrência a um Worker/writer e a falha a um seam controlado. [N § Limites e estado da evidência; CI: tests, generated_parity, guards, limits]

Permanecem os limites do índice entre linguagens, ramos não examinados, autenticação/composição externas e recuperação geral. Esta L2 não herda binding/publicação anteriores; sua aceitação e seu consumo exigem evidência própria.
