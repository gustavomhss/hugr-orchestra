# Relay — entendimento local L2: execução, recuperação e evidência

Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Predecessor aceito: `s3-l1-relay`. Oracle congelado: `oracles/L2-all.json`, casos L2-B1 e L2-B2. Este corpo reúne contratos locais do motor nativo, drivers shell e integração Python; não declara um run executado.

## 1. Modelo local: plano, controles, efeitos e estado

Sprint é o plano ordenado; WP é a unidade estável; checklist é o conjunto de controles daquela WP. O array decide a ordem. Um controle pode observar, julgar ou executar um comando, mas o resultado de um controle não equivale automaticamente ao estado durável do arm, ao settlement do workflow ou à validade de todos os artefatos atuais.

Quatro fatos devem ser mantidos separados:

1. **Efeito externo:** o comando pode ter alterado algo fora do Relay.
2. **Disposição do controle:** pass/fail/erro foi produzido para um oracle e uma proveniência.
3. **Recibo/ledger durável:** o caller conseguiu registrar a observação na cadeia correta.
4. **Aplicação de estado:** posição, retry, completion ou settlement foi persistido.

A ordenação feliz costuma ser efeito → disposição → registro → aplicação. Crash entre passos cria resultado incerto; integridade do ledger não volta no tempo nem desfaz o efeito.

## 2. Processo morreu depois do efeito — caso L2-B1

Não se pode afirmar rollback nem exactly-once. `release` registra a intervenção e permite refazer a mesma WP, mas não reverte um comando já executado. Repetição sem evidência pode duplicar publicação, mensagem, cobrança ou escrita externa.

Procedimento seguro:

1. Identificar arm/token/WP e conferir nomes seguros, lock e estado atual. Não apagar lock ou editar JSON por conveniência.
2. Ler ledger/receipts, stderr e artefatos atuais. Procurar disposição assinada/proveniente, receipt do caller e evento de aplicação separadamente.
3. Inspecionar o alvo externo por uma porta idempotente/observável quando o contrato permitir. Ausência de receipt não prova ausência de efeito.
4. Classificar: `observed-applied`, `observed-not-applied`, `stale-not-dispatched`, `unknown-effect` ou `corrupt/unavailable`.
5. Só repetir automaticamente quando o próprio contrato prova que o trabalho não foi despachado ou quando a operação é idempotente e a chave de idempotência foi realmente usada. `unknown-effect` bloqueia repetição automática.
6. Em workflow governado, concluir pelo caminho de settlement do host. Chamar `ArmEvaluate` diretamente não substitui o receipt/settlement que a integração exige.
7. Registrar tentativa e desconhecidos. Contagem física, custo e billing permanecem `UNKNOWN` quando não expostos.

Lock repair precisa preservar o diagnóstico; arquivo de release, plan ou state editável pelo mesmo usuário do SO não é autenticação humana.

## 3. Policy compilou, judges são advisory e stdout está vazio — caso L2-B2

O que foi estabelecido é limitado:

- A compilação prova que o profile/policy passou pelo compilador correspondente. Não prova que o driver selecionado implementa todos os kinds/fields emitidos.
- IDs de controles precisam continuar globalmente únicos depois do merge. Conflito preservado é defeito; compilar não o apaga.
- Judge com `blocking:false` é advisory. Falha semântica pode ser registrada sem bloquear avanço; maioria/independência não deve ser inferida do texto “independent auditor”.
- `stdout` vazio é ambíguo. O hook pode ter concluído, recusado, escalado, falhado antes do JSON ou simplesmente não produzido texto. Consulte `arm state`, stderr e `relay verify`.
- `relay verify`/audit exit 0 prova a integridade/consistência que o comando de audit realmente checou. Não executa os gates, não comprova artefatos atuais e não transforma `oracle_recheck.status=not-run` em `ok`.
- A distinção do recheck é estrutural. Com cadeia íntegra e registros utilizáveis, `not-run` significa que nenhum sprint atual foi fornecido ou descoberto; para cadeia/registro quebrado há outro `not-run` com nota explícita de que a comparação não rodou. Depois que existe um path de sprint alcançável, falha de leitura, UTF-8, JSON ou schema é `invalid` — o próprio código fixa que sprint alcançável ilegível é “invalid, never not-run”.
- Portanto, quando comparação do plano é exigida, `not-run` é evidência ausente e `invalid` é evidência negativa de sprint ilegível/malformado. Nenhum dos dois equivale a `ok`.
- Custo ausente também não é zero: o audit retorna `total: null` e a nota `this run recorded no cost data — not zero cost, unmeasured`. Billing, tokens e tentativas continuam `UNKNOWN` sem medição.
- YAML de profile é fonte e JSON vizinho é compilado; fixtures/goldens são exemplos e oracles agrupados. Não editar um failing golden para fabricar verde sem alterar conscientemente o contrato e seus casos.

## 4. Drivers não são intercambiáveis

| Superfície | Identidade/posição | Regressão e conclusão | Limite |
| --- | --- | --- | --- |
| Arm TS | token e WP ID | checklist e controles anteriores aplicáveis; `complete` remove HOLD | host checks/judge/locks seguem contratos nativos |
| Arm shell | token/marcador e WP ID | stdout/exit têm disposições próprias | mesmo usuário pode editar arquivos; sem auth por si |
| `relay-gate eval/check` | counter ou posição nomeada | `eval` inclui DoD/regressão; `check` não avança/registre | check ainda executa efeitos |
| Benchmark hook | counter | contrato próprio de DoD/regressão | evidência experimental, não runtime geral |
| LangGraph | edges instrumentadas e ledger externo | approval/check/retry do wrapper | ledger autorrelatado e distinto do arm nativo |

Migrar de stop hook para outra superfície exige mapear posição, lifecycle, campos e receipt; não basta reproduzir exit code.

## 5. Golden/fixtures e corpus de 3.700 entradas

A maioria das entradas serve a famílias de contrato: quoting/JSON, lifecycle, migration, audit, profiles/policies, spec/design/research tools, LangGraph e campanhas. Elas não são 3.700 necessidades semânticas independentes.

- **Fonte autoral:** TS/shell/Python, YAML de profiles/policies e specs.
- **Gerado/compilado:** JSON derivado de YAML e snapshots produzidos por ferramentas.
- **Fixture/golden:** input/output esperado de um contrato; mudança exige justificativa e revisão do oracle.
- **Evidência histórica:** benchmark/results/traces; data e ambiente importam.
- **Navegação:** docs/skills catalogam superfícies, mas não viram dependências de build automaticamente.

## 6. Diagnóstico mínimo

Para blank output ou aparente completion: localizar token/WP, conferir state, stderr, ledger/verify e a prova dos artefatos atuais. Para busy: não contornar lock. Para revision drift: comparar bytes/revisão vinculados. Para judge unavailable: registrar indisponibilidade; stub/calibração não substitui revisão. Para host_check ausente ou schema inválido: falha nomeada, não pass.

Este L2 não executou arm, gate, audit ou workflow. Todo status runtime/CI continua `NOT_RUN`; custos não observados continuam `UNKNOWN`.
