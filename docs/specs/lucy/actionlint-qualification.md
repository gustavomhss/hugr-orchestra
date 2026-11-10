# actionlint 1.7.12 static qualification

Static-only ABI floor measurement of the approved release artifacts. The existing `packages/core/script/toolkit-floors.ts` `measure` and `reduce` exports verified archive integrity, extracted the named executable member, and inspected its header; no actionlint executable was run. Reproduce with the temporary driver procedure and cache documented in the work package; detailed measured rows are at `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lucy-recovery-evidence/actionlint-static-floors.json`.

| Target | Archive SHA-256 | Executable / recognized header | Measurement / recorded floor |
| --- | --- | --- | --- |
| darwin-arm64 | `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f` | `actionlint`, Mach-O arm64 minos 12.0 | macOS 12.0 |
| darwin-x64 | `5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644` | `actionlint`, Mach-O x86_64 minos 12.0 | macOS 12.0 |
| linux-arm64 | `325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6` | `actionlint`, ELF; static, no interpreter/needed libraries | `{}` (no dynamic glibc requirement observed) |
| linux-x64 | `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8` | `actionlint`, ELF; static, no interpreter/needed libraries | `{}` (no dynamic glibc requirement observed) |
| win32-x64 | `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9` | `actionlint.exe`, PE; OS/subsystem stamp 6.1, no recognized newer-Windows imports | `{}` (no newer requirement detected by this scan) |

The PE scan covers the existing inspector's known unconditional imports only; it is not full Windows API/runtime compatibility qualification. This static result does not establish a supported Windows floor. Runtime conformance and any Windows support decision remain separate work.
