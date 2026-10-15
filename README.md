# BrakeBot

**Automatic braking for [Extreme Braking Challenge](https://brake.tp0k.us/) — Tampermonkey userscript or browser console.**  
**适用于[极限刹车挑战](https://brake.tp0k.us/)的自动刹车工具：支持油猴自动注入或控制台手动运行。**

[简体中文](#简体中文) · [English](#english)

**[🚀 一键安装 / Install BrakeBot userscript](https://raw.githubusercontent.com/BingsongTong/BrakeBot/main/brake-bot.user.js)** — Edge + Tampermonkey, no F12 required.


![BrakeBot 实测 9117 分 / A 9,117-point BrakeBot run](assets/high-score-9117.webp)

> **Best demonstrated successful run / 目前展示的最高成功成绩：9,117 points（分）**  
> This is an actual in-game result, not a world-record claim or proof of leaderboard submission.  
> 这是游戏内实测成功成绩，并非全球最高分声明，也不代表已提交排行榜。

| 指标 / Metric | 实测结果 / Observed result |
|:--|--:|
| 得分 / Score | **9,117** |
| 起刹速度 / Initial braking speed | 259.3 km/h |
| 刹停时间 / Stopping time | 7.375 s |
| 制动距离 / Braking distance | 295.6 m |
| 最大显示踏板力 / Max *displayed* pedal force | 1,612 N |

> 旧成绩 / Previous run: [9,107 分截图 / 9,107-point screenshot](assets/high-score-9107.png)。新版主图为实测截图的裁剪展示 / The new featured image is cropped from the actual in-game screenshot for readability.

> **关于 1612 N / About 1,612 N:** The game rounds the displayed force to an integer. A successful run can display 1,612 N even when the internal force remains below the actual break threshold.  
> 游戏会将显示的踏板力四舍五入为整数，所以成功刹停时画面显示 1612 N，并不代表内部真实踏板力已达到断裂阈值。

---

## 简体中文

### 项目介绍

BrakeBot 是为游戏 [极限刹车挑战](https://brake.tp0k.us/) 编写的自动刹车控制器，提供**打开网页即运行的 Tampermonkey 油猴脚本**和传统控制台脚本，主要按 **Microsoft Edge 约 55–60 FPS** 的运行条件调试。

脚本通过模拟空格键控制游戏中的刹车，**不直接修改成绩、不篡改游戏物理计算、也不会自动提交排行榜**。它是非官方的社区项目，与游戏作者没有隶属关系。

### 一键安装（推荐：无需 F12）

1. 在 Edge 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 如 Tampermonkey 提示缺少执行权限，请到 `edge://extensions` 开启**开发人员模式**，并检查扩展设置中的用户脚本权限。参见 [Tampermonkey 官方说明](https://www.tampermonkey.net/faq.php?q=Q209)。
3. 点击 **[安装 BrakeBot 油猴脚本](https://raw.githubusercontent.com/BingsongTong/BrakeBot/main/brake-bot.user.js)**，在 Tampermonkey 的安装确认页点击安装。如果浏览器仅显示源代码，可在 Tampermonkey 的新建脚本窗口中复制 [`brake-bot.user.js`](brake-bot.user.js) 的内容并保存。
4. 打开或刷新 <https://brake.tp0k.us/>。BrakeBot 会**自动加载并开始一局**，不必打开控制台；右上角面板可停止、重试、开关自动启动及设置起刹距离。

默认在距路障 **297 米**时开始刹车，这是高风险设置。帧率不稳定时可在面板改为 **305 米或以上**。设置保存在该游戏站点的浏览器本地存储中。

油猴版只在浏览器本地注入控制逻辑，**不会修改游戏服务器的源码或成绩，不会自动提交排行榜**。默认每次加载页面只自动开始**一局**；后续可点击“开始 / 重试”。

**提示：**请勿同时运行油猴版和控制台版，避免双重控制。

### 控制台运行（兼容方式）

1. 使用 **Microsoft Edge** 打开 <https://brake.tp0k.us/>。
2. 按 **F12** 打开开发者工具，切换至 **Console（控制台）**。
3. 打开本仓库中的 [`brake-bot.js`](brake-bot.js)，复制**完整代码**并粘贴到控制台，按回车执行。如果 Edge 阻止粘贴，请先阅读浏览器提示并确认代码来源可信。
4. 脚本会自动开始一局，判断起刹时机，并控制连续踩刹与短按点刹。运行过程中尽量保持游戏标签页在前台。

需要手动终止时，在控制台执行：

```javascript
brakeBot.stop();
```

查看控制器运行状态：

```javascript
brakeBot.status();
```

如果需要反复测试，建议每次运行前刷新页面，避免旧的动画帧挂钩残留。

### 工作原理

油猴版的控制策略与控制台版一致，均使用三帧预测；此外还提供自动启动与网页内控制面板。


- **物理步数估计：** 根据浏览器帧时间，估计游戏以约 120 Hz 更新的物理模拟步数。
- **三帧前瞻：** 在 `hold`（持续踩）、`tap`（短按）和 `off`（松开）之间搜索，使预测的累计制动力尽可能高。
- **踏板保护：** 预测施力不超过设定上限，尝试贴近游戏 1612 N 的断裂阈值。
- **数据校验：** 对比模型预测和游戏 HUD 的踏板力读数；误差过大时自动停止控制。

主要参数位于 [`brake-bot.js`](brake-bot.js) 文件顶部：

```javascript
const STEP = 1 / 120;        // 游戏物理模拟步长（秒）
const START_DISTANCE = 297; // 距障碍物多少米开始刹车
const FORCE_CEIL = 1611.96; // 预测的踏板力安全上限（N）
const LOOK_AHEAD = 3;       // 前瞻帧数
```

**注意：** `START_DISTANCE = 297` 属于激进设置，刹车距离余量很小。如遇到帧率下降或撞击障碍物，可尝试调整为 **305 米或更大**；这仅增加安全距离，不保证得分上升。

### 限制与注意事项

- 脚本依赖游戏页面当前的 DOM ID、动画回调及物理规则；游戏更新后可能失效。
- HUD 的车速、距离和踏板力会被四舍五入；不同 FPS、硬件负载和浏览器调度会影响实际成绩。
- 9117 分是一次成功实测，不保证每次达到，也不是理论上限。
- 请自行核对游戏规则，确认是否允许使用自动化工具及是否允许将相关成绩提交排行榜。

### 项目文件

```text
BrakeBot/
├── README.md
├── brake-bot.js
├── brake-bot.user.js
├── assets/
│   ├── high-score-9117.webp
│   └── high-score-9107.png
├── CHANGELOG.md
├── .gitignore
└── LICENSE
```

### 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

Copyright (c) 2026 Bingsong Tong

---

## English

### Overview

BrakeBot is a predictive braking controller for [Extreme Braking Challenge](https://brake.tp0k.us/). Use it as an **auto-injected Tampermonkey userscript** or as a browser-console script, primarily tuned for **Microsoft Edge at approximately 55–60 FPS**.

It simulates the spacebar to control braking. It **does not directly change scores, bypass the game's physics, or automatically submit leaderboard entries**. This is an unofficial community project and is not affiliated with the game developer.

### One-click installation (recommended: no F12)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Microsoft Edge.
2. If Tampermonkey says userscript execution is blocked, enable **Developer Mode** at `edge://extensions` and check the extension's userscript permissions. See [Tampermonkey's official FAQ](https://www.tampermonkey.net/faq.php?q=Q209).
3. Click **[Install BrakeBot userscript](https://raw.githubusercontent.com/BingsongTong/BrakeBot/main/brake-bot.user.js)** and confirm installation in Tampermonkey. If the browser just displays the source, create a new script in Tampermonkey, paste the contents of [`brake-bot.user.js`](brake-bot.user.js), and save it.
4. Open or refresh <https://brake.tp0k.us/>. The script **loads automatically and starts one round**. Use the top-right panel to stop, retry, toggle automatic start, or change the braking distance.

The default **297 m** braking point is aggressive. If your frame rate fluctuates, raise it to **305 m or more** in the on-page panel. The preference is saved locally in your browser for the game site.

The userscript runs **in your browser only**. It does **not** modify the game's server code, forge scores, or submit leaderboard entries. It auto-starts **one round per page load**; retry subsequent runs using the panel.

**Do not run the userscript and console script simultaneously**, as their input controllers can conflict.

### Console method (alternative)

1. Open <https://brake.tp0k.us/> in **Microsoft Edge**.
2. Press **F12**, then select the **Console** tab in Developer Tools.
3. Open [`brake-bot.js`](brake-bot.js), copy the **entire script**, paste it into the console, and press Enter. If Edge blocks pasting, read its warning and verify that you trust the code before proceeding.
4. The script starts a new run, selects the braking point, and controls the brake automatically. Keep the game tab in the foreground for more consistent timing.

To stop the controller:

```javascript
brakeBot.stop();
```

To inspect its current status:

```javascript
brakeBot.status();
```

Refresh the page before repeated attempts if an earlier animation hook may still be active.

### How it works

The Tampermonkey and console variants use the same three-frame prediction policy; the userscript adds automatic startup and an on-page control panel.


- **Physics-step estimation:** estimates the number of approximately 120 Hz simulation steps executed during a browser animation frame.
- **Three-frame lookahead:** searches `hold`, `tap`, and `off` actions to maximize predicted cumulative braking force.
- **Pedal protection:** predicts the braking force and tries to stay below the game's 1,612 N pedal-break threshold.
- **HUD validation:** compares estimated pedal force against the on-screen value and stops controlling if they diverge significantly.

Key parameters near the top of [`brake-bot.js`](brake-bot.js):

```javascript
const STEP = 1 / 120;        // Physics step in seconds
const START_DISTANCE = 297; // Start braking at this distance (m)
const FORCE_CEIL = 1611.96; // Predicted pedal-force ceiling (N)
const LOOK_AHEAD = 3;       // Number of frames to look ahead
```

**Warning:** `START_DISTANCE = 297` is an aggressive setting with very little stopping margin. If you experience low FPS or barrier collisions, try **305 m or more**. Starting earlier creates more stopping room; it does not directly raise your score.

### Limitations and fair use

- The controller depends on the current page's DOM IDs, animation callback, and game rules; site updates may break it.
- The HUD rounds speed, distance, and force values. FPS, hardware load, and browser scheduling can all change the result.
- The 9,117-point screenshot documents one successful run, not a guaranteed score or theoretical maximum.
- Review the game's rules before using automation or submitting automatically assisted results to its leaderboard.

### Repository contents

```text
BrakeBot/
├── README.md
├── brake-bot.js
├── brake-bot.user.js
├── assets/
│   ├── high-score-9117.webp
│   └── high-score-9107.png
├── CHANGELOG.md
├── .gitignore
└── LICENSE
```

### License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Bingsong Tong
