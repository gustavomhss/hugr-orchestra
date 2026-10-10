import json
import os
from pathlib import Path
import struct
import subprocess
import sys


def require(condition, code):
    if not condition:
        raise SystemExit("ELF_DIAGNOSTIC_FAILURE:" + code)


def command(directory, name, argv, env=None):
    result = subprocess.run(argv, capture_output=True, timeout=900, env=env)
    (directory / (name + ".json")).write_text(json.dumps({"argv": argv, "status": result.returncode}) + "\n")
    (directory / (name + ".stdout")).write_bytes(result.stdout)
    (directory / (name + ".stderr")).write_bytes(result.stderr)
    return result


def main():
    compiler, directory, system = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    require(system in {"x86_64-linux", "aarch64-linux"}, "UNSUPPORTED_SYSTEM")
    require(compiler.is_file(), "COMPILER_MISSING")
    require((directory / "source-status.txt").read_text() == "", "SOURCE_DIRTY")
    version = command(directory, "compiler-version", [str(compiler), "--version"])
    require(version.returncode == 0 and version.stdout.strip() == b"1.3.14", "COMPILER_VERSION")
    data = bytearray(compiler.read_bytes())
    require(data[:6] == b"\x7fELF\x02\x01", "ELF64_LE_REQUIRED")
    require(struct.unpack_from("<H", data, 18)[0] == (62 if system == "x86_64-linux" else 183), "ELF_MACHINE_MISMATCH")
    phoff, shoff = struct.unpack_from("<QQ", data, 32)
    phsize, phnum, shsize, shnum, names_index = struct.unpack_from("<HHHHH", data, 54)
    require(phsize == 56 and shsize == 64 and phnum > 0 and shnum > 0 and names_index < shnum, "ELF_TABLE_SHAPE")
    require(phoff + phsize * phnum <= len(data) and shoff + shsize * shnum <= len(data), "ELF_TABLE_BOUNDS")
    programs = [struct.unpack_from("<IIQQQQQQ", data, phoff + index * phsize) for index in range(phnum)]
    sections = [struct.unpack_from("<IIQQQQIIQQ", data, shoff + index * shsize) for index in range(shnum)]
    names = sections[names_index]
    require(names[4] + names[5] <= len(data), "ELF_NAMES_BOUNDS")
    table = data[names[4]:names[4] + names[5]]
    require(all(section[0] < len(table) for section in sections), "ELF_NAME_OFFSET_BOUNDS")
    named = [(bytes(table[section[0]:]).split(b"\0", 1)[0].decode(), section) for section in sections]
    bun = [section for name, section in named if name == ".bun"]
    require(len(bun) == 1 and bun[0][5] > 0, "BUN_SECTION_MISSING_OR_AMBIGUOUS")
    writable = [index for index, program in enumerate(programs) if program[0] == 1 and program[1] & 2]
    owners = [index for index in writable if programs[index][3] <= bun[0][3] < programs[index][3] + programs[index][6]]
    require(len(owners) == 1 and len(writable) >= 2 and writable[0] != owners[0], "REGRESSION_PRECONDITION_NOT_OBSERVED")
    (directory / "compiler-layout.json").write_text(json.dumps({"programs": programs, "sections": named, "writable": writable, "bunOwner": owners[0]}, indent=2) + "\n")
    for index in writable:
        if index == owners[0]:
            continue
        program = programs[index]
        require(program[1] == 6, "METADATA_SEGMENT_FLAGS")
        require(not any(section[2] & 1 and section[3] < program[3] + program[6] and section[3] + section[5] > program[3] for section in sections), "WRITABLE_SECTION_IN_METADATA_SEGMENT")
        require(any(header[0] in {3, 6} and program[3] <= header[3] and header[3] + header[6] <= program[3] + program[6] for header in programs), "METADATA_SEGMENT_NOT_IDENTIFIED")
        struct.pack_into("<I", data, phoff + index * phsize + 4, program[1] & ~2)
    fixed = directory / "readonly-metadata-template"
    fixed.write_bytes(data)
    fixed.chmod(0o700)
    source = directory / "hello.ts"
    source.write_text('console.log("NATIVE_TEMPLATE_HELLO")\n')
    env = dict(os.environ, BUN_DEBUG_FORCE_NIX_HOST="1")
    for label, template in [("original", compiler), ("readonly", fixed)]:
        output = directory / (label + "-compiled")
        built = command(directory, label + "-compile", [str(compiler), "build", "--compile", "--compile-executable-path", str(template), str(source), "--outfile", str(output)], env)
        require(built.returncode == 0 and output.is_file(), "COMPILE_FAILED:" + label)
        headers = command(directory, label + "-headers", ["readelf", "-lW", "-SW", "-dW", str(output)])
        require(headers.returncode == 0, "ELF_HEADERS_FAILED:" + label)
        executed = command(directory, label + "-execute", [str(output)])
        if label == "original":
            require(executed.returncode == -11, "ORIGINAL_SEGFAULT_NOT_REPRODUCED")
            command(directory, label + "-backtrace", ["gdb", "--batch", "-ex", "run", "-ex", "bt", "-ex", "info proc mappings", "--args", str(output)])
        if label == "readonly":
            require(executed.returncode == 0 and executed.stdout.strip() == b"NATIVE_TEMPLATE_HELLO", "READONLY_TEMPLATE_NOT_RUNNABLE")
    (directory / "result.json").write_text(json.dumps({"status": "DIAGNOSTIC_ONLY_NOT_DISTRIBUTION", "system": system, "sourceRevision": (directory / "source-revision.txt").read_text().strip(), "originalFailed": True, "readonlyTemplateSucceeded": True}) + "\n")


main()
