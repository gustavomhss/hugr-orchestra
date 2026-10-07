# Read Benchmark

Correctness-first harness for `filePath`, `offset`, `limit`.

## Run

```bash
./bench-corpus.sh /tmp/bench-corpus
./bench-hardcore.sh <opencode-binary> /tmp/bench-corpus 5 /tmp/bench-result
```

Harness overwrites deterministic corpus files and validates SHA-256 manifest. Each serial run validates JSON envelope and expected outcome. Success validates numbered range plus exact returned content against source oracle. Oversized explicit range is valid source range `offset=1, limit=1000` over dense post-truncation lines; it expects `ok:false` with `Requested range exceeds 50 KB output limit` and no output. Missing corpus, malformed/no envelope, malformed JSON, invalid output, oracle mismatch, wrong outcome, unsuccessful process, no rows, missing expected cells, wrong row count fail run.

Modes: default, explicit slice, tail, oversized default, oversized explicit range. Corpus: LF, CRLF, Unicode/emoji, long-line, dense-large, sparse-large.

`output_chars` means JavaScript string character count, not bytes or tokens. `elapsed_ms` includes CLI startup. p50/p95 only shown where sample size >=2.

## Model Read Agent A/B

`bench-read-agent.sh` compares two compiled binaries through real `opencode run --format json` sessions. Model IDs must be explicit `provider/model` values. It never embeds credentials; normal provider configuration supplies them.

```bash
./bench-read-agent.sh --baseline /path/to/baseline --candidate /path/to/candidate --models openai/gpt-5.6-luna --runs 1 --timeout-sec 180 --out /tmp/read-agent-ab
./bench-read-agent.sh --baseline /path/to/baseline --candidate /path/to/candidate --models openai/gpt-5.6-luna --tasks tail --runs 3 --timeout-sec 180 --out /tmp/read-agent-tail-ab
./bench-read-agent.sh --baseline /path/to/baseline --candidate /path/to/candidate --models openai/gpt-5.6-luna --runs 1 --timeout-sec 180 --out /tmp/read-agent-ab --resume
./bench-read-agent.sh --report-only --out /tmp/read-agent-ab
./bench-read-agent.sh --self-test
```

Corpus is deterministic and written only to `<out>/corpus`: 20,000-decoy tail marker, middle marker, and long-line marker. `--tasks` defaults to all tasks; it accepts unique known IDs `tail`, `middle`, `long_line`. Selected tasks become immutable plan tasks and expected-row keys, while corpus and hashes always retain all fixtures. Task text names each fixture by absolute corpus path because OpenCode project discovery can differ from process cwd; it gives no tool parameter hints. Each isolated child uses `opencode run --auto`; auto approval is limited to generated corpus under output root. New output roots must be empty. New runs write immutable `plan.json` with binary paths/SHA-256/version, models, task answers, corpus hashes, runs, and timeout. `--resume` requires exact plan match, validates persisted rows, skips completed keys including `timeout`/`failed`, and never overwrites raw events. Use new output directory to retry completed timeout or failure cells. Every completed binary/model/task/run appends one normalized row to `<out>/raw-results.jsonl`, flushes and fsyncs it, then prints progress. Every raw JSON event stream stays under `<out>/raw-events`.

Each model process has `--timeout-sec` limit, default 180 seconds. Timeout terminates process group, persists `timeout` outcome, then continues remaining cells. Exact marker remains only `success`; timeout and malformed/model outcomes fail closed. Complete reports include per-cell `success`/`failed`/`timeout` counts, then evaluator exits nonzero when any trial failed closed. `--report-only` never calls models: it validates `plan.json`, corpus hashes, and all persisted rows, refusing malformed, duplicate, unexpected, or missing keys. Reports write only after complete evidence. Tool calls include inputs and actual output/error results. Retry telemetry is `N/A` because current CLI JSON emits no retry event; token input/output and cost are `N/A` unless `step_finish` exposes them. `N/A` never means zero.

Run self-tests with `BENCH_SELF_TEST=1 ./bench-hardcore.sh`. They prove malformed envelope, zero rows, oracle mismatch, exact expected-error fragment mismatch, unexpected success/error outcomes fail closed. Out-of-range offsets are outside this benchmark scope. No symbol, search, depth, sparse, token, byte, or accuracy claim. No LSP oracle. Debug params JSON-only. Debug runner removes throwaway session in finalizer. Report records expected/observed outcomes, test count/cell completeness, runtime platform/Python/binary, and states missing CPU/memory/disk/load controls.

## Performance

`bench-performance.sh` is separate from correctness corpus and harness. It creates deterministic 1MiB and 100MiB text fixtures only under `--corpus` (default `/tmp/opencode-read-performance-corpus`); `--large` adds 1GiB. It never writes correctness corpus.

```bash
./bench-performance.sh <compiled-opencode-binary> --runs 3 --corpus /tmp/opencode-read-performance-corpus --out /tmp/opencode-read-performance-result
BENCH_PERFORMANCE_SELF_TEST=1 ./bench-performance.sh
```

`--runs N` defaults to 3 and requires positive integer. Rows are serial `default`, `explicit_small_slice`, and `tail_offset_minus_5` calls. JSON/Markdown record raw per-run rows plus min/avg/p50/p95 for `process_elapsed_ms` (startup included), envelope `operation_ms`, and peak RSS bytes. With one run, p50/p95 are `n/a`. Missing/duplicate cell rows, invalid metrics, or missing modes fail before report. macOS parses `/usr/bin/time -l`; Linux parses `/usr/bin/time -v` kbytes into bytes; other OSes fail `unsupported-platform`. 1GiB is opt-in: require at least 1GiB free disk plus overhead; do not use during active workload.

Each validated row is appended then flushed and fsynced to `<out>/raw.jsonl`; progress prints per row. New runs deliberately truncate that file first. Interrupted runs retain raw evidence but do not produce a success report. Recover only complete evidence with `./bench-performance.sh --report-only --corpus DIR --out DIR --runs N --sizes 1MiB,100MiB`; missing/duplicate/malformed rows fail without changing `raw.jsonl`. `--sizes` defaults to `1MiB,100MiB`; supports each size once. `1GiB` requires both `--large` and explicit `--sizes ...1GiB`.
