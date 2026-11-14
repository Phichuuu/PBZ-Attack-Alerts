# Changelog

## 0.2.4 — 2026-11-14

- Fix alerts permanently stopping during map travel when PuerTS rejects an
  already released widget even in `IsValid`. Cleanup now releases references first
  and cannot interrupt reset or stop.
- Rebind the overlay and combat state when the world, pawn or controller changes,
  or game time rewinds. Known released-object races retry after a one-second
  real-time delay; unsupported binding errors still stop safely.
- Add regression tests reproducing the reported cleanup failure, repeated travel,
  controller replacement, clock rewind, delayed recovery and unknown failures.
- Attack timing, colors and visual size are unchanged.

## 0.2.3 — 2026-11-14

- Add a discoverable AGENTS.md entry point, a complete agent deployment guide,
  and a copyable player prompt in the README.
- Include a read-only file verifier with JSON output and documented exit codes,
  keeping file verification separate from configuration and in-game verification.
- Ship the agent guide and verifier in the player ZIP; add regression coverage
  for missing/changed files, shadowed entries and invalid input. Combat behavior is unchanged.

## 0.2.2 — 2026-11-14

- Canonicalize Windows short-name game directories before the installer containment check.
- Add an actual Windows short-path regression test. Combat behavior is unchanged.

## 0.2.1 — 2026-11-14

- Improve yellow contrast using a thicker star/core, a soft dark edge and a longer
  peak-opacity phase, while preserving size and attack timing.
- Publish complete source, ready-to-install files, a verified dependency installer,
  reproducible build instructions and automated checks.

## 0.2.0 — 2026-11-14

- Replace rectangular crosses with original layered star flares.
- Add a separate melee windup cue based on eligible, player-targeted live timelines.
- Follow the enemy's torso bone, with an actor-centre fallback.

## Earlier diagnostic versions

- Establish the native incoming-frame path, world-owned overlay, sparse-map
  iteration, hot-reload cleanup and bounded diagnostics.
