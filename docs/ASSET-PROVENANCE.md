# Asset provenance and usage notes

## Official feature references

The three gameplay identities follow the feature language on Tesla's official Roadster page:

- <https://www.tesla.com/roadster> describes active aero and a multi-mode suction/downforce system for Performance.
- The same page describes the Thrust trim as seating for two with rear cold-gas thrusters and a claimed 0–60 mph time under one second.
- The same page describes Rocket as seating for one with perimeter cold-gas thrusters supporting forward, upward and lateral rotational movement, and states that it is not approved for public road use.

These are product-reference claims presented as game fiction and are not independently verified performance promises by this project.

## Why scraped Tesla photos are not included

The official Tesla Gallery page at <https://www.tesla.com/tesla-gallery> says its downloads are for news media in connection with a story/article, that Tesla retains all image rights, that the notice “Courtesy of Tesla, Inc.” is required, and that prior written consent is required for uses outside those parameters. Because an open-source game repository is not automatically a qualifying media use, this project does not copy or redistribute those images. Contributors may keep official URLs as references, but must obtain permission before adding an official Tesla image to a distributed build.

## In-game visual assets

- `src/game/player.ts` contains a procedural no-logo fallback car built from Three.js primitives. It is the guaranteed playable visual and is authored for this project.
- `assets/models/roadster-base.glb` is a generated, optimized original sports-car base with no logo, badge or text. It is registered through `assets.lock.json`; check the applicable service terms before mirroring the binary to an independent GitHub repository.
- `assets/share/og.png` is a generated promotional image for this project. It intentionally shows an original unbranded vehicle and no Tesla marks.
- `assets/share/favicon.png` is a project-authored neon R/03 mark.
- `public/fonts/` contains the bundled Manus CC0 font files and their license notice.

When adding a new asset, record its source URL, creator/provider, license or restriction, attribution text and whether the file is committed, managed or only a local reference.
