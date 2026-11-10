# Mine AC-08 / AC-09

Repositório: `gustavomhss/hugr-orchestra`  
Base declarada: `genesis-economy-green`  
SHA de leitura e pai do commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`  
Árvore base: `a522a53e5f046f1758151b0f558531bbded04592`  
Branch de entrega: `mine-ac0809`

## Sete casos, sem veredito global

Esta fatia contém **3 casos AC-08 e 4 casos AC-09**. Subcenários, testes candidatos e achados de revisão não aumentam essa contagem. Os registros completos estão em [ac08-cases.json](ac08-cases.json) e [ac09-cases.json](ac09-cases.json); o método, a contagem e a proveniência estão em [receipt.json](receipt.json).

Cada caso é `INDETERMINATE` quanto à suficiência da prova para a obrigação solicitada. Isso não significa teste falho nem ausência de implementação. Código, assertion, resultado histórico e aceite têm campos distintos. As citações são `path:blob` de corpos lidos no SHA acima, com localizadores. Uma referência a um run em documento histórico conserva seu head e alcance originais.

| Caso | O que o mine encontrou | Limite da prova |
| --- | --- | --- |
| AC-08 reserva | Transação `immediate`, grant após commit e guard anterior ao delegate. EA-02 reabre reserva após ack perdido. | EA-02 grava `recordForward` manualmente: falta suspensão de ack e observação da reserva pelo outro leitor no delegate. |
| AC-08 liquidação | EA-08 exige duas tentativas e só a segunda liquidada; EA-20 lê o 12 persistido; EA-21 cobre ack perdido após commit. | Há lacunas nos oráculos de usage incompleto, vínculo fora de ordem e contagem inclusiva. Nenhum aceite completo aplicável foi lido. |
| AC-08 concorrência | EA-11 usa duas instâncias no mesmo banco, saldo 10, reservas 6, slots suficientes e perdedor por `balance`. | Não usa barreira determinística nem conta o forward no delegate físico. |
| AC09-03 missing artifact | IFIT-1 tem resultado histórico nominal `passed`; RB-18/20 têm assertions de `ownership-missing`. | O resultado IFIT-1 é do manifesto CAS ausente/wrong-kind, em outro binding; nenhum aceite nominal aplicável foi lido. RB-18/20 não herdam esse resultado. |
| AC09-06 invalid generation | Controle nominal de geração não parseável em `readSidecarSet`; `commitProjection` recusa escrita `unreadable` quando nada parseia. | Assertions reais de armazenamento, sem resultado/aceite nominal lido. O gate/reader pertinente precisa ter vínculo explícito; sidecar não é excluído de antemão. |
| AC09-08 shared manifest corruption | Leitor valida manifesto antes da seleção; store de disco trata JSON inválido/rehash divergente como ausência. | Não foi lido controle/resultado de corrupção do manifesto compartilhado retendo suas leituras dependentes. |
| AC09-09 branch-protection | YAML do guard declara que tornar o check obrigatório depende de configuração externa; worklist é outro fluxo. | Definição ou verde de workflow não demonstra enforcement. Nenhuma política live foi retroativamente atribuída ao pin. |

## O que o enquadramento errou

### 1. Aceite ausente não apaga código nem reparos

O r5 julga `5c84ce4d0feafaa63211aa4169be65b6f492e1b6`, por leitura estática. Ele não pode ser aplicado automaticamente como defeito do SHA desta fatia. No pin atual, os corpos de EA-08, EA-20 e EA-21 já contêm assertions antes ausentes, e EA-11 já distingue saldo de slots. Essas melhorias são registradas como implementação/oráculos presentes, sem fabricar execução.

Fontes: `modules/atlas/docs/design/genesis-campaign-results/update-plan-implementation-v1/astra-f2-g1-green-r5.decision.json:2911823cb692c935c0b8891474932e591317b553`; `packages/core/test/economy/admission.test.ts:652f08e7729203a447ffdff957d5dbcc396a1484`; `packages/core/test/economy/executor.test.ts:ec84047bc6a2064a35f88d2deac269f119f96bf2`.

### 2. Grant, encaminhamento, terminal e liquidação são observações diferentes

EA-02 não prova ordem commit→forward apenas por seu nome. EA-11 observa um grant, não um único envio físico. O contrato exige contador no delegate e barreiras determinísticas. Usage desconhecido mantém a obrigação; terminal suficiente pode liberar apenas o slot. O parser recusa `close.invalid` antes de `observeTerminal`.

O inventário histórico delimita 120 dispatches lógicos, 114 resultados pareados e seis originais com uso desconhecido. Essas contagens não são tentativas físicas liquidadas nem moeda. Desconhecido continua `unknown, not zero`.

Fontes: `modules/atlas/docs/design/genesis-g1-contract.md:a18838b86ddc578ac02f6986a9ad49981ba35cbf`, §§1.3–1.6 e §3; `packages/core/src/economy/executor.ts:925984643e4a4cd5b844e02e9d48c473b8d3353c`, 335–368; `modules/atlas/docs/design/genesis-campaign-results/accounting-inventory-summary-v1.json:526ad1f0cca21ed05b7c78027efb8d1aa0a42dd4`.

### 3. Missing artifact tem resultado histórico; falta aceite nominal aplicável

O relatório versionado nomeia `IFIT-1 refuses a missing or wrong-kind CAS object` como `passed`. Seu manifesto registra o [run 42135009305](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42135009305), head `0f21e6a20e9e57bf6d65d9b8e1438839f290968e`, escopo `atlas-pilot`. O run não foi consultado independentemente nesta fatia; o resultado lido é o relatório persistido. Ele não é uma execução atual nem resultado de RB-18/20. Os aceites examinados não nomeiam essa recusa no alcance observado. O uso do reader real com CAS em memória não cria, por si, obrigação nova de host composto.

Fontes: `modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/ownership-runtime-results.json:37d5e2be561bc9dd16e7730a434f0aa9aac768e3`; `modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/evidence-manifest-v1.json:e65be0852f0ff27ec45103f86317f9a97f18b891`; aceites e limites citados em `ac09-cases.json`, AC09-03.

### 4. A matriz não era um inventário exaustivo de assertions

O G4 dizia que não havia assertion aberta de geração inválida. Este mine abriu o controle nominal `UNPARSEABLE generation` no reader de sidecar e a recusa de escrita `unreadable`. Isso acrescenta fonte concreta, sem convertê-la em resultado aceito nem impor uma categoria nova de geração.

Corrupção do manifesto compartilhado continua outro caso: exige observar as leituras dependentes retidas. Manifesto ausente, corrupção de sidecar e rollback de identidade estrangeira não substituem essa observação. No store de disco, bytes CAS adulterados viram `undefined` antes do reader; não se fabrica `ownership-integrity` com stub de `get`.

Fontes: `modules/atlas/docs/design/genesis-g4-host-migration-contract.md:913235d97bc0ba42bc80dc84a3adf607ef457df9`, 18, 31 e 33; `modules/atlas/packages/adapter-io/test/sidecar-generation-filename.test.ts:bc474d2dd93f74ea25b7cacb15f3357afb760785`, 93–101; `modules/atlas/packages/adapter-io/test/sidecar.test.ts:9c50d3b38105cdbee8d78e3ffd24d6d8fdf3ab93`, 261–271; `modules/atlas/packages/adapter-io/src/store.ts:8c71e53e0ff26165bed2cf3f147f913c05889d8a`, 272–289.

### 5. Workflow não é branch protection

`atlas-guard.yml` depende de configuração externa para ser required check. `atlas-worklist.yml` declara que CI não tem Atlas store e produz somente a worklist. Falta de recibo de enforcement não permite afirmar que a branch está desprotegida.

Fontes: `.github/workflows/atlas-guard.yml:97c2738c447c8cdb37389da612566e716654cc3b`, 3–10; `.github/workflows/atlas-worklist.yml:0d19e573c705b296d38de15e60224f4c182d4a1c`, 3–10.

## Execução e preservação

A mineração usou subagentes separados para AC-08 e AC-09, mais revisão independente. Foram lidos código, testes, contratos e recibos. A verificação local se limitou aos arquivos documentais: JSON, contagem, escopo, citações e hashes. Não houve teste de produto local, workflow disparado, chamada de producer/provider ou gasto novo de execução do repositório.

A consulta remota de runs com `head_sha=1cde2ff7a71bcf7aecb5d030917b577165135d38` retornou `total_count=0`; a resposta e seu limite estão no recibo. Isso não é falha de CI nem prova de ausência de runs de snapshots com outro head. Executar a suíte existente não supriria automaticamente os observadores ausentes nem produziria um aceite nominal.

Os mapas e aceites anteriores permanecem intactos. AC-03 não é reaberto; old-producer permanece `INDETERMINATE`; G3 não é renomeado; nenhuma ordem de versão foi inferida; nenhum sidecar untrusted foi servido. A entrega é documental, somente neste diretório, sem PR, merge, force-push ou atualização de `genesis-run-fix`.
