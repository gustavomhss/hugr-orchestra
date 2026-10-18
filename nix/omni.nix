{
  lib,
  stdenv,
  callPackage,
  fetchurl,
  makeRustPlatform,
  path,
  nodejs,
  darwin,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ./toolchain-sources.json);
  source = manifest.rust.sources.${stdenv.hostPlatform.system} or (throw
    "Unsupported Rust toolchain system: ${stdenv.hostPlatform.system}"
  );
  # The locked Nixpkgs ships rustc 1.94; native/omni pins 1.98.0. Install the
  # official standalone dist archive through Nixpkgs' own prebuilt-bootstrap
  # recipe (rustc + rust-std + cargo), which is also how Nixpkgs builds cargo.
  toolchain = callPackage (path + "/pkgs/development/compilers/rust/binary.nix") {
    inherit (manifest.rust) version;
    src = fetchurl { inherit (source) url hash; };
    platform = source.target;
    versionType = "bootstrap";
  };
  rustPlatform = makeRustPlatform { inherit (toolchain) rustc cargo; };
  root = ../native/omni;
  addon = "libhugr_omni_node${stdenv.hostPlatform.extensions.sharedLibrary}";
in
assert lib.assertMsg (source.target == stdenv.hostPlatform.rust.rustcTarget)
  "Rust ${manifest.rust.version} archive target ${source.target} differs from ${stdenv.hostPlatform.rust.rustcTarget}";
rustPlatform.buildRustPackage {
  pname = "hugr-omni";
  inherit ((lib.importTOML (root + "/Cargo.toml")).workspace.package) version;

  # Only what Cargo reads: the workspace manifests/lock, every member crate and
  # the addon's Rust sources (not its JS, docs or the local target/ directory).
  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/Cargo.toml")
      (root + "/Cargo.lock")
      (root + "/.cargo")
      (root + "/crates")
      (root + "/bindings/node/Cargo.toml")
      (root + "/bindings/node/build.rs")
      (root + "/bindings/node/src")
    ];
  };

  cargoLock.lockFile = root + "/Cargo.lock";
  # The two crates CI ships (.github/actions/omni-binaries/action.yml).
  cargoBuildFlags = [
    "-p"
    "hugr-omni-node"
    "-p"
    "omni-supervisor"
  ];
  # The omni suites spawn processes and terminals and run in omni.yml, not here.
  doCheck = false;
  # cargo-auditable is built for the locked rustc; keep the 1.98 cargo unwrapped.
  auditable = false;

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isDarwin [ darwin.sigtool ];

  # The layout core/src/omni.ts and desktop stage-omni.ts read: the addon under
  # its shipped name next to the supervisor. Moved after strip/patchelf ran on
  # the standard bin/lib outputs; rmdir fails if Cargo produced anything else.
  postFixup = ''
    mv "$out/lib/${addon}" "$out/hugr_omni.node"
    mv "$out/bin/hugr-omni-supervisor" "$out/hugr-omni-supervisor"
    rmdir "$out/lib" "$out/bin"
  '' + lib.optionalString stdenv.hostPlatform.isDarwin ''
    # As for the Bun-compiled CLI: re-sign ad hoc after every byte mutation.
    codesign --force --sign - "$out/hugr_omni.node" "$out/hugr-omni-supervisor"
  '';

  nativeInstallCheckInputs = [ nodejs ];
  doInstallCheck = stdenv.buildPlatform.canExecute stdenv.hostPlatform;
  installCheckPhase = ''
    runHook preInstallCheck
    test -x "$out/hugr-omni-supervisor"
    # Node-API 8 addon: Node must load the renamed file and see its exports.
    node -e '
      const addon = { exports: {} }
      process.dlopen(addon, process.argv[1])
      if (Object.keys(addon.exports).length === 0) process.exit(97)
    ' "$out/hugr_omni.node"
    runHook postInstallCheck
    echo "OMNI_INSTALL_CHECK_OK:${manifest.rust.version}:${stdenv.hostPlatform.system}"
  '';

  passthru = {
    inherit toolchain rustPlatform;
    addon = "hugr_omni.node";
    supervisor = "hugr-omni-supervisor";
  };

  meta = {
    description = "hugr-omni Node-API addon and process supervisor for Orchestra";
    license = with lib.licenses; [
      mit
      asl20
    ];
    platforms = builtins.attrNames manifest.rust.sources;
  };
}
