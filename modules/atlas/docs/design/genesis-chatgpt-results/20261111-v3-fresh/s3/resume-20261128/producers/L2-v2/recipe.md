# Receita real de adoção/correção L2-v2

## Natureza e identidade deste complemento

Este registro foi acrescentado em `2026-11-28T06:23:56Z` pelo agente `/root/s3_l2_revision`, cujo nome canônico foi exposto pelo host por `collaboration.list_agents`. Documenta as operações já executadas na adoção/correção registrada em `2026-11-28T06:13:34Z`. O arquivo `recipe.md` não existia naquela entrega: esta é documentação complementar posterior, elaborada a partir do histórico operacional visível e dos recibos originais, sem fingir um artefato histórico recuperado.

Execução de registro: `15cc9853-0e71-4950-8813-0bfb66f82c8a`. Repositório: `gustavomhss/hugr-orchestra`. Fonte declarada no pedido: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo declarado no pedido: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Esses dois commits foram referências recebidas; não houve fetch remoto nem leitura de arquivo de protocolo.

Este complemento apenas completa a proveniência da receita. Não executa novamente a transformação, não reabre produção/revisão, não altera qualquer corpo ou recibo anterior e não emite decisão de aceite. O `response.json` original conserva seu estado `REVIEW_REQUIRED`. A comunicação da root sobre a revisão consta integralmente em `request-supplement.md`; nenhum parecer foi consultado para produzir este complemento.

## Inputs efetivamente adotados

Os inputs eram alternativas pré-existentes da recuperação, com originais históricos completos ausentes. A adoção não atribuiu autoria, prompts ou pareceres históricos. Os três arquivos foram lidos como bytes, medidos e decodificados com UTF-8 estrito.

| Corpo | Input absoluto | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| maestro | `/workspace/scratch/0666cc914bd1/s3-provenance/files/bodies/l2-maestro.md` | 6733 | `7505522f3e92fa25dfda8dac896a2717d6eac71d9bd3a928d0bf4ae5e5b08d7e` |
| relay | `/workspace/scratch/0666cc914bd1/s3-provenance/files/bodies/l2-relay.md` | 7235 | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` |
| integrations | `/workspace/scratch/0666cc914bd1/s3-provenance/files/bodies/l2-integrations.md` | 6833 | `5b65c606ab258eea521adbf0cdf4bdf43b0755ec2ec0a7be5a2efc25545ce0c3` |

## Evidência estática consultada na execução original

O dossiê autorizado foi lido; seus trechos A1 e C3 foram inspecionados novamente de forma localizada. Os dois arquivos-fonte abaixo também foram lidos para medir seus bytes/hashes e inspecionar as linhas pertinentes. Nenhum módulo do produto foi importado ou executado.

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `/workspace/scratch/0666cc914bd1/s3-provenance/l2-source-evidence.md` | 30264 | `d1a31fae0dfb0e41a074680f44b25fd023e33b304bb4b921ad4590e9ecf7e223` |
| `/workspace/scratch/0666cc914bd1/s3-provenance/sources/modules/maestro/coordination/src/approval.ts` | 9452 | `70bb260f4e7ffb20844042f8c12934ce10398779d9ff4916b0ced9c5917cd8d4` |
| `/workspace/scratch/0666cc914bd1/s3-provenance/sources/modules/app-dock/src/app-dock.ts` | 55918 | `e70b35aea0b041ab27f01823ecee2893d0738b657a4de1f67121ac016dc8e980` |

Os hashes integrais de `approval.ts` e `app-dock.ts` coincidiram com os constantes do dossiê autorizado. As linhas consultadas foram `approval.ts` 131–146 e `app-dock.ts` 357–360 e 380–390. As mudanças foram determinadas exclusivamente pelos três findings visíveis reproduzidos em `request.md`.

## As três substituições literais executadas

Cada texto anterior abaixo foi convertido em bytes UTF-8; exigiu-se exatamente uma ocorrência antes de aplicar `bytes.replace(old, new, 1)`. As quebras de linha e todos os bytes fora dessas sequências foram preservados.

### L2-v2-01 — maestro, §2, item 2

Base estática: `modules/maestro/coordination/src/approval.ts`, linhas 131–146.

Texto anterior, literal:

```text
2. A primeira resposta genuína do owner depois da apresentação é interpretada. Resposta sintética, ambígua, anterior ou em outra Session não aprova.
```

Texto substituto, literal:

```text
2. A resposta selecionada do owner deve ser genuína, ter `role=user`, pertencer à mesma Session e ser posterior à apresentação. Não pode existir qualquer mensagem intermediária com `role=user` (inclusive sintética) entre a apresentação e essa resposta. Resposta sintética, ambígua, anterior ou em outra Session não aprova; `reply-synthetic` e `reply-not-immediate` são recusas distintas.
```

### L2-v2-02 — integrations, §3, resultado unknown/uncertain

Base estática: `modules/app-dock/src/app-dock.ts`, linhas 357–360.

Texto anterior, literal:

```text
- `unknown/uncertain`: a ação pode ter sido despachada; não repetir automaticamente quando duplicação é perigosa.
```

Texto substituto, literal:

```text
- `unknown/uncertain`: a ação pode ter sido despachada; nunca repetir automaticamente.
```

### L2-v2-03 — integrations, §3, resultado stale-not-dispatched

Base estática: `modules/app-dock/src/app-dock.ts`, linhas 388–390.

Texto anterior, literal:

```text
- `stale-not-dispatched`: a regra específica pode permitir no máximo o retry delimitado.
```

Texto substituto, literal:

```text
- `stale-not-dispatched`: admite no máximo uma repetição automática, somente quando o erro é uma instância de `NativeRPCError`, com `code === "stale-ref"`, `outcome === "not-dispatched"` e `attempt < 1`; não se aplica a outros erros stale ou falhas.
```

## Procedimento efetivamente executado

1. Li os três corpos autorizados e o dossiê, calculei SHA-256 e número de bytes, confirmei os trechos locais das fontes e a identidade canônica do agente.
2. Preparei exclusivamente o diretório `s3-l2-revision/`. Uma primeira chamada de processo com esse diretório ainda inexistente como cwd foi recusada antes de executar o script; criei o diretório e executei o processamento. Não houve escrita de corpos naquela chamada recusada.
3. Executei um script Python por heredoc usando `pathlib`, `datetime`, `difflib`, `hashlib` e `json`. O script recusava sobrescrever um diretório de saída não vazio e confirmava os hashes e tamanhos esperados dos inputs e das duas fontes.
4. Percorri os corpos na ordem `maestro`, `relay`, `integrations`. Para Maestro, apliquei `L2-v2-01`. Para Relay, a lista de mudanças era vazia e `after` permaneceu exatamente igual a `before`. Para Integrações, apliquei `L2-v2-02` e depois `L2-v2-03`, na ordem registrada no `response.json`.
5. Após as substituições, decodifiquei cada resultado em UTF-8 estrito, calculei SHA-256/bytes e recusei qualquer corpo acima de 14.000 bytes.
6. Reverti, em memória e em ordem inversa, exclusivamente as substituições declaradas; comparei o resultado integral com os bytes do input. Qualquer diferença interromperia o processamento. Também comparei explicitamente Relay antes/depois.
7. Gravei os três corpos com `write_bytes`, reli cada arquivo e comparei os bytes persistidos com o resultado previsto.
8. Produzi o diff com `difflib.unified_diff`, `splitlines(keepends=True)`, contexto `n=3` e nomes `a/bodies/...` e `b/bodies/...`. Relay não gerou hunk porque não mudou.
9. Gravei o pedido inicial e seu complemento visível em `request.md`, o recibo novo de adoção/correção em `response.json` e o inventário dos seis outros arquivos em `adoption-manifest.json`. Os JSONs foram serializados com `ensure_ascii=False`, `indent=2` e uma quebra de linha final.
10. Em uma conferência estática separada, reli os JSONs; confirmei `REVIEW_REQUIRED`, os hashes/tamanhos de todos os arquivos indexados, os hashes/tamanhos dos inputs e outputs dos corpos e o inventário exato de sete arquivos. Essa conferência não executou código do produto nem testes.

### Núcleo da transformação e da checagem de reversão

O trecho abaixo documenta o núcleo utilizado. `edits` corresponde exatamente às três substituições acima; `before` contém os bytes lidos do input de cada corpo. Ele não foi executado novamente para gerar este complemento.

```python
after = before
relevant = [edit for edit in edits if edit['body'] == name]
for edit in relevant:
    old = edit['before'].encode('utf-8')
    new = edit['after'].encode('utf-8')
    if after.count(old) != 1:
        raise RuntimeError('Replacement occurrence is not unique: ' + edit['id'])
    after = after.replace(old, new, 1)

after.decode('utf-8', errors='strict')
if len(after) > 14000:
    raise RuntimeError('Body exceeds byte limit: ' + name)

reversed_bytes = after
for edit in reversed(relevant):
    reversed_bytes = reversed_bytes.replace(
        edit['after'].encode('utf-8'),
        edit['before'].encode('utf-8'),
        1,
    )
if reversed_bytes != before:
    raise RuntimeError('Bytes outside bounded substitutions changed: ' + name)
if name == 'relay' and after != before:
    raise RuntimeError('Relay must be identical.')
```

## Resultados já produzidos e preservados

| Corpo | Bytes antes | Bytes depois | Delta | SHA-256 final |
| --- | ---: | ---: | ---: | --- |
| maestro | 6733 | 6979 | 246 | `5907c7745c2533529d3039f9d8635f76bd98aeefaa5612b8594723341d258012` |
| relay | 7235 | 7235 | 0 | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` |
| integrations | 6833 | 6968 | 135 | `90c2c94bf63580c676f88a7065fd3cadb4e6fd6332c99c9f9d9534d56086d259` |

`response.json` contém os hashes antes/depois, as origens e as três substituições. `changes.diff` contém o diff integral, e `adoption-manifest.json` vincula os arquivos da entrega original. Todos continuam com os mesmos bytes; o manifesto original não foi reescrito para incluir este complemento. O novo `recipe-response.json` identifica e mede os arquivos complementares.

## Limites mantidos

- Foram apenas três substituições localizadas; não houve reautoria ampla nem qualquer mudança em Relay.
- Os corpos são evidência estática; runtime, testes, CI e live acceptance permaneceram `NOT_RUN`. A checagem de bytes/UTF-8/hashes não constitui execução do produto.
- Não houve escrita no GitHub, nova autoridade ou alteração L1. A execução documentada não avançou L3/L4. Este complemento também não executa L3/L4.
- Nenhum arquivo de oracle, judgment ou resposta reservada foi aberto ou incluído. Referências textuais já existentes nos corpos foram preservadas junto com todos os demais bytes não alterados.
- Custos, tokens e tentativas físicas não medidos permaneceram `UNKNOWN`.
- O agente realizou adoção/correção como produtor e este registro documental; não emitiu aceite independente e não alterou o status original.
