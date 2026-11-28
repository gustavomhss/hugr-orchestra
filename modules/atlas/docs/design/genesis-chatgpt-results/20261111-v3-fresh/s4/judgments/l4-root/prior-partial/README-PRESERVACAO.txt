PRESERVAÇÃO PARCIAL DE REQUESTS E RESPOSTAS L4

Preservador: /root/preserve_l4_review
Diretório autorizado: /workspace/scratch/4d151507ca43/genesis-root-20261112T034839Z/agents/preserve-l4-review
Natureza: preservação mecânica. Este pacote não contém novo parecer semântico, execução operacional, binding, aprovação, consumo ou publicação.

ESTADO
PARTIAL_PRESERVATION. O contexto de ROOT e do preservador compactou antes de os envelopes novos completos serem gravados. ROOT confirmou que também não os tem recuperáveis e determinou encerrar esta preservação parcial, sem reconstruir os envelopes como originais.

PRESERVADO
- J1: três ACKs textuais retidos na compactação; coleção nova de 21 trechos literais da resposta final que sobreviveram à compactação. Essa coleção NÃO é o JSON original nem uma resposta completa.
- J2: três ACKs e bloco JSON final completo retido pelo auxiliar /root/preserve_l4_review/save_j2_response. O manifest próprio de J2 explicita a cadeia pela compactação e os limites de whitespace/terminador/envelope.
- Requests: fragmento textual da correção courier no pacote 2; fragmento textual do FECHAMENTO L4 de J1 no pacote 4. Não há envelope completo de nenhum dos oito despachos.
- Referências: cópias byte a byte dos quatro corpos, dois arquivos de metadados e quatro pacotes históricos do snapshot S4. Os dez SHA256 calculados conferem com os hashes carregados no contexto.

LACUNAS E LIMITES
Os quatro corpos efetivamente transmitidos nos novos requests NÃO puderam ser extraídos. Sua igualdade ou divergência com os corpos do snapshot é NÃO VERIFICÁVEL. Hashes de cópias do snapshot não provam identidade da transmissão. Nenhuma divergência foi silenciosamente normalizada e nenhuma ausência de divergência foi inferida.

Os pacotes em historical-reference-packets/ são arquivos históricos do snapshot, não os envelopes novos enviados por ROOT. Não devem ser usados como substitutos desses envelopes.

A correção courier preserva que os trechos CLI do pacote 1 foram compactados/reformatados, sem identidade de bytes atribuível à projeção. O contexto relata substituição por trechos literais no pacote 4, mas esses trechos transmitidos não estão disponíveis integralmente neste pacote.

Não há IDs de mensagem host disponíveis. Os nomes /root/local_j1 e /root/local_j2 são identidades de agente, não IDs de mensagens.

As transcrições visíveis usam UTF-8 e um LF terminal escolhido para armazenamento. Seus SHA256 identificam apenas os arquivos preservados. Não demonstram os bytes de transporte das mensagens originais. As cópias das fontes preservam os bytes dos arquivos locais de origem.

INVENTÁRIO
manifest.json contém limites, proveniência, cobertura e SHA256 de todos os demais arquivos.
SHA256SUMS contém SHA256 do manifest e de todos os arquivos, exceto do próprio SHA256SUMS.
source-inventory.json descreve a origem de cada cópia do snapshot.
requests/coverage.json registra a lacuna para cada despacho esperado e a ausência de comparação de transmissão.

ESCOPO RESPEITADO
Escritas apenas neste diretório. Leituras dos arquivos de origem explicitamente fornecidos. Nenhuma ferramenta GitHub, teste de produto, alteração de candidato/oracle, novo juízo ou escrita remota.
