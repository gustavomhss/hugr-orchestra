# Importador v3 — rota histórica explícita

Esta versão é uma proposta do principal em continuação do trabalho S2. Preserva v1/v2, os pedidos/saídas dos autores e os recibos anteriores. Não é uma camada produzida, uma integração S5 ou um aceite de campanha.

A nova rota `historical-body-rebinding` preserva os bytes do corpo, manifesto, aceite, congelamento de fontes e dois reviews históricos no CAS existente. Exige correspondência exata dos corpos/reviews com os manifests e bindings atuais dos arquivos. Lê e compara os bytes das fontes atuais com o congelamento histórico. Não gera uma resposta nativa fictícia para representar esse corpus.

As duas derivações operacionais corrigidas podem ser fornecidas com o corpo original, manifesto de correção, prefreeze e os dois aceites históricos do candidato exato. O corpo efetivo permanece byte a byte, inclusive Unicode não-NFC válido. Limitações/unknowns históricos acompanham o resultado; a receita original ausente continua indisponível. A comparação identifica explicitamente `historical-body-new-binding` e `NEW_S5_BINDING_REQUIRED`: novo escopo, autoridade, receita e contrato exigem os pareceres atuais. Não se declara igualdade integral com o resultado histórico.

A rota entra na mesma preparação privada e no mesmo binder. Antes de vincular reviews S5, o binder relê os bytes históricos preservados e refaz apenas sua validação determinística; o candidato reconstituído deve ser idêntico ao revisado. O plano congelado inclui `entry.reuse`, e o caller exige o novo helper como input de implementação. Entradas nativas e históricas possuem cobertura total disjunta.

## Verificação observada

O preview isolado, com importador v3 e rebuild v3, compilou via `bun run build` do pacote Atlas, exit 0. O entry point compilou com Bun, resolvendo 65 módulos, exit 0. O patch passou em `git apply --check --whitespace=error`, exit 0. O checkout original permanece sem alterações compartilhadas. Isso é compilação de proposta; não é teste local, CI, produtor executado, importação histórica executada nem candidato integrado.

O helper histórico tem 204 linhas, o importador 453 e o caller 120 segundo a convenção do guard. O importador permanece acima do alvo ordinário 400 e abaixo do limite rígido 600. O guard não foi executado.

## Entrada de integração

S5 deve substituir a proposta nativa v2 pela v3, mantendo o rebuild v3, depois do congelamento S1 e da liberação serial. Seus IDs de juízes continuam reais e fornecidos por S5; não foram substituídos por autores ou Terra históricos. A S2 pediu três unidades adicionais para revisão técnica/correção/delta, sem resetar os seis pacotes contabilizados. Produção continua dependendo do inventário/contratos e da quota correspondente.
