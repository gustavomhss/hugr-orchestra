{
  lib,
  stdenvNoCC,
  fetchurl,
  bun,
  versionCheckHook,
  writableTmpDirAsHomeHook,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ./toolchain-sources.json);
  source = manifest.bun.sources.${stdenvNoCC.hostPlatform.system} or (throw
    "Unsupported Bun toolchain system: ${stdenvNoCC.hostPlatform.system}"
  );
in
bun.overrideAttrs (old: {
  inherit (manifest.bun) version;
  src = fetchurl { inherit (source) url hash; };
  sourceRoot = "bun-${source.target}";

  # Keep Nixpkgs' Linux patching, Darwin ICU/signing, bunx and completions.
  passthru = builtins.removeAttrs old.passthru [ "updateScript" ] // {
    sources = lib.mapAttrs (_: archive: fetchurl { inherit (archive) url hash; }) manifest.bun.sources;
    compileTarget = source.compileTarget;
  };

  nativeInstallCheckInputs = [
    versionCheckHook
    writableTmpDirAsHomeHook
  ];
  doInstallCheck = stdenvNoCC.buildPlatform.canExecute stdenvNoCC.hostPlatform;
  versionCheckProgramArg = "--version";
  versionCheckKeepEnvironment = [ "HOME" ];

  meta = old.meta // {
    changelog = "https://bun.sh/blog/bun-v${manifest.bun.version}";
    platforms = builtins.attrNames manifest.bun.sources;
  };
})
