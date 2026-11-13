# Critérios congelados — Platform 200

Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Prompt S5: `d2d985c28947c7f984a36b07ad34ede3d4d2d6b4`.

O pedido explícito desta sessão restringe a S5 a 200 caminhos exatos e a uma entrega documental estática. A branch e o prefixo deste pedido prevalecem sobre os destinos genéricos do protocolo. Não executar código, testes, ferramentas do produto ou CI. Não integrar, publicar no runtime, criar PR ou alterar outras branches.

## Barra pública antes da autoria

1. Exatamente 200 caminhos únicos, todos blobs no baseline, sem expansão de prefixos; identidade Git, tamanho e SHA-256 dos bytes capturados.
2. Leitura integral de cada fonte, com método explícito. Dados gerados podem ter leitura estrutural completa justificada; não apresentar amostragem como inspeção semântica integral de cada registro.
3. Explicação própria e rastreável por caminho: mecanismo, responsabilidade, contratos, relações, falhas e limites quando demonstrados. Configs simples recebem profundidade proporcional. Patches descrevem mudanças nos hunks; documentação conserva sua autoridade de intenção/relato; testes são especificações estáticas.
4. Afirmações sustentadas por linhas/símbolos. Fato observado na fonte, inferência e lacuna permanecem separados. Ausência de execução e de evidência externa não vira aprovação.
5. Bases L1–L2 são julgadas antes de sustentar L3–L4. Relações indicam dependência causal versus navegação. A totalidade mantém disposição sem dupla contagem.
6. Dois juízes novos, independentes da autoria, recebem os mesmos corpos e evidências; sem ferramentas e sem autoria. Reutilizar o par nas correções. Achados obrigatórios corrigidos e reavaliados ou explicitamente abertos.
7. Oráculos congelados antes da autoria e respostas reservadas fora do produtor. Publicar apenas resumo dos juízos, referências opacas reais e conteúdo próprio autorizado. Não publicar pareceres integrais, ledgers, transcrições, caminhos locais, segredos ou respostas reservadas.
8. Escritas Git apenas no prefixo autorizado, por uma única orquestradora, com commits descendentes do baseline, atualização condicional sem força e releitura remota.

## Necessidades por lote

- A — distribuição, Nix e CI: localizar contratos de empacotamento, configuração, dependências, controles e falhas, separando workflow declarado de proteção/execução observada.
- B — tooling, scripts, patches e lockfile: explicar transformação/validação, escopos e exceções, contratos de dependências e limites dos patches.
- C — arquitetura, guias, configuração e visual QA: distinguir plano, estado documentado e implementação; explicar orientação operacional e limitações sem executar comandos descritos.

Aplicam-se GO-A1..7, GO-I1..8, QS-1..6, CC-1/2/3/6/7 e DOD-1/2/5/6/7 conforme o escopo documental. Provas de consumidores Atlas, runtime, manutenção executada, gates operacionais e aceite global não são reivindicadas por esta entrega.

