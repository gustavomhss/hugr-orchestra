{
  description = "Orchestra development flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      rev = self.shortRev or self.dirtyShortRev or "dirty";
    in
    {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            (callPackage ./nix/bun.nix { })
            nodejs_24
            pkg-config
            openssl
            git
          ];
        };
      });

      overlays = {
        default =
          final: _prev:
          let
            bun = final.callPackage ./nix/bun.nix { bun = _prev.bun; };
            electron = final.callPackage ./nix/electron.nix { };
            node_modules = final.callPackage ./nix/node_modules.nix {
              inherit rev bun;
            };
          in
          rec {
            orchestra = final.callPackage ./nix/orchestra.nix {
              inherit node_modules bun;
              nodejs = final.nodejs_24;
            };
            orchestra-desktop = final.callPackage ./nix/desktop.nix {
              inherit orchestra bun electron;
              nodejs = final.nodejs_24;
            };
          };
      };

      packages = forEachSystem (
        pkgs:
        let
          bun = pkgs.callPackage ./nix/bun.nix { };
          electron = pkgs.callPackage ./nix/electron.nix { };
          node_modules = pkgs.callPackage ./nix/node_modules.nix {
            inherit rev bun;
          };
        in
        rec {
          default = orchestra;
          inherit bun electron node_modules;
          orchestra = pkgs.callPackage ./nix/orchestra.nix {
            inherit node_modules bun;
            nodejs = pkgs.nodejs_24;
          };
          orchestra-desktop = pkgs.callPackage ./nix/desktop.nix {
            inherit orchestra bun electron;
            nodejs = pkgs.nodejs_24;
          };
          # Updater derivation with fakeHash - build fails and reveals correct hash
          node_modules_updater = node_modules.override {
            hash = pkgs.lib.fakeHash;
          };
        }
      );
    };
}
