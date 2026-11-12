#!/usr/bin/env python3
"""Qualify an actual frozen CLI archive. Do not run until root approves its inputs."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import secrets
import shlex
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time


def digest(file):
    value = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def snapshot(root):
    result = {".": {"directory": True, "mode": stat.S_IMODE(root.lstat().st_mode)}}
    for item in sorted(root.rglob("*")):
        info = item.lstat()
        name = str(item.relative_to(root))
        if stat.S_ISLNK(info.st_mode):
            result[name] = {"link": os.readlink(item), "mode": stat.S_IMODE(info.st_mode)}
        elif stat.S_ISDIR(info.st_mode):
            result[name] = {"directory": True, "mode": stat.S_IMODE(info.st_mode)}
        elif stat.S_ISREG(info.st_mode):
            result[name] = {"sha256": digest(item), "mode": stat.S_IMODE(info.st_mode), "bytes": info.st_size}
        else:
            result[name] = {"special": stat.S_IFMT(info.st_mode), "mode": stat.S_IMODE(info.st_mode)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--installer", required=True, type=Path)
    parser.add_argument("--evidence-output", required=True, type=Path)
    parser.add_argument("--frozen-sha", required=True, help="Root-approved full producer source commit")
    parser.add_argument("--sha256", required=True, help="Root-approved archive digest from producer receipt")
    parser.add_argument("--version", default="0.3.7")
    parser.add_argument("--target", default="darwin-x64-baseline")
    args = parser.parse_args()
    evidence = {"status": "FAIL", "phase": "setup-output", "failureCategory": "setup_failure", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": [], "commands": []}
    output = args.evidence_output.absolute()
    sandbox = None
    logs = None
    output_reserved = False

    def phase(name, category):
        evidence["phase"] = name
        evidence["failureCategory"] = category

    try:
        # Exclusive reservation refuses existing output and keeps its bytes intact.
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x"):
            pass
        output_reserved = True
        output = output.resolve()
        logs = output.parent / (output.stem + "-logs")
        logs.mkdir(mode=0o700)
        phase("setup-inputs-and-host", "setup_failure")
        archive = args.archive.resolve(strict=True)
        installer = args.installer.resolve(strict=True)
        require(platform.system() == "Darwin" and platform.machine().lower() in ("x86_64", "amd64"), "Requires an actual macOS Intel host")
        require(Path("/usr/bin/sandbox-exec").is_file(), "Network-denying macOS sandbox-exec is required")
        require(len(args.frozen_sha) == 40 and all(c in "0123456789abcdef" for c in args.frozen_sha), "Expected full frozen SHA")
        require(len(args.sha256) == 64 and all(c in "0123456789abcdef" for c in args.sha256), "Expected lowercase archive SHA-256")
        require(args.version == "0.3.7", "This qualification is bounded to release 0.3.7")
        require(args.target in ("darwin-x64", "darwin-x64-baseline"), "Expected published Mac Intel CLI target")
        require(digest(archive) == args.sha256, "Archive differs from root-approved producer digest")
        phase("setup-provenance", "setup_failure")
        repo = Path(subprocess.check_output(["/usr/bin/git", "-C", str(installer.parent), "rev-parse", "--show-toplevel"], text=True).strip()).resolve()
        relative = installer.relative_to(repo).as_posix()
        source = subprocess.check_output(["/usr/bin/git", "-C", str(repo), "show", args.frozen_sha + ":" + relative])
        require(source == installer.read_bytes(), "Installer bytes do not match the frozen producer source SHA")
        require(relative == "apps/cli/distribution/install.sh", "Expected the reviewed official POSIX installer")
        evidence.update({"archive": str(archive), "archiveSha256Before": digest(archive), "installer": str(installer), "installerSha256": digest(installer), "frozenSha": args.frozen_sha, "version": args.version, "target": args.target})
        phase("setup-isolation", "setup_failure")
        sandbox = Path(tempfile.mkdtemp(prefix="orchestra-artifact-uninstall-")).resolve()
        evidence["sandbox"] = str(sandbox)
        home, prefix, work, temp = (sandbox / name for name in ("home", "custom-prefix", "work", "tmp"))
        for directory in (home, work, temp, sandbox / "private-bin"):
            directory.mkdir(mode=0o700)
        marker = sandbox / "npm-was-invoked"
        npm = sandbox / "private-bin" / "npm"
        npm.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + shlex.quote(str(marker)) + "\nexit 125\n")
        npm.chmod(0o700)
        key = sandbox / "credential.key"
        key.write_text(base64.b64encode(secrets.token_bytes(32)).decode("ascii"))
        key.chmod(0o600)
        env = {
            "PATH": str(npm.parent) + ":/usr/bin:/bin:/usr/sbin:/sbin",
            "HOME": str(home), "ORCHESTRA_TEST_HOME": str(home), "TMPDIR": str(temp) + "/",
            "XDG_DATA_HOME": str(home / "data"), "XDG_CACHE_HOME": str(home / "cache"),
            "XDG_CONFIG_HOME": str(home / "config"), "XDG_STATE_HOME": str(home / "state"),
            "ORCHESTRA_CREDENTIAL_KEY_FILE": str(key), "LC_ALL": "C", "LANG": "C", "CI": "true",
            "ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD": "1", "NO_COLOR": "1", "TERM": "dumb",
        }

        def run(label, argv, expected=0):
            bounded = ["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)(deny network*)", *[str(part) for part in argv]]
            command = {"label": label, "phase": evidence["phase"], "category": evidence["failureCategory"], "argv": [str(part) for part in argv], "networkDenied": True, "exitCode": None, "stdout": str(logs / (label + ".stdout")), "stderr": str(logs / (label + ".stderr"))}
            evidence["commands"].append(command)
            try:
                result = subprocess.run(bounded, cwd=work, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=180)
            except (OSError, subprocess.TimeoutExpired) as error:
                # A launch/host/timeout failure is not conclusive product proof.
                evidence["failureCategory"] = "execution_failure_unclassified"
                command["category"] = evidence["failureCategory"]
                command["launchError"] = str(error)
                for stream in ("stdout", "stderr"):
                    captured = getattr(error, stream, None)
                    if isinstance(captured, bytes):
                        captured = captured.decode("utf-8", errors="replace")
                    (logs / (label + "." + stream)).write_text(captured or "")
                raise
            command["exitCode"] = result.returncode
            (logs / (label + ".stdout")).write_text(result.stdout)
            (logs / (label + ".stderr")).write_text(result.stderr)
            if expected is not None:
                require(result.returncode == expected, label + " exited " + str(result.returncode) + "; see captured logs")
            require(not marker.exists(), "npm was invoked; private fail-closed sentinel prevented real npm execution")
            return result

        def compare_trees(label, expected, actual):
            mismatch = {
                "added": {name: actual[name] for name in sorted(actual.keys() - expected.keys())},
                "missing": {name: expected[name] for name in sorted(expected.keys() - actual.keys())},
                "changed": {name: {"expected": expected[name], "actual": actual[name]} for name in sorted(expected.keys() & actual.keys()) if expected[name] != actual[name]},
            }
            for suffix, value in (("expected", expected), ("actual", actual), ("mismatches", mismatch)):
                (logs / (label + "-" + suffix + ".json")).write_text(json.dumps(value, indent=2))
            evidence.setdefault("treeComparisons", []).append({"phase": evidence["phase"], "label": label, "expected": str(logs / (label + "-expected.json")), "actual": str(logs / (label + "-actual.json")), "mismatches": str(logs / (label + "-mismatches.json")), "equal": not any(mismatch.values())})
            require(not any(mismatch.values()), label + " changed files outside its exact allowed delta; see mismatches JSON")

        phase("setup-network-sandbox", "setup_failure")
        run("sandbox-preflight", ["/usr/bin/true"])

        # Only the actual archive is extracted; no synthetic binary/descriptor is used.
        phase("setup-archive-extraction-and-tuple", "setup_failure")
        standalone = sandbox / "standalone"
        standalone.mkdir()
        with tarfile.open(archive, "r:*") as package:
            names = set()
            for member in package.getmembers():
                item = PurePosixPath(member.name)
                require(not item.is_absolute() and item.parts and all(part not in ("..", ".") for part in item.parts), "Unsafe archive member")
                require(str(item) not in names, "Duplicate archive member")
                names.add(str(item))
                require(member.isdir() or member.isfile(), "Archive contains a link or special file")
                destination = standalone.joinpath(*item.parts)
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with package.extractfile(member) as source_file, destination.open("xb") as target_file:
                        shutil.copyfileobj(source_file, target_file)
                    destination.chmod(member.mode & 0o777)
        descriptor = json.loads((standalone / "distribution.json").read_text())
        metadata = json.loads((standalone / "package.json").read_text())
        require(descriptor["schema"] == "orchestra-distribution-v1" and descriptor["version"] == args.version and descriptor["target"] == args.target, "Archive descriptor does not match frozen release tuple")
        require(metadata["version"] == args.version and metadata["name"] == "@humanguardrail/cli-" + args.target, "Archive package identity differs")
        evidence["descriptor"] = {"schema": descriptor["schema"], "version": descriptor["version"], "target": descriptor["target"]}
        evidence["checks"].append("trusted archive digest, frozen installer bytes, and archive tuple verified")
        phase("product-official-install", "product_failure")
        run("official-install", ["/bin/sh", installer, "--prefix", prefix, "--version", args.version, "--target", args.target, "--archive", archive, "--sha256", args.sha256])
        payload = prefix / "versions" / (args.version + "-" + args.target)
        launcher = prefix / "bin" / "orchestra"
        require(launcher.is_symlink() and (prefix / "current").is_symlink(), "Official installer did not create the expected launcher/current links")
        require(launcher.resolve() == payload / "bin" / "orchestra", "Official launcher resolves outside its selected payload")
        phase("product-compiled-identity", "product_failure")
        version = run("compiled-version", [launcher, "--version"])
        require(version.stdout.strip() == args.version, "Actual installed executable reports the wrong version")
        # Prepare ordinary user sentinels and all initialization directories before
        # snapshotting dry-run. No credential content or owner data enters evidence.
        phase("setup-preservation-probes", "setup_failure")
        paths = {name: home / name / "orchestra" for name in ("data", "cache", "config", "state")}
        for name, directory in paths.items():
            directory.mkdir(parents=True, exist_ok=True)
            (directory / "qualification-sentinel").write_text(name + " preserved bytes")
        for directory in (paths["data"] / "log", paths["data"] / "repos", paths["cache"] / "bin", temp / "orchestra"):
            directory.mkdir(parents=True, exist_ok=True)
        older = prefix / "versions" / "0.0.0-qualification-sentinel"
        older.mkdir()
        (older / "retained").write_text("older version must survive")
        (prefix / "prefix-bystander").write_text("ordinary prefix bytes must survive")
        other = sandbox / "other-installation"
        other.mkdir()
        (other / "retained").write_text("unrelated installation must survive")
        phase("setup-installed-warmup", "setup_failure")
        run("uninstall-help", [launcher, "uninstall", "--help"])
        before = snapshot(sandbox)
        phase("product-dry-run", "product_failure")
        dry = run("uninstall-dry-run", [launcher, "uninstall", "--dry-run", "--keep-config", "--keep-data"])
        require("Dry run - no changes made" in dry.stdout and str(payload) in dry.stdout, "Dry-run did not identify the actual owning archive")
        require("npm uninstall" not in dry.stdout + dry.stderr, "Dry-run misclassified official archive as npm")
        after_dry = snapshot(sandbox)
        (logs / "before-dry-run.json").write_text(json.dumps(before, indent=2))
        (logs / "after-dry-run.json").write_text(json.dumps(after_dry, indent=2))
        compare_trees("dry-run", before, after_dry)
        evidence["checks"].append("compiled dry-run identifies selected archive and makes no tree changes")
        phase("setup-real-uninstall-oracle", "harness_failure")
        # The only allowed deletion roots are these bounded sandbox-relative
        # paths. No broad prefix/HOME exclusion or runtime-created-file exception.
        allowed_deleted = [
            {"path": payload.relative_to(sandbox).as_posix(), "subtree": True},
            {"path": (prefix / "current").relative_to(sandbox).as_posix(), "subtree": False},
            {"path": launcher.relative_to(sandbox).as_posix(), "subtree": False},
            {"path": paths["cache"].relative_to(sandbox).as_posix(), "subtree": True},
            {"path": paths["state"].relative_to(sandbox).as_posix(), "subtree": True},
        ]
        for entry in allowed_deleted:
            require(entry["path"] in before and entry["path"] not in (".", "home", "custom-prefix"), "Invalid allowed deletion boundary")
        evidence["allowedDeletedPaths"] = allowed_deleted
        (logs / "allowed-deleted-paths.json").write_text(json.dumps(allowed_deleted, indent=2))
        expected_after = {name: value for name, value in before.items() if not any(
            name == entry["path"] or (entry["subtree"] and name.startswith(entry["path"] + "/"))
            for entry in allowed_deleted
        )}
        (logs / "before-real-uninstall.json").write_text(json.dumps(before, indent=2))
        phase("product-real-uninstall", "product_failure")
        real = run("uninstall-real", [launcher, "uninstall", "--force", "--keep-config", "--keep-data"], expected=None)
        # Capture/compare before standalone warmup or any subsequent setup writes.
        after_real = snapshot(sandbox)
        (logs / "after-real-uninstall.json").write_text(json.dumps(after_real, indent=2))
        compare_trees("real-uninstall", expected_after, after_real)
        require(real.returncode == 0, "Actual uninstall failed; see command logs and complete tree snapshots")
        require(not payload.exists() and not os.path.lexists(prefix / "current") and not os.path.lexists(launcher), "Owned payload/current/launcher survived uninstall")
        require(prefix.is_dir(), "Uninstall removed the broad prefix")
        require((older / "retained").read_text() == "older version must survive", "Uninstall damaged retained version")
        for name in ("data", "config"):
            require((paths[name] / "qualification-sentinel").read_text() == name + " preserved bytes", "Keep flag failed for " + name)
        for name in ("cache", "state"):
            require(not paths[name].exists(), "Uninstall failed to remove " + name)
        require((other / "retained").read_text() == "unrelated installation must survive", "Another installation was changed")
        evidence["checks"].append("compiled uninstall removes only selected payload and links; keep flags and older/unrelated sentinels survive")
        # Startup initializes empty Global directories. Warm only help before the
        # refusal snapshot; then run the actual ambiguous standalone command.
        phase("setup-standalone-warmup", "setup_failure")
        standalone_executable = standalone / "bin" / "orchestra"
        run("standalone-help", [standalone_executable, "uninstall", "--help"])
        for directory in (paths["data"], paths["config"], paths["state"], paths["data"] / "log", paths["data"] / "repos", paths["cache"] / "bin"):
            directory.mkdir(parents=True, exist_ok=True)
        standalone_before = snapshot(sandbox)
        phase("product-standalone-refusal", "product_failure")
        refused = run("standalone-refusal", [standalone_executable, "uninstall", "--force", "--keep-config", "--keep-data"], expected=None)
        require(refused.returncode != 0 and "Cannot safely identify this installation" in refused.stdout + refused.stderr, "Ambiguous standalone archive did not fail explicitly")
        compare_trees("standalone-refusal", standalone_before, snapshot(sandbox))
        evidence["checks"].append("actual standalone archive refuses safely without npm or tree changes")
        phase("product-input-integrity", "product_failure")
        evidence["archiveSha256After"] = digest(archive)
        require(evidence["archiveSha256After"] == args.sha256, "Input archive changed during qualification")
        evidence["checks"].append("input archive SHA-256 unchanged before/after all operations")
        phase("complete", None)
        evidence["status"] = "PASS"
    except Exception as error:
        evidence["error"] = str(error)
        evidence["failedPhase"] = evidence["phase"]
        evidence["failedCategory"] = evidence["failureCategory"]
    finally:
        evidence["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        evidence["sandboxRetainedForReview"] = str(sandbox) if sandbox else None
        if output_reserved:
            output.write_text(json.dumps(evidence, indent=2) + "\n")
    # If evidence reservation itself failed, emit diagnostics to stdout without
    # modifying an existing destination or claiming any product result.
    print(json.dumps({"status": evidence["status"], "phase": evidence["phase"], "failureCategory": evidence["failureCategory"], "error": evidence.get("error"), "evidence": str(output) if output_reserved else None, "sandbox": str(sandbox) if sandbox else None}))
    return 0 if evidence["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
