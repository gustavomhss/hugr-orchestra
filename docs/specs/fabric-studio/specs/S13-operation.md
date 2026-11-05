# S13 — Operação, persistência e continuidade

**Estado:** proposta técnica; não congelada para implementação.

**Recorte em materialização:** somente a seam C07 PR01 foi delimitada em [PROTECTED-RECORD-WAVE](PROTECTED-RECORD-WAVE.md). Ela não congela esta spec inteira: guarda/decrypt, substituição/revisão, limites de registro e migração têm aceitação própria. Retenção completa, eliminação de cópias/backups, fencing de restore, orçamento medido, OAuth e qualificação operacional permanecem separados e bloqueiam seus consumidores. Estado de cada gate em DELIVERY, sem alegar que cifra resolve a recuperação integral.

**Requisitos proprietários:** FS-PRV-003; FS-PRV-006; FS-HIS-005–007; FS-HIS-009; FS-OPS-001; FS-OPS-003; FS-OPS-005–008; FS-OPS-013.

## 1 Responsabilidade e integrações

S13 define proteção, retenção, limpeza e operação limitada; não concede acesso remoto nem implementa ACL multiusuário. Consome [CONTRACTS](CONTRACTS.md) C01/C02/C05–C07 e [OWNERSHIP](OWNERSHIP.md), [autoridade e dados](../requirements/02-authority-and-data.md), [continuidade](../requirements/05-evidence-and-continuity.md), [operação](../requirements/06-ai-and-operation.md) e [decisões Q03–Q13](../requirements/DECISIONS.md). S02 possui contexto/conexão; S03 readiness; S07 ativações/resultados; S09 comandos/jobs; S11 egress; S12 composição portátil; S14 prova integrada.

**FS-OPS-001.** Perfil inicial: um operador por instância/perfil, Microsoft public cloud, desktop e web privado sobre backend Orchestra. O principal do host/Basic auth não representa pessoas distintas; sem ACL de equipe, conexão SP compartilhada ou colaboração simultânea. Desktop local usa seu backend/callback previsto em Q01; cliente ligado a servidor remoto usa login, storage, drivers e rede **desse servidor**, não localhost/filesystem do browser. Contextos sem Git continuam distintos mesmo com `Project.ID.global` igual; Location real não vira workspace Fabric.

Chamadas Microsoft e drivers são server-side, lazy por superfície. Q06 escolhe MSAL Node, Tedious e Kusto/REST pertinentes, não os qualifica em Bun. Abrir Studio/template não baixa executável nem instala bridge nativa. Não suportado inicialmente: nuvem soberana, private link, proxy autenticado ou inspeção TLS sem qualificação própria. Probes de callback/TDS/HTTPS verificam o perfil real, certificados e destinos; falha não permite `trustServerCertificate`, túnel, senha alternativa ou relaxamento de proxy/TLS.

## 2 Contrato

### 2.1 Armazenamento, proteção e compatibilidade

**FS-OPS-003.** Usar Database, migrações e backups existentes, sem banco paralelo de feature. Resolver `storageID` estável do store e owner/contexto no servidor; se ausente, o host deve provê-lo antes de persistir. Upgrade migra revisões sem reinterpretar conteúdo para esconder incompatibilidade. Store/schema mais novo que o leitor suporta recusa escrita antes de mutação; restauração informa dependência da chave e limitações do backup, sem prometer recolher cópias externas.

**FS-PRV-003.** Leitura/escrita de payload sensível usa C07: primeiro guard de owner/store/contexto e seleção da linha esperada; depois abrir envelope cifrado e comparar o conteúdo interno autenticado `(domain, storageID, principal, contextID, recordID, kind, revision)` ao destino esperado, antes de uso. Linha/ciphertext trocado, revisão incompatível ou comparação falha não produz plaintext utilizável. Identificador recebido não é bearer nem autorização para decrypt.

Reusar primitivas e lifecycle de chave Orchestra, não cifra própria nem registro Fabric disfarçado de credencial. Cifra existente protege segredos específicos; não demonstra base inteira cifrada, envelope contextual ou cobertura da recuperação sobre novas tabelas. Chave ausente/indevida preserva ciphertext e solicita recuperação, sem substituir chave/dado silenciosamente. Credencial herdada do dev app permanece read-only e sem refresh. Até qualificar proteção, recuperação e limpeza, **não persistir conteúdo sensível em disco**; manter apenas o que a política permitir em memória, com perda na interrupção informada.

### 2.2 Classes e retenção Q03

Prazos abaixo são decisões de política, não medidas de segurança ou budgets de capacidade. Política explicitamente mais restritiva prevalece. Nenhuma expiração cria cópia em chat, export, backup improvisado ou diagnóstico para contornar limpeza.

| Classe | Proteção, duração e término |
| --- | --- |
| Tokens/cache MSAL | Backend cifrado no lifecycle de credenciais; nunca manifesto, log, export ou IA. Desconexão segue S02; sem refresh de herança dev. |
| Rows, logs brutos, resultados de query | Apenas memória; limpar ao fechar sessão de dados/contexto **ou após 30 minutos sem uso, o que ocorrer primeiro**. Sem persistência automática. |
| Definições/código/metadados sensíveis | Minimizar ao necessário ao trabalho salvo, payload cifrado e leitura contextual; exibir não autoriza egress. Aplicar classe de rascunho/composição/evidência pertinente, não prazo genérico novo. |
| Rascunhos | Autosave local cifrado, visível; recuperar por **sete dias de inatividade**, salvo opção explícita de conservar no trabalho salvo. Nunca aplica remoto. |
| Composição salva | Até exclusão explícita; referências sanitizadas/revalidadas. Nomes/contexto podem exigir cifra. |
| Evidência com dados | Opt-in por evidência, cifrada, **sete dias por padrão**; prazo mostrado e exclusão antecipada disponível. Sem cópia remanescente no histórico/modelo local. |
| Recibos/proveniência de comandos | Mínimo necessário, cifrado se sensível; **90 dias após estado terminal**. Ativo/unknown mantém mínimo para reconciliar, sujeito a exclusão explícita com perda de observação informada. |
| Tombstones de deduplicação | Mínimo command ID/hash/estado, sem payload de dados, **durante toda a vida do contexto**. Limpar recibo não torna command ID reutilizável. |

### 2.3 Inspeção, limpeza e desconexão

**FS-HIS-007.** `retention.inspect/delete` é a operação lógica já prevista em C06, não API publicada. Entrada: ContextRef e classes/IDs autorizados, com confirmação explícita quando há perda de prova. Inspeção informa classes existentes, prazo/idade, proteção disponível e dependência de observação; nunca revela payload antes da autorização. Saída de delete: recibo de alcance local concluído ou problema C02; falha de limpeza não é sucesso. A limpeza cobre caches/handles e cópias locais pertinentes; efeitos sobre backups existentes precisam ser documentados e demonstrados antes de prometer eliminação integral.

**FS-HIS-005.** Remover composição/painel/rascunho elimina somente os objetos locais escolhidos. Excluir contexto invalida permanentemente seus handles e intenções não enviadas, preservando a regra de replay C05; não envia cancelamento, DROP ou exclusão de workspace Fabric. Intenção já em `submitting` não pode ser declarada não enviada só por limpar o contexto; eventual efeito remoto continua possível e deve ser informado.

**FS-HIS-006.** Desconectar bloqueia novos acessos autenticados e encerra observações locais dependentes da conexão; invalida gerações/ativações e descarta respostas tardias. Não confirma cancelamento nem apaga jobs/agendas/efeitos remotos. Novo login exige vínculo autorizado, sem autosubmit de intenções pendentes. Exportações baixadas e conteúdo já enviado ao provider não são recolhidos pela desconexão/exclusão; informar antes do envio e da limpeza.

Proveniência mínima não depende de cascade da sessão/mensagem: apagar chat marca referência removida e mantém apenas o mínimo permitido para observação pelo operador **atualmente** autorizado. Apagar a proveniência necessária produz observação `unavailable`, nunca adoção anônima, Tool.Context reconstruído ou identidade presumida. Tombstone sobrevive à limpeza de recibo enquanto o contexto existir.

### 2.4 Limites, consumo e medidas

**FS-OPS-006.** Aplicar seeds Q09 na admissão e durante execução/materialização, antes de exceder recursos. Limite mais restritivo de política/provider prevalece. Consumo parcial não vira resultado completo; excesso retorna `limit`, truncamento explícito ou espera visível conforme operação, nunca aumento automático. Medição de documento usa bytes UTF-8 efetivamente codificados, não caracteres; cardinalidades contam entradas, inclusive as rejeitáveis. Convenção de profundidade do parser S04 deve ser registrada no ensaio comum antes do freeze.

| Área | Seed e comportamento exigido |
| --- | --- |
| Documento por espaço | 256 KiB, profundidade 16, 24 ferramentas, 64 bindings; S04 rejeita excesso, não elimina entradas silenciosamente. |
| Query interativa | 60 s; 1.000 rows/página, 10.000 rows/resultado ou 5 MiB/resultado, primeiro limite atingido. Timeout local não confirma cancelamento remoto. |
| Concorrência por conexão | Duas queries de dados e quatro reads de metadados em voo; excesso em espera visível, sem compartilhamento de fetch entre autoridades/contextos. |
| Refresh/poll | Recorrência de dados desligada; ativação separada, mínimo inicial 60 s. Job poll inicia em 5 s, desacelera até 60 s; `Retry-After`/backoff do provedor prevalecem. |
| Cache | Metadados até 60 s na mesma autoridade/contexto, sem prometer revogação instantânea; revalidação forte supera TTL. Rows não viram cache durável. |
| Modelo | 32 KiB por pedido de conteúdo Fabric explicitamente permitido; S11 aplica antes de admissão, sem truncamento silencioso de código/instrução. |

KiB/MiB significam 1.024/1.048.576 bytes. Paginação não reinicia orçamento total; parar captura não é job cancelado. O lead complementou Q09 com seeds de integração C08: fila 32/conexão, ativação query até 15 minutos, materialização até 32 MiB/contexto e 128 MiB/instância, payload durável até 256 MiB/contexto e 1 GiB/instância, até 10.000 recibos/100.000 tombstones por contexto. Excesso bloqueia nova admissão sem apagar buffer dirty/seleção ativa/recibo/tombstone para abrir vaga. Cache/handle inativo elegível pode expirar com motivo. Logs técnicos persistentes desligados; pacote diagnóstico opt-in seed 1 MiB sanitizado. Esses valores **não são budgets finais medidos**; a prova de limite/limpeza sob carga ainda bloqueia freeze/ativação pertinentes.

Pacote portátil S12 tem seed 512 KiB/64 hints/documento 256 KiB. Exportação de dados S07/C08 é JSONL do recorte capturado, até 10.000 rows/5 MiB, ExportRef de uso único/seed 60 s e download autenticado no-store com reautorização; sem query nova, path/URL livre ou arquivo truncado chamado completo. Logs/erros continuam sem payload sensível. Não habilitar caminhos antes de seus limites serem implementados e qualificados.

**FS-OPS-005.** Consumo separa modelo, Fabric, transferência e armazenamento, com unidade, fonte, período/atraso e escopo de atribuição. Mostrar preço desconhecido/estimativa explicitamente quando não verificável; read-only pode consumir capacidade, e capacidade não é convertida em moeda por suposição. Não consultar Capacity Metrics app como fonte externa de telemetria própria.

**FS-OPS-013; FS-PRV-006.** Instrumentar latência por superfície e backend/contexto permitido, hit/miss de cache no mesmo contexto, rate limit/backoff, duração e cancelamento de query, espera/fila, erro por motivo C02 e resultado unknown. Correlacionar com referências autorizadas S09, não payload. Distinguir cancelamento solicitado de confirmado, tempo de espera de tempo remoto e métrica ausente de zero. Não registrar bearer, cache MSAL, SQL literal, rows, código ou resposta remota integral por padrão. Erro remoto é sanitizado antes de log/recibo, inclusive metadados sensíveis. Diagnóstico de suporte é opt-in sanitizado; telemetria externa nunca automática.

**FS-OPS-007.** Antes do freeze de defaults finais registrar cenário artificial, perfil desktop/web, SO/hardware/rede, versões, baseline Orchestra sem Studio e resultados frios/quentes/repetidos. Separar renderer, backend, Microsoft e modelo; medir abaixo/no/acima dos seeds e comportamento sob limpeza/retenção. Atestar limite não prova SLO, ganho de produtividade ou segurança absoluta. Nenhum threshold de latência final é decidido aqui.

## 3 Estados e falhas

**FS-OPS-008.** Usar Availability/Problem de C02; a tabela não cria state machine pública paralela. Readiness depende da tupla operação/formato/identidade/direitos/capacidade/região/rede/versão qualificada de S03. Ao detectar quebra de contrato ou preview não qualificado, degradar/desabilitar só a operação afetada; preservar leitura/exportação segura da composição por S12, sem exportar dados nem migrar intenção permissivamente.

| Evento | Transição/saída observável |
| --- | --- |
| Driver ausente/não conforme; rede incompatível | `not-installed`, `unverified` ou `unsupported` com motivo; não baixar bridge nem acionar fallback privilegiado. |
| Login perdido/negação conhecida | `authentication-required`/`denied`; bloquear novos acessos e reavaliar caches; não usar TTL como grant. |
| Queda durante despacho | Estado C05 `unknown` até evidência suficiente; nenhum retry por timeout, reconnect ou lease. |
| Expiração/exclusão de payload/prova | Invalidar handle; `expired`/`unavailable` conforme caso, sem reconstruir evidência. |
| Schema/store incompatível ou chave indisponível | Recusar escrita/leitura protegida pertinente, preservar material recuperável e informar motivo. |
| Limite/rate limit | `limit`/`throttled`, espera/backoff explícitos; não repetir query implicitamente para preencher faltantes. |

TLS inválido, porta TDS bloqueada, callback inacessível e protocolo não suportado são motivos distinguíveis. Uma falha de rede não passa operação a ready por haver documentação do endpoint. Sem prova real de rota SQL com concorrência forte, escrita de produção/prod-like continua bloqueada por Q07; se nenhuma rota fechar a jornada, lançamento integrado bloqueado, não qualificado por handoff.

## 4 Persistência e autoridade

**FS-HIS-009.** Offline pode reabrir composição/evidência local ainda autorizada, protegida e dentro da retenção, mostrando identidade, idade e último estado observado. Sem rede não significa negar todo material local; tampouco permite alegar status remoto atual, renovar grant/ativação ou iniciar execução/fila oculta. Conteúdo ausente, expirado ou sujeito a reautorização online mostra motivo de indisponibilidade.

Troca de tenant/identidade/provider, desconexão, mudança de política ou revogação conhecida reavalia elegibilidade de cache e leitura offline **antes** de servir dados. A chave da cifra não concede autorização. Epoch/TTL não garantem detecção instantânea de revogação remota. Restaurar backup não restaura consentimento/autoridade atual nem reabilita handle de contexto excluído; esta propriedade exige prova de replay/recuperação antes de freeze.

S07/S09 continuam donos das transações de resultado/comando. C07 impede troca entre registros/contextos por guard e comparação interna, mas não prova sozinho anti-rollback completo de store/backup. Pendências de replay devem voltar ao lead; não enfraquecer idempotência para habilitar recuperação. Nenhum Authority, Tool.Context ou bearer é serializado como licença para restart.

## 5 Prova e bloqueios

Casos **futuros, não executados**. Limpeza usa relógio controlado/estado verificável, e falha de instrumento não pode contar como ausência de dado.

| ID / seção | Caso positivo futuro | Caso negativo futuro |
| --- | --- | --- |
| FS-PRV-003 / 2.1–2.2 | Cada classe cumpre proteção e prazo Q03; envelope válido só abre no owner/contexto/revisão esperados. | Trocar ciphertext/linha/contexto ou perder chave impede leitura; sem proteção não há escrita sensível em disco. |
| FS-PRV-006 / 2.4 | Recibo/métrica correlaciona trabalho sem payload; suporte exige opt-in sanitizado. | Erro remoto com token/SQL/row não vaza em log, diagnóstico ou telemetria automática. |
| FS-HIS-005 / 2.3 | Excluir composição/contexto limpa alcance local e invalida handles/intents não enviados. | Remover painel/contexto não cancela job nem apaga recurso; command antigo não reaparece como novo. |
| FS-HIS-006 / 2.3 | Desconectar para acessos/observação local e exibe continuidade remota como não cancelada. | Resposta tardia não repopula cache; reconectar não submete intenção nem recolhe exportação. |
| FS-HIS-007 / 2.3 | Inspecionar mostra classes/prazos; exclusão confirmada elimina payload e declara perda de observação. | Sem provenance, observação fica unavailable; apagar chat não fabrica origem nem apaga prova permitida por cascade. |
| FS-HIS-009 / 4 | Offline abre material local autorizado dentro do prazo com idade/status histórico. | Revogação conhecida/expiração bloqueia dado; offline não inicia efeito/fila ou anuncia atualidade remota. |
| FS-OPS-001 / 1 | Desktop e browser remoto usam backend/callback/rede/store corretos e contextos sem Git isolados. | Browser remoto não usa localhost do cliente; dois browsers/Basic auth não viram ACL multiusuário. |
| FS-OPS-003 / 2.1 | Upgrade/backup/restore preserva revisões e proteção no store existente. | Schema mais novo recusa escrita; restore antigo não revive handle excluído nem autoriza replay. |
| FS-OPS-005 / 2.4 | Consumo separa quatro categorias com fonte/unidade/atraso e preço desconhecido explícito. | Query read-only não vira gratuita; capacidade sem preço não recebe moeda exata inventada. |
| FS-OPS-006 / 2.4 | Abaixo/no limite admite conforme seed; fila/resultado parcial são explícitos e finitos. | Acima de bytes/rows/profundidade/cardinalidade/concorrência não amplia budget nem reporta completude falsa. |
| FS-OPS-007 / 2.4 | Registro de ensaio repete baseline frio/quente por perfil, com resultados e falhas de limite. | Uma execução quente ou valor seed não congela SLO/default final nem alega ganho permanente. |
| FS-OPS-008 / 3 | Quebra de API/rede desabilita operação com motivo e preserva composição sanitizada. | Preview/TLS inválido/driver não conforme não ativa fallback, auto-upgrade permissivo ou escrita fraca prod-like. |
| FS-OPS-013 / 2.4 | Cenários produzem latência, cache, rates, duração/cancelamento, fila, erro e unknown distinguíveis. | Métrica indisponível não vira zero; só HTTP 2xx não basta e cancel request não é cancel confirmado. |

**BLOCKER S13-PROTEÇÃO (freeze/persistência sensível):** demonstrar C07, replay/substituição, limpeza de cópias e recuperação de chave cobrindo payloads Fabric. `credential/cipher.ts:10–43,57–100` oferece cifra/lifecycle e busca atual de dados selados, não prova cobertura de tabelas de domínio; adaptador e alcance de recuperação precisam de decisão/verificação do lead.

**BLOCKER S13-BUDGETS (freeze/ativação pertinente):** o lead escolheu seeds finitos adicionais em C08 e manteve logs técnicos persistentes desligados. Faltam prova/medida abaixo/no/acima do limite, cobertura de alocação/buffers e configuração segura; números decididos para ensaio não são SLOs ou freeze dos budgets finais de Q09. S04/S07/S12 usam as mesmas unidades/limites decididos.

**BLOCKER S13-RECUPERAÇÃO (freeze):** provar migração/newer-schema refusal, backup/restore com exclusão/tombstones, guard pré-decrypt e perda honesta de observação. C07 não resolve sozinho rollback de backup; não inventar nova seam pública para escondê-lo. Base de store: `database/database.ts:17–46`; proteção existente não equivale a banco inteiro cifrado.

**BLOCKER S13-QUALIFICAÇÃO (ativação/lançamento):** conformidade Bun/distribuição e ensaio por perfil/rede/versão ainda ausentes; Q02 exige ambiente, identidades e budget autorizados. Q07 exige ao menos uma rota forte real para mudança/publicação; falta de prova mantém operação e lançamento afetados bloqueados. Sem novos gates de CI, acesso ao tenant ou afirmação de enforcement de relay nesta etapa.
