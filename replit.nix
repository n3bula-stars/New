{ pkgs }: {
  deps = [
    pkgs.nodejs-22_x
    pkgs.nodePackages.pnpm
    pkgs.replitPackages.jest
  ];
}