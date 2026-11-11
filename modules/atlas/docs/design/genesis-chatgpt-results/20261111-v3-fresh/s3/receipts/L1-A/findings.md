# Findings — L1-A Maestro

Fonte de produto: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Todos os paths abaixo resolvem em `sources.json`; os conflitos decisivos constam em `review-evidence.md`. Este registro não é parecer de juiz. Não houve alteração do produto.

## F-A01 — Capacidade anunciada sem decisão implementada

**Observação:** `modules/maestro/coordination/src/v2/tools/result.ts` registra `maestro_record_result_decision`, valida o caller e então sempre falha com `HOLD work-result-unavailable`. O próprio arquivo distingue o WorkResult estruturado V2 da identidade de tool-part necessária à decisão durável.

**Impacto:** catálogo/descrição e resultado de worker não demonstram aceite. O consumidor deve reportar o resultado ao owner e preservar a lacuna; não gerar recibo sintético nem afirmar decisão persistida. No L1 a capacidade está delimitada; implementar o comportamento é trabalho de produto fora deste despacho.

**Estado:** limitação funcional existente, exposta no corpo; aprofundamento L2/L4 preservado.

## F-A02 — Spec de Memory está desatualizada perante o código

**Intenção/documento:** `docs/specs/seat-framework/README.md` afirma um único owner de Atlas Memory (`backend`) e que outras definições seriam recusadas. A abertura também aponta a antiga árvore `packages/orchestra/src/maestro`.

**Observação:** `modules/maestro/coordination/src/seats/seat.ts` permite `backend`, `jimmy`, `archie`, `live`; as quatro definições declaram `atlasMemory:true`. `src/v2/atlas-source.ts` confirma esses quatro owners e exige seat nativo da Location. A árvore implementada está em `modules/maestro/coordination`.

**Disposição:** o corpo usa o código pinado para disponibilidade atual e preserva a intenção histórica como conflito, sem corrigir a spec neste trabalho. As regras de toolkit continuam limitadas a backend, sem ampliar esse grant por analogia.

**Estado:** conflito documental, não ausência de fonte; corrigir/reconciliar em manutenção posterior.

## F-A03 — Comentário sobre standalone não acompanha o caminho de embedding

**Observação:** `src/v2/seats.ts` comenta que o standalone CLI não carrega árvores. `src/seat-skill-root.ts` aceita `ORCHESTRA_SEAT_SKILLS_EMBEDDED`; `apps/cli/script/build.ts` fornece os virtual files e define essa flag como verdadeira. O gerador reúne skills de seats, shared e playbooks.

**Disposição:** falha real de carregamento produz warning/ausência de seats, mas não se conclui indisponibilidade de todo standalone. A inspeção não prova que um binário distribuído específico foi construído ou executado corretamente.

**Estado:** comentário divergente; runtime/packaging executado permanece não observado.

## F-A04 — Metadado de compatibilidade é mais estreito que a implementação

**Observação:** o bloco gerado do README de coordenação registra `Legacy and compatibility: none`. `roster.ts` canonicaliza um ID legado de backend, mantém profiles históricos; `v2/governance/records.ts` lê várias versões de eventos; `logical-task.ts` reconcilia autoridade histórica do pai imediato.

**Disposição:** não inferir ausência de compatibilidade de dados a partir daquele metadado de módulo. O corpo enumera a compatibilidade interna observada e preserva os registros antigos. Não se conhece daqui uma política completa de migração/remoção.

**Estado:** precisão documental insuficiente; interpretação explicitamente delimitada.

## F-A05 — Limites de execução que não podem ser omitidos

**Observação:** os quatro seats `staffed:false` recusam dispatch novo, mas a condição de continuação/reserva/workflow os trata separadamente. Upstream em background, ausência do host de background e replay autorizado incompatível têm recusas explícitas. A decisão final V2 de WorkResult permanece indisponível (F-A01).

**Observação:** o budget do conductor é process-local por drain; as alterações são medidas antes da chamada seguinte. Sem snapshots, não há medição de linhas/arquivos. O read sandbox adicional dos seats é aplicado em macOS/Linux; não se atribui a mesma garantia ao Windows a partir de `write-roots.ts`.

**Disposição:** esses limites são comportamento observado, não problemas resolvidos ou controles executados por esta unidade. Constam do corpo para impedir que L2/L3 promovam intenção a capacidade.

**Estado:** limites aceitos como escopo de conhecimento L1; provas operacionais pertencem às próximas etapas.

## F-A06 — Prova executada e cobertura semântica ainda têm fronteiras

**Observação desta produção:** 80 fontes de produto/fronteira foram capturadas e inspecionadas (algumas por linhas selecionadas), além de cinco documentos de protocolo. A população de 424 paths foi classificada integralmente. Os corpos não lidos têm disposition e necessidade posterior explícitas. Testes e fixtures foram relacionados a contratos, sem alegar leitura individual nem execução.

**Lacuna:** nenhum teste Bun, typecheck, checker do produto, build, Session ou porta Atlas foi executado. Não há recibo Actions deste produtor. Não há parecer semântico independente nem consumidor executado nesta entrega de produtor. Esses estados não foram convertidos em PASS.

**Disposição:** candidato L1 pronto para os juízes. L2/L3/L4 não foram entregues neste despacho; o inventário conserva suas necessidades. O controle mecânico de população/hash não prova suficiência semântica.

## F-A07 — Cópias locais do protocolo têm um LF adicional

**Observação mecânica:** cada um dos cinco arquivos fornecidos em `genesis-s3/protocol/` tem exatamente um LF extra ao final em comparação com o blob Git do protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. O diff não contém mudança semântica. A primeira asserção de igualdade local falhou e foi investigada; não foi ignorada.

**Disposição:** capturas exatas foram feitas pelo conector em `recipe/.orchestra/skills/execute-genesis/`; `protocol-sources.json` guarda SHA-256 da captura exata, SHA-256 da cópia fornecida e `provided_local_matches:false`. Os arquivos da orquestradora não foram alterados. Recipe/protocol permanece separado dos inputs de produto.

**Estado:** vínculo exato resolvido pela captura Git; diferença original preservada para rastreabilidade.

## F-A08 — Erro local de formato do inventário foi corrigido

Uma primeira leitura determinística supôs que `population-A.json` tinha envelope com `entries`; o arquivo é uma lista. O erro ocorreu após a leitura de fronteiras e antes de gerar cobertura. A leitura foi corrigida, os 424 itens foram reconciliados, e o script final verifica unicidade e a decomposição 325+99. Não houve mutação do inventário de origem nem resultado parcial apresentado como completo.
