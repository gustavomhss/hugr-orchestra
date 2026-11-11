# Contratos dos complexos e crítica independente

Base revalidada: 74bfb2f447; o plano inicial em remediation-plan.md precedeu toda implementação complexa. Críticos Sol: House (segurança), McKay (recuperação), Lamport (ownership/prova), Elon (intenção/modelos/streams). Todos somente leitura. O lead registra aqui decisões antes do GO; achados parcialmente resolvidos no dev não são reaplicados.

## Contrato pronto para a próxima unidade: M2/M3

Escrita exclusiva: apps/desktop/src/main/omni-process.ts e omni-process.test.ts; linux-workspace-access.ts e novo teste correspondente apenas para cleanup no error. Novo helper/test de lifecycle permitido se nomear a fronteira real de settlement e não duplicar lógica. Guia desktop-startup.md deve distinguir falha de início e perda do supervisor. Sem Protocol, novo spawner, allowlist ou native/omni.

Estado terminal único por handle. Falha de início emite error e depois close uma vez; não emite exit OS inventado. Após spawn normal, exit precede drain/reap e close. Perda do supervisor ou falha da bomba emite erro, encerra recursos/streams e emite close uma vez, sem rejeição não observada. Abort listeners e timers são removidos em todo estado terminal. stop mantém limpeza da árvore; não declarar sucesso de cleanup sem prova do reaper.

A API terminal numérica preserva fallback de exitCode 1 quando não há status OS; onExit registrado tardiamente recebe o mesmo resultado uma vez. Se saída já foi entregue e o supervisor some durante drain, não entregar segundo exit. Pipe wait e pump são observados desde seu início, inclusive quando uma falha antes da outra. Consumer de workspace limpa timeout/abort/pipes tanto no error quanto close sem duplo settle.

Testes antes do patch: ENOENT real pelo spawn omni com expectSpawn; caller espera close único sem exit; abort concorrente. Perda controlada de wait antes/depois de exit e pump rejection por seam de dependência tipada local (nunca globalThis mutation) exige erro/close únicos, streams fechados, nenhum unhandled rejection nem callback tardio. PTY rejeição exige onExit1 e replay tardio. Preservar testes reais de descendente/pipes e controle positivo omni. Gate hosted desktop Linux+Windows, typecheck local do pacote e guards. Crítica independente dos critérios antes de GO; execução só depois de red observado.

## Decisões a congelar antes das unidades seguintes

- H1: mesma ordem de regras agente e Session do runner; deny final vence saved allow; missing-agent permanece deny. Catálogo e execução testados com read real anunciado e deny específico, mais Session allow e ask explícito.
- H4: transportar alvo original e fazer resolução canônica pela autoridade da Location; external_directory antes da ação final; paths ../ e symlink cobertos sem afrouxar SDK deny. Tipos do host e runner precisam um contrato único.
- H6: falta congelar representação de namespace e compatibilidade. Rejeitar colisões antes de publicar catálogo; prefixo MCP reservado contra nativos, origem vinculada à permissão, sem promover grants de nomes antigos automaticamente. Não autorizar implementação por concatenação improvisada.
- H7: issuer persistido em tokens e clientInfo; URL mutation limpa atomicamente tokens/clientInfo/PKCE/state sob lock. Legado sem issuer exige reauth individual e preserva outras conexões. Atualizações concorrentes não podem ressuscitar credencial anterior. Nenhuma credencial real em teste.
- H8: validar binding dentro da fronteira de escrita e novamente antes da admissão do run, após claim. Congelar ordem de lock e linearização revoke/commit; checagem apenas após placed é insuficiente.
- H12: somente documentos user/global ou projeto aprovado pelo ConfigTrust alteram destino api, headers sensíveis e fonte env; apresentação/custo podem continuar. Cobrir os dois transforms e destinos de resolução alternativos, preservando custom globals. Detalhes de request.body e variantes precisam revisão por capacidade antes de GO.
- H5: decisão do lead = recusar join de entrada de approval antes de qualquer mutação do builder ou .gitignore; não expandir semântica fan-in nesta correção. Testar grafo/arquivo idênticos após recusa e aprovação suportada que pausa de verdade.
- H10: default remoto vira basename segura para ambos separadores; rejeitar nomes inválidos e criar xb, sem seguir symlink/overwrite. --output explícito permanece escolha do owner; definir cleanup só do arquivo que a operação criou.
- H14: dev já tem caps 2MiB/32MiB/1MiB. Manter esses limites; falta deadline integral, counts e agregado sem overshoot concorrente; cache só publica bundle completo; deny total antes de rede. Não atribuir ausência completa de limites ao dev atual.
- E1: identidade/payload/delivery/Session da intenção ambígua sobrevive até ACK/reconciliação e reload; edição deliberada cria intenção nova. Congelar persistência/recovery, não deduplicar por texto.
- E2: server-resync já existe no dev; resta fence antes de snapshot e preservação de eventos posteriores inclusive status omitidos/transcript. Não reimplementar reconexão inteira.
- E6: capacidade por engine efetiva com herança; não esconder globalmente modelo válido em host externo. Congelar representação pública e recusa antes da admissão.
- E7: modelo já possui geração canônica, variante precisa contrato equivalente e precedência modelo→variante. Preservar denylist HTTP; testes até prepare, regenerar Client por rotina oficial.
- E8: exigir terminal semântico normalizado após onHalt, respeitando protocolos diferentes; EOF truncado vira falha durável no runner. Não usar sentinel bruto universal nem repetir ferramentas assentadas.
- E9: decisão do lead = overflow fail-closed com erro observável, socket encerrado e consumidor acordado; fila permanece bounded. Teste real >128 frames com consumidor parado e terminal excedente.
- E10: requer regex limitada ou isolamento terminável para todas superfícies RegExp e String; timeout cooperativo não serve. Congelar subconjunto/flags/backreferences/lookaround/lastIndex e consumer antes de dependência nova. Teste adversarial com watchdog externo.
- T2: chunking já corrigido no dev; falta contrato agregado de admissão/anexos+expansão JSON/base64 e bound SSE coerente. Não aumentar teto arbitrariamente. Múltiplos anexos e resto sem delimitador são casos obrigatórios.
- N1: Env registra todo run, compõe cancelamento caller+teardown e prova fim da árvore do Worker sem matar host. N2 conserva deadline e vigilância durante erro de inventário recuperável; nunca inventa tree-empty. Congelar erro terminal quando proteção não puder ser mantida.
- L1: cenário antigo de descendente ativo passou 6 testes atuais com coordinator real. Residual distinto: create após enumeração não participa do hold. Exige fence de criação/admissão por árvore e ordem de locks, antes de nova alegação runtime.
- L2: decisão do lead = Busy imediato; exclusividade antes de reler Session e por stage/clear/commit inteiro. Erro público exige Protocol/Server e generate coordenados.
- L8: owner antigo precisa ser segurado antes da leitura até rebind+registro; definir ordem arm/Session e recusa entre processos sem fence durável.
- L9: bundle fechado por arquivo/hash/existência/tipo; cleanup condicional preserva edições posteriores e reporta conflito depois de destino aplicado. Coordenar owner não substitui CAS contra escritor externo.
- G2: decisão do lead = rejeitar hosts sobrepostos para storage físico canônico antes de servir, liberar no scope. Refcount compartilhado sem definir quem fornece runner/Location não é suficiente.
- X3: somente registro de locks torna-se global por backend físico+canonical; fs/formatter/permissões permanecem locais. Aliases e arquivos distintos têm testes específicos.
- L3: recompor epoch e deltas sobreviventes atomicamente com revert, preservando fontes indisponíveis; reset simples perde informação. Definir tratamento de epoch legado inconsistente.
- L4: construtor canônico reconstrói chave/claims/carriers a partir de fact autenticado; acumuladas exigem prova própria. Legado ambíguo recusa/candidato; preservar scope e tierT2, sem reescrever log histórico.
- L5: causalidade exige predecessor/identidade de commit e outbox recuperável; decidir branches/clone versus sidecar atual e formato legado. Timestamp pós-commit não é ordem causal.
- L6: publicação CAS temporária validada+atômica e reparo de existente inválido condicionado; replay relê conteúdo. Hash/formato preservados; concorrência/partial/symlink sem apagar objeto válido.
- L7: contextIsCurrent antes reserve e consumo inicial; replay de receipt já concluído continua idempotente. Legado sem binding suficiente exige nova aprovação.
- L10: resolver agente efetivo pela AgentV2.select da Location atual usando LocationServiceMap; default alterado revoga owner antigo, explícito não muda. Sem preencher agent em toda Session nem hardcode de seat.
- L11: journal prepared/applied/decided com payload imutável, recovery serial antes de nova decisão. Escolher roll-forward indexed ou compensação identificável antes de permitir discarded; não apagar regra antiga por semelhança textual.
- M5: preferir lote inteiro IMMEDIATE e prune apenas após commit integral, desde que todas migrations.up existentes suportem tx; senão exigir journal de upgrade com backup pinado. Não modificar migrations shipped.
- M6/M7: validar journal legado inteiro antes de escrita, conversão atômica e guard unknown também no primeiro acesso/applyOnly. Reconciliar prefixo parcial existente sem reaplicar SQL; dois writers e timestamps desconhecidos recusam sem mutação.
- M9/M10: rerun retoma apenas artefatos originais verificáveis por manifest/hash/version/SHA; build pelo mesmo SHA não garante mesmos bytes. npm/GH existentes divergentes recusam; feed só após payloads imutáveis, prune após todos manifests remotos. Sem publicação real em teste.
- M11: geração+AbortController antes do primeiro await; Stop/destroy invalida e limpa aquisição tardia antes de novo start. Propagar signal pelo ciclo; callbacks antigos não atualizam overlay novo.
- M13: outbox durável de segmentos/IDs+intenção de close antes do ACK local, sem senha persistida. Stop encerra captura imediatamente; close server após ACK de segmentos. Retry limitado, ended legado terminal preservado e ACK perdido reconciliado por GET. Falta congelar estado visível de pendência antes de GO; não trocar perda de dados por simples cancelamento de timer.

## Gates e limites

As decisões acima documentam o que foi examinado e o que ainda precisa de contrato detalhado, não são declaração de implementação. Cada unidade recebe ownership disjunto, crítica dos testes, red hosted, GO, green e revisão fria; integração serial na mesma audit-remediation. Apenas E11 já passou esse ciclo e está integrado. M2/M3 é a próxima unidade preparada. Regeneração de qualquer fronteira pública será centralizada por unidade para evitar disputa no generated. Nenhum caso complexo é fechado só pela existência deste plano.
