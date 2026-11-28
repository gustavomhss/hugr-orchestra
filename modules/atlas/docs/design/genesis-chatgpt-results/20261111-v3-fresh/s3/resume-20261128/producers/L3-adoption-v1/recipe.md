# Receita real da adoção L3

## Identidade e alcance

Produção realizada por `/root/s3_l3_producer` nesta execução S3 `15cc9853-0e71-4950-8813-0bfb66f82c8a`. É nova adoção/correção de um alternativo de recuperação. Não é recuperação dos prompts, da autoria ou dos aceites históricos ausentes. A solicitação integral recebida está em `request.md`; a resposta documental desta produção está em `response.json`.

## Operações realmente realizadas

1. Leitura do corpo alternativo L3 e verificação de seus 11.409 bytes e SHA-256 informado na solicitação.
2. Enumeração dos paths autorizados em `s3-l2-revision/bodies` e `s3-provenance/sources`; leitura dos três corpos L2-v2 e conferência dos hashes selecionados pela principal.
3. Leitura do dossiê estático autorizado e dos trechos decisivos de `approval.ts`, `app-dock.ts`, `arm/evaluate.ts` e `packages/core/src/relay.ts`. A saída agregada do dossiê sofreu truncamento de exibição; as condições alteradas foram conferidas diretamente nos arquivos-fonte autorizados. Não foram lidos oracles, pareceres reservados nem consumer cases.
4. Tentativa de delegar uma conferência somente de fonte sobre release/lock. A criação do auxiliar foi recusada por limite de threads; nenhum auxiliar foi criado ou contribuiu. A conferência foi realizada pelo próprio produtor.
5. Aplicação sequencial de nove substituições exatas com Python, exigindo uma única ocorrência de cada âncora. Todo trecho fora dessas substituições permaneceu byte a byte igual ao alternativo. Escrita somente no diretório `s3-l3-adoption`.
6. Geração de `changes.diff` por `difflib.unified_diff` com três linhas de contexto, registro de hashes/bytes e conferência de UTF-8 e limite de 18.000 bytes. Os inputs foram relidos para comparar os hashes antes/depois. São verificações de integridade documental, não testes do produto.

## Receita determinística utilizada

O bloco abaixo reproduz em memória as substituições realmente aplicadas e compara o resultado com o corpo salvo. Os nove pares preservam literalmente suas âncoras e substituições; não são prompts históricos reconstruídos.

```python
from pathlib import Path
import hashlib
import json

source = Path("s3-provenance/files/bodies/l3-flows.md")
before = source.read_bytes()
assert len(before) == 11409
assert hashlib.sha256(before).hexdigest() == "d69898e99b6e6eb4d9309b46c9e1541059effdbbdcc59fd2efb29ddd860947b7"
text = before.decode("utf-8", errors="strict")
replacements = json.loads(r'''[
  [
    "**Estado:** `CANDIDATE_UNRELEASED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Oracle: `oracles/L3-flows.json`. Este corpo foi reconstruído depois da perda da sessão anterior. Os corpos L2 correspondentes estão persistidos, mas ainda não receberam dois novos pareceres independentes; portanto este L3 não está liberado, não entra como artefato aceito no pacote nativo e não autoriza L4.",
    "**Estado:** `CANDIDATE_UNRELEASED` / `REVIEW_REQUIRED`; runtime: `NOT_RUN`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Oracle: `oracles/L3-flows.json` (referência preservada, não consultada nesta adoção). Nova adoção/correção do corpo alternativo de recuperação por `/root/s3_l3_producer`, sem reconstruir autoria, prompts ou aceites históricos ausentes.\n\nOs três predecessores L2-v2 foram liberados pela principal em `2026-11-28T06:21:31Z`, conforme seu atestado de dois pareceres independentes (`/root/s3_j1` e `/root/s3_j2`) nos seis casos, sem findings abertos. Seleção conferida por SHA-256: Maestro `5907c7745c2533529d3039f9d8635f76bd98aeefaa5612b8594723341d258012`; Relay `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037`; Integrações `90c2c94bf63580c676f88a7065fd3cadb4e6fd6332c99c9f9d9534d56086d259`. Essa liberação não concede aceite a este L3: ele continua pendente de revisão independente, não entra como artefato aceito no pacote nativo e não autoriza L4."
  ],
  [
    "2. A revisão apresentada ao owner vincula os hashes exatos de revisão, validação, contexto, policy e task. Só a primeira resposta genuína posterior, na mesma Session e não sintética, pode ser interpretada.",
    "2. A revisão apresentada ao owner vincula os hashes exatos de revisão, validação, contexto, policy e task. A resposta selecionada do owner deve ser genuína, ter `role=user`, pertencer à mesma Session e ser posterior à apresentação. Não pode existir qualquer mensagem intermediária com `role=user` (inclusive sintética) entre a apresentação e essa resposta. Resposta sintética e resposta não imediata são recusas distintas (`reply-synthetic` e `reply-not-immediate`). [Fonte: `modules/maestro/coordination/src/approval.ts:135–146`.]"
  ],
  [
    "O processo pode morrer depois do efeito externo e antes de produzir disposição, antes do receipt durável ou antes da aplicação de estado. Esses cortes não são equivalentes. `release` de lock permite retomar a WP sob o contrato; não desfaz efeito externo e não prova exactly-once.",
    "O processo pode morrer depois do efeito externo e antes de produzir disposição, antes do receipt durável ou antes da aplicação de estado. Esses cortes não são equivalentes. `release` é do arm parked: o caminho do owner escreve o arquivo `release` sob o run lock. A próxima avaliação registra `human-release` antes de consumi-lo, reinicia retry, round e claim do gate e reavalia a mesma WP, sem dispensar controles. Não desfaz efeito externo e não prova exactly-once. [Fonte: `modules/relay/src/arm/evaluate.ts:67–89`.]\n\nA recuperação/remoção do run lock é uma operação distinta: no Core, `recover` só remove um diretório de lock anterior ao processo e não detido por avaliação local; registra `gate-recovered` antes da remoção. `Relay.release` tenta essa recuperação antes de chamar `ArmEvaluate.release`; isso não transforma release do arm em release de lock. [Fonte: `packages/core/src/relay.ts:374–418,517–520`.]"
  ],
  [
    "5. Repetir automaticamente apenas se o contrato prova `not-dispatched` ou se a operação foi realmente emitida com chave idempotente válida. `unknown-effect` bloqueia repetição quando duplicação é perigosa.",
    "5. Repetir automaticamente apenas se o contrato prova `not-dispatched` ou se a operação foi realmente emitida com chave idempotente válida. `unknown-effect` bloqueia repetição automática. Essa regra geral não amplia o retry específico do Dock em F4."
  ],
  [
    "- `stale-not-dispatched`: usar somente a regra de retry delimitada do contrato.",
    "- `stale-not-dispatched`: no máximo uma repetição automática, somente para uma instância de `NativeRPCError` com `code === \"stale-ref\"`, `outcome === \"not-dispatched\"` e `attempt < 1`; outros erros stale ou falhas não satisfazem essa regra. [Fonte: `modules/app-dock/src/app-dock.ts:388–390`.]"
  ],
  [
    "- `unknown/uncertain`: não repetir automaticamente quando o efeito pode ter ocorrido.",
    "- `unknown/uncertain`: nunca repetir automaticamente; a incerteza não autoriza replay, mesmo se a ação parecer inofensiva ou idempotente. [Fonte: `modules/app-dock/src/app-dock.ts:357–360,388–390`.]"
  ],
  [
    "| efeito desconhecido | receipt + alvo externo observável | HOLD/manual/idempotência provada | retry cego |",
    "| efeito desconhecido | receipt + alvo externo observável | HOLD/manual; obter evidência do efeito | repetição automática enquanto desconhecido |"
  ],
  [
    "## 7. Limites desta reconstrução",
    "## 7. Limites desta adoção"
  ],
  [
    "A cobertura estática dos quatro casos do oracle pode ser verificada deterministicamente, mas este corpo não recebeu os dois novos pareceres independentes exigidos. Nenhuma Session, provider, workflow, build, cache, Dock, Janitor, CI, importação, publicação ou leitura Atlas foi executada por esta reconstrução. O histórico da conversa anterior registra que um L3 chegou a ser aceito, mas os pareceres e o corpo completos não estão duráveis; essa alegação não é usada como release.",
    "Este corpo cobre os quatro fluxos descritos, mas ainda exige dois novos pareceres independentes sobre seus bytes; o produtor não concede PASS. O aceite dos predecessores L2-v2 não libera este L3. Nenhuma Session do produto, provider, workflow, build, cache, Dock, Janitor, CI, importação, publicação ou leitura Atlas foi executada por esta adoção: runtime `NOT_RUN`. Os originais históricos superiores e seus prompts/aceites completos não foram recuperados. O alternativo anterior permanece preservado como input; esta nova autoria registra somente a adoção/correção realizada, sem usar alegação histórica como release."
  ]
]''')
for old, new in replacements:
    assert text.count(old) == 1
    text = text.replace(old, new, 1)
after = text.encode("utf-8")
assert len(after) == 13637
assert hashlib.sha256(after).hexdigest() == "17c3d7fdd7f693d66eefc29df3928d5bda449387db77a016a9b7b1f3cc3f0b99"
# Validação em memória: não executa o produto nem sobrescreve o input.
assert Path("s3-l3-adoption/bodies/l3-flows.md").read_bytes() == after
```

## Limites

Não houve GitHub, escrita remota, execução do produto, teste de runtime, CI ou L4. O protocolo é referência fornecida pela principal e não foi aberto. A liberação L2-v2 é o atestado recebido da principal; o produtor conferiu os três corpos selecionados, sem ler os julgamentos. Este L3 permanece `CANDIDATE_UNRELEASED` / `REVIEW_REQUIRED`; runtime `NOT_RUN`. O produtor não concede PASS.
