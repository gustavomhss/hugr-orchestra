# Correções PA-01–PA-06 — contrato 4.2

Estado: correções de planejamento/tooling aplicadas; não é implementação nem benchmark do Orchestra. A revisão original em `../REVIEW.md` permanece histórica e intacta. A referência da interface e os 304 arquivos da marca não mudaram. Os 143 nós, 4 frentes, 10 issues, 25 subissues, 38 WPs e 66 tasks foram preservados; não há novo scheduler, framework de UI ou dependência de runtime.

## Resolução por achado

| Achado | Reparo aplicado | Prova de contrato/tooling |
|---|---|---|
| PA-01 | Zero reservas de máquina pela task inteira. RUNNING.phase distingue work/collect/review. Preflight de coleta e seleção recusam trabalho local concorrente. P01 é derivado de dois manifests; P10 é coletado na campanha S23 e revalidado por S25, não em sete campanhas de widgets. | Testes `PA01_*`, formato do bruto em PERFORMANCE/RECEIPTS e verificação de tiers/locks no plano. |
| PA-02 | T1s consomem entregas locais verificadas, não a auditoria completa do fornecedor. Copy/parity S22-T1 roda cedo. Arquivos/diff se apoiam no C-05 existente antes da verificação S09. Seleção estável prioriza o caminho do piloto sem ignorar precedências. | Testes `PA02_*`, caminhada sintética das 66 tasks, análise de cones e leases. |
| PA-03 | Todos os Quality standards pertinentes do produtor e seus agregadores foram reescritos por estágio. T1 produz candidato/build/smoke; S23-T1 prepara coletores; S23-T2 mede; S24 revisa; S25-T2 agrega e encerra. | Testes `PA03_*`, inspeção dos cinco grupos/stages/ancestrais e caminhada com gate falho e repetição. |
| PA-04 | Slope passa a domínio assinado e unidade única bytes/min. Valores decrescentes válidos passam; positivos sustentados reprovam; sinais mistos são INCONCLUSIVE e bloqueiam PASS. Não há arredondamento nem relaxamento do teto residual. | Testes `PA04_*`: negativo/zero/positivo, ruído, unidade errada, NaN, amostra insuficiente. |
| PA-05 | P03 mantém os tetos absolutos e acrescenta regressão pareada máxima de 5% com piso de 2ms para input-p95/feedback e 5ms para input-p99/hot-tab. | Testes `PA05_*`: 8→49ms, 10→90ms e 8→40ms falham; melhoria/ruído pequeno passam; baseline lenta não dispensa teto. |
| PA-06 | Tema tem consumidor UI75 no shell existente; governança tem adapter UI76 explicitamente planejado. Bindings distinguem W1 indisponível/HOLD e W2 live autoritativo. Obrigação sem consumidor e captura não relacionada reprovam. | Testes `PA06_*`: consumidor/estado removido, binding vazio, imagem não relacionada e reuso legítimo de captura. |

## O que mudou nos axiomas

Os cinco grupos continuam explícitos em cada nó. Não foram substituídos por uma nota de “seguir o pai”. Foram corrigidas obrigações incompatíveis com o estágio e delimitadas as campanhas proporcionais. Invariantes de identidade, permissões, preservação do usuário, assets e evidência real são contínuos. Aceite final e encerramento de pai nunca são pré-requisito de seu produtor.

Dois testes existentes foram adaptados por mudanças intencionais: versão projetada usa a versão real do contrato (não string congelada 4.1), e reserva de hardware é testada na fase collect em vez de bloquear toda a preparação S23-T1. Não se removeu o controle de host quieto: testes verificam WAIT, erro em reservas sobrepostas e nenhum início novo durante a coleta.

## Disjunção e paralelismo

A caminhada sintética usa quatro vagas, duração igual por task, requisitos externos ficticiamente satisfeitos e **nenhuma task real marcada PASS**. O piloto tem 11 pré-requisitos de task, contra 15 no contrato anterior. Nesse modelo sem duração de janelas de coleta, sua implementação aparece na rodada 9 e verificação na 10. Isso não é previsão de prazo, speedup nem benchmark. O tempo real depende dos testes, hardware, integrações e bloqueios externos.

Foram examinados 1.009 pares de tasks sem precedência transitiva. Nos cones declarados há somente a sobreposição S19-W2-T1/S20-W2-T1, protegida pelo lease de registro/codegen já existente. Não se declara independência comportamental do monorepo por isso; S01 continua responsável pelo censo do checkout e os consumidores verificam contratos compartilhados.

Revisar resultados não deve reservar a máquina. Contudo, `phase=review` durante uma coleta significa **sem processos locais concorrentes**: não é permissão para rodar typecheck, capturar telas ou gravar código enquanto mede. O preflight lê o estado declarado do coordenador; não é mutex de SO e não descobre processos sozinho. A coleta real deve conferir processos, energia e janela. --collect retorna WAIT com exit 2 quando a reserva não pode ser adquirida.

## Limites de aprovação

As margens P03 são metas de engenharia, não ruído calibrado no Mac. S02 precisa medir repetibilidade do mesmo build; ruído maior que o piso é inconclusivo. Não aumentar o piso por conta própria. Tendência de memória com sinais mistos também exige estender settle/janela ou repetir rodada válida; nenhum intervalo de confiança foi alegado.

O tooling confere identidades, campos, diferenças de manifests e métricas; não autentica o produtor, não verifica beleza automaticamente e não substitui as capturas/medições reais. UI76 é um arquivo planejado dentro do owner S20, não backend ou capacidade live existente. W2 continua bloqueado sem a autoridade apropriada; o estado indisponível não fica bloqueado.

A revisão foi feita pelo mesmo assistente em passagem separada, não por auditor externo. Não houve frontend alterado, dependência runtime instalada, execução de modelo pago, build/render de produto, Electron ou benchmark do Orchestra. Publicação dos reparos não fecha o épico #215 nem aprova tasks de produto.

## Reproduzir

Na raiz `specs/orchestra-visual`:

```sh
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_parallelism_repairs.py' -v
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/select_work.py --repo /caminho/real/do/worktree --jobs 4
```

O primeiro trabalho continua S01-W1-T1. Os logs locais são de fixtures sintéticas; os logs da publicação registram a execução das ferramentas no checkout do GitHub. O grafo nativo de issues é reconciliado sem duplicar tickets; dependências finas não viram bloqueio de issue inteira.
