# E10 — draft de capability gate hardened, cinco casos

Planejamento apenas. Fonte integrada consultada `2ba68435ec`; nenhuma alteração/execução. Este gate qualifica invocação/processo, não CodeMode, codec, stdin protocol, defaultFactory ou deadline público.

**Harness comum.** Futuro teste Core usa serviços reais AppProcess/ChildProcessSpawner via AppNodeBuilder/CoreProcess+Omni e expectSpawn em CADA caso; nenhum rawspawn. Owned scope mantém child exato, leitores stdout/stderr (64KiB cada), timer e heartbeat. Um build HOSTED prepara fixture JS própria com entrypoint que emite somente COMPILED_ENTRY/PID/execPath e termina naturalmente. Sem Core/Effect no executable filho.

Compile copia os campos REAIS de `apps/cli/script/build.ts:150`: autoloadBunfig:false, autoloadDotenv:false, autoloadTsconfig:true, autoloadPackageJson:true, target host idêntico ao CLI, outfile próprio, windows:{}, execArgv:[`--user-agent=${binary}/${Script.version}`,"--use-system-ca","--"]. Fixar valores selecionados em manifest; não substituir user-agent por nome diferente. Bun1.3.14; bun-types1.3.13 declara esses campos (`CompileBuildOptions:3022`), mas não prova comportamento runtime. Build failure/asset ausente é SETUP, nunca regex RED.

**Invocação proposta.** Source usa process.execPath; compiled usa caminho absoluto do binário produzido. Modo helper: argv=["--no-env-file",`--config=${ownedEmptyBunfig}`,"-e",CONSTANT_SCRIPT], stdin ignorado, shell:false, cwd próprio neutro, extendEnv:false. Env somente BUN_BE_BUN:"1" e, no Windows, entradas SystemRoot/WINDIR obtidas case-insensitivamente quando disponíveis. Preservar nomes/valores originais sem adicionar PATH/HOME/TEMP/BUN_OPTIONS/NODE_OPTIONS/NODE_PATH. Suficiência dessas duas variáveis ainda será medida.

O config é arquivo vazio próprio, absoluto, fora da descoberta implícita. Dentro de scratch controlado, plantar canários .env/bunfig/preload no cwd e seu pai: chave de env dedicada, preload que emite sentinel e escreve marker. Isso envenena deliberadamente apenas arquivos próprios; nenhum process.env/chdir/global patch. Script helper relata booleano da chave; pai verifica marker ausente e ausência do sentinel. Não imprimir ambiente inteiro. Source precedentes usam /dev/null; owned-empty Windows ainda não qualificado.

**Matriz exata, BOTH:**

1. **Source normal hardened:** flags+env acima, script constante emite EVAL_OK/PID/execPath; exit0 natural, canários ausentes, readers joined.
2. **Compiled normal entry:** mesmo binário/neutralcwd/env mínimo, SEM BUN_BE_BUN e SEM -e; exigir COMPILED_ENTRY, PID real e execPath realpath igual ao artifact. Prova que build/fixture existe antes do teste de modo Bun; não é execução da CLI real.
3. **Compiled helper hardened:** flags/env helper; exigir EVAL_OK e ausência de COMPILED_ENTRY/canários, exit0/readers joined. Se o execArgv embutido terminando em -- impedir flags/-e, reportar capability failure factual; não editar CLI nem tentar flags alternativas silenciosamente.
4. **Source CPU:** helper constante constrói padrão '^'+'(?=a+$)'.repeat(2048)+'a+$' (14340bytes), subject8MiB de 'a'; CPU_ENTER flush antes de RegExp.test e CPU_DONE somente depois. Correlacionar PID; mark<750ms desde admission imediatamente antes do spawn.
5. **Compiled CPU:** exatamente o mesmo script/limites/witness, via artifact+BUN_BE_BUN. Entry sentinel ou import/flags/startup inadequado é SETUP/capability failure, não CPU RED.

Nos casos4/5, timer solicita SIGKILL em admission+1500ms; exigir vivo antes, exit real e AMBOS leitores joined antes de3000ms, morto depois, sem CPU_DONE e sem contenção. HB50ms desde admissão, pelo menos3ticks pós-mark, maxGap<750ms incluindo bordas. Reportar timestamps reais, não converter request em sinal observado. Contenção própria dispara em8000ms; é TRIGGER de cleanup, não garantia de retorno nem enforcement do produto. Finally libera timers/fibers e junta processo/leitores antes de remover scratch/artifact. Nenhum sucesso antecipado só porque kill foi solicitado.

**Portas ainda incertas:** -- embutido versus BUN_BE_BUN/flags; Windows env mínimo; descoberta de config/dotenv nessa combinação; startup<750 e exit/join<3000 no artifact. Sem medições novas nem escolha de implementação.

## Acceptance freeze and independent review

Five cases are frozen at `9999cd2d8d825c5096f6c49f7995c1e14e2317cc`, following original acceptance `f8a0ab66b6`. Root and the independent critic read the entire test/fixture and approved the two narrow corrections: include admission-to-marker in the heartbeat maximum, and confirm actual OS PID liveness/death with signal0 in addition to the owned process handle. Only ESRCH means absent; other errors fail. Kill request is never substituted for observed exit/readers completion.

The build does not import Script, whose evaluation has unrelated subprocess effects. It reads CLI package.json as an explicit fixture version input (currently1.18.27), labels that input in the manifest and constructs the same user-agent argument shape. This does not evaluate actual release-version policy or execute the Orchestra CLI. All other frozen compile fields retain the CLI shape, including its trailing `--`.

No local build or runtime is permitted. Static gates and serial Core typecheck precede an official BOTH-OS test:ci request for `test/codemode-native-process.test.ts`. At this checkpoint no new capability runtime has executed. Production NativeRegExp port, codec, interpreter barriers and default behavior have no implementation authorization yet. The private parser is already separately verified; E10 remains open.
