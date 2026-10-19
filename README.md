# Roadster / 03 — Three Modes

Roadster / 03 is an unofficial, open-source browser stunt-driving vertical slice inspired by the public Tesla Roadster concept language. It is built with Three.js, TypeScript and Rapier, and is designed for Chrome on desktop, Android and iOS browsers, with a structure that can also be packaged as a PC desktop app.

The game is a single replayable neon stunt loop. Choose a vehicle identity, hit every glowing checkpoint gate, chain the route for combo score, launch from ramps, and restart quickly to improve the run.

## Vehicle modes

- **Performance** is a two-seat-inspired road mode focused on active aero, high downforce, grip and stability.
- **Thrust** is a two-seat-inspired race mode with rear cold-gas-thruster gameplay and a deliberately labeled fictional sub-one-second 0–60 fantasy burst.
- **Rocket** is a single-seat-inspired experimental mode with perimeter-thruster lift and air steering. The UI marks it as not road-approved.

These are gameplay identities, not a claim that this fan project is an official Tesla product. Tesla names, marks and product references belong to their respective owners. No endorsement is implied.

## Controls

Use **WASD** or the left stick to steer, mouse/right stick to look, **Space/A** to lift, and **F/X/RT** to boost. Touch devices get a left virtual stick plus BOOST and LIFT buttons. **Esc/Start** pauses. The settings panel exposes low, medium and high rendering tiers, adaptive mobile-friendly resolution, reduced camera motion, audio and language options.

## Performance approach

The scene uses a fixed-step simulation, kinematic collision controller, low draw-call procedural track geometry, pooled particles, physically based materials, bloom on high quality, dynamic shadows on medium/high, and reduced post-processing on low/mobile. The generated base-car asset is optimized for a web game, while the procedural fallback keeps the vertical slice playable when a managed asset is unavailable.

## Run locally

```bash
pnpm install
pnpm dev
# open the printed local URL

pnpm build
pnpm test
pnpm smoke
```

## Open-source notes

The source is intended for GitHub collaboration. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [LICENSE](LICENSE) and [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md) before redistributing a build or replacing the visual assets. Do not add secrets, scraped images or unverified third-party model files.

## Sources

The gameplay feature wording is grounded in Tesla's official Roadster page. The official Tesla Gallery is recorded as a reference source only because it states that its downloads are for news-media stories/articles, remain Tesla property, require “Courtesy of Tesla, Inc.” and require prior written consent for uses outside those parameters. As a result, this repository does **not** redistribute scraped Tesla product photos. The in-game car is an original generated/procedural asset with no Tesla logo, badge or text.

- Official Roadster feature reference: <https://www.tesla.com/roadster>
- Official Tesla Gallery usage notice: <https://www.tesla.com/tesla-gallery>
- Bundled Manus CC0 fonts: `public/fonts/ManusCC0-LICENSE.txt`
