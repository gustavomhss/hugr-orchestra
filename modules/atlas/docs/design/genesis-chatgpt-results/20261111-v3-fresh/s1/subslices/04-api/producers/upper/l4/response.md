L4 revisão 2 pronto para o mesmo par de juízes.

- Chave: `s1.subslice04.maintenance`; layer `4`; need `maintenance`.
- Corpo: [body.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/body.md) — 10033 bytes UTF-8, SHA-256 `ce0f86d365df573cf89218da7fee86009d1a37c65c775735c02a68079d38160e`.
- Metadata: [metadata.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/metadata.json) — SHA-256 `18add6006acef55bfbe1427c75b6bb1ca612cf4c8720833c42d41e72a5595129`.
- Receita: [recipe.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/recipe.json) — SHA-256 `e1fce629014f0e95b2033ce40706bfe40bb10fc6b8ad4e540e6a658b8d927511`.
- Delta: [body.diff](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/body.diff) — SHA-256 `34cdfe65f88476761f5f35453505b677cf55dada2ece278bee5ba7fd9c09e5f7`; cópia legível em [literal-delta.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/literal-delta.md).
- Registros: [request.txt](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/request.txt), [response.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/response.md), [manifest.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/manifest.json) e [delta-manifest.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l4/delta-manifest.json).

A revisão 1 completa está preservada em `revision-1/`, com seis arquivos byte-identical e sem backups recursivos. O predecessor L3 agora é a revisão 3 aceita, `ba532f772f8f2f08be5938caf3ba9856c6f185e79d18fb0ed9d016b9d176f0bd`, vinculada ao gate `23460fd3c06d24b6e3e5f2ba483903ab907539d0b3d054a06cf0596c9e33358a`.

Há sete dependências diretas: L3 atualizado, L2, boundaries, codegen e os três L1 Core reconhecidos. A adaptação usa os contratos Core disponíveis para orientar mudança e diagnóstico; o handoff fica restrito ao conhecimento restante. As seções de consulta e propagação, limites públicos, critérios e passos de geração/Actions/guards/typechecks permaneceram iguais. L3 não foi modificado.

Não houve fonte bruta, oracle, chamada externa, execução de produto/Atlas, teste, geração ou rebuild nesta atualização. Nenhuma especulação diagnóstica foi convertida em capacidade operacional aceita; publicação e consumo continuam exigindo suas provas próprias.

## Delta literal completo

```diff
--- revision-1/body.md
+++ body.md
@@ -1,8 +1,8 @@
 # L4 — procedimento local de ownership e manutenção
 
-`s1.subslice04.maintenance` · `orchestra.s1` · fonte API `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
+`s1.subslice04.maintenance` · `orchestra.s1` · fonte API/Core `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
 
-Use para decidir e verificar manutenção das fronteiras Schema/Protocol/Server/Client/SDK/gerador. A base é L3 e conhecimento local aceito; regras de consulta/manutenção são normativas. Resultados de execução pertencem a recibos vinculados ao candidato e à operação.
+Use para decidir e verificar manutenção das fronteiras Schema/Protocol/Server/Client/SDK/gerador e seus contratos Core locais. A base é L3 revisão 3 e conhecimento aceito, incluindo três L1 Core; regras de consulta/manutenção são normativas. Resultados de execução pertencem a recibos vinculados ao candidato e à operação.
 
 ## 1. Consultar pouco, pela porta real
 
@@ -21,16 +21,17 @@
 | Necessidade | Consulta e decisão |
 | --- | --- |
 | Tipo compartilhado/campo opcional | L2 → `s1.api.schema-contracts`: alterar a autoridade canônica Schema quando ela possui o DTO; distinguir ausência, `undefined`, `null` e valor. `optional` filtra `undefined`; isso não define sozinho defaults ou compatibilidade histórica. |
-| Pedido, resposta ou erro HTTP | L2 → `s1.api.session-contract`/`s1.api.server-edge`: localizar Protocol e o adapter Server. Para `session.prompt`, conferir declaração e encaminhamento pelo handler, resposta `Admitted` e mapeamentos específicos; significado interno novo exige o owner Core. |
+| Pedido, resposta ou erro HTTP | L2 → `s1.api.session-contract`/`s1.api.server-edge`: localizar Protocol e o adapter Server. Para `session.prompt`, conferir declaração e encaminhamento pelo handler, resposta `Admitted` e mapeamentos específicos; usar também os três L1 Core aceitos para distinguir admissão, execução e persistência. |
 | Cliente e fronteiras | `s1.api.boundaries`/`s1.api.client-projection`: manter Schema/Protocol compartilhados; rejeitar imports runtime Core/Server no Client. A composição desses serviços pertence a Server/SDK. Conferir Promise wire e Effect decodificado, incluindo envelopes: só `{data: A}` exato é desembrulhado. |
 | Receita/nome/omissão/gerador | `s1.api.codegen`: Client possui `src/contract.ts` e `script/build.ts`; `tooling/httpapi-codegen` possui compilação/emissão/escrita. Receita alterada exige análise mesmo quando API ou bytes públicos parecem iguais. |
+| Admissão/retry, execução ou dados duráveis | L3 → `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.persistence`: usar os contratos já aceitos de identidade/wake/promoção, coordenação local e EventV2. Pedir complemento somente para requisito fora desses limites. |
 
 Recorra ao índice quando faltar a entrada do assunto e conserve seus gaps. Com a chave vinculada, consulte diretamente a profundidade necessária. Um gap obrigatório vira complemento inferior delimitado e julgado antes do claim dependente; não inicia releitura geral. Claims históricos `RETIRED_EXTRA_CLAIM` continuam retirados, sem resolução por fonte.
 
 ## 3. Alterar e verificar o candidato autorizado
 
 1. Fixe os inputs/contratos e o delta, incluindo adições, remoções e intenção/documentação ou receita alteradas. Identifique consumidores e conhecimento afetados; não confunda imports de produto com dependências de construção.
-2. Ajuste a autoridade identificada e a implementação/delegação pertinente. Mantenha tipos compartilhados canônicos e erros locais explícitos. Não preencha semântica Core ausente por inferência do handler.
+2. Ajuste a autoridade identificada e a implementação/delegação pertinente. Mantenha tipos compartilhados canônicos e erros locais explícitos. Para novo campo de prompt, verifique se altera o JSON canônico/delivery da identidade de retry ou a consistência da projeção; `promptContext` e instante de criação pertencem a esta última. `resume:false` suprime o wake daquela chamada. Use L3 e os três L1 Core aceitos; reserve o handoff para semântica que exceda esses contratos.
 3. Para mudança pública pertinente de Protocol/Server HttpApi, use a geração oficial: em `packages/client`, `bun run generate`. Mudança da receita deve revalidar seus produtos. Não edite manualmente `src/generated`/`src/generated-effect`; confira os outputs e manifestos pertencentes ao gerador. Falha por schema não suportado requer corrigir a entrada/receita autorizada, sem fabricar codec ou substituir gerados à mão.
 4. Em `packages/client`, `bun run check:generated` executa geração e diff dos dois diretórios. Registre revisão, comando e resultado; existência do script ou igualdade aparente dos arquivos não é freshness comprovada.
 5. Selecione os gates reais conforme `AGENTS.md` aplicável e o delta: testes de produto **somente em GitHub Actions**, typechecks dos pacotes afetados e guards. O contrato fixado cita `bun run check:guards --base origin/dev`; use o candidato/base pertinentes e não invente variantes ou nomes de workflows. Registre o que rodou, falhou ou falta. Testes lidos, build local e PASS de conteúdo não substituem CI, prova de browser ou binding runtime.
@@ -47,9 +48,9 @@
 
 | Situação | Ação e limite |
 | --- | --- |
-| `/api/event` caiu | Consultar `s1.api.stream-contract`. O global vivo não oferece aqui retomada automática sem perdas; leitura durável de Session usa sequência exclusiva e outro conjunto de eventos. Não prometer recomposição do feed global por esse caminho. |
-| Prompt admitido, retry ou estado de execução duvidoso | Consultar o contrato Session. `Admitted` não comprova execução; `active` é local ao processo; history não certifica snapshot entre páginas. Para identidade de retry, delivery/resume/promoção, persistência e recuperação, solicitar conhecimento Core aceito e compatível. O1/O2 orientam o handoff, sem certificar as respostas. |
-| Garantia de exclusão entre hosts ou efeitos externos exactly-once | Abster-se dessa certificação com a base API/SDK/eventos. Nomear o claim, owner Core/serviço pertinente e evidência faltante; HOLD apenas dos dependentes cuja decisão exige esse conhecimento. |
+| `/api/event` caiu | Consultar `s1.api.stream-contract` e, para persistência/subscrição, `s1.core.persistence`. A leitura durável de Session usa sequência exclusiva e eventos armazenados, relidos após wakes; `persist:false` não faz append nem avança sequência. O global vivo não oferece aqui retomada automática sem perdas; não prometer sua recomposição por esse caminho. |
+| Prompt admitido, retry ou estado de execução duvidoso | Usar L3 e `s1.core.session-admission`: no mesmo message ID, confrontar Session ID, prompt canônico codificado e delivery; retry exato pode emitir novo wake sem novo input, enquanto delivery divergente gera conflito. Retry histórico requer o `Prompted` durável original. Distinguir inbox admitido, promoção/mensagem visível e tentativa do provider; `Admitted` não comprova turno concluído. Usar `s1.core.session-execution` para coordenação/interrupção local; `active` não é estado distribuído e history não certifica snapshot entre páginas. O1/O2 continuam como apoio. |
+| Garantia de exclusão entre hosts ou efeitos externos exactly-once | Abster-se dessa certificação com a base API/SDK/eventos e os três contratos Core locais aceitos. Nomear o claim, owner Core/serviço pertinente e evidência faltante; HOLD apenas dos dependentes cuja decisão exige esse conhecimento. |
 | Input/gerado indisponível, evidência conflitante ou gate ausente | Preservar o motivo e a versão; indisponível não significa removido. Encaminhar o complemento ou operação ao owner competente. Não ampliar o aceite por contagem, hash, teste isolado ou mudança só do texto. |
 
 Encerre a manutenção com disposição explícita do delta, contratos/conhecimento afetados, provas executadas e pendências. Este procedimento não certifica execução, compatibilidade browser, completude Core, publicação ou consumo real; essas conclusões exigem seus recibos e gates próprios.
```
