影之刃零：黄光／红光攻击预警 0.2.3 试用版

0.2.3 新增 Agent 部署指南和只读文件核验；战斗效果沿用 0.2.1。
让其他 Agent 安装请先读取根目录 AGENTS.md 和 docs/AGENT_DEPLOYMENT.md。

0.2.1 黄光辨识度调整
尺寸仍为 154，尖芒的长度和最大放大比例不变。黄色尖芒与亮芯稍微
加厚，加一层柔和暗边区分亮色背景，完整亮度保持约 0.13 秒后淡出。
黄色收拢光圈和前奏星芒更清楚。红光、胸口跟随和攻击预警时机不变。
此版已通过构建与本地回归，预览已检查；游戏内观感尚未重测。

本版变化
- 矩形十字换成自绘尖角星芒，带白色亮芯、柔光和扩散细环。
- 黄色表示可招架，红色表示建议闪避；红光为斜向星芒。
- 光效跟随怪物胸口骨骼；没有可用骨骼时使用身体中心，不再悬在头顶。
- 加入近战前奏：即将进入攻击节点时先显示收拢光圈，游戏确认攻击
  朝玩家打来后再触发完整亮闪。默认关闭启动自检和详细诊断。

提前量与边界
前奏读取正在执行的敌人时间轴，在攻击节点前最多约 0.26 秒开始。
它表示准备发动这一击，不是保证会命中的倒计时；移动、打断、变速和
分支动作会改变结果。仅对近距离、朝向玩家、明确以玩家为目标且满足
当前动作条件的近战显示前奏。不能确认时保留原来的亮闪路径。
亮闪读取玩家 DeflectComponent.ReceiveFrames。默认提前上限 0.40 秒，
实际提前量取决于游戏何时提供数据；已观察的铁面近战多为约 0.3 秒。
调大此参数不会凭空让攻击数据更早可见。
实测铁面／金面近战的 18 个匹配样本：光圈首次显示距游戏预计命中
约 0.42～0.60 秒，用户反馈节奏可以。不能据此保证所有敌人均有相同提前量。
黄／红星芒已确认在游戏中显示；胸口跟随位置尚待实际战斗目视复核。
已通过 29 项本地回归检查。本地检查不等于全游戏实测。

覆盖限制
目前不能保证所有攻击都有提示。部分投石提供无效时间标记，尚未加入
可靠的落点预警；部分抓投、环境伤害、特殊 Boss 招式也待验证。
红光是建议闪避，不保证所有特殊武器或技能都无法化解该招。

安装与启动
依赖 PBZModLoader 1.0.2 或兼容版本（zoneoflkf / LLKKFF）。
来源：https://github.com/zoneoflkf/PBZModLoader/releases
无需 UE4SS，玩家不需要 Node.js。
退出游戏，将包内 pbz-attack-alerts 整个文件夹复制到：
游戏目录/ProjectPBZ/PBZModLoader/mods/
请复制所有文件，不能只复制 main.js。然后从 Steam 正常启动游戏。
已安装加载器时，更新脚本后可回到游戏按 Alt+F5 重载。

调整（安装目录内 settings.js，保存后 Alt+F5）
- size：星芒大小，默认 154；heightOffset：胸口附加高度，默认 0。
- earlyWindup：是否显示提前光圈，默认 true。
- windupSeconds：光圈提前到攻击节点的时间，默认 0.26。
- leadSeconds：亮闪提前上限，默认 0.40；flashSeconds：时长，默认 0.32。
- startupCheck：启动显示自检，默认 false；开启后延迟 5 秒显示 8 秒。
- preview：中央轮流测试黄红光，默认 false。测试光不代表发现攻击。
- combatProbe：详细出招记录，默认 false。

卸载：退出游戏，将 mods/pbz-attack-alerts 文件夹移到 mods 外。
此 MOD 只创建自己的显示层，不执行招架、闪避，不修改伤害或存档。
暂停隐藏，切图和热重载清理自己的显示层。
日志：ProjectPBZ/PBZModLoader/evidence/<本次运行>/loader.log。
搜索 [PBZMOD] pbz-attack-alerts；windup confirmed 记录光圈实测提前量。

参考与素材
https://github.com/visibleLi/PBZ-Forewarn---Sekiro-Style-Danger-Alert
参考活动技能、并行时间轴及只读动作条件的观察方式。
https://github.com/OneDragon-Anything/ZenlessZoneZero-OneDragon
该项目识别已出现的红黄光，不提供 PBZ 出招或原版特效生成代码。
星芒由独立几何绘图生成，没有附带上述项目的源码、模型、音频，
也未提取《绝区零》原版资源。当前没有提示音。

源码 src/；光效生成 scripts/make-flare.py；预览 art/flare-preview.png。
构建：npm.cmd ci，再 npm.cmd run build；测试：node --test tests/*.test.cjs。
