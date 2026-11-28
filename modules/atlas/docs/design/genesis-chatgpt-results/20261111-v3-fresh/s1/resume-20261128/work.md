# S1 Core — retomada por reconciliação

Estado: **IN_PROGRESS**. Execução local `2ccbd15d-4f66-44a3-b2e1-8326abce0bef`; este UUID identifica o registro, não um ID de conversa do host.

Branch exclusiva: `genesis-core-resume`. HEAD inicial conferido: `4fe8525b57585f1de78c27b2598f51575b5a66c0`, filho de `a8df22ae3a140c58c63f62ce2a634c84f415c943`; o único diff inicial é o briefing S1-CORE.md.

Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Inventário inicial executado

`reconciliation.json` agrupa versões por chave e hash de corpo, fixa proveniência e aceites. `source-map.json` reconcilia 2.236 caminhos únicos, preserva o hash congelado e a profundidade de leitura histórica: Sessões 555; Ferramentas 424; Automação 462; APIs 472; Bibliotecas 323.

Foram reconciliadas 52 chaves históricas/correntes: 32 aceites exatos, dez aceites C delimitados e dez corpos sem aceite corrente demonstrado. Três cópias Core de APIs não criam novos artefatos. Há 51 candidatos selecionados; a antiga `s1.core.entry` permanece histórica, com os 104 caminhos roteados para o suporte aceito de Automação. A escolha de navegação da união ainda será julgada.

Essas contagens não incluem corpos superiores ainda em recuperação nem sínteses que faltam produzir. Manifesto, classificação e hash não são suficiência semântica.

## Fila finita

| Trabalho | Estado | Condição de fechamento |
| --- | --- | --- |
| Inventário por chave, versão, hash e aceite | RUNNING | Incorporar recuperação dos superiores e decisões novas; conferir união |
| Sete superiores e B15 | RUNNING | Busca por hash/proveniência; distinguir bytes, aceites e NO_CHANGE |
| Cinco L1 pendentes de Sessões | REVIEW | Dois juízes independentes novos; corrigir achados pelo mesmo par |
| Sete L1 aceitos de Sessões | DONE — reúso delimitado | Bytes e pareceres exatos preservados |
| Ferramentas: quatro corpos históricos | REVIEW | Dossiê existente, lacunas de folhas e dois pareceres |
| Automação: 12 corpos e seis inputs grandes | DONE — recuperação | Binding/operação dependem de S4; aceites atuais preservados |
| APIs: 13 próprios e três Core exatos | DONE — recuperação | Guard original e provas operacionais permanecem abertos |
| Bibliotecas: dez L1 C | DONE — reúso delimitado | 323 paths, 39 metadata-only e limites preservados |
| Bibliotecas: quatro L2, L3 e L4 | RUNNING | Contrato/oracle herdados; só liberar dependentes após aceite |
| Sessões/Ferramentas: L2–L4 | PENDING | Recuperar superiores existentes antes de nova autoria |
| Pacote único e navegação S1 | PENDING | Seleção completa, dependências e raízes revisadas |
| Runtime, consumidores e manutenção próprios | BLOCKED — dependência em consulta | Release S4 exato compatível; operações reais isoladas |
| Gates, matriz de critérios, selagem e readback | PENDING | Provas pertinentes, sem converter NOT_RUN em PASS |

## Agentes e autoridade

Investigadores desta execução: `/root/recover_sessions`, `/root/recover_tools_libraries`, `/root/recover_automation_api`. Eles não são juízes semânticos. Produtor L2 de Bibliotecas: `/root/produce_libraries`, contexto novo sem oracle. O investigador de Bibliotecas leu o oracle reservado e por isso não assumiu autoria.

Os handles históricos são evidência de origem, não identidades chamáveis nesta conversa. Novos julgamentos usarão dois contextos independentes criados com `fork_turns: none`; os IDs reais e decisões serão preservados. Não há diversidade de modelo presumida.

Somente a principal escreve remotamente; atualizações usam lease de HEAD e `force:false`. Runtime comum é da S4. Aceite e integração global pertencem a ROOT. Nenhuma operação produtiva, teste local, merge ou chamada paga externa foi executada.

## Limites e uso

Os registros históricos permanecem intactos. Tokens, tentativas físicas e cobrança não expostos permanecem UNKNOWN. A reconciliação financeira antiga continua GLOBAL_UNRECONCILED. Parecer semântico não é binding, publicação, consumo ou CI.

O release observado inicialmente em `genesis-runtime-resume@af0ed426b8caf0d95772e1fb174d34bab86399c4` ainda descreve R3 e o limite de 256.000 bytes; isso não qualifica os pacotes completos. A disponibilidade será reconferida antes do fechamento.
