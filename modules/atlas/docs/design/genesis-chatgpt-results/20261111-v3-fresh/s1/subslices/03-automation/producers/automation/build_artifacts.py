"""Build documentary receipts from captured bytes. Does not run product code/tests."""
from pathlib import Path
import collections
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent
INPUTS = ROOT.parent.parent / "inputs"
COMMIT = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
ARTIFACT = "s1.core.automation"
REPO = "gustavomhss/hugr-orchestra"
SRC = "packages/core/src/"
TEST = "packages/core/test/"
PLAN = []

def add(key, title, section, entries):
    # Entries: path relative to src (or test: prefix), role, full ranges, review ranges.
    PLAN.append(dict(id=key, title=title, body_section=section, entries=[
        dict(path=(TEST + p[5:] if p.startswith("test:") else SRC + p), role=role,
             full=full, review=review) for p, role, full, review in entries]))

add("A01", "Fachada preguiçosa, snapshot e roteamento", "1, 3", [
 ("actions.ts", "Fachada da Location; construção lazy, congelamento de entrada e reconciliador efetivamente escolhido", [(39,85),(123,133),(171,216)], [(129,133),(171,180),(192,202)]),
 ("actions/contract.ts", "Seams de reader/transport/operations; separa acknowledgment persistido de saída de comando", [(10,36),(48,88)], []),
 ("actions/error.ts", "Erro tipado do domínio Actions usado na classificação, não texto livre de stderr", [(1,6)], []),
])
add("A02", "Binding físico e estado externo", "1", [
 ("actions/binding.ts", "Resolução de remoto bruto/efetivo antes de auth, referência confiável e revisão sem retarget", [(25,100),(104,161)], [(54,75),(125,137)]),
 ("actions/state.ts", "JSON estrito fora do checkout, falha de integridade, permissões e mutex local", [(18,73),(77,166)], [(87,104),(139,158)]),
])
add("A03", "Identidade de cursor e capacidades qualificadas", "1", [
 ("actions/cursor.ts", "Cursor liga binding/revisão/provider/escopo/filtros e paginação limitada", [(9,82)], [(24,44)]),
 ("actions/github/catalog.ts", "Capacidades dependem de leitura concreta, sem promover write desconhecido", [(75,89)], [(75,89)]),
])
add("A04", "Catálogo e fonte GitHub com identidade imutável", "1", [
 ("actions/github/index.ts", "Composição concreta dos readers GitHub", [(1,17)], []),
 ("actions/github/native.ts", "IDs/SHAs nativos, lookup por repository ID e validação de paginação Link", [(12,40),(60,69),(87,121)], [(60,69)]),
 ("actions/github/catalog.ts", "Workflow nativo e fonte com commit, path, bytes, UTF-8 e Git blob verificados", [(18,72)], [(43,51),(60,72)]),
])
add("A05", "Runs e jobs GitHub preservam tentativa", "1", [
 ("actions/github/runs.ts", "Filtros representáveis e projeção sem inventar finishedAt", [(20,83),(85,120)], [(62,83)]),
 ("actions/github/jobs.ts", "Fixa e confere run_attempt ao listar/ler jobs", [(15,61)], [(22,43)]),
])
add("A06", "GitLab: um slot de CI e fonte local qualificada", "1", [
 ("actions/gitlab/index.ts", "Composição concreta dos readers GitLab", [(1,11)], []),
 ("actions/gitlab/native.ts", "Schema de identidades, slot de pipeline, path e versão de servidor observada", [(10,42),(72,122),(143,170)], [(79,94),(113,122)]),
 ("actions/gitlab/catalog.ts", "Config path nativo sem fallback indevido; hash e versão composta da fonte", [(13,87)], [(21,36),(56,72)]),
])
add("A07", "Runs/jobs/bridges GitLab sem tentativa fabricada", "1", [
 ("actions/gitlab/runs.ts", "Pipeline nativa e gates por metadata para filtros; tempos nativos", [(12,116)], [(58,77),(91,107)]),
 ("actions/gitlab/jobs.ts", "Coleções jobs e bridges em cursor distinto, include_retried e ownership", [(15,69)], [(22,42),(53,66)]),
])
add("A08", "Orçamento e segurança do parser YAML", "2", [
 ("actions/source/document.ts", "Parsing limitado antes e durante expansão; valores e chaves estritos", [(10,81),(85,151),(156,207),(238,276)], [(10,27),(48,66),(183,198)]),
])
add("A09", "Grafo de definição GitHub", "2", [
 ("actions/source/graph.ts", "Partialidade, nós de definição, needs e detecção de ciclos", [(10,74)], [(17,30),(45,57)]),
 ("actions/source/github.ts", "Jobs/needs locais, matrix/reusable parcialmente resolvidos", [(10,62)], [(30,57)]),
])
add("A10", "Resolução local de GitLab", "2", [
 ("actions/source/gitlab.ts", "Includes não executados, extends/default distintos, needs locais sem inventar stage edges", [(12,97),(100,179),(181,240)], [(39,57),(94,111),(138,159),(207,223)]),
])
add("A11", "Base e input de autoria", "2", [
 ("actions/authoring/index.ts", "Snapshot de draft, validação local e lint remoto opcional", [(15,52)], []),
 ("actions/authoring/input.ts", "Schemas estritos, branch/path/texto e versões próprias de provider", [(12,124)], [(69,86),(107,124)]),
 ("actions/authoring/base.ts", "Observa branch padrão e commit, revalida base, hash local do draft", [(15,72)], [(23,38),(58,72)]),
])
add("A12", "Publicação GitHub em fases", "2", [
 ("actions/authoring/github.ts", "Branch/contents/review com identidade, bytes e novo commit, sem transação remota única", [(14,99)], [(33,54),(63,78)]),
])
add("A13", "Publicação GitLab em fases", "2", [
 ("actions/authoring/gitlab.ts", "Branch/file/MR; create versus update com last_commit_id e confirmação", [(14,101)], [(39,64),(83,101)]),
])
add("A14", "Readback de autoria, lint e editor schedule", "2", [
 ("actions/authoring/remote.ts", "Readback após write, distinção unsent/unknown, identidade da review e ausência qualificada", [(13,129)], [(73,101),(114,129)]),
 ("actions/authoring/lint.ts", "Lint sem dry-run/jobs não amplia topologia", [(1,30)], [(13,30)]),
 ("actions/authoring/schedule.ts", "Edição localizada de on.schedule com recusas para estrutura ambígua", [(11,77)], [(26,41),(59,77)]),
])
add("A15", "Admissão durável da intenção", "3", [
 ("actions/operations.ts", "Prepara intenção sob identidade da Location e dedupe client ID; payload de execute separado", [(16,45),(60,121)], [(77,104)]),
 ("actions/operations/sql.ts", "Schema persistido e chave única; não armazena execute input", [(1,35)], [(12,35)]),
])
add("A16", "CAS, limite de execução e recuperação sem replay", "3", [
 ("actions/operations.ts", "Claim prepared→sending, fiber antes de CAS e único perform fora da transação", [(124,169)], [(136,165)]),
 ("actions/operations/storage.ts", "Leases/retenção/limites, recuperação lifetime e finalização do ledger", [(10,142)], [(10,15),(78,103),(124,142)]),
 ("actions/operations/outcome.ts", "Ack estrito, erro definitivo tipado e identidade de observação imutável", [(1,40)], [(13,39)]),
])
add("A17", "Reconciliação exata e seus limites", "3", [
 ("actions/operations.ts", "Só accepted/unknown observáveis; observe não executa mutação", [(171,204)], [(178,199)]),
 ("actions/operations/readback.ts", "Promotion CAS só com atribuição suficiente; pending preserva recibo", [(1,27)], [(9,27)]),
 ("actions/readback.ts", "Dispatch sem runID não é adivinhado; retry exige tentativa; cancel exige estado observado", [(1,35)], [(14,35)]),
])
add("A18", "Dispatch GitHub, autoridade e inputs", "4", [
 ("actions/github/commands.ts", "Decodifica kind/payload e escolhe comando concreto", [(10,38)], []),
 ("actions/github/commands/common.ts", "Snapshot, permissões negativas, source/run esperados e ator revalidado antes do envio", [(21,166)], [(76,98),(152,166)]),
 ("actions/github/commands/inputs.ts", "Inputs workflow_dispatch limitados/tipados com defaults e choices", [(10,69)], [(19,37),(49,69)]),
 ("actions/github/commands/workflow.ts", "Dispatch prova fonte padrão e selecionada; 204 unattributed, 200 ID qualificado", [(10,79)], [(12,47),(54,64)]),
])
add("A19", "Run/job GitHub: elegibilidade e acknowledgment", "4", [
 ("actions/github/commands/run.ts", "Retry terminal sem inventar attempt; cancel/force/delete/fork têm condições próprias", [(10,59)], [(21,56)]),
 ("actions/github/commands/job.ts", "Job retry valida ownership/attempt e retorna IDs já conhecidos", [(9,33)], [(15,33)]),
])
add("A20", "GitLab: plano, role, dispatch e trigger", "4", [
 ("actions/gitlab/commands.ts", "Plano é construído antes do único envio principal; qualifica resposta", [(8,33)], [(17,33)]),
 ("actions/gitlab/commands/native.ts", "Roles observados e project policies; ausência não vira autoridade", [(10,72)], [(25,45)]),
 ("actions/gitlab/commands/launch.ts", "Dispatch/trigger distinguem token/body/endpoint e provam ref/config", [(10,52)], [(19,52)]),
 ("actions/gitlab/commands/shared.ts", "Payload estrito, commit/ref e resposta pipeline nativa vinculada", [(11,83)], [(52,76)]),
])
add("A21", "GitLab: inputs autoritativos e merge request", "4", [
 ("actions/gitlab/commands/inputs.ts", "Gate 18.1 e schema local sem includes desconhecidos; regex não é executada como JS", [(9,80)], [(15,38),(47,60)]),
 ("actions/gitlab/commands/merge-request.ts", "MR aberto no mesmo projeto; IID, source e head/merge refs próprios", [(10,53)], [(21,49)]),
])
add("A22", "Run/job GitLab: sem equivalências GitHub", "4", [
 ("actions/gitlab/commands/runs.ts", "Retry/cancel/rename/delete pela política e resposta pipeline, sem copiar lista terminal GitHub", [(9,47)], [(21,45)]),
 ("actions/gitlab/commands/jobs.ts", "Jobs e bridges, retry com novo ID, play e erase com gates de versão/ownership", [(13,133)], [(36,68),(98,113)]),
])
add("A23", "Recursos, versão e fases parciais", "4", [
 ("actions/resources.ts", "Roteamento por recurso e publicação GH schedule como source.write", [(15,66)], [(20,46)]),
 ("actions/resources/native.ts", "Alvo estrito, fonte/versão selecionadas, autoridade e send seguro", [(55,188)], [(55,68),(138,150)]),
 ("actions/resources/config-common.ts", "Plano em fases: falha após primeira escrita é unknown, sem rollback", [(23,169)], [(141,169)]),
])
add("A24", "Variables/secrets: scope, redaction e criptografia", "4", [
 ("actions/resources/variables.ts", "Identidade key+scope, hidden/masked, mutações e sealed box sem persistir valor no ack", [(15,207)], [(40,59),(105,129),(189,207)]),
 ("actions/resources/config-variable-github-page.ts", "Dois fluxos paginados GH vars/secrets sob limite e cursor composto", [(9,59)], []),
 ("actions/resources/config-sodium.d.ts", "Tipagem estreita do wrapper libsodium; não é implementação criptográfica", [(1,15)], []),
])
add("A25", "Environments e reviewers representáveis", "4", [
 ("actions/resources/config-environment-schema.ts", "Schemas nativos GH/GL para regras, refs e formas de reviewers", [(5,37)], []),
 ("actions/resources/config-environment-reviewers.ts", "Wildcards/grupos/múltiplas aprovações podem ser read-only; lookup user exato", [(6,32)], [(8,26)]),
 ("actions/resources/config-environment-github.ts", "Branch/tag policies em fases, inventário limitado e timer não inventado", [(10,114)], [(46,72),(96,114)]),
 ("actions/resources/config-environment-gitlab.ts", "Constraints GL próprios, delete stopped, metadata e approvals em fases", [(11,116)], [(25,56),(77,99)]),
])
add("A26", "Deployment review e assimetria do listing", "4", [
 ("actions/resources/environments.ts", "List valida environments; runID seleciona pending review", [(17,72)], [(19,34)]),
 ("actions/resources/config-deployment-review.ts", "Aprovação por run/env/commit/versão; GL não executa job", [(13,110)], [(51,75),(88,110)]),
])
add("A27", "Policy local versus configuração remota", "1, 4", [
 ("actions/resources/policy.ts", "Retenção local não configura provider; approved-actions e project settings nativos", [(8,85)], [(15,34),(50,75)]),
])
add("A28", "Caches e fronteira GraphQL GitLab", "4", [
 ("actions/resources/caches.ts", "GH key/ref exige inventário; GL invalida namespace futuro, conserva blobs existentes", [(14,152)], [(24,43),(68,84),(98,109)]),
 ("actions/resources/gitlab-graphql.ts", "GraphQL allowlist, IDs globais e auth/TLS nativos; respostas limitadas", [(12,96)], [(17,43),(65,79)]),
])
add("A29", "Runner ownership e enrollment", "4", [
 ("actions/resources/runners.ts", "GH repo scope/JIT/custom labels; GL ownerProject, assigns, inherited e delete sem impacto externo", [(20,75),(95,210),(215,286)], [(112,136),(170,199),(249,261)]),
])
add("A30", "Schedules GitLab nativos", "4", [
 ("actions/resources/schedules.ts", "GL owner/ref/timezone/active, inputs e fases variables; play sem pipeline ID", [(20,235)], [(49,70),(112,142),(178,204)]),
])
add("A31", "Schedules GitHub são source.write", "2, 4", [
 ("actions/resources/schedule-yaml.ts", "Cron literal e edição limitada do documento, sem execução remota", [(10,81)], [(28,46),(61,81)]),
 ("actions/resources/schedules.ts", "GH default branch e blob esperado, limites de inventário, sem play/ownership/pause API", [(237,335)], [(237,266),(299,326)]),
])
add("A32", "CLI GitHub e lifecycle de processo", "5", [
 ("actions/transport.ts", "Composição GH CLI/GL HTTP; open/upload não são capabilities universais", [(15,67)], []),
 ("actions/transport/cli.ts", "Args sem shell, origin/path/headers e ambiente sem prompts/debug", [(8,90)], [(15,33),(48,72)]),
 ("actions/transport/process.ts", "Metadata/bytes com budgets, finalizador kill e EOF depende de exit", [(9,91)], [(12,24),(61,91)]),
 ("actions/transport/identity.ts", "Parser de conta/projeto nativos: identidade não é display text", [(1,24)], []),
])
add("A33", "Snapshot de credenciais e HTTP GitLab", "5", [
 ("actions/transport/credentials.ts", "Versão glab qualificada, snapshot de token/TLS limitado e regular", [(10,85)], [(13,30),(51,70)]),
 ("actions/transport/gitlab.ts", "Mesma credencial para ator e write, rotas stream/upload admitidas", [(11,73)], [(19,39),(53,73)]),
 ("actions/transport/http.ts", "TLS verificado, same origin sem redirect, phase HTTP sticky, backpressure e abort", [(15,186)], [(28,42),(65,89),(153,171)]),
])
add("A34", "Classificação de resposta e incerteza", "5", [
 ("actions/transport/response.ts", "Só resposta JSON/headers completos e exit normal sustentam rejeição definitiva", [(8,76)], [(56,76)]),
 ("actions/transport/http.ts", "Falha de TLS anterior ao HTTP versus possibilidade de write remoto", [(91,113)], [(91,113)]),
])
add("A35", "Alvos de bytes e identidade do artifact", "5", [
 ("actions/output/index.ts", "Budgets separados metadata/bytes, scope finaliza stream, sem Range arbitrário", [(12,66)], [(41,66)]),
 ("actions/output/artifacts.ts", "Metadados GH/GL com artifactID/jobID e version allowlist", [(12,73)], [(39,62)]),
 ("actions/output/target.ts", "Validação de kind/path/run/job/attempt e ownership antes de transferir", [(12,103)], [(35,56),(77,103)]),
 ("actions/output/native.ts", "Schemas nativos, ownership e erased/expired/available/unavailable", [(12,67),(88,116),(142,167)], [(142,167)]),
])
add("A36", "URL assinada, renovação e headers", "5", [
 ("actions/output/download.ts", "Um renewal read-only antes de bytes, sem replay parcial, rechecagem de identidade", [(7,39)], [(7,39)]),
 ("actions/output/signed.ts", "Getter separado sem credenciais nativas; HTTPS, timeout e redirects limitados", [(11,90)], [(19,39),(52,76)]),
 ("actions/output/headers.ts", "Filename seguro e metadados limitados não são checksum da transferência", [(7,46)], [(20,46)]),
])
add("A37", "Mutações de artifact e versão selecionada", "4, 5", [
 ("actions/output/mutations.ts", "Delete/keep nativos, target/version/ownership, GH keep indisponível", [(9,58)], [(18,36),(45,58)]),
 ("actions/output/version.ts", "Fingerprint só de metadados selecionados; distinção expiry ausente/null", [(1,16)], [(7,16)]),
])

add("B01", "Serviço Board e porta Maestro", "6", [
 ("board/board.ts", "Transações immediate, atividade e publicação; ciclos host e falha de storage", [(73,95),(181,198),(566,642),(1675,1692)], [(181,198),(1683,1692)]),
 ("board/tools.ts", "Tools do Board guardadas para o agente default Maestro", [(24,42),(145,161)], [(24,34),(153,161)]),
 ("board/rows.ts", "Projeção de rows; decision outcome por default e anexos sem path/credentialID", [(12,113)], [(69,96)]),
 ("board/shared.ts", "Runner Git limitado, atividade e waits/forecast por dependências e perguntas", [(48,70),(121,150),(179,239)], []),
 ("board/sql.ts", "Persistência de plano, checks, attempts, queue/bundles e histórico distinto", [(169,280),(342,430)], []),
])
add("B02", "Transições e autoridade do card", "6", [
 ("board/board.ts", "requireActive, dependencies/steps, move/hold/budget/intake com pré-condições particulares", [(279,307),(427,486),(894,912),(965,1037),(1040,1147),(1555,1602),(1621,1671)], [(427,441),(1040,1089),(1637,1671)]),
])
add("B03", "Decisão durável, undo, nota e anexo", "6", [
 ("board/decision.ts", "Escolha, supersession e resultado narrado sem prova externa", [(8,129)], [(48,75),(88,129)]),
 ("board/thread.ts", "Threads host readonly, ID determinístico e insert idempotente", [(9,57)], [(35,56)]),
 ("board/board.ts", "Pergunta/answer, armazenamento de anexos e remoção, undo conflito por campos", [(1149,1273),(1295,1467)], [(1306,1338),(1388,1416),(1418,1452)]),
])
add("B04", "Mirror GitHub tem semântica própria", "7", [
 ("board/github.ts", "Mirror since/ETag limitado, Board vence plano, comentários por ID, CI TTL/cache e taxas fixas", [(59,83),(126,158),(164,313),(317,433),(435,611),(625,688)], [(126,135),(234,269),(317,341),(465,488),(518,537),(595,611)]),
])
add("B05", "Medição parcial, orçamento e forecast", "6, 7", [
 ("board/money.ts", "Custos Sessions/filhos e CI cache; threshold/forecast e bloqueio só de nova entrada building", [(21,191)], [(65,91),(136,169)]),
 ("board/spend.ts", "Measured/not-metered/partial e thresholds; forecast monetário é estimativa", [(9,143)], [(30,65),(83,93)]),
 ("board/forecast.ts", "Monte Carlo do histórico Board com mínimo, seed e horizonte; waits/late", [(8,94),(119,162)], [(8,14),(25,42),(93,94)]),
])
add("B06", "CI do tree e correlação por heurística", "7", [
 ("board/ci.ts", "Contrato/defaults, índice timestamp, ledger por tree/comando, affected e run heurístico", [(137,226),(234,454),(456,504)], [(156,192),(194,213),(336,359),(382,404),(440,465)]),
])
add("B07", "Admissão na fila e head exato", "8", [
 ("board/queue.ts", "Review/PR/record/dependencies/scoped-green antes de enfileirar, recheck TX e dequeue", [(75,188),(716,723)], [(98,150),(716,723)]),
 ("board/queue-record.ts", "Fetch do head nativo, movido volta Review e caminho de record PR", [(47,85)], [(47,72)]),
])
add("B08", "Corte, lanes e full gate", "8", [
 ("board/queue.ts", "Busy local, cut por tamanho/espera/epic/fix, filtros, bundle merge/PR/workflow e adaptação", [(271,466),(472,708),(727,733)], [(271,299),(330,349),(550,566),(584,618),(727,733)]),
 ("board/queue-lanes.ts", "Overlap por affected: unknown global, blocked não passa/não bloqueia; capacidade", [(8,85)], [(25,67),(81,85)]),
 ("board/queue-shared.ts", "Gate por rollup, affected real e correlação por workflow/head", [(33,111),(114,173),(185,216)], [(54,74),(134,173)]),
 ("board/queue-drift.ts", "Area declarada versus affected gera nota, sem negar integração por si", [(1,21)], []),
])
add("B09", "Red, infra, base e isolamento", "8", [
 ("board/queue-settle.ts", "Pending, infra retry limitado, probes/isolamento e fix/flaky têm estados próprios", [(44,236),(367,493)], [(44,85),(99,128),(186,205),(451,472)]),
 ("board/queue-red.ts", "Logs desconhecidos não provam infra; base tests, classifiers, bisect, fix card e flaky", [(38,120),(143,259),(266,391),(398,472)], [(38,82),(143,177),(398,420)]),
])
add("B10", "Merge, recuperação e limite de revogação", "8", [
 ("board/queue-settle.ts", "Revalida heads/tip, recupera push já feito e usa force-with-lease; skew disjunto registra tested/merged", [(238,364)], [(238,271),(326,364)]),
 ("board/queue.ts", "Controles de hold/pause são filtros no corte, não prova de rechecagem no settle", [(309,350),(584,618)], [(315,335),(584,601)]),
])
add("B11", "Snapshot e conflitos", "9", [
 ("board/snapshot.ts", "Attempt e refs WIP, scanner obrigatório, push não garante rows/restore globais", [(17,42),(57,93),(119,230),(237,309)], [(75,93),(155,183),(208,230),(252,276)]),
 ("board/conflicts.ts", "Observa avanço de base em branches Review/Queue e registra conflito; não rebaseia", [(10,12),(35,113),(130,165)], [(35,43),(74,103)]),
])
add("B12", "Record Atlas e replay de plano", "9", [
 ("board/queue-record.ts", "Record separa host/prosa; visibility conservadora/redaction, campos não observados vazios", [(92,212),(215,303)], [(119,143),(271,296)]),
 ("board/record.ts", "Port Atlas/fallback: texto não se transforma em evidência por estar em um record", [(10,67)], [(39,67)]),
 ("board/tree.ts", "Replay em banco vazio de atividades de plano; exclui estado operacional/arquivos", [(21,99),(140,179),(212,237),(283,306),(344,367),(404,414),(440,472)], [(21,24),(59,99),(404,414)]),
])
add("B13", "Proof e ledger: origem de fatos e ausência", "7, 9", [
 ("board/proof.ts", "Combina fato PR/CI vivo e registros; verificado em instante, sem fabricar CI quando falha", [(11,65)], [(31,59)]),
 ("board/ledger.ts", "Métricas derivadas das rows disponíveis, medianas e null por falta de base", [(11,94)], [(45,69)]),
])
add("S01", "Duas políticas e identidades persistidas", "10", [
 ("scheduled-task/shared.ts", "Claim/Outcome e insert IDs determinísticos com slot/revisão/manual key", [(14,85),(94,144)], [(94,125),(139,144)]),
 ("scheduled-task/sql.ts", "Policy, owner, revision e unicidades task/revision/slot e manual key", [(10,76)], [(24,35),(60,75)]),
 ("scheduled-task/port.ts", "Port vinculado a Scope evita ciclo de imports; restaura vínculo anterior", [(1,41)], []),
 ("scheduled-task/capability.ts", "Owner exato Session/agent/project/location versus placed operator", [(26,87),(147,157),(238,268),(384,394)], [(70,87),(147,157),(384,394)]),
])
add("S02", "Política legacy e DST", "10, 11", [
 ("scheduled-task/model.ts", "Cadência once/daily/weekly, catch-up e DST compatible, IDs task/slot", [(8,103),(126,140)], [(25,36),(66,82)]),
 ("scheduled-task.ts", "Legacy criação/update/resume/remove e projeção isolada", [(120,150),(349,450),(452,473),(506,557)], [(120,150),(506,528)]),
])
add("S03", "Capability: cron, intervalo e catch-up", "10, 11", [
 ("scheduled-task/capability-model.ts", "Cron cinco campos numéricos/OR, interval anchor, latest/skip e DST first-valid", [(27,218)], [(42,64),(83,105),(177,189)]),
 ("scheduled-task/capability.ts", "Cadence persistida e primeiro slot validado; timezone/catchUp/limit", [(397,453),(468,493)], [(427,453)]),
])
add("S04", "Admissão de prompt, lease e corrida de revogação", "12", [
 ("scheduled-task.ts", "Duas holds, SessionInput durável, started apenas admissão, lease/takeover sem duplicar prompt", [(23,32),(152,264),(272,320)], [(152,185),(196,207),(272,302)]),
 ("scheduled-task/capability.ts", "Holds confere revisão/lease/enabled, revoke ignora input já admitido", [(89,145),(179,200)], [(121,145),(179,200)]),
])
add("S05", "Revisão, manual key e contabilização", "12", [
 ("scheduled-task/capability.ts", "Update/pause/remove revogam limites próprios; manual dedupe e slot started conta", [(159,177),(270,378),(455,466)], [(282,309),(335,378),(455,466)]),
])
add("S06", "Daemon, wake e inferência estática de create", "12", [
 ("scheduled-task.ts", "Wrapper immediate notifica Queue; idle sem tasks/runs espera wake", [(85,103),(304,347),(484,504)], [(85,95),(322,347)]),
 ("scheduled-task/capability.ts", "Create usa db.insert diretamente; elo com Queue depende de wrapper/caller", [(202,237)], [(207,237)]),
])
add("T01", "Testes existentes: intenção verificável, NOT_RUN", "13", [
 ("test:actions/readback.test.ts", "Assertions existentes para retry sem tentativa e ausência de confirmação GitLab", [(182,231)], [(182,203)]),
 ("test:actions-resource-schedules.test.ts", "Fixture de falha após criação sem rollback/retry", [(22,51)], [(22,38)]),
 ("test:actions-transport-gitlab-http.test.ts", "Fixture TLS write/reset exige unknown, não envio repetido", [(28,49)], []),
 ("test:board-budget.test.ts", "Assertions de decisão superseded/outcome preservados", [(93,130)], []),
 ("test:board-queue.test.ts", "Simulação de host morto após push, sem segundo merge", [(145,187)], [(145,169)]),
 ("test:scheduled-task-capability.test.ts", "Simulação de revogação durante admissão, manual reuse e isolamento", [(308,395),(470,550)], [(337,359)]),
 ("test:scheduled-task.test.ts", "Slots failed consumidos e takeover por lease com mesmos IDs", [(184,248)], []),
])

# The short projection selects literal branches, not prose substitutes for code.
# Entire implementations and the wider decisive ranges remain in sources/ and evidence.md.
SHORT = {
 "A01": {"actions.ts": [(129,133),(192,202)]},
 "A02": {"actions/binding.ts": [(54,75)], "actions/state.ts": [(139,151)]},
 "A03": {"actions/cursor.ts": [(24,37)], "actions/github/catalog.ts": [(78,88)]},
 "A04": {"actions/github/native.ts": [(60,69)], "actions/github/catalog.ts": [(60,72)]},
 "A05": {"actions/github/runs.ts": [(65,80)], "actions/github/jobs.ts": [(22,30)]},
 "A06": {"actions/gitlab/native.ts": [(79,90)], "actions/gitlab/catalog.ts": [(21,31),(61,72)]},
 "A07": {"actions/gitlab/runs.ts": [(91,102)], "actions/gitlab/jobs.ts": [(22,34)]},
 "A08": {"actions/source/document.ts": [(10,27),(183,191)]},
 "A09": {"actions/source/github.ts": [(30,43)], "actions/source/graph.ts": [(45,53)]},
 "A10": {"actions/source/gitlab.ts": [(94,111),(207,217)]},
 "A11": {"actions/authoring/base.ts": [(23,32),(58,72)]},
 "A12": {"actions/authoring/github.ts": [(33,45)]},
 "A13": {"actions/authoring/gitlab.ts": [(39,56)]},
 "A14": {"actions/authoring/remote.ts": [(114,129)], "actions/authoring/lint.ts": [(13,21)]},
 "A15": {"actions/operations.ts": [(83,101)], "actions/operations/sql.ts": [(27,35)]},
 "A16": {"actions/operations.ts": [(138,165)], "actions/operations/storage.ts": [(88,99)]},
 "A17": {"actions/readback.ts": [(14,35)]},
 "A18": {"actions/github/commands/common.ts": [(84,98)], "actions/github/commands/workflow.ts": [(31,47)]},
 "A19": {"actions/github/commands/run.ts": [(21,35)], "actions/github/commands/job.ts": [(24,33)]},
 "A20": {"actions/gitlab/commands/native.ts": [(25,38)], "actions/gitlab/commands/launch.ts": [(33,52)]},
 "A21": {"actions/gitlab/commands/inputs.ts": [(15,28)], "actions/gitlab/commands/merge-request.ts": [(21,32)]},
 "A22": {"actions/gitlab/commands/runs.ts": [(21,26),(37,45)], "actions/gitlab/commands/jobs.ts": [(55,68)]},
 "A23": {"actions/resources.ts": [(29,46)], "actions/resources/native.ts": [(138,150)], "actions/resources/config-common.ts": [(153,169)]},
 "A24": {"actions/resources/variables.ts": [(40,53),(189,207)]},
 "A25": {"actions/resources/config-environment-reviewers.ts": [(8,21)], "actions/resources/config-environment-gitlab.ts": [(25,36)]},
 "A26": {"actions/resources/environments.ts": [(19,29)], "actions/resources/config-deployment-review.ts": [(99,110)]},
 "A27": {"actions/resources/policy.ts": [(15,27)]},
 "A28": {"actions/resources/caches.ts": [(24,43),(68,84)]},
 "A29": {"actions/resources/runners.ts": [(180,199),(249,261)]},
 "A30": {"actions/resources/schedules.ts": [(112,126),(178,190)]},
 "A31": {"actions/resources/schedules.ts": [(299,326)]},
 "A32": {"actions/transport/cli.ts": [(15,27)], "actions/transport/process.ts": [(61,77)]},
 "A33": {"actions/transport/credentials.ts": [(13,27)], "actions/transport/gitlab.ts": [(19,32)]},
 "A34": {"actions/transport/response.ts": [(56,76)], "actions/transport/http.ts": [(91,104)]},
 "A35": {"actions/output/target.ts": [(35,46)], "actions/output/native.ts": [(142,167)]},
 "A36": {"actions/output/download.ts": [(9,37)], "actions/output/signed.ts": [(19,31)]},
 "A37": {"actions/output/mutations.ts": [(25,36),(45,58)]},
 "B01": {"board/board.ts": [(181,191)], "board/tools.ts": [(153,161)]},
 "B02": {"board/board.ts": [(427,441),(1062,1089)]},
 "B03": {"board/decision.ts": [(54,75),(101,118)], "board/board.ts": [(1421,1441)]},
 "B04": {"board/github.ts": [(126,135),(323,341),(595,611)]},
 "B05": {"board/money.ts": [(163,169)], "board/spend.ts": [(30,49)], "board/forecast.ts": [(8,14)]},
 "B06": {"board/ci.ts": [(336,359),(440,454)]},
 "B07": {"board/queue.ts": [(98,117),(134,150)]},
 "B08": {"board/queue-lanes.ts": [(25,44)], "board/queue-shared.ts": [(54,74)], "board/queue.ts": [(271,287)]},
 "B09": {"board/queue-red.ts": [(48,82)], "board/queue-settle.ts": [(99,110),(451,463)]},
 "B10": {"board/queue-settle.ts": [(238,271)], "board/queue.ts": [(315,335),(584,595)]},
 "B11": {"board/snapshot.ts": [(75,93),(208,220)], "board/conflicts.ts": [(35,43)]},
 "B12": {"board/queue-record.ts": [(271,296)], "board/tree.ts": [(21,24),(59,73)]},
 "B13": {"board/proof.ts": [(31,48)]},
 "S01": {"scheduled-task/sql.ts": [(70,75)], "scheduled-task/capability.ts": [(384,394)]},
 "S02": {"scheduled-task/model.ts": [(25,36),(66,82)]},
 "S03": {"scheduled-task/capability-model.ts": [(42,58),(83,105),(177,189)]},
 "S04": {"scheduled-task.ts": [(156,182),(196,207),(285,302)], "scheduled-task/capability.ts": [(137,145),(187,198)]},
 "S05": {"scheduled-task/capability.ts": [(335,364),(455,466)]},
 "S06": {"scheduled-task.ts": [(85,95),(339,347)], "scheduled-task/capability.ts": [(207,237)]},
 "T01": {"test:scheduled-task-capability.test.ts": [(337,359)]},
}
for item in PLAN:
    lookup = {(TEST + p[5:] if p.startswith("test:") else SRC + p): ranges
              for p, ranges in SHORT[item["id"]].items()}
    for entry in item["entries"]:
        entry["review"] = lookup.pop(entry["path"], [])
    assert not lookup, (item["id"], lookup)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def json_out(name, data):
    (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    sources = [json.loads(line) for line in (INPUTS / "sources.jsonl").read_text().splitlines()
               if line.strip()]
    selected = [s for s in sources if s["legacy_artifact_key"] == ARTIFACT]
    assert len(selected) == 204
    population = {s["path"]: s for s in selected}
    assert len(population) == 204
    captures = [json.loads(line) for line in (ROOT / "capture-ledger.jsonl").read_text().splitlines()]
    assert len(captures) == 204 and {c["path"] for c in captures} == set(population)
    by_path = {c["path"]: c for c in captures}
    byte_lines = {}
    for c in captures:
        b = (ROOT / c["capture_path"]).read_bytes()
        b.decode("utf-8", errors="strict")
        assert c["commit"] == COMMIT
        assert c["git_blob_sha"] == population[c["path"]]["git_blob_sha"] == git_blob(b)
        assert c["sha256"] == sha256(b) and c["bytes"] == len(b)
        assert c["connector"] == "github.fetch_blob" and c["git_blob_verified"] is True
        byte_lines[c["path"]] = b.splitlines(keepends=True)
    json_out("captures.json", dict(schema="genesis-source-captures/v1", repository=REPO,
        commit=COMMIT, population=dict(artifact=ARTIFACT, count=204,
        selection='legacy_artifact_key == "s1.core.automation"',
        total_bytes=sum(c["bytes"] for c in captures)),
        verification=dict(method="SHA1('blob ' + decimal_byte_length + NUL + exact_UTF8_bytes), SHA256(exact_bytes)",
            result="204/204 exact matches; documentary verification only, no product tests"),
        captures=sorted(captures, key=lambda c: c["path"])))

    index = collections.defaultdict(list)
    for item in PLAN:
        for e in item["entries"]:
            assert e["path"] in by_path
            for mode in ("full", "review"):
                for a, b in e[mode]:
                    assert 1 <= a <= b <= len(byte_lines[e["path"]]), (item["id"],e["path"],a,b)
            index[e["path"]].append((item,e))
    implementations = {p for p in population if p.startswith(SRC)}
    assert len(implementations) == 115 and implementations <= set(index)
    assert sum(p.startswith(SRC+"actions") for p in implementations) == 83

    evidence_counts = {}
    for mode, filename in [("full", "evidence.md"), ("review", "evidence-review.md")]:
        label = "Arquivo integral de evidência selecionada" if mode == "full" else "Projeção curta para revisão independente"
        out = [f"# {label}: Actions, Board e agendamento\n",
            f"Artefato `{ARTIFACT}` · baseline `{COMMIT}` · repositório `{REPO}`.\n",
            "Todos os blocos são transcrições literais dos bytes UTF-8 capturados por `github.fetch_blob`. "
            "Linhas são 1-based inclusivas; intervalos separados omitem contexto, não inserem código. "
            "Git blob SHA1 e SHA256 são da fonte completa, não de uma versão reformatada. "
            "Cada fence preserva os bytes de seu intervalo (a quebra que fecha o fence não é parte da fonte quando a última linha não a contém).\n",
            "O archive é `sources/<path>`; `captures.json` fixa os 204 arquivos e `coverage.jsonl` fixa suas disposições. "
            "Os IDs abaixo ligam este documento às seções do `body.md`. Só leitura estática ocorreu; testes existentes são NOT_RUN.\n"]
        if mode == "review":
            out.append("Esta é uma seleção para juízes sem ferramentas, não o inventário completo de prova. "
                "`evidence.md` conserva intervalos mais amplos para cada ID, incluindo as 115 implementações substantivas. "
                "Se um claim depender de contexto não exibido aqui, use REQUEST_EVIDENCE com ID/path/intervalo; "
                "não promova a ausência de contexto a aceitação. As inferências de wake e revogação de bundle continuam explicitamente estáticas.\n")
        count = 0
        literal_bytes = 0
        for item in PLAN:
            out.append(f"\n## {item['id']} — {item['title']}\n\nVínculo: `body.md` §{item['body_section']}; archive de evidência: `evidence.md`, seção `{item['id']}`.\n")
            for e in item["entries"]:
                if not e[mode]:
                    continue
                c = by_path[e["path"]]
                out.append(f"\n### `{e['path']}`\n\nArchive: `{c['capture_path']}` · bytes: {c['bytes']} · Git blob: `{c['git_blob_sha']}` · SHA256: `{c['sha256']}`.\n")
                if mode == "full":
                    out.append(f"Papel da fonte: {e['role']}.\n")
                for a, b in e[mode]:
                    raw = b"".join(byte_lines[e["path"]][a-1:b])
                    code = raw.decode("utf-8")
                    out.append(f"\nLinhas **{a}–{b}**; SHA256 do intervalo `{sha256(raw)}`:\n\n~~~~typescript\n{code}" + ("" if code.endswith("\n") else "\n") + "~~~~\n")
                    count += b-a+1
                    literal_bytes += len(raw)
        (ROOT / filename).write_text("\n".join(out), encoding="utf-8")
        evidence_counts[filename] = dict(anchors=len(PLAN), source_files=len({e['path'] for a in PLAN for e in a['entries'] if e[mode]}),
            selected_lines=count, literal_bytes=literal_bytes, bytes=(ROOT/filename).stat().st_size)

    coverage = []
    for p, s in sorted(population.items()):
        c = by_path[p]
        links = index.get(p, [])
        is_impl = p in implementations
        selected_test = bool(links) and not is_impl
        kind = "implementation" if is_impl else "existing_test" if p.endswith(".test.ts") else "fixture_or_test_helper"
        if is_impl:
            depth = "semantically_read_substantive_implementation"
            role = "; ".join(dict.fromkeys(e["role"] for _,e in links))
            reason = ("Implementação comportamental lida, necessária à compreensão operacional da necessidade flow: " + role +
                      ". Mantida no corpo pelas âncoras indicadas; não reduzida a um censo nem usada como prova de execução.")
            disposition = "retained_as_substantive_evidence"
        elif selected_test:
            depth = "semantically_read_decisive_assertion_ranges"
            role = "; ".join(e["role"] for _,e in links)
            reason = "Assertions/fixtures dos intervalos indicados lidas como intenção de validação existente, NOT_RUN nesta produção. " + role + ". Não constitui PASS novo."
            disposition = "supporting_validation_not_run"
        else:
            depth = "orientation_inventory"
            text = b"".join(byte_lines[p]).decode("utf-8")
            declarations = re.findall(r'(?:test|it|describe)\(\s*[\"\x27]([^\"\x27\n]+)',text)
            topic = "; ".join(declarations[:2]) if declarations else Path(p).name
            if kind == "fixture_or_test_helper":
                role = "Fixture/helper de validação: " + topic
                reason = "Bytes e papel de suporte inspecionados no inventário; agrupado com as fixtures de sua família. Nenhuma implementação de produto é excluída por esse agrupamento. Não executado e sem autoridade instrucional; não prova provider/runtime."
            else:
                role = "Teste existente, inventário de intenção: " + topic
                reason = "Declarações e estrutura inspecionadas para disposição; não alego leitura decisiva de todas as assertions. Implementação correspondente recebeu leitura semântica própria. Teste conservado como validação futura NOT_RUN, sem PASS novo."
            disposition = "supporting_validation_inventory_not_run"
        coverage.append(dict(path=p, commit=COMMIT, git_blob_sha=c["git_blob_sha"], sha256=c["sha256"], bytes=c["bytes"],
            family=s["family"], source_kind=kind, read_depth=depth, role=role,
            need=["flow"], artifact=[ARTIFACT], disposition=disposition, reason=reason,
            evidence_ids=list(dict.fromkeys(a["id"] for a,_ in links)),
            decisive_ranges=[dict(anchor=a["id"],lines=[[x,y] for x,y in e["full"]]) for a,e in links],
            observation_authority="static_source_or_existing_test_only",
            execution_status="NOT_RUN", capture=c["capture_path"]))
    assert len(coverage)==204
    (ROOT/"coverage.jsonl").write_text("".join(json.dumps(c,ensure_ascii=False)+"\n" for c in coverage), encoding="utf-8")

    inputs = []
    input_paths = ["COMMON.md","mission.json","inputs.json","AGENTS.md","SKILL.md","sources.jsonl","criteria.json",
        "references/principles.md","references/fatia-1.md","references/fresh-start.md","references/orchestration.md",
        "references/judging.md","references/transport.md","history/coverage-needs-projection.json",
        "history/a3-dossier.md","history/a4-dossier.md","history/bodies/automation.md"]
    for name in input_paths:
        b=(INPUTS/name).read_bytes()
        scope = "full"
        if name.endswith("a3-dossier.md"):
            scope="selected pertinent ranges: 190–218, 414–428, 2240–2350, 2903–3101"
        if name.endswith("a4-dossier.md"):
            scope="selected pertinent ranges: 246–304, 338–349"
        if name.endswith("coverage-needs-projection.json"):
            scope="s1.core.automation projection and connected source dispositions"
        if name=="sources.jsonl":
            scope='exact population selection legacy_artifact_key == "s1.core.automation"'
        inputs.append(dict(path="../../inputs/"+name,bytes=len(b),sha256=sha256(b),read_scope=scope))
    context=(ROOT/"context/genesis-ownership-plan.md").read_bytes()
    assert git_blob(context)=="b45a73f17c34341097a8c8725a1df6260cd273b5"
    inputs.append(dict(path="context/genesis-ownership-plan.md",repository_path="modules/atlas/docs/design/genesis-ownership-plan.md",
        commit=COMMIT,git_blob_sha=git_blob(context),sha256=sha256(context),bytes=len(context),
        read_scope="normative public goals/invariants/AC/CC/QS/DoD; source captured through connector"))

    principles = {
        "GO-A1":"Corpo operacional por propósito/estado/entrada/saída/falha/autoridade; aceite semântico pertence aos juízes.",
        "GO-A2":"Capturas imutáveis, metadados de bytes, evidência e recibo do produtor persistidos; história não reescrita.",
        "GO-A3":"Entrada curta Como usar este L1 e seções dirigem leitura; não é nova camada L2–L4.",
        "GO-A4":"§14 liga classes de mudança às fontes/consumidores necessários, preservando reutilização histórica válida.",
        "GO-A5":"Baseline/protocolo/kit fixados; publicação Git e current/read manifest são tarefa posterior da principal.",
        "GO-A6":"Captura/hash/disposição mecanizadas; limites de execução e prova explícitos; nenhum produto executado.",
        "GO-A7":"Só documentação L1 no espaço autorizado; nenhum novo mecanismo Atlas/produto.",
        "GO-I1":"Pedido/receita/resposta originais conservados; recibos históricos não apagados; correções futuras devem vincular nova versão.",
        "GO-I2":"Código, intenção, teste NOT_RUN e inferência separados no corpo e na evidência.",
        "GO-I3":"Sem alegação de current ou read Atlas aceito; autoridade depende do futuro manifesto exato e aceite.",
        "GO-I4":"Fonte/recipe/input identities explícitas; navegação não vira dependência de build artificial.",
        "GO-I5":"Manutenção §14 inclui mudanças, remoções, não código e abstenção quando não há prova.",
        "GO-I6":"Uso de modelo/tokens/custos não exposto é UNKNOWN; nenhum provider pago chamado pelo produtor.",
        "GO-I7":"Sem oracle, secrets, remote writes ou instruções de fixtures; texto importado é dado.",
        "GO-I8":"204 hashes corretos não significam 204 provas semânticas; profundidade e limites por fonte explícitos.",
        "AC-01":"204 fontes congeladas, 115 implementações semânticas, 89 validações com disposição; cases públicos não foram consumidos nem simulados aqui.",
        "AC-04":"Corpo histórico/projeção/A3/A4 efetivamente ingeridos; delta de provider/scheduler/Board ancorado em implementação; malícia não tem autoridade.",
        "CC-1":"Coverage finita, sem fontes omitidas; limites e propriedade dos complements explícitos.",
        "CC-3":"Propósito, estados, contratos e impacto por mecanismo e provider no corpo completo; juízes avaliam utilidade.",
        "CC-7":"Conserva corpo/história aceites/correções, distingue doc gerada/campanhas e schemas de compatibilidade; nenhum generated edit.",
        "QS-1":"Afirmações ancoradas e epistemics explícitos, principalmente races inferidas.",
        "QS-2":"Seções orientadas a dispatch, recursos, fila e admissão/recovery; decisões de manutenção concretas.",
        "QS-3":"Um corpo, arquivo de evidência e projeção; sem documento narrativo por fonte.",
        "QS-4":"Boundaries de autoridade/auth/identity/preconditions/falhas e valores secretos explicitados.",
        "QS-5":"Fontes e assertions existentes com hashes, limites reais e nenhum novo PASS; testes/consumidores/runtime não executados.",
        "QS-6":"Aproveitamento de história, capture única por blob, limites de contagem/custo honestos; projeção evita repetir archive inteiro."
    }
    artifacts = ["body.md","captures.json","coverage.jsonl","evidence.md","evidence-review.md","request.txt"]
    artifact_hashes=[]
    for name in artifacts:
        b=(ROOT/name).read_bytes()
        artifact_hashes.append(dict(path=name,bytes=len(b),sha256=sha256(b),git_blob_sha=git_blob(b)))
    recipe=dict(schema="genesis-l1-producer-recipe/v1",task="AUTOMATION-L1",role="producer_only",repository=REPO,
        artifact_key=ARTIFACT,layer=1,need="flow",scope="orchestra.s1",source_commit=COMMIT,
        protocol_commit="ee2521a5b966bd505cc95bd1c733e09e12f33531",kit_commit="70234d541a9a3539935ef16f19e33c8f2d5f30ec",
        inheritance_commit="a8df22ae3a140c58c63f62ce2a634c84f415c943",execution_id="34269cf4-d631-41c5-a30b-85b0ec217390",
        publication_owner="/root",branch="genesis-s1-automation",
        final_prefix="modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation",
        population=dict(count=204, family_counts=dict(collections.Counter(s["family"] for s in selected)),
            substantive_implementations=115,actions_implementations=83,existing_validation_files=89,
            decisive_existing_test_files=7,orientation_validation_files=82,unknown_source_dispositions=0),
        actual_inputs=inputs,producer_procedure=[
            "Ler COMMON/missão/AGENTS/SKILL/referências e ingerir histórico pertinente; priorizar 80 folhas Actions sem leitura decisiva.",
            "Capturar 204 blobs fixados por conector GitHub read-only e verificar SHA1 Git e SHA256 de cada byte UTF-8.",
            "Ler substantivamente todas as 115 implementações; inventariar 89 arquivos de validação e ler assertions decisivas de sete.",
            "Escrever novo corpo completo, preservando histórico e seus limites; não implementar gaps para mudar a verdade.",
            "Gerar evidência literal ampla e projeção curta; registrar disposição por fonte sem alegar execução.",
            "Verificar somente integridade documental, população e âncoras; entregar para juízes independentes sem autocertificação."
        ],deterministic_receipt_generator="build_artifacts.py",public_criteria=[dict(id=k,producer_disposition=v,status="SUBMITTED_FOR_INDEPENDENT_REVIEW") for k,v in principles.items()],
        evidence=evidence_counts,artifacts=artifact_hashes,
        execution=dict(product_tests="NOT_RUN",ci="NOT_RUN",provider_mutations="NOT_RUN",atlas_runtime="NOT_RUN",
            consumers="NOT_RUN",independent_judgments="NOT_PERFORMED_BY_PRODUCER",L2_L4="NOT_PRODUCED",
            local_product_changes=0,remote_writes=0,paid_provider_calls=0,oracle_access=False,
            model_tokens="UNKNOWN",model_cost="UNKNOWN",model_usage_accounting="Not exposed by host; unknown is not zero"),
        unresolved_runtime_qualification="All actual runtime/provider/TLS/scheduler/queue results remain unqualified; static observation is not execution.",
        important_static_limits=[
            "Actions generic readback cannot confirm source/resource kinds and does not recover unattributed dispatch by guessing a run.",
            "Board uses separate gh/ledger/heuristics; queue settle path does not show universal post-admission hold/pause revocation check (static inference, not reproduced defect).",
            "Scheduler started is durable prompt admission; revocation can race admission and keep started without counting repeat/advancing next.",
            "Capability create directly inserts while idle daemon waits on wake queue; possible wake gap is static inference with caller/runtime qualification absent."
        ],global_complements="Publication, two independent judges, consumers, L2–L4, Atlas isolated import/current/read/index and maintenance runs belong to principal after L1 acceptance.")
    json_out("recipe.json",recipe)

    body=(ROOT/"body.md").read_text()
    claimed=set(re.findall(r'\b(?:A\d\d|B\d\d|S\d\d|T\d\d)\b',body))
    assert claimed <= {a["id"] for a in PLAN}, claimed
    report=dict(population_exact=True,captured_and_git_sha256_verified=204,substantive_implementations=115,
        validation_files=89,coverage_rows=len(coverage),evidence_anchor_count=len(PLAN),body_anchor_ids=sorted(claimed),
        evidence=evidence_counts,product_tests_run=0,
        clarification="These are document-integrity checks, not semantic acceptance or product tests.")
    json_out("document-integrity.json",report)
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
