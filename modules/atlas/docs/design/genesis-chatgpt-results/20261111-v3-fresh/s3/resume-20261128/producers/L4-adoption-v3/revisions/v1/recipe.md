# Receita — S3 L4 adoption v1

Produção original por `/root/s3_l4_producer` em `2026-11-28T06:38:33Z`, execução `15cc9853-0e71-4950-8813-0bfb66f82c8a`. Saída no momento da produção: `REVIEW_REQUIRED`; o produtor não concede aceite.

## Escopo e base

Adoção dos quatro alternativos estáticos, com substituições localizadas. Fonte de produto: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. O pedido literal e seu complemento de transporte estão em `request.md`. A seleção L3 foi verificada por bytes/SHA-256; a liberação de L1/L2/L3 é atestada pela principal, não deduzida de frases antigas nem de pareceres lidos por este produtor.

Os originais superiores, prompts e aceites históricos ausentes não foram reconstruídos. O produtor desta resposta é a instância real `/root/s3_l4_producer`; não reivindica a autoria dos alternativos. A nova adoção registra somente as mudanças desta execução.

## Operações realizadas

1. Ler apenas os quatro alternativos, os corpos L1/L2/L3 autorizados, os dois suplementos públicos e as fontes estáticas registradas em `response.json`.
2. Recalcular bytes UTF-8 e SHA-256, exigindo correspondência dos quatro alternativos e do L3 selecionado com os identificadores do pedido corrigido.
3. Aplicar uma vez cada substituição literal de `response.json`, em ordem, sem normalização de newlines, espaços ou conteúdo fora dos trechos enumerados.
4. Datá-las como estado/autoria no momento da produção e remeter liberação futura aos recibos externos sobre os bytes exatos.
5. Conferir decodificação UTF-8, newline final, hashes finais e limite de 16.000 bytes de cada corpo; gerar `changes.diff` a partir dos inputs preservados.
6. Reproduzir as substituições em memória para confirmar a igualdade dos corpos e do diff e conferir que os hashes dos inputs/fontes permanecem os mesmos. Essas são verificações de artefatos documentais; não são teste de produto ou aceite semântico.

## Correções obrigatórias

- Todos: proveniência nova e estado de produção datados, predecessores liberados conforme atestado, ausência de aceites originais preservada e liberação L4 externa.
- Entry: retirar o estado histórico incorreto de que L3 ainda não fora liberado. O mapa restante foi preservado.
- Ownership: nenhuma mudança de conteúdo de domínio; apenas estado/proveniência de adoção.
- Maintenance/operational: preservar a regra exata da resposta genuína `role=user`, mesma Session, após apresentação e sem qualquer user intermediária, inclusive sintética.
- Maintenance/operational: Dock unknown nunca admite replay automático; o único retry exige `NativeRPCError`, `stale-ref`, `not-dispatched` e `attempt < 1`.
- Operational: distinguir `release` do arm parked de `recover` do run lock; manter HOLD enquanto efeito é desconhecido; atualizar o encerramento que indevidamente mantinha L2/L3 sem aceite.

## Reprodução somente de bytes

A partir de `/workspace/scratch/0666cc914bd1`, o trecho abaixo lê entradas autorizadas e saídas deste produtor. Não importa nem executa produto; não escreve arquivos.

```python
from pathlib import Path
import hashlib, json, difflib

root = Path('/workspace/scratch/0666cc914bd1')
record = json.loads((root / 's3-l4-adoption/response.json').read_text(encoding='utf-8'))
patches = []
for item in record['artifacts']:
    raw = (root / item['input']['path']).read_bytes()
    assert len(raw) == item['input']['bytes']
    assert hashlib.sha256(raw).hexdigest() == item['input']['sha256']
    text = raw.decode('utf-8')
    for change in record['substitutions']:
        if change['artifact'] != 'bodies/' + item['name']:
            continue
        assert text.count(change['before']) == change['expected_occurrences'] == 1
        text = text.replace(change['before'], change['after'], 1)
    data = text.encode('utf-8')
    assert data == (root / item['output']['path']).read_bytes()
    assert len(data) == item['output']['bytes'] <= 16000
    assert hashlib.sha256(data).hexdigest() == item['output']['sha256']
    patches.extend(difflib.unified_diff(raw.decode('utf-8').splitlines(keepends=True),
        text.splitlines(keepends=True), fromfile=item['input']['path'],
        tofile=item['output']['path'], n=3))
assert ''.join(patches).encode('utf-8') == (root / 's3-l4-adoption/changes.diff').read_bytes()
for source in record['sources_used']:
    data = (root / source['path']).read_bytes()
    assert len(data) == source['bytes']
    assert hashlib.sha256(data).hexdigest() == source['sha256']
print('REPRODUCED_BYTES; semantic release remains external')
```

## Limites e handoff

Runtime, build, testes, CI, provider, Dock, Janitor, live acceptance, importação/publicação/leitura Atlas: `NOT_RUN`. Custos, billing, tokens e chamadas físicas: `UNKNOWN`. Não foram lidos oracles, judgments, casos ou respostas de consumidores. Referências históricas a essas rotas já presentes nos corpos foram preservadas como texto; não foram seguidas. Não houve chamada GitHub, escrita em inputs ou escrita fora de `s3-l4-adoption/`.

São necessários dois novos pareceres independentes sobre os quatro hashes finais. A adoção não converte aceites dos predecessores em aceite L4. Depois da produção, somente os recibos externos determinam a liberação; esta resposta original e seus corpos conservam o estado datado da produção.
