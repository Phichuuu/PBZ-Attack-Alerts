# 交给 Agent 安装 / Agent deployment guide

仓库：https://github.com/Phichuuu/PBZ-Attack-Alerts

## 给使用者：复制这段话给你的 Agent

> 请帮我安装这个《影之刃零》黄／红光预警 MOD：
> https://github.com/Phichuuu/PBZ-Attack-Alerts
> 先读取根目录 AGENTS.md 和 docs/AGENT_DEPLOYMENT.md，按其中的流程查找
> 我电脑上的 Steam 游戏目录，预检、安装并核验文件与启用配置。使用仓库自带
> 成品，不需要编译。保留其他 MOD 和备份已有设置。最后告诉我安装版本、
> 检查结果以及是否还需要进游戏验证。

你的 Agent 需要能操作**你自己的 Windows 电脑**，访问游戏目录和 GitHub。
只会浏览网页或仅在云端运行的 Agent 可以读懂项目，但不能直接写入你的电脑。
本仓库是公开的，读取和下载不需要 GitHub 登录或令牌。

## For agents: ordered installation procedure

The commands below are PowerShell. Run them from the extracted repository/package
root. `$gameRoot` must be the resolved, real path on this user's PC, not a literal
placeholder. Windows PowerShell 5.1 is sufficient. No build tools are required.

### 1. Obtain and inspect the package

Clone `https://github.com/Phichuuu/PBZ-Attack-Alerts.git`, or download and extract
[main.zip](https://github.com/Phichuuu/PBZ-Attack-Alerts/archive/refs/heads/main.zip).
When Git is available, record `git rev-parse HEAD`. Read `AGENTS.md`, this guide,
`scripts/install.ps1`, `scripts/verify-install.ps1`, `dependencies.json` and
`ready-to-install/manifest.json` before executing scripts.

Alternatively, use the ZIP and matching `.sha256` from the
[latest release](https://github.com/Phichuuu/PBZ-Attack-Alerts/releases/latest).
Verify the ZIP hash before extraction. Agent docs and the verifier are included
from **0.2.3** onward. Do not mix files from different versions. Do not pipe a
remote script directly into execution.

### 2. Find the game and inspect the existing installation

Use a game path supplied by the user if valid. Otherwise inspect Steam's
`SteamPath` under `HKCU:\Software\Valve\Steam`, then its
`steamapps/libraryfolders.vdf`. For each listed library, inspect
`steamapps/appmanifest_*.acf` for PBZ / Phantom Blade Zero / 影之刃零 and resolve
`installdir` under that library's `steamapps/common`. Validate candidates by both
`platform/steam/PBZ.exe` and `ProjectPBZ`. Do not assume a drive letter, library
location or app ID. If no unique candidate exists, ask for the Steam “Browse local
files” directory; do not scan or modify arbitrary disk locations.

If `Get-Process PBZ -ErrorAction SilentlyContinue` finds the running game, ask the
user to save and exit before installing. Do not terminate it automatically.

Inspect `ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/settings.js` if it exists.
The installer replaces it with the release defaults and backs up changed files.
Record intended custom values so they can be reapplied after verification, or
report the backup location to the user. Existing `main.ts` takes priority over
`main.js`: move only a confirmed obsolete copy to a backup outside `mods`, never
silently delete it. An unrelated `main.js` or DLL conflict needs investigation.

### 3. Preview and install without prompts

Set `$gameRoot` to the validated path, then run **each command separately**, checking
`$LASTEXITCODE` immediately. Stop on a nonzero exit code.

```powershell
# Preview only: validates the local payload and planned destinations.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\install.ps1 -GameRoot $gameRoot -WhatIf
```

```powershell
# Actual installation. The user requesting installation authorizes this step.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\install.ps1 -GameRoot $gameRoot
```

Do not invoke `Install.cmd` from automation; its `pause` is intended for people.
`-ExecutionPolicy Bypass` is scoped to this process, not a persistent policy change.
Do not change machine-wide security settings or elevate automatically.

The installer verifies every payload hash. With no loader installed it downloads
the official loader pinned by `dependencies.json`, verifies SHA-256, then installs
it. With an existing loader it preserves it. A dry run does not download or verify
the remote archive and does not install anything. Network errors are actionable
failures, not successful offline installs.

### 4. Verify files, then check configuration

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1 -GameRoot $gameRoot
```

The verifier is read-only and emits one JSON object on stdout:

| Field / exit code | Meaning |
| --- | --- |
| `schemaVersion: 1` | Output contract version |
| `packageVersion` | Version of this checked-out / extracted payload |
| `status: "files_verified"`, exit `0` | All package and installed hashes match; expected loader entry files and a proxy exist; no overriding `main.ts` |
| `status: "verification_failed"`, exit `1` | Missing/changed files, incomplete loader layout, or an overriding entry; inspect `issues` and `files` |
| `status: "error"`, exit `2` | Invalid arguments, game directory, manifest, or unreadable files; inspect `error` |
| `configurationChecked: false` | The next manual configuration inspection is required |
| `runtimeVerified: false` | No in-game test was performed |

This checks file presence/hashes, not DLL provenance or the compatibility of a
previously installed loader. The JSON may contain local paths; keep it local.

Next read `ProjectPBZ/PBZModLoader/mods.ini`. For PBZModLoader 1.0.2:

- `[Loader]` requires `Version=1`; `Enabled=0` disables loading globally.
- In `[Mods]`, `pbz-attack-alerts=0` disables this mod; `1` or an absent entry allows it.
- Legacy `[Loader] Count` / `[Mod.N]` entries can override automatic discovery.
  Check the matching `Id`, `Entry` and `Enabled`; the desired entry is
  `mods/pbz-attack-alerts/main.js`. Do not replace the entire file or unrelated entries.
- If configuration is missing, malformed, or belongs to a different loader version,
  report that configuration has not passed rather than inventing defaults.

If this user's requested installation requires enabling this mod, back up the INI
and change only its disabled entry. A globally disabled loader also affects other
mods: explain that effect and resolve the user's intent before changing the global
switch. Preserve the original INI encoding and other sections.

Verify the stock payload **before** reapplying custom settings. Afterwards the
verifier correctly reports the changed `settings.js` hash. Report that deliberate
change separately; do not edit the manifest to make it pass or restore an old
settings file wholesale over new defaults.

### 5. Report completion honestly

Report the payload version (and commit if cloned), target folder, file verification,
configuration result, any settings restored, and backup location if files changed.
Installer backups are under
`ProjectPBZ/PBZModLoader/attack-alerts-backups/<timestamp>/` and preserve paths
relative to the game root.

Say “installed and files verified; in-game check pending” until an actual game run
has been observed. The installer/verifier never starts the game. If the user wants
an in-game test, launch through Steam and inspect the **new run's**
`ProjectPBZ/PBZModLoader/evidence/<run>/loader.log` for `pbz-attack-alerts` and errors.
Loading logs alone do not prove a visible flash; observe an enemy attack or obtain
the user's observation. `startupCheck` and `preview` are false by default, so no
flash on entering a save is normal. Yellow suggests parrying and red dodging;
coverage remains incomplete, as documented in the README.

## Failure handling and rollback

| Situation | Action |
| --- | --- |
| Game still running | Let the user save and exit; rerun the same commands |
| Download or checksum failure | Do not bypass checks; check connectivity/source. Remove only a confirmed corrupt archive in this repository's `.cache/`, then retry the official download |
| Unknown proxy DLL | Preserve it; identify the installed tool and a compatible loader setup before proceeding |
| Files pass but no light | Check INI, the current run's loader log, and an actual supported enemy attack; do not promise all attacks |
| No Windows/local access or game missing | Explain the missing prerequisite and provide the player installation link; do not claim deployment |
| Undo a new installation | Exit the game, move only `mods/pbz-attack-alerts` outside `mods`; keep shared loader files and other mods |
| Restore an update | Exit the game, identify this installation's backup, inspect its exact paths, and restore only this mod's files/settings. The backup contains replaced files, not a complete game snapshot |

When reporting a problem publicly, redact local account names and unrelated paths.
Never upload game files, save files, credentials, or full logs without reviewing them.
