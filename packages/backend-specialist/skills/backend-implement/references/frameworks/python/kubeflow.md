# Kubeflow Pipelines

## Applicability

The packet assigns a Kubeflow Pipelines definition written with the kfp SDK (`@dsl.component`, `@dsl.pipeline`) and names the compiled pipeline YAML as part of the write paths or as evidence. The reference version is kfp `2.17.0`. kfp is a project dependency, never a toolkit engine: the project's own pinned kfp compiles the pipeline. Read [Python](../../languages/python.md) first.

## Non-trigger

- Submitting, scheduling or running a pipeline, or any `kfp` command that talks to a cluster (`run`, `pipeline`, `experiment`). The shell has no network and no cluster.
- Adding kfp to a project, or changing its pin.
- Component container images: building or pushing them is outside the seat.

## Inputs

- The pipeline module, the pipeline function's name, and the output path of the compiled YAML.
- The project's kfp pin in its lock file, and the environment that has it installed (`.venv`, or the runner command the packet names).

## Steps

1. Read kfp's pin from the lock file. No pin means the change cannot be compiled here: return a `packet` blocker. Never install kfp, not even into a scratch environment.
2. Write the components and pipeline the change needs.
3. Compile from the project root inside the project's environment:
   ```sh
   kfp dsl compile --py <pipeline.py> --function <pipeline_fn> --output <pipeline.yaml>
   ```
   On kfp 1 lines, `dsl-compile --py <pipeline.py> --output <pipeline.yaml>` is the equivalent. Never use `python -m kfp.cli`: on `2.17.0` its `__main__` defines no entry guard, so it exits 0 without compiling.
4. Confirm the output file was rewritten, then read its diff: only the changed components and the pipeline that uses them may move.

## Tools and outputs

- Handwritten and yours: the pipeline module and its tests. The compiled YAML is derived; regenerate it, never edit it.
- A pinned kfp missing from the environment is `project-prerequisite-missing:kfp`.

## Limits and checks

- Compilation proves types and wiring between components. It proves nothing about the container images or a run on a cluster.
- Checks: the compile succeeds, and the packet's unit tests for component functions pass.
