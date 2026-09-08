{
  description = "RampAgent config repository - formatting/linting toolchain";

  inputs.nixpkgs.url = "nixpkgs";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # `nix develop` -> shell with the exact tools used for linting/formatting.
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.prettier
          ];
        };
      });

      # `nix fmt` -> format the whole repo with the pinned prettier.
      formatter = forAllSystems (pkgs: pkgs.prettier);
    };
}
