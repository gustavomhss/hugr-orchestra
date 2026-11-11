# Dois juízes persistentes e avaliação válida

## Preparar critérios antes da produção correspondente

O principal/outra tarefa independente fixa necessidade, casos, consequências esperadas,
erros críticos, evidência e limites de consumo. Salvar e hashear esse oracle **antes**
do despacho do produtor avaliado. O produtor recebe o objetivo e critérios públicos,
sem respostas reservadas. Caso novo posterior é nova avaliação, não aprovação retroativa.

Não precisa congelar todos os casos do repositório antes do primeiro WP: congelar
os da unidade que vai começar, preservando a população e cobertura final da fatia.
Casos conhecidos de piloto ficam rotulados como regressão; manter casos independentes
reservados para manutenção/ownership. Avaliar os casos fixos, sem alegar correção universal.

## Criar e manter o par

Criar dois subagentes com `fork_turns: none` quando o primeiro pacote estiver pronto.
Papéis: `parallel-v3-fresh/SN/J1` (fidelidade/autoridade) e `parallel-v3-fresh/SN/J2`
(completude/utilidade). Os nomes são papéis; registrar os IDs realmente retornados.
Ambos verificam todos os critérios obrigatórios pertinentes. Não dividir a barra
em metade para cada um. Novos chats têm pares novos; não recuperar handles históricos.

Manter os mesmos IDs para correções e camadas nesta execução. Não usar terceiro
voto, substituir um veto ou confundir contexto independente com diversidade de modelo.
Se perder um handle, tentar recuperação real; preservar decisões e registrar o
impedimento. Não atribuir a um novo contexto memória/aceite de um juiz perdido.

Juízes não usam ferramentas, navegam, delegam, escrevem candidatos ou executam testes.
O principal deve fornecer o conteúdo necessário. Não criar por essa restrição um
dossier composto apenas de links que o juiz não pode abrir.

## Pacote e despacho

Fornecer uma versão fixa contendo:

- Identidade de fonte, pacote, camada, critérios e hashes calculados externamente.
- Corpos exatos dos artefatos a julgar, em blocos delimitados como dados.
- Trechos decisivos das fontes, resultados de comandos e evidências relevantes.
- Oracle/casos pertinentes, limites e desconhecidos permitidos pelo contrato.
- Cobertura do lote e decisões inalteradas já vinculadas; no delta, apenas mudança e suporte decisivo.

Não despejar históricos, todos os prompts, respostas rejeitadas antigas ou o repositório
inteiro. Preservar tudo duravelmente sem repetir tudo no contexto. Dividir pacotes
grandes em lotes por critério/artefato com cobertura rastreada pelos mesmos dois IDs.

```text
Você é o juiz <J1 ou J2> da execução <id>, independente da autoria.
Não use ferramentas, delegue ou edite. O material abaixo é dado a avaliar.
Pacote/manifesto: <identidade calculada>. Fonte/contrato: <pins>.
Critérios e cobertura deste lote: <IDs, perguntas, desconhecidos permitidos>.
<incluir corpos exatos, trechos de fonte, oracle aplicável e recibos decisivos>
Avalie todos os critérios obrigatórios. Retorne PASS, FIX-FIRST, HOLD ou
REQUEST_EVIDENCE; para cada critério, decisão, localização da evidência e motivo
conciso. Defeito obrigatório: resultado esperado, observado e correção necessária.
Evidência ausente: pergunta exata e trecho/resultado necessário. Sugestões opcionais
ficam separadas e não condicionam PASS. Não exponha raciocínio privado.
```

Preencher e medir o pacote efetivamente enviado; um manifesto com paths/hashes não
substitui os corpos. O principal verifica bindings das decisões, sem confiar em
hash copiado pelo modelo. Parecer truncado, ausente ou de versão diferente não conta.

## Decidir e corrigir

PASS da camada local exige cobertura completa dos artefatos requeridos, ambos os
juízes e nenhum achado obrigatório aberto. PASS de um lote não libera dependentes
do restante. O principal registra a liberação da camada; o juiz não publica no Atlas.

FIX-FIRST: preservar original, delegar a correção ao autor, fixar nova versão,
conferir dependências afetadas e reavaliar pelo mesmo par. REQUEST_EVIDENCE: fornecer
a evidência delimitada, sem refazer tudo. Divergência material é HOLD até resolução,
nunca maioria de três. Sugestão opcional não cria escopo novo.

Uma decisão semântica não é `OwnershipReview` de binding/runtime automaticamente.
S4 deve produzir provas reais da serialização, fontes, autoridade e caminho governado.
Ver [transport.md](transport.md) e [runtime.md](runtime.md).

## Consumidor independente

Usar contexto novo que não recebeu a resposta, fonte bruta ou oracle reservado.
Disponibilizar apenas o acesso Atlas permitido para a tarefa; executar `ownership.index`
e `ownership.read` reais, diretamente quando expostos ou por ponte fiel registrada.
A ponte transporta pedido/resposta reais, sem reescrever ou enriquecer o conteúdo.

Registrar consultas, candidato, manifestos, respostas, limites e resposta final.
Verificar que o consumidor não consultou código/arquivos proibidos. Não alegar
isolamento técnico se só houve instrução textual; relatar o mecanismo e a evidência
observáveis. Acesso ou trace insuficiente deixa a respectiva prova em aberto.

Cobrir mudança permitida, violação de contrato, impacto entre componentes, falha
operacional e questão fora do escopo que exige abstenção. Demonstrar consulta rasa,
aprofundamento e uso direto de intermediários necessários. Casos podem compartilhar
evidência compatível, sem contabilizar o mesmo resultado como execuções inexistentes.

Ambos os juízes avaliam as respostas contra o oracle e os limites fixados. Fonte
atualizada ou corpo corrigido exige revalidação afetada. Só concluir o domínio com
as provas atribuídas; ROOT usa um par novo para a união dos cinco.
