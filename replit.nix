{ pkgs }:
let
  jest = pkgs.nodePackages.jest;
in
pkgs.mkShell {
  buildInputs = [
    pkgs.yarn
    jest
  ];
}