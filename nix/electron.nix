{
  lib,
  stdenv,
  callPackage,
  path,
  writableTmpDirAsHomeHook,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ./toolchain-sources.json);
  # At the locked revision this is `args: version: hashes: derivation`.
  mkElectron = callPackage (path + "/pkgs/development/tools/electron/binary/generic.nix") { };
  electron = mkElectron manifest.electron.version (
    lib.mapAttrs (_: source: source.hash) manifest.electron.sources
  );
in
electron.overrideAttrs (old: {
  # Binary packaging does not need headers. The generic's lazy headers fetch
  # requires a recursive unpacked hash, not one of our measured ZIP hashes.
  passthru = builtins.removeAttrs old.passthru [ "headers" ];
  meta = old.meta // {
    platforms = builtins.attrNames manifest.electron.sources;
  };

  nativeInstallCheckInputs = [ writableTmpDirAsHomeHook ];
  doInstallCheck = stdenv.buildPlatform.canExecute stdenv.hostPlatform;
  installCheckPhase = ''
    runHook preInstallCheck
    test "$(ELECTRON_RUN_AS_NODE=1 "$out/bin/electron" -p 'process.versions.electron')" = "${manifest.electron.version}"
    runHook postInstallCheck
  '';
})
