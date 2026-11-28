# Gerador externo de `command.json`

`operation-config.py` escreve exclusivamente uma configuração nova, fora das raízes S2. Não executa Atlas, wrapper, recorder ou instalação de política. O diretório futuro de resultado precisa estar ausente e não é criado pelo gerador; o diretório pai da configuração deve existir.

São fixados runtime `db9b423…`, release selado `e171783…`, candidato `d1c847…`, original `4a36e1…`, Bun e CWD exatos. O gerador confere os 716 registros originais do prepare e os 1.170 do byte lock, preservando cada registro e deduplicando somente caminhos idênticos com bytes idênticos. Acrescenta preparado, receipt/lock, recorder `0185ccf…`, wrapper, CLI original, o próprio gerador e controles declarados. Uma divergência impede escrever a configuração.

## Interface

```text
python operation-config.py OPERATION
  --operation-id ID_NOVO
  --command-file /caminho/externo/command.json
  --result-dir /caminho/externo/resultado-ainda-ausente
```

Operações: `init-store`, `admit`, `index`, `read`.

- **init-store:** requer `--generation HASH_EXATO`; não declara actor. Remove do ambiente herdado `ATLAS_ACTOR` e `ATLAS_RATIFY_TOKEN`.
- **admit:** requer `--approval CAMINHO_BINDING --approval-sha256 HASH`. O binding e os requests/responses devem estar no namespace exclusivo abaixo, fora de `.atlas`. Se os bytes ainda não estiverem instalados, passe `--approval-source /arquivo/externo/exato.json`. O argumento do CLI é relativo à raiz; o gerador não copia o binding.
- **index/read:** requer `--query /controle/externo.json --query-sha256 HASH`. O gerador valida apenas o formato do reader original, sem gerar perguntas, respostas, dicas ou campos de oracle. O controle precisa estar fora das raízes de fonte.
- **Consumidor real:** opcionalmente acrescente, juntos, `--consumer-case ID_CONGELADO --consumer-agent ID_REAL_RETORNADO`. Nenhum agente é criado ou inferido. O gerador exige que `consumer.id` e `consumer.mode` da política pretendida coincidam com o caso/modo informado. O par fica no `command.json` preservado pelo recorder; não é acrescentado artificialmente ao recibo fixo. Sem agente fornecido, apenas a identidade de orçamento da política é registrada, sem alegar execução por consumidor independente.

Namespace de binding, relativo a `/workspace/scratch/5cfbb6c803f1/s2-evaluation`:

```text
modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2/binding/
```

Por exemplo, `CAMINHO_BINDING` é esse prefixo seguido de `binding.json`; requests e responses usam outros arquivos no mesmo namespace. Declare cada referência de decisão via `--input` ou `--control`, com o SHA-256 exato indicado no binding para aquele arquivo. O gerador confere as referências e seus pins sem avaliar votos. Replica as regras de `nativePath`: caminho relativo, texto NFC, sem segmentos vazios, `.`, `..`, `.git` ou `.atlas` em qualquer capitalização, sem caracteres proibidos ou segmentos terminados em ponto/espaço. O nome do controle externo de query também é validado.

Para `admit`, `index` e `read`, é obrigatório declarar os bytes exatos do marker e das duas políticas por `--input` ou `--control`:

```text
--input /arquivo/existente SHA256_INTENCIONAL
--control /target/esperado /source/com/bytes/intencionais SHA256_INTENCIONAL
```

`--control` registra tanto source quanto target. Não instala nem altera target; este pode ainda não existir ou conter a política anterior. O recorder exige os bytes intencionais antes de executar. Dentro da raiz, targets adicionais são permitidos somente no namespace de binding acima ou nos três arquivos de estado `.atlas/evaluation-store.json`, `.atlas/evaluation-policy.json` e `.atlas/policy.json`. Nenhuma das 716/1.170 linhas fixadas pode ser redefinida. Para marker existente, use seu hash efetivamente capturado. Para políticas, use os bytes exatos previamente definidos, sem tratar configuração como aprovação.

Para readers, a política pretendida é lida do source declarado (ou do arquivo instalado quando usado com `--input`) e seu caso/modo é comparado com o plano e os metadados fornecidos. Se a política atual ainda for outra, o comando não poderá executar até a instalação dos bytes pretendidos: o recorder fixa o hash do target. O builder apenas registra essa diferença; não troca política nem orçamento.

As demais operações declaram apenas `ATLAS_ACTOR=genesis-s2-resume-846d4f9c`. Todas removem `ATLAS_RATIFY_TOKEN`; o actor herdado também é removido antes da declaração nominal.

## Exemplo de preparação da configuração inicial

```bash
python /workspace/scratch/5cfbb6c803f1/s2-investigation/operation-config.py init-store \
  --operation-id s2-evaluation-init-store-01 \
  --command-file /workspace/scratch/5cfbb6c803f1/s2-execution/init-store-01-command.json \
  --result-dir /workspace/scratch/5cfbb6c803f1/s2-execution/init-store-01 \
  --generation "$GENERATION"
```

`GENERATION` deve vir da identidade já fixada pelo operador; o gerador não a inventa. A criação da configuração não autoriza execução. Após revisão e os requisitos correspondentes, o comando separado é:

```bash
python /workspace/scratch/5cfbb6c803f1/s2-investigation/capture-state-operation.py \
  /workspace/scratch/5cfbb6c803f1/s2-execution/init-store-01-command.json \
  /workspace/scratch/5cfbb6c803f1/s2-execution/init-store-01
```

Nesta entrega, somente a sintaxe e a estrutura do gerador foram verificadas. Nenhuma configuração operacional ou diretório de resultado foi criado, e nenhum dos dois comandos acima foi executado.

## Correção anterior ao primeiro uso

A versão inicial restringia binding a `.atlas`, incompatível com `nativePath` do CLI. Foi preservada integralmente em `operation-config-history/initial-before-native-path-fix/`, com `correction-note.json`. O erro foi encontrado pela revisão de root antes de qualquer configuração/operação; a correção muda somente builder e documentação, mantendo CLI, gates e helpers fixos intactos.
