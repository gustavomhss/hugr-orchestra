"""Preserve Bun 1.3.14's native ELF template without writable loader metadata."""
import json
from pathlib import Path
import struct
import sys


def require(condition, code):
    if not condition:
        raise SystemExit("NIX_TEMPLATE_FAILURE:" + code)


def main():
    require(len(sys.argv) == 4, "ARGUMENTS")
    source, destination, system = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    require(system in {"x86_64-linux", "aarch64-linux"}, "UNSUPPORTED_SYSTEM")
    require(source.is_file() and not destination.exists() and destination.parent.is_dir(), "PATHS")
    data = bytearray(source.read_bytes())
    require(len(data) >= 64 and data[:6] == b"\x7fELF\x02\x01", "ELF64_LE_REQUIRED")
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
    bun = [section for section in sections if bytes(table[section[0]:]).split(b"\0", 1)[0] == b".bun"]
    require(len(bun) == 1 and bun[0][5] > 0, "BUN_SECTION_MISSING_OR_AMBIGUOUS")
    writable = [index for index, program in enumerate(programs) if program[0] == 1 and program[1] & 2]
    owners = [index for index in writable if programs[index][3] <= bun[0][3] < programs[index][3] + programs[index][6]]
    require(len(owners) == 1, "BUN_WRITABLE_OWNER_MISSING_OR_AMBIGUOUS")
    changed = []
    for index in writable:
        if index == owners[0]:
            continue
        program = programs[index]
        require(program[1] == 6, "METADATA_SEGMENT_FLAGS")
        require(not any(section[2] & 1 and section[3] < program[3] + program[6] and section[3] + section[5] > program[3] for section in sections), "WRITABLE_SECTION_IN_METADATA_SEGMENT")
        require(any(header[0] in {3, 6} and program[3] <= header[3] and header[3] + header[6] <= program[3] + program[6] for header in programs), "METADATA_SEGMENT_NOT_IDENTIFIED")
        struct.pack_into("<I", data, phoff + index * phsize + 4, program[1] & ~2)
        changed.append(index)
    require([index for index, program in enumerate(programs) if program[0] == 1 and struct.unpack_from("<I", data, phoff + index * phsize + 4)[0] & 2] == owners, "BUN_WRITABLE_OWNER_NOT_UNIQUE")
    with destination.open("xb") as output:
        output.write(data)
    destination.chmod(0o700)
    print(json.dumps({"status": "NIX_TEMPLATE_PREPARED", "system": system, "bunOwner": owners[0], "readonlyMetadataSegments": changed}))


main()
