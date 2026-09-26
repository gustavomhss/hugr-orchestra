# Revisão 4.1 — insumo HuGR e integração delimitada

**Resultado: contrato atualizado e verificações do pacote PASS. Produto NOT_RUN.**

Data: 26/09/2026. A revisão adiciona a marca recebida ao plano v4. Não refaz a revisão inteira do produto, não reabre o design e não aprova a implementação. Os relatórios REVIEW-v4.md e FINDINGS-RESOLUTION.json permanecem como histórico dos reparos anteriores.

## Delta e autoridade

O kit tem 304 arquivos, dos quais 295 pertencem à entrega original. Todos os 304 arquivos foram comparados por SHA-256 com os bytes do ZIP recebido. O verificador original passou: 295 arquivos originais, 294 entradas de checksum, 36 pares de cópia web, 89 SVGs parseados, 42 SVGs mestres de logo, 15 rotas de uso, quatro referências de ícones de manifesto e oito arquivos adicionais de handoff.

A imagem enviada neste turno e a referência raster do kit têm pixels RGBA idênticos em 1254 × 1254; seus PNGs não têm o mesmo hash. Isso identifica a referência recebida. Não demonstra equivalência pixel a pixel entre um SVG renderizado e o raster artístico. Os vetores fornecidos permanecem aprovados sem tentativa de corrigir essa diferença.

O master da interface permanece byte a byte inalterado. Sua composição e paleta continuam aprovadas. Os assets HuGR passam a ser a fonte do símbolo, em lugar do elo ilustrativo do mock. O nome Orchestra permanece texto separado, sem editar o wordmark HuGR nem renomear a instalação. Essa aplicação é uma decisão operacional do contrato, a conferir no render; não um lockup vetorial novo apresentado como aprovado pelo usuário.

## Conflitos examinados e resolvidos

| ID | Conflito/risco | Resolução e prova |
|---|---|---|
| B01 | S05 ainda exigia vetorizar/reconstruir símbolo do mock | Revogada a instrução. S05, WP e tasks consomem arquivos oficiais, mantendo cinco axiomas próprios. Teste verifica ausência da obrigação antiga. |
| B02 | Arte correta poderia ter bytes alterados por otimização/reexport | Kit imutável e mapa de cópias com hashes. Verificações positivas e negativas de alteração, ausência, extras, troca de variante, destino e symlink. |
| B03 | Exemplo React poderia induzir instalação de outro framework | Wrapper fino Solid app-local, recursos SVG externos; o exemplo original fica intacto no vendor. Não foi escrito frontend nesta etapa. |
| B04 | Paleta do kit poderia substituir o grafite aprovado | Separadas autoridade de arte e autoridade de tema. SPEC/BUDGETS/referência mantêm direção; nenhuma importação global dos tokens corporativos. |
| B05 | Logo completo ilegível numa sidebar pequena | Dois símbolos primary/inverse para primeiro uso; 32 px inicial, 24 px mínimo, favicon existente para 16 px. Lockups completos só em consumidores compatíveis. |
| B06 | Hashes não detectariam aplicação no consumidor/URL errados | Contrato exige render, variante, base path, MIME, dimensões, estado de erro e acessibilidade reais. Verificador de arquivos não anuncia esses testes executados. |
| B07 | Mudança da marca quebraria o gate contra o mock antigo | Exceção localizada de símbolo; comparar marca ao kit e geometria/tema/montanhas ao mock. Não mascarar toda sidebar. |
| B08 | Kit volumoso poderia entrar inteiro no build | Apenas dois assets obrigatórios na fatia inicial. Templates, documentação e originais permanecem insumos fora de public. Native/PWA/wordmarks condicionais. |
| B09 | Manifesto genérico poderia renomear ou quebrar o app | Head/manifest/ICNS são inputs, não substitutos cegos. Preservar produto, appId, scope, protocolo, updater e serviço existente. |
| B10 | Preservação da marca poderia invalidar o ownership anterior | Primeiro teste completo flagrou remoção indevida de logo.tsx do owner S05. Restaurado owner exclusivo com limite opt-in e preferência por wrapper local; teste original preservado. |
| B11 | Registro BRAND novo poderia ficar sem writer autorizado | S01 pode ajustar somente bindings/destinos/classificações; não arte, hashes de origem, política ou budgets. Teste confirma S01 como único owner do registro e S05 do wrapper. |
| B12 | Kit poderia ser confundido com paisagem final ou frontend concluído | Paisagem permanece independente na S05; nenhum asset oficial foi instalado no produto nem task promovida a PASS. |

## Verificações executadas

- Baseline v4: 133 testes das ferramentas passaram antes das alterações; log qa/v4-before-brand-tests.log.
- Primeira passagem completa 4.1: 151 testes, com uma falha de ownership. Log preservado em qa/v4.1-first-run-scope-finding.log. A correção não removeu nem enfraqueceu o teste original.
- Última passagem completa: **151 testes únicos passaram**, 133 existentes mais 18 testes de marca. Log qa/v4.1-all-tests.log; comando e exit code em qa/v4.1-test-run.json.
- Depois da correção do writer dos contratos BRAND, o conjunto completo foi repetido e passou. Resultados anteriores são históricos, não substitutos da última passagem.
- validate_plan: PASS, 143 nós, 715 grupos de axiomas, 1.980 critérios e 74 registros de superfície/fonte. São registros, não 74 telas exercitadas.
- render_issues --check: 39 projeções correspondem ao plano. render_maps --check: sem divergência.
- verify_brand: 304 arquivos do kit e 14 bindings verificados. Duas cópias obrigatórias, 12 condicionais. Validação de destinos de produto permanece NOT_RUN fora dos testes sintéticos.
- Grafo de dependências, hierarquia e locks iguais aos da v4; BUDGETS, PERFORMANCE, COVERAGE, fixture, progress e master iguais byte a byte.
- progress permanece vazio. Apenas S01-W1-T1 é a primeira task pronta, sem checkout local verificado.
- Nenhum arquivo de fonte foi incluído. Nenhum novo pacote do runtime.

Os 18 testes adicionais cobrem: kit válido; byte adulterado; cópias corretas; obrigatório ausente; variantes trocadas; symlink; escape de origem; destino não autorizado; alteração normativa invalidando digest; instrução antiga removida; ownership de wrapper/registro; arquivo extra; mock alterado; binding duplicado; corrupção rejeitada pela validação completa; projeções na revisão correta; ausência de fontes; arquivo HTML no lugar de asset opcional.

Esse conjunto não certifica assets para todos os motores SVG. Houve inspeção interna de renderizações dos símbolos para confirmar a escolha primary/inverse, não do aplicativo em execução. Imagens derivadas para inspeção não são novas fontes da marca e não foram empacotadas como assets de produção.

## Performance e acabamento preservados

O inverse fornecido mede 4.317 bytes (1.380 no gzip local nível 9) e o primary 15.295 bytes (2.301 no mesmo gzip). São tamanhos de arquivo, não tempos de paint, memória do navegador ou tráfego servido medido. O ICNS tem 425.952 bytes e sua presença no instalador deve ser medida separadamente.

Os budgets não foram ampliados. Exibir a marca não demanda polling, chamada de modelo, canvas, WebGL, animação nem um novo provider de tema. A leveza não autoriza amputar detalhes dos vetores; a fidelidade não autoriza efeitos caros adicionais. Contêiner, variante existente e largura apropriada são as ferramentas de adaptação.

## Publicação e estado real

Branch: visual-migration-plan. Nota BRAND-INPUT.md: commit 86e02726c239971735fa2025e32418d6c8320004. Bootstrap EXECUTE.md 4.1: commit 100d8e4a1745724a08d20b934df9e509dab78676, lido de volta. Issue #148 atualizada para marca HuGR oficial e paisagem independente; permanece aberta.

O ZIP é a entrega completa. Não foram enviados os 304 arquivos ou o plano inteiro ao repositório; não houve sincronização de todos os 39 corpos nem criação de relações nativas. Os textos remotos informam essa limitação, sem alegar leitura de artefatos ausentes.

## Condições de conclusão ainda obrigatórias

S01 verifica consumidores e serving no checkout. S05 copia assets e implementa o adaptador, sem alterar os originais. S06/S08/S25 integram slots e packaging. S24 compara a marca com a fonte correta, além de todos os microestados. Provas no mesmo build continuam obrigatórias, inclusive testes nativos quando aplicáveis.

Não houve frontend implementado, typecheck/build do produto, benchmark do Orchestra, render do aplicativo, instalação de ícone ou teste Electron nesta passagem. Os testes de ferramentas usam dados, repositórios e cópias sintéticos. Esta revisão foi feita pela mesma assistência em passagem de verificação; não é auditoria externa independente.

**Fechamento desta revisão:** insumo pronto e contrato atualizado. **Fechamento do produto:** não concedido. Não usar integridade da marca para marcar S05 ou a migração como concluída.
