# Agent entry point / Agent 部署入口

This repository is PBZ Attack Alerts, a Windows / Steam mod for Phantom Blade Zero.
If the user asks you to **install or deploy**, follow
[docs/AGENT_DEPLOYMENT.md](docs/AGENT_DEPLOYMENT.md). It contains the complete
installation, verification, troubleshooting and rollback procedure.

## Installing for a player

- Use the committed `ready-to-install/` files. No Node.js, Python, compiler, SDK,
  GitHub account or access token is needed for installation.
- Work on the player's Windows PC with access to their installed Steam game.
  A cloud-only agent cannot install into a PC it cannot access.
- Resolve the actual game root; never reuse an example path or the author's path.
  It must contain `platform/steam/PBZ.exe` and `ProjectPBZ`.
- Inspect `scripts/install.ps1` and `dependencies.json`, then use the documented
  noninteractive command with an explicit `-GameRoot`. Do not run `Install.cmd`
  from automation: it waits for keyboard input.
- Run a dry run, install, verify file hashes, and inspect `mods.ini` as documented.
  Check each process exit code before continuing. A dry run alone is not an install.
- Respect the user's existing authorization. Ask only for missing information or
  decisions, such as multiple plausible game folders or an unrelated DLL conflict.
  Do not kill the game to avoid its installation guard.
- Do not overwrite unknown DLLs, remove unrelated mods, or bypass checksum/path
  checks. Preserve existing user settings through the documented backup procedure.
- Report **files verified**, **configuration checked**, and **in-game verified**
  separately. File hashes cannot prove the game loaded the mod or rendered a flash.
- Keep local paths, saves, logs and credentials local; do not commit or upload them.

## Developing the project

Read `README.md`, `THIRD_PARTY_NOTICES.md` and the deployment guide before changing
installation behavior. Use Node.js 22+ and `npm ci`; the pinned SDK downloads from
the official release and is not redistributed in this repository.

After code or installer changes, run `npm test` on Windows. Installer tests use
temporary fixtures, never the actual game. `npm run build` updates the committed
`ready-to-install/` payload and its hashes; commit those generated changes with
their source. Documentation-only edits do not require a new build.

New release packages must use a new version; do not replace an existing version's
ZIP with different contents. `npm run package` creates the ZIP and SHA-256 file.
Do not claim wider attack coverage than the README describes.
