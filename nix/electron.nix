{
  lib,
  stdenv,
  callPackage,
  path,
  writableTmpDirAsHomeHook,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ./toolchain-sources.json);
  source = manifest.electron.sources.${stdenv.hostPlatform.system} or (throw
    "Unsupported Electron toolchain system: ${stdenv.hostPlatform.system}"
  );
  # At the locked revision this is `args: version: hashes: derivation`.
  mkElectron = callPackage (path + "/pkgs/development/tools/electron/binary/generic.nix") {
    inherit stdenv;
  };
  electron = mkElectron manifest.electron.version (
    lib.mapAttrs (_: source: source.hash) manifest.electron.sources
  );
in
builtins.seq source (electron.overrideAttrs (old: {
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
    echo "TOOLCHAIN_INSTALL_CHECK_OK:electron:${manifest.electron.version}"
  '';
} // lib.optionalAttrs stdenv.hostPlatform.isDarwin {
  # genericBuild returns after buildCommand; it never enters the phase loop.
  # runPhase retains the final doInstallCheck/non-executable-host guard.
  buildCommand = old.buildCommand + ''
    runPhase installCheckPhase
  '';
}))
