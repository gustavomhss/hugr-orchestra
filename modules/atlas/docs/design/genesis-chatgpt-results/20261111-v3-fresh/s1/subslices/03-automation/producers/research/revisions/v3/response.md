# Resposta original — research v3 / RB-J2-F01

Achado confirmado por inspeção estática e corrigido documentalmente com uma única substituição em R8, linha 239. O corpo distingue índice utilizável, ausência de sources.query e sondagem map já executada que falha com index_unavailable/index_building. Nesse último ramo, 16 termos distintos podem produzir 33 consultas internas. Nenhum teste ou produto foi executado.

Body v3: 63841 bytes; SHA-256 f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f; Git blob 72bdc55fdf2dbda97e84c87111be73fa49aceeb4.

Body v2 preservado byte a byte em history/body-v2.md: SHA-256 d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661. recipe-v2.json permanece intacta e foi preservada também em history/recipe-v2.json: SHA-256 09505ca6228267ab6ad9c0397c7a45690009b1738ae3aa53c8b8df722db5598b.

A receita efetiva é o pedido mais apply.py, ambos existentes e congelados antes da execução. apply.py: SHA-256 1a06fb787058915ac20e696c5c8ea855dcda7813d9b208d15fa3770336de2f2e; freeze: 65ceaf32de80a5b134d63e28fadc9271c822470d768d9d852d1ce8ce5287bacd. A extensão de inputs identifica oito arquivos efetivamente consumidos, por unidade integral, sem varrer o acervo. recipe-v3.json é saída descritiva posterior, não a receita executada. A auditoria v2 permanece histórica, não lida nem alterada.

Delta: SHA-256 6fe47e6bc32f1d4623c8683c5aaa78305ce692d8f8f91681dc34f06a97e9ffa2. Suplemento literal curto: 9589 bytes; SHA-256 46ba4a495ad9d9a25f19d8ca410ee45f606c390aa1f8e7dd73766e200fe112a6. Extensão de inputs: SHA-256 95e1d759bace7baa2f8e5bed6f65ee9f5fba1f4a4c24b7f93a4b8d2318bc1101. Receita descritiva v3: SHA-256 cd8813f5a1d2157546b762c60b0ff08812281a4138006fdc282a3fdab809abe0.

A reconstrução inversa recupera exatamente a v2; a comparação por linhas mostra uma única linha substituída e o restante byte-idêntico. O pedido e o achado público original estão preservados. O suplemento reutiliza RB-S005/RB-S032, com hashes dos arquivos e intervalos literais curtos. A contagem 33 é contraprova estática, sem reprodução de runtime. Sem oracle, resultados reservados, rede, publicação, produto, novo juiz ou L2. Parecer agregado e protocolo P/H pertencem à principal e aos mesmos juízes; não há novo PASS do produtor.
