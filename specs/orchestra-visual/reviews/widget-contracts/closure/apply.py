#!/usr/bin/env python3
"""One-time, optimistic widget-contract amendment; never edits product source."""
import argparse, hashlib, json
from pathlib import Path

BASE = {
    'PLAN.json': '45159c61d0cd1a67d22e8d35149a2f4567855db9325870cfcf1dc472c4211b1f',
    'WIDGETS.md': '9de546df885024f56b4a8fd33dba439b702121ce834d8eb3aaf86bdc401e4ae7',
    'SURFACES.json': 'd6100b43ff7289ba3fb71f2080b9a295f41688c5e97d3117ea0487162124f434',
    'COVERAGE.json': '5a11374ff085a415f46d9a2943e6b7be2db3e46336b0e9f8ae06e839e79b85c0',
}
SOURCE = '1a235323361717d13a44d3c184bad13649f59e60'
ENTRY = '''### Onde implementar — destinos, não um segundo plano

Todos os caminhos desta tabela partem da raiz do repositório. **Novo** significa componente/adaptação frontend a implementar no escopo indicado, não arquivo já existente. As tarefas T1 implementam e provam sua fatia; T2 verificam essa fatia. S25 conecta os componentes no candidato; S23/S24 avaliam esse candidato; nenhuma T1 exige aprovação de um consumidor futuro.

| Elemento | Fonte/componente existente | Destino decidido | Task de entrega → verificação |
|---|---|---|---|
| Checklist W01 | todowrite + timeline atual | Novo `packages/app/src/pages/session/timeline/orchestra-checklist.tsx`, apresentado pelo `message-timeline.tsx` existente | `S09-W1-T1` → `S09-W1-T2` |
| Alterações/diff W02 e testes W03 | ReviewPanelV2 + ToolPart normalizado + mensagem-fonte real | Novo `packages/app/src/pages/session/orchestra-evidence.tsx`; adaptadores/ações/testes no cone `orchestra-evidence*` | `S11-W1-T1` → `S11-W1-T2`; seam da timeline em S09 |
| Dock W04 | AppsPanel + appDock* | Modificar `packages/app/src/pages/session/apps-panel.tsx` e `.css`; bridge no owner S16 | `S15-W1-T1` → `S15-W1-T2`; nativo `S16-W1-T1` → `S16-W1-T2` |
| Files / Docs / Terminal em W04 | file context, reader, file renderer e terminal atuais | Novos `packages/app/src/pages/session/orchestra-evidence-files.tsx` e `orchestra-evidence-docs.tsx`; reusar `terminal-panel.tsx` | S11 entrega panes; S25 conecta; S15 não escreve nesses arquivos |
| Dados de Tasks/Atividade W05/W06 | stores sincronizados + snapshots pequenos existentes | Modificar `packages/app/src/pages/session/tasks-data.ts`; novo `orchestra-activity-data.ts` no mesmo diretório se a projeção separada for necessária | `S17-W1-T1` → `S17-W1-T2` |
| Cards Tasks/Atividade W05/W06 | um read model compartilhado | Modificar `packages/app/src/pages/session/tasks-panel.tsx`; novo `orchestra-activity.tsx` e seu teste | `S18-W1-T1` → `S18-W1-T2` |
| Faixa de ações W07 | shell transport, prompt store, open-in-app e share atuais | Novo `packages/app/src/pages/session/orchestra-evidence-actions.tsx`; callbacks de draft/execução no cone de composer de S10 | S11 entrega UI; S10 entrega callbacks; S25 conecta |
| Atalhos W08 | shell, comandos da sessão e consumers S19–S21 | S06 apresenta navegação; somente S25 modifica `packages/app/src/pages/session/use-session-commands.tsx` | S06/S19/S20/S21 entregam; `S25-W1-T1` conecta |
| Acabamento/prova W09 | aplicativo integrado, não outra demo | Comparação visual e métricas sobre o mesmo build; evidências nos owners atuais | `S23-W1-T2` / `S24-W1-T2` → `S25-W1-T2` |

Sufixo `*` é um cone de escrita, não ordem para criar arquivos desnecessários. Não criar um componente para cada célula desta tabela nem um registry genérico de widgets. Adaptadores pequenos podem ficar no arquivo do componente quando não são reutilizados. A árvore de providers, a persistência e os backends atuais continuam sendo a fonte de verdade.

'''
SHELL_SOURCE = '''### Duas origens de execução, uma apresentação

O frontend atual normaliza mensagens pelo `packages/app/src/utils/session-message.ts`. **O adapter de evidência deve preservar a origem, não converter a forma normalizada em autoridade nova.** A normalização pode gerar `state.status="completed"` para uma shell interrompida e preencher um fim ausente com o início. Esses valores de apresentação não comprovam sucesso nem duração zero.

| Origem | Binding decidido | Regra de resultado |
|---|---|---|
| Tool do agente | ToolPart + mensagem assistant correspondente, no mesmo servidor/sessão | Usar estado real e metadata de execução. Erro/cancelamento explícito prevalece sobre texto/rodapé; ausente continua desconhecido |
| Comando direto/repetido por `session.shell` | `SessionMessageInfo` de tipo shell → `normalizeSessionMessages` / `shellPart`; `message.shellID` corresponde ao callID; IDs sintéticos são usados somente na projeção existente | Preferir `source.status`, `source.exit`, `source.output?.output`, `source.output?.truncated` e `source.time` da mensagem real. No shape observado, running é ativa; exited com exit inteiro usa esse código. Outro status exige o discriminante real do host ou resultado desconhecido. Interrupção/falha explicitamente reportada não vira sucesso por `part.state.status=completed`, rodapé positivo ou exit0 contraditório |

S09 fornece ao callback `sourceMessage` quando a mensagem bruta correspondente está carregada. Para assistant, o ID é o da mensagem-fonte; para shell direta, é a origem que a normalização converte em `<id>:assistant` e `<id>:tool`. **Não inventar outro ID nem inferir parentesco pelo texto do comando.** S11 consome essa informação; S25 liga o seam. Reusar a projeção/lookup já existente e qualificar por servidor/sessão; não varrer todas as mensagens de todas as sessões a cada render.

Sem estado/fim autoritativo: resultado não confirmado, duração `—`, motivo disponível no disclosure. Para shell direta, `time.completed` ausente não se transforma em zero por causa do fallback do normalizador. Quando o shape de output não expõe outputPath, oferecer só o output retido; não fabricar caminho de arquivo a partir do texto. O contrato não exige editar o normalizador compartilhado ou ampliar o backend para esses casos.

**Owner do adapter W03: S11.** O adaptador deve preservar a projeção existente para outros consumidores. O teste `WK07` inclui shell direta interrompida/failed, exit contraditório e fim ausente, além dos casos de log já definidos. O teste `WK19` confirma que repetir cria nova execução e novo card sem sobrescrever o resultado anterior.

'''
OPEN_ORIGIN = '''### Abrir a origem — contrato exato de navegação

S17 acrescenta ao read model somente referências frontend opcionais já observadas: `sourceMessageID`, `sourcePartID`, `callID` e `originUserMessageID`. Não muda schema de servidor. A mensagem normalizada assistant carrega `parentID`; confirmar que esse parent identifica uma mensagem user projetada na mesma sessão. Para shell direta, a normalização existente produz o par user/assistant com a origem shell. Não escolher “a mensagem anterior mais próxima” nem deduzir o parent por timestamp.

O hook `useSessionHashScroll` recebe **UserMessage**, e o hash reconhecido é `#message-<id>`. Não criar `#message-<callID>` nem passar ToolPart ao hook. S25 recebe `onOpenItem(source)` de S18, usa `sessionHref(serverKey, sessionID)` para a sessão real e o ID de user confirmado para revelar o turno pelo fluxo de hash/scroll existente; respeita reduced-motion e carregamento histórico atual. A seleção/exibição do output permanece vinculada ao part/callID de W03, não à label da row.

Se a origem user não puder ser resolvida, o botão se chama **“Abrir sessão”**, não “Abrir execução exata”. Mostrar “Origem da execução não disponível no histórico carregado” e preservar o output retido quando disponível. Não iniciar varredura/polling ilimitado nem rolar para uma mensagem escolhida por aproximação. A troca de servidor/sessão enquanto a origem carrega invalida o callback antigo. `WK14` cobre parent válido, origem ausente, hash de callID recusado e callback obsoleto.

'''
DRAFT = '''**Preservação do composer ao repetir:** reusar o transporte e a captura de ownership, **não chamar o submit normal que limpa o input**. O callback de replay não chama `clearInput`, `prompt.reset`, `context.clear`, não altera o modo do composer e não muda o texto, cursor, anexos ou contextos do rascunho. Isso vale no sucesso, erro, cancelamento antes do envio e resposta incerta. O resultado aparece no fluxo real da sessão; o rascunho continua aguardando envio normal. `WK19` inclui rascunho não vazio com anexos antes/depois do replay; `WK20` confirma que respostas antigas não restauram um snapshot sobre edições mais novas.

'''
AXES = {
'S09': {
 'dod':'Seam W03 entrega sourceMessage quando carregada; W01 usa fallback atual apenas sem snapshot histórico concluído carregado.',
 'invariants':'Não tratar estado/duração sintéticos da normalização como prova de sucesso ou tempo real.',
 'quality_standards':'Reusar a projeção de mensagens; sem lookup global por token ou novo registro de tools.',
 'completeness_criteria':'WK02/WK07 verificam o passthrough de origem e proposta não confirmada; parser e UI de resultado são responsabilidade S11, não duplicação em S09.',
 'success_criteria':'O consumidor distingue a origem do resultado e não precisa adivinhar o significado de completed.'},
'S10': {
 'dod':'Callback de replay preserva integralmente o rascunho normal nos estados desta etapa.',
 'invariants':'Replay não chama clearInput/reset/context.clear nem restaura snapshot sobre edições mais novas.',
 'quality_standards':'Capturar e revalidar identidade; nenhuma segunda execução por double click ou retry automático.',
 'completeness_criteria':'WK19/WK20 verificam texto/cursor/anexos preservados, cancelamento e resposta incerta.',
 'success_criteria':'Repetir um comando não custa ao usuário seu rascunho ou troca o alvo da execução.'},
'S11': {
 'dod':'W03 distingue resultado da fonte shell e estado sintético do part; W07 não limpa o composer.',
 'invariants':'Interrupted/failed explícitos nunca viram sucesso; fim ausente permanece duração desconhecida.',
 'quality_standards':'Adapter limitado aos dois shapes documentados; sem parser universal ou endpoint novo.',
 'completeness_criteria':'WK07/WK19 cobrem shell direta normalizada, exit contraditório, fim ausente e novo card.',
 'success_criteria':'O card continua útil sem inventar sucesso, duração, contagens ou bytes não retidos.'},
'S17': {
 'dod':'Projeção mantém referências de origem opcionais e todas as entidades ativas já sincronizadas.',
 'invariants':'64 é carga de teste, não teto de dados; parent de origem nunca é inferido por ordem ou timestamp.',
 'quality_standards':'Limitar DOM/cache adicional, não descartar intervenções ativas para cumprir budget.',
 'completeness_criteria':'WK13/WK15 incluem 65+ ativas; em WK14 S17 prova somente referências de origem qualificada/ausência. Stop e navegação renderizada pertencem a S18/S25.',
 'success_criteria':'Contagem, expansão e navegação da origem concordam sem truncamento silencioso.'},
'S18': {
 'dod':'Resumo e detalhe preservam todas as ativas carregadas e a prioridade ativa definida em W05.',
 'invariants':'Encerradas não deslocam ativas no resumo; origem incerta só oferece Abrir sessão.',
 'quality_standards':'Virtualizar rows e estabilizar foco/ordem; 64 não limita o total da coleção.',
 'completeness_criteria':'WK13/WK14/WK16 cobrem 65+ ativas, falhas recentes, origem ausente e View all sem omissões.',
 'success_criteria':'O usuário vê trabalho urgente e chega à origem real, sem ação enganosa.'},
'S25': {
 'dod':'No estágio de integração nomeado, os bindings W03/W05/W07 estão conectados ao source real.',
 'invariants':'Hook de hash recebe user confirmado, não callID; replay não chama o submit destrutivo do draft.',
 'quality_standards':'Reusar controllers/normalização existentes, sem segundo estado de histórico ou runtime.',
 'completeness_criteria':'WK25/WK27 incluem abertura de origem, replay com draft e shell interrompida; gates globais só no fechamento.',
 'success_criteria':'O cockpit conectado respeita os efeitos decididos mesmo com origem ausente ou respostas atrasadas.'},
}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def once(text,old,new):
    if text.count(old)!=1:raise ValueError('Expected one stable input fragment: '+old[:90])
    return text.replace(old,new,1)
def apply(root):
    for name,expected in BASE.items():
        if sha(root/name)!=expected:raise ValueError('Concurrent input change: '+name)
    original=json.loads((root/'PLAN.json').read_text());plan=json.loads((root/'PLAN.json').read_text())
    text=(root/'WIDGETS.md').read_text()
    text=once(text,'### Interfaces locais propostas — nomes e efeitos, não APIs já existentes\n',ENTRY+'### Interfaces locais propostas — nomes e efeitos, não APIs já existentes\n')
    text=once(text,'renderExecutionEvidence({serverKey, sessionID, messageID, part})','renderExecutionEvidence({serverKey, sessionID, messageID, part, sourceMessage})')
    text=once(text,'`part` usa ToolPart do SDK já importado. undefined mantém renderer atual.','`part` usa ToolPart do SDK já importado; `sourceMessage` é opcional e usa o tipo SessionMessageInfo atual, sem um schema paralelo. undefined mantém renderer atual.')
    text=once(text,'### Formato reconhecido, decidido\n',SHELL_SOURCE+'### Formato reconhecido, decidido\n')
    old='Fonte corrente só é usada quando não há snapshot concluído correspondente na história carregada; o mesmo reader de sessão existente faz a hidratação, sem novo polling.'
    new='Regra exata de fallback: mostrar a lista corrente somente se não existir nenhum part todowrite concluído com lista válida no histórico carregado da sessão. Havendo snapshot histórico carregado, mostrar somente os snapshots em seus lugares; não tentar provar correspondência da lista corrente por igualdade de conteúdo ou índice. O mesmo reader de sessão existente faz a hidratação, sem novo polling.'
    text=once(text,old,new)
    start=text.index('**Ordenação:** needs-input, failed, running, demais;');end=text.index('**Abrir:**',start)
    text=text[:start]+'''**Ordenação e resumo:** primeiro compor a coleção de ativas (`needs-input`, depois `running`); em cada grupo, ordenar por timestamp real decrescente quando conhecido e depois pela key lexical. Timestamp desconhecido fica depois dos conhecidos no mesmo grupo. O ticker não muda a ordem. Mostrar até3 ativas; somente se houver menos de3, preencher as vagas com encerradas recentes, priorizando failed antes das demais. Se houver falhas recentes fora do resumo, o header mostra contagem/link para o detalhe, sem deslocar uma ativa ou inventar status. Este algoritmo substitui a ordenação genérica que colocava failed antes de running no mesmo pool.

**Detalhe:** “Ver todas (N)” expande o próprio card, com seções ativas/encerradas e as mesmas rows; usar o virtualizer existente acima de30 itens. **64 é carga de referência, não teto da coleção.** Todas as entidades ativas já sincronizadas continuam acessíveis, inclusive65 ou mais; limitar DOM montado/overscan e caches derivados, nunca aplicar slice(0,64) às ativas. Encerradas continuam limitadas às12retidas pelo read model, explicitamente rotuladas “12 encerradas recentes”. Se o backend só carregou parte da coleção, exibir a quantidade carregada e o mecanismo atual de carregar mais; não prometer o total global. Expandir não remonta o Dock. WK13 inclui 65+ ativas e WK15 verifica DOM limitado sem perda de entidade/intervenção.

'''+text[end:]
    text=once(text,'**Dismiss:** apenas encerradas, local à mesma sessão/key;',OPEN_ORIGIN+'**Dismiss:** apenas encerradas, local à mesma sessão/key;')
    text=once(text,'“Ver todas” expande inline até a coleção já retida, no máximo64rows virtualizadas; sem buscar transcript inteiro.','“Ver todas” expande inline a coleção já retida, com virtualização; não limita as entidades ativas a64 nem oculta a65ª intervenção. Encerradas seguem a retenção W05, e fontes Dock/Janitor não consomem uma cota artificial das tarefas. Sem buscar transcript inteiro.')
    text=once(text,'### Criar PR: handoff explícito, sem publicação disfarçada\n',DRAFT+'### Criar PR: handoff explícito, sem publicação disfarçada\n')
    source_rows='''**Bindings adicionais conferidos em `'''+SOURCE+'''`:**
- `packages/app/src/utils/session-message.ts`: `normalizeSessionMessages`, `shellMessages` e `shellPart`; preservar status/tempo da mensagem-fonte.
- `packages/app/src/context/server-session-v2-reducer.ts`: `session.shell.started`/`session.shell.ended` alimentam a origem real de replay.
- `packages/app/src/pages/session/use-session-hash-scroll.ts` e `message-id-from-hash.ts`: navegação por UserMessage e hash `#message-<id>`.
- `packages/app/src/utils/session-route.ts`: `sessionHref(serverKey, sessionID)` qualifica a rota de servidor/sessão.
Esses caminhos são **fontes de leitura**, não nova permissão de escrita. W03 e W05 explicam exatamente como usar suas saídas sem modificar o contrato público.

'''
    text=once(text,'**Escolha de implementação:** todos os itens W01–W08 usam frontend e contratos existentes.',source_rows+'**Escolha de implementação:** todos os itens W01–W08 usam frontend e contratos existentes.')
    (root/'WIDGETS.md').write_text(text,encoding='utf-8')
    reads={
      'S09':['packages/app/src/utils/session-message.ts','packages/app/src/context/server-session-v2-reducer.ts'],
      'S11':['packages/app/src/utils/session-message.ts','packages/app/src/context/server-session-v2-reducer.ts'],
      'S17':['packages/app/src/utils/session-message.ts','packages/app/src/pages/session/use-session-hash-scroll.ts','packages/app/src/utils/session-route.ts'],
      'S18':['packages/app/src/pages/session/use-session-hash-scroll.ts','packages/app/src/pages/session/message-id-from-hash.ts','packages/app/src/utils/session-route.ts'],
      'S25':['packages/app/src/utils/session-message.ts','packages/app/src/pages/session/use-session-hash-scroll.ts','packages/app/src/pages/session/message-id-from-hash.ts','packages/app/src/utils/session-route.ts'],
    }
    for n in plan['nodes']:
        owner=n['id'].split('-')[0]
        if owner not in AXES or n['id'].startswith('S25-W0'):continue
        for group,extra in AXES[owner].items():n['axioms'][group][-1]+=' '+extra
        if 'read_paths' in n or n['kind'] in ('subissue','task'):n['read_paths']=list(dict.fromkeys(n.get('read_paths',[])+reads.get(owner,[])))
        if owner=='S17' and 'WK14' not in n.get('widget_cases',[]):n['widget_cases'].append('WK14');n['widget_cases'].sort()
        if owner=='S09' and 'WK07' not in n.get('widget_cases',[]):n['widget_cases'].append('WK07');n['widget_cases'].sort()
    plan['status']='widget-bindings-closed-and-source-rechecked; product implementation and measurements NOT_RUN'
    fields=('id','kind','parent','children','depends_on','acceptance_requires','write_paths','leased_write_paths','exclude_paths','resource_locks','criterion_ids','criterion_evaluation_stage','required_performance_gates','required_visual_gates','required_native_gates','verification_tier','sampling_requires_quiet_host')
    assert [{k:n.get(k) for k in fields} for n in original['nodes']]==[{k:n.get(k) for k in fields} for n in plan['nodes']]
    (root/'PLAN.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert sha(root/'SURFACES.json')==BASE['SURFACES.json']
    assert sha(root/'COVERAGE.json')==BASE['COVERAGE.json']
    print(json.dumps({'status':'APPLIED','kind':'planning-not-product','nodes':len(plan['nodes']),'criteria':sum(len(a) for n in plan['nodes'] for a in n['axioms'].values()),'dag_scope_and_budgets_changed':False}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();apply(a.root)
