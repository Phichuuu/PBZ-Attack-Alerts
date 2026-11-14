# PBZ Attack Alerts · 影之刃零黄／红光预警

为《影之刃零》（Phantom Blade Zero）提供类似动作游戏红黄闪光的视觉预警：**黄色建议招架，红色建议闪避**。星芒跟随敌人胸口，近战攻击前有收拢光圈，随后触发亮闪。

![黄红星芒示意](art/flare-preview.png)

这是独立绘制的效果，未使用《绝区零》的原版素材或声音。当前版本 **0.2.3 试用版**，Windows / Steam 为已验证平台，依赖 [PBZModLoader](https://github.com/zoneoflkf/PBZModLoader)。

0.2.3 增加 Agent 部署入口和只读安装核验；保留 0.2.2 的 Windows 短路径安装修复，战斗效果与 0.2.1 相同。

## 让你的 Agent 帮你安装

把下面这段话发给能操作你电脑的 Agent 即可：

> 请帮我安装 https://github.com/Phichuuu/PBZ-Attack-Alerts 。先读取仓库的
> AGENTS.md 和 docs/AGENT_DEPLOYMENT.md，查找我的 Steam 游戏目录，使用现成文件
> 完成预检、安装、文件核验和启用配置检查，保留其他 MOD 和已有设置的备份。
> 最后告诉我安装结果及是否还需要进游戏验证。

**Agent 从这里开始：[AGENTS.md](AGENTS.md) → [完整部署流程](docs/AGENT_DEPLOYMENT.md)。**
安装无需编译，也无需 GitHub 账号。需要 Agent 能访问玩家的 Windows 电脑；仅能浏览网页的 Agent 无法直接安装。

## 拉取后直接使用

**普通玩家不需要 Node.js、Python 或编译器。** 仓库已经包含完整成品 `ready-to-install/pbz-attack-alerts/`。

1. [下载完整项目 ZIP](https://github.com/Phichuuu/PBZ-Attack-Alerts/archive/refs/heads/main.zip) 并解压，或运行：
   ```powershell
   git clone https://github.com/Phichuuu/PBZ-Attack-Alerts.git
   ```
2. 退出游戏，双击项目中的 **`Install.cmd`**。
3. 根据提示粘贴游戏根目录。可在 Steam 中右键游戏 → 管理 → 浏览本地文件找到；该目录内应有 `ProjectPBZ` 和 `platform`。
4. 安装完成后从 Steam 启动游戏。

安装器会校验成品文件。没有加载器时，会从上游官方 Release 下载已固定版本与 SHA-256 的 PBZModLoader 1.0.2；已有加载器时保留它。首次自动安装需要能访问 GitHub。遇到其他工具占用的代理 DLL 时会停止并说明原因，不覆盖未知 DLL。

已有 MOD 文件被替换前会备份到游戏的 `ProjectPBZ/PBZModLoader/attack-alerts-backups/`。自定义 `settings.js` 会随更新备份，请按需恢复其中的数值。其他 MOD 和现有 `mods.ini` 会保留。

也可以直接下载 [Release 玩家安装包](https://github.com/Phichuuu/PBZ-Attack-Alerts/releases/latest)，解压后运行其中的 `Install.cmd`。安装器不会启动游戏。

### 手动安装 / 离线安装

先安装兼容的 PBZModLoader，然后复制整个 `ready-to-install/pbz-attack-alerts` 文件夹到：

```text
游戏根目录/ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js
```

复制所有文件，不要只复制 `main.js`，也不要留下优先级更高的旧 `main.ts`。若曾在 `mods.ini` 禁用此 MOD，把已有 `[Mods]` 段里的 `pbz-attack-alerts=0` 改为 `1`。更新后支持 **Alt+F5** 热重载。

卸载：退出游戏，将 `mods/pbz-attack-alerts` 文件夹移到 `mods` 外。不需要移除其他 MOD 或整个加载器。

## 效果和覆盖范围

- 原创尖角星芒、白色亮芯、柔光和扩散细环；0.2.1 增强黄光对比，保持原来的大小。
- 提前光圈只检查近距离、朝向玩家且明确以玩家为目标的敌人，读取当前动作条件。
- 光圈表示敌人正在准备攻击，不是保证命中的倒计时；移动、打断、变速和分支会改变结果。
- 亮闪读取游戏提供给玩家的攻击判定，普通近战也能触发。
- 同一攻击去重，连招分开处理，重叠攻击优先红光；暂停、切图和重载会清理显示。
- 不自动招架、不自动闪避，不修改伤害、敌人状态或存档。当前没有提示音。

**仍不支持所有攻击。** 部分投石的原生时间值无效，尚未加入可靠落点提示；抓投、环境伤害和部分 Boss 脚本也未完整验证。红光是建议闪避，特殊武器或技能可能有其他处理方式。

0.2.0 的铁面／金面近战测试中，18 个匹配样本的光圈距游戏预计命中约 **0.42～0.60 秒**。这不是全部敌人的承诺，也不是 0.2.1 的独立实测。0.2.1 的显示调整已做预览和本地回归，实战观感待继续验证。

## 调整参数

编辑已安装 MOD 中的 `settings.js`，保存后按 Alt+F5：

| 参数 | 默认 | 用途 |
| --- | --- | --- |
| `size` | 154 | 显示尺寸（逻辑像素） |
| `heightOffset` | 0 | 胸口位置附加高度 |
| `earlyWindup` | true | 提前收拢光圈 |
| `windupSeconds` | 0.26 | 提前到攻击节点的时间，非命中倒计时 |
| `leadSeconds` | 0.40 | 确认攻击后的亮闪提前上限 |
| `flashSeconds` | 0.32 | 亮闪时长上限 |
| `startupCheck` / `preview` | false | 显示测试，不代表敌人攻击 |
| `combatProbe` | false | 临时详细诊断 |

部分近战到命中前约 0.3 秒才进入原生攻击列表，单独调大 `leadSeconds` 不能凭空增加提前量。

## 开发与复现

需要 **Node.js 22 或更新版本**。源码、测试、图形生成脚本、成品和安装器均在仓库中，不依赖作者电脑上的任何目录。

```powershell
npm ci
npm test
npm run package
```

- `npm ci` 自动获取官方 SDK 0.3.3 并验证固定 SHA-256；无需手动寻找 SDK。下载缓存位于 `.cache/`。
- `npm run check` 严格检查 TypeScript。
- `npm run build` 生成 `dist/`，同步仓库内的 `ready-to-install/` 和逐文件哈希清单。
- `npm test` 构建后运行回归检查，不启动或修改游戏；安装器测试只使用临时模拟目录。
- `npm run package` 运行检查后生成 `release/PBZ-Attack-Alerts-0.2.3-win64.zip` 和校验文件。同名包已存在时拒绝覆盖。
- 自动构建配置位于 `.github/workflows/check.yml`。

SDK 和加载器属于外部依赖，从官方固定来源获取，不随 Git 仓库重新分发。游戏本体不在仓库中，测试桩也不代替实际游戏。

### 修改图形

图形的原始参数在 `scripts/make-flare.py`；现成的 PNG 字节已经嵌入 `src/flare-assets.ts`，通常构建无需 Python。需要重新生成时：

```powershell
python -m pip install -r requirements-art.txt
python scripts/make-flare.py
npm run build
```

### 文件结构

```text
src/                  MOD 完整 TypeScript 源码及内嵌光效
AGENTS.md             其他 Agent 的部署入口
docs/                 Agent 安装、核验、排错和回退流程
scripts/              SDK 获取、构建打包、安装核验、光效生成
art/                  原创光效预览
ready-to-install/     拉取后即可安装的成品及哈希清单
tests/                原生桥接模拟、调度、前奏与安装器测试
types/                本项目额外的类型声明
dependencies.json     官方依赖版本、地址与 SHA-256
```

## 反馈

在 [Issues](https://github.com/Phichuuu/PBZ-Attack-Alerts/issues) 提供游戏/加载器/MOD 版本、敌人名称、漏报或颜色/位置问题的复现步骤。日志位于游戏的 `ProjectPBZ/PBZModLoader/evidence/<本次运行>/loader.log`，筛选 `pbz-attack-alerts` 即可；分享前删去个人路径等无关信息。

## 开源协议与致谢

本项目原创代码与光效按 **GPL-3.0-only** 开源，见 [LICENSE](LICENSE)。依赖和参考资料说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这是非官方 MOD，与游戏开发商及《绝区零》官方无关。
