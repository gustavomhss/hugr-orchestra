# L4 — Manutenção da fatia Platform 200

Corpo de autoria estática; decisões de revisão ficam no índice/resumo do pacote. Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. O [manifesto](../manifest.json) conserva as 200 primárias, sem recontar apoios. Este roteiro deriva das [relações L3 aceitas](relations.md), lidas integralmente e citadas como R1–R11. Seus fatos de implementação são mediados por essa base; as recomendações são inferências de manutenção, sem execução ou obrigação nova do produto.

## Avaliar uma mudança preservando a referência anterior

1. **Renovar os bytes.** Escolher uma revisão imutável e preservar o candidato anterior: manifesto, corpos, critérios, hashes e vínculos das decisões que realmente o avaliaram. Capturar a revisão escolhida com path, tipo, Git blob, SHA-256, tamanho e método de leitura. Registrar renomeados/removidos/novos sem trocar silenciosamente um dos 200; ampliar a população exige decisão de escopo. Hash novo identifica bytes novos; hash igual não resolve mudança no contexto consumidor.
2. **Reabrir o significado.** Ler integralmente as fontes implicadas na pergunta, com método estrutural justificado para dados gerados. Comparar mecanismos, contratos e limites, incluindo consumidores inalterados. Marcar as explicações L2, relações L3 e orientações L4 afetadas; conservar as decisões ligadas aos bytes anteriores. Distinguir causalidade, formato e teste estático de navegação, e história de evidência na revisão escolhida. A renovação de checksums não renova aceite semântico. [Critérios](../criteria.md), itens 1–6; [critérios L4](../layer-criteria.md).
3. **Separar a comprovação operacional.** Registrar conclusões documentais e lacunas. Eventual instalação, carga, teste ou distribuição exige tarefa autorizada e resultado com revisão, inputs, ambiente, objeto observado e alcance. A ausência de resultados aqui não confirma sucesso ou defeito de runtime; este roteiro não autoriza execução.

## M1 — Um pacote mudou de endereço, export ou declaração de ownership?

Reconsiderar a identidade registrada e os consumidores de localização: P188/P187, P176 e P127; depois exports, literais, README e exceções em P178/P181/P183/P189/P191/P177/P180/P197. Revisar a correspondência nome/arquivo/entrada pública e alcance dos leitores, distinguindo validação pura, contenção física e resolução aproximada. `R1`, `R7`.

Pedir mapa antes/depois e leitores afetados, com tipos de aresta e escopo. As fixtures P143/P150/P151 e P144/P145 especificam intenção, sem resultado atual. `exportMissing` e pins exigem decisão explícita mesmo quando o relinker não falha; não transferir o sucesso de um resolvedor local para todos os consumidores. Mudança de chave de exceção por path não prova autorização nova nem redução histórica da dívida. Leitores fora da população são fronteiras a investigar em escopo próprio.

## M2 — Uma versão, patch ou chave de cache mudou?

Reabrir P072, o patch pertinente e seus consumidores; confrontar P019/P017/P039/P200 para decidir que inputs participam do reúso. No baseline, 19 dos 20 patches têm vínculo no lock e P166 não tem; preservar essa distinção até nova evidência. Revisar resolução, comportamento pretendido pelo delta e condições de reúso. Hit de cache não é execução nova; variável encaminhada não necessariamente entra no hash. `R2`.

Comparar hunks semanticamente distintos e formatos efetivamente alterados; não concluir aplicação a partir da presença do patch. P198 não rebaseia patches como P163. P172 exige C++20, enquanto P137 trata CPU/libc de prebuilds. Em P157/P066, pedir evidência da ponte entre `providerMetadata` e `providerOptions` e da afinidade provider/modelo antes de afirmar continuidade entre turnos. O patch não mostra essa ponte. Instalação resolvida, ABI e comportamento remoto continuam exigindo comprovação própria. `R3`.

## M3 — Mudou o alvo nativo, o empacotamento ou o bloqueio de publicação?

Reconsiderar a seleção do par em P133, chave CPU/libc em P137 e modo executável em P016. No Nix, seguir P112→P110 e a ordem poda/reparo/admissão P124/P125/P126. Revisar o objeto entregue e a condição verificada por cada etapa. Cabeçalho compatível não comprova ABI ou carga; P126 também não qualifica GUI nem toda a árvore de processos. Pedir correspondência explícita entre produtor, alvo, arquivos e consumidor; eventual carga real pertence à verificação operacional. `R4`.

Para gates, reconstruir o encadeamento declarado: a publicação P036 depende de assemble e qualify; qualify chama P025. P037 não chama diretamente esse bundle; P034 não espera P035 por `needs`. Confrontar P104/P105/P106/P108 como contrato ou história, sem substituir o YAML escolhido. Assinatura opcional, checksum posterior e publicação não atômica pedem evidências distintas de assinatura efetiva, qualificação e estado dos destinos. Nada aqui demonstra configuração de proteção de branch. `R5`.

## M4 — Há novo hash Nix, formato de recibo ou controle negativo?

Partir da coordenação P027, da captura P109 que chama P117 e das normalizações P114/P118; reabrir P115 e os leitores/controles P116/P120/P121/P122/P129/P142 quando o formato mudar. Separar medição candidata, proveniência e qualificação. Comparar campos, ordem, códigos e conjuntos, além dos digests. P115 e P116 diferem no tratamento de nomes/duplicatas; P142 testa parsing, não a execução dos controles. `R6`.

Manter explícito que `dependencyInputs` na proveniência compara JSONs capturados, que `GITHUB_ACTIONS=true` não autentica origem e que a trap de P109 observa o estado final. O hash NAR e os digests dos registros têm papéis distintos. Logs/controles reais, se autorizados e obtidos, precisam vincular a tentativa; captura não encerra qualificação consumidora.

## M5 — Um plano antigo parece autorizar movimento ou migração de produto?

Reconciliar P075/P092, as alternativas P076/P090 e os cancelamentos de P083 antes de usar o plano como orientação. P074 e P177 descrevem populações/momentos diferentes; a diferença entre 487 e 94 não identifica sozinha a causa da redução. Pedir uma explicação situada na revisão escolhida e preservar o alcance dos leitores, inclusive o risco documentado de perder alvos silenciosamente após movimento. `R8`.

P091/P085/P086 avisam sobre contratos V1 removidos. P088 distingue rota disponível de eventos e estados esperados pelo renderer. Revisar compatibilidade funcional pelos contratos atuais e sua composição, sem promover tabelas históricas ou presença de rota a prova de funcionamento. Briefs e índices ajudam a localizar decisões, sem criar dependência de runtime entre todos os destinos.

## M6 — Será necessário retirar, recuperar ou espelhar uma árvore?

Separar seleção/inventário P175/P174, recuperação P193/P194 e replay P192. Pedir membership, bytes, modos, identidade de origem e disponibilidade do leitor/payload para o mecanismo escolhido. P149 oferece cenários estáticos de corrupção e concorrência; não comprova todas as corridas. Hash autocontido não autentica origem externa, inventário não restaura, e replay first-parent não preserva toda a topologia de merges. `R9`.

P093–P097 são índices/relatos, sem prova de retenção atual. Se o leitor foi removido com o escopo, recuperar sua capacidade de leitura também é pré-condição material. Até existir evidência própria, registrar disponibilidade como desconhecida; não recomendar remoção com base apenas no índice. Conservar revisão e objetos descritos pela orientação anterior.

## M7 — Uma captura visual ou smoke deve sustentar mudança de UI?

Vincular a observação ao build, fontes e modalidade: P001/P002 distinguem explicação, CSS e instalado/dev; P007 mantém folhas antigas ao trocar sua injeção. Reabrir P003/P006/P010 quanto ao alcance de contraste, transformação e montagem. Pedir evidência que distinga regra nova de declaração antiga ainda presente; uma imagem montada não traz identidade ou veredito por si. P056 consome P055 em um smoke TUI sem assertions automáticas; não implementa o CSS desktop. Guias e índices são navegação. Nenhuma captura, renderização ou medição nova foi produzida aqui. `R10`.

## M8 — O candidato documental pode ser admitido como input Atlas?

Preservar a fronteira já demonstrada em `R11`: P072 tem 489.909 bytes, acima do limite de 256.000 do caminho observado no apoio. É recusa estática por tamanho, não execução observada; `unavailable` não significa `absent`. SHA de transporte e Git blob não substituem versão de input. Pedir comprovação de admissão e versão pelo consumidor apenas em tarefa própria autorizada; não alterar o limite nem presumir suporte das outras 199 pelo tamanho. O apoio permanece fora da contagem primária.

## Registro para quem continuar

Registrar pergunta, revisões anterior/escolhida, delta de fontes/contratos, trechos L2/L3/L4 afetados, evidências/localizadores e pendências. Separar fato estático demonstrado, inferência condicionada, lacuna e trabalho fora do escopo, bem como decisão documental e resultado operacional. Link de navegação não vira dependência causal. Não se certificam manutenção executada, importação, reparo ou aceite global.

**Bases efetivamente consumidas:** `manifest`, SHA-256 `293392e28b20da40124af6ed710f3fb29fc6f208446ff966448617562c4e8c1d` (leitura estrutural completa); `relations`, SHA-256 `61901fbd8504aa98215999cd35dbfde64f31c68e950db894c23e05fd48a343e4` (leitura textual integral). Pnnn localiza fontes e bases L2 nessas relações; não alega nova inspeção dos blobs originais.
