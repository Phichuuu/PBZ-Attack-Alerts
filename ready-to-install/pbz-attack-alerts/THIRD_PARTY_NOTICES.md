# Third-party notices

## PBZModLoader and development template

Author: zoneoflkf / LLKKFF. Source: https://github.com/zoneoflkf/PBZModLoader
Upstream root license: GNU GPL v3. The initial TypeScript project structure and
scripts/clean.cjs were adapted from its template; the project uses GPL-3.0-only.
No loader binary, game executable or game asset is committed to this repository.
The installer obtains the official 1.0.2 player archive using dependencies.json.
That archive retains upstream licensing notices including its toolchain notices.

## Development SDK 0.3.3

The official SDK package declares UNLICENSED. It is fetched unchanged from the
upstream template release for local development and is not included in this Git
repository or player bundle. This project's GPL grant does not relicense the SDK.
The source URL and archive SHA-256 are fixed in dependencies.json. The locally
fetched vendor/game-api directory retains the upstream package metadata.

## Build dependencies

TypeScript (Microsoft): Apache-2.0, https://github.com/microsoft/TypeScript
fflate (Arjun Barrett): MIT, https://github.com/101arrowz/fflate
Pillow contributors: HPND, https://github.com/python-pillow/Pillow
These are installed by npm/pip; their original notices remain with the packages.
fflate and TypeScript are development tools, not MOD runtime dependencies.

## Research references (not bundled)

- https://github.com/visibleLi/PBZ-Forewarn---Sekiro-Style-Danger-Alert
  Read-only active-ability/timeline observation and condition-checking approach.
  No source or assets from this repository are copied into this project.
- https://github.com/OneDragon-Anything/ZenlessZoneZero-OneDragon (GPL-3.0)
  Used to understand recognition of existing yellow/red cues. No model, automatic
  control, audio or source file from it is bundled.
- https://github.com/Tencent/puerts
  Runtime bridge API reference. The MOD uses the game's existing PuerTS runtime.

The flare masks are independently generated geometry, with the editable generator
included. No Zenless Zone Zero art, music or sound recordings are distributed.
