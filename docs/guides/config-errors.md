# Config errors

If an Orchestra config file is invalid, Orchestra now stops with an error instead of skipping the file. Before, a broken file was ignored and you ran on defaults without knowing.

This covers `orchestra.json` and `orchestra.jsonc` in your global config folder, in the project, and under `.orchestra/`.

## What the error shows

The error names the file and what is wrong:

- A syntax error gives the file path, the kind of problem (for example a missing comma) and where in the file it is.
- A value that does not match the schema gives the file path and the key that is wrong, for example that `model` must be a string.

## How to fix it

1. Open the file named in the error.
2. Fix the syntax or the value it points to. Comments and trailing commas are allowed in `.jsonc` and in `.json`.
3. Start again. If you want to run without the file for now, rename or move it.

An unknown extra key is not an error; it is ignored.
