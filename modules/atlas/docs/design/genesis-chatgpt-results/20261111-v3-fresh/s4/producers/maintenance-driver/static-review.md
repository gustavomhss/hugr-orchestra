# Observações estáticas — WP-MAINTENANCE-DRIVER

Esta é uma declaração do produtor sobre o código entregue, não um parecer independente nem uma execução da operação. Runtime, testes, build, typecheck e guards de produto: **NOT_RUN**. Não foram fornecidos ou inventados baseline, target, alteração de domínio ou decisões reais para executar esta composição.

Arquivo revisado: `maintenance-operation.mjs`, 22.051 bytes, 317 linhas, SHA-256 `a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f`. O parser `node --check` retornou exit code 0 sem avaliar imports ou executar o corpo. Isso verifica sintaxe JavaScript, não resolução de módulos Bun/TS, tipos, integração ou comportamento operacional.

## Conferências no texto

1. O prepared é rederivado pela porta real e comparado pelo candidate ID, kernel ID e JSON exato. A origem dessa conferência é `genesis-native.ts:112-120`.
2. O binding é validado pela porta real. Approval, prepared e requests/responses têm bytes preservados no CAS existente. A adaptação declarada para `OwnershipReview` usa o mesmo contrato/tipo de `genesis-native.ts:123-145` e não chama o publicador para obter reviews. A validação não autentica pessoas a partir de strings (`genesis-native-binding.ts:18-19`).
3. O registry cobre todas as keys, impõe o input real do driver, ordem lexicográfica dos inputs e a ordem existente das dependências. Rejeita alteração de metadados estruturais, roots, contrato, keys ou topologia. A ordem importa para o envelope (`ownership-rebuild.ts:318-343`; `canonical.ts:56`).
4. Capturas usam observação real, leitura limitada e kernel ID. Os bytes retidos nunca são substituídos; reobservações continuam lendo o host. `run` acessa somente captura, dependências resolvidas e output anteriormente carregado do CAS. Todos os campos de resultado são explícitos, sem defaults de fixture. `evaluate` recusa qualquer envelope diferente do target.
5. O rebuild existente é a única implementação do planejamento/reúso. O resultado privado inteiro é comparado ao target, inclusive no caminho de zero calls (`ownership-rebuild.ts:213`). Um output diferente sem invalidação observável não é ativado por atalho.
6. Publicação usa grounding real, `composeRuntime.check` e o handler existente. Há validação atual de todas as entries e verificação do baseline publicado antes da emissão. Policy, actor, ratify e trust ficam na composição nativa (`compose.ts:162-176,233-236`).
7. O handler real retorna `ok:false` para `emitted:false` e mantém o resultado em `data` (`tools/handler.ts:190-200,386-427`). O driver exige `ok:true` e `data.emitted:true`, preserva o retorno integral e não usa no-op/readback para transformar recusa em sucesso. A implementação real é `adapter-io/governed-emit.ts:169-405`; `tools/emit.ts` declara seu `createEmit` como modelo de referência e não é usado.

## Limites que permanecem explícitos

São aceitos apenas inputs `file:` obrigatórios, no layout já vinculado ao baseline. O operador precisa vincular o driver antes da primeira publicação e fornecer decisões reais para o target exato. O script pode ser executado de uma cópia byte a byte igual ao input no corpus; ambos são reobservados. O runtime previsto é o commit informado pelo principal, não uma revisão Git certificada por esta entrega.

As verificações não criam lock global, snapshot atômico do host ou fence de época. A ativação conserva as portas e os limites nativos. O driver não escreve logs próprios fora do CAS; a publicação mantém os efeitos duráveis do produto, inclusive projeção e eventual log nativo. `calls` conta callbacks determinísticos, não chamadas de modelo, IO total ou dinheiro. `model` e `tokens`: **UNKNOWN**.

Os trechos de portas transportados para revisão são dados estáticos. Nenhum resultado reservado ou resposta de juiz compõe este relatório. Não há declaração de PASS, publicação realizada ou aceitação de S4.
