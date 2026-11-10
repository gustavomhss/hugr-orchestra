# Next block after the hold (2026-11-10)

Verdict by Astra via the browser. The lead has not implemented it. The hold on
`c0335bec177976f801df1e148bbaad5eede95a2a` remains.

## Verbatim verdict

> VEREDITO: A
>
> Correção limitada ao normalizador e ao lookup, partindo de c0335bec177976f801df1e148bbaad5eede95a2a.
> O bloco deve implementar a severidade por achado, com as regressões diretamente necessárias.
>
> Preservação do nível nativo. O nível SARIF deve atravessar parsing, Raw e resolução da prioridade
> sem ser descartado. O resolver utilizado pelo controller deve receber a informação do achado, além
> de pack e regra.
>
> Resolução explícita pelo catálogo. Para zizmor: note → P3, warning → P2, error → P1. Eliminar a
> escolha pelo primeiro valor de Object.values. Regras que declaram prioridade fixa por "*" continuam
> seguindo essa política explícita; elas não precisam inventar um nível nativo.
>
> Regressão pela cadeia real de normalização. Três achados zizmor/artipacked, variando somente o nível,
> devem passar pelo parser e pelo mesmo resolver usado em produção, chegando aos itens com classe
> security.secret estável e prioridades P3/P2/P1, respectivamente. Um lookup substituto no teste que
> já devolva a prioridade esperada não comprova a correção. Os casos Medium e High devem detectar o
> defeito anterior.
>
> Ausência ou nível desconhecido sem classificação silenciosa. Para uma regra que exige mapeamento por
> nível, esses casos devem gerar diagnóstico explícito de falha de normalização, preservando a evidência
> bruta. Não podem receber P3 por padrão, desaparecer como regra desconhecida nem produzir resultado
> limpo. Incluir regressões desses casos.
>
> Compatibilidade demonstrada. Typecheck do core e testes afetados devem passar. Preservar o
> comportamento das regras com prioridade fixa e a regressão oxlint que comprova exclusão da regra
> dropped antes do CLI, com ausência no raw e controle positivo da regra mantida.
>
> Proveniência do novo candidato. Registrar o SHA resultante da correção. Para o aceite técnico deste
> bloco, admito evidência de test:ci sintética com comparação explícita das árvores, demonstrando
> igualdade com o candidato salvo o .ci-run.json identificado e conferido. Registrar separadamente SHA
> candidato, headSha real, run e ambiente. Isso comprova equivalência de conteúdo; não transforma o
> run em uma execução com headSha igual ao candidato.
>
> O HOLD permanece após este aceite parcial. Este bloco não reverte o catálogo, não ativa o controller
> zizmor e não altera o helper de CI. O roteamento zizmor para not-built e a qualificação final do tip
> continuam como pendências explícitas; um verde do normalizador não as encerra.

## Out of scope

- Revert of `c0335bec17`
- Zizmor controller activation
- Changes to `script/test-ci.ts`
- Treating a synthetic `test:ci` headSha as the candidate SHA
