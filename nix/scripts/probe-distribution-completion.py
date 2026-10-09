#!/usr/bin/env python3
"""Deferred completion teeth: mutate real captured metadata through the actual checker."""
import json
from pathlib import Path
import subprocess
import sys
from dependency_measurement import require


def main():
    require(len(sys.argv) == 4, "COMPLETION_PROBE_ARGUMENTS")
    original, directory, phase = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    directory.mkdir()
    artifacts = json.loads((original / "artifacts.json").read_text())
    names = [item["name"] for page in artifacts for item in page["artifacts"]
             if item["name"].startswith(f"nix-distribution-{phase}-")]
    require(bool(names), "EMPTY_COMPLETION_PROBE_WORKERS")
    cases = {
        "unchanged-real-capture": None,
        "empty-jobs": "MISSING_OR_FAILED_NATIVE_JOB:",
        "skipped-native-job": "MISSING_OR_FAILED_NATIVE_JOB:",
        "empty-artifacts": "MISSING_OR_DUPLICATE_NATIVE_ARTIFACT:",
        "wrong-run-head": "RUN_IDENTITY_MISMATCH",
        "wrong-worker-head": "WORKER_SOURCE_MISMATCH:",
        "wrong-native-system": "WORKER_NATIVE_SYSTEM_MISMATCH:",
        "failed-worker": "WORKER_FAILED_OR_DIRTY:",
    }
    for name, expected in cases.items():
        fixture = directory / name
        fixture.mkdir()
        for file in ("run.json", "jobs.json", "artifacts.json"):
            (fixture / file).write_bytes((original / file).read_bytes())
        workers = fixture / "workers"
        workers.mkdir()
        for worker in names:
            (workers / worker).symlink_to((original / "workers" / worker).resolve(), target_is_directory=True)
        if name == "empty-jobs":
            (fixture / "jobs.json").write_text('[{"jobs": []}]')
        if name == "skipped-native-job":
            jobs = json.loads((fixture / "jobs.json").read_text())
            next(job for page in jobs for job in page["jobs"] if job["name"].startswith("native distribution ("))["conclusion"] = "skipped"
            (fixture / "jobs.json").write_text(json.dumps(jobs))
        if name == "empty-artifacts":
            (fixture / "artifacts.json").write_text('[{"artifacts": []}]')
        if name == "wrong-run-head":
            run = json.loads((fixture / "run.json").read_text())
            run["head_sha"] = "wrong-source"
            (fixture / "run.json").write_text(json.dumps(run))
        edits = {"wrong-worker-head": ("source-revision.txt", "wrong-source"),
                 "wrong-native-system": ("native-system.stdout", "wrong-system"),
                 "failed-worker": ("batch.exit", "1")}
        if name in edits:
            worker = workers / names[0]
            worker.unlink()
            worker.mkdir()
            file, content = edits[name]
            for child in (original / "workers" / names[0]).iterdir():
                if child.name != file:
                    (worker / child.name).symlink_to(child.resolve(), target_is_directory=child.is_dir())
            (worker / file).write_text(content)
        result = subprocess.run([sys.executable, "nix/scripts/complete-distribution.py", str(fixture), phase],
                                text=True, capture_output=True)
        require((result.returncode == 0 if expected is None else
                 result.returncode != 0 and expected in result.stderr), "COMPLETION_PROBE_VERDICT:" + name)
        (fixture / "probe-result.json").write_text(json.dumps({"status": result.returncode, "expected": expected,
                                                             "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n")
    print(json.dumps({"status": "COMPLETION_CONTROLS_OK", "completed": list(cases)}, indent=2))


if __name__ == "__main__":
    main()
