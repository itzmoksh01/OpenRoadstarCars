# Contributing

Roadster / 03 is a small, focused browser game. Contributions should preserve the three-mode identity, touch/keyboard/gamepad support and the low/medium/high performance tiers.

Before opening a pull request, run `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm smoke`. Keep gameplay state in the fixed-step loop and keep UI copy in both locale JSON files.

For new art, use original or clearly licensed assets. Do not copy Tesla product images from search results into the repository. Add every external source, license or usage restriction to [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md). Avoid Tesla logos, badges and claims of endorsement. Keep generated or managed assets optional where practical so the procedural fallback remains playable.
