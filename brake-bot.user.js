// ==UserScript==
// @name         BrakeBot - Auto Braking
// @name:zh-CN   BrakeBot - 自动极限刹车
// @namespace    https://github.com/BingsongTong/BrakeBot
// @version      1.1.0
// @description  Auto-run predictive braking with an on-page control panel.
// @description:zh-CN  自动起跑、预测点刹及网页内控制面板。
// @author       Bingsong Tong
// @match        https://brake.tp0k.us/*
// @run-at       document-start
// @noframes
// @grant        none
// @sandbox      raw
// @license      MIT
// @homepageURL  https://github.com/BingsongTong/BrakeBot
// @supportURL   https://github.com/BingsongTong/BrakeBot/issues
// @downloadURL  https://raw.githubusercontent.com/BingsongTong/BrakeBot/main/brake-bot.user.js
// @updateURL    https://raw.githubusercontent.com/BingsongTong/BrakeBot/main/brake-bot.user.js
// ==/UserScript==

(() => {
  "use strict";

  // The hook must be installed before the game schedules its animation loop.
  // This is a browser-side helper: it does not modify the game or submit scores.
  if (window.__BrakeBotUserScript) return;

  const originalRAF = window.requestAnimationFrame;
  if (typeof originalRAF !== "function") return;

  const STEP = 1 / 120;
  const FORCE_CEIL = 1611.96;
  const LOOK_AHEAD = 3;
  const BREAK_FORCE = 1612;
  const STORAGE_KEY = "brakebot:userscript:v1";

  const $ = id => document.getElementById(id);
  const number = id => parseFloat($(id)?.textContent ?? "NaN");

  const prefs = { autoStart: true, startDistance: 297 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (typeof saved.autoStart === "boolean") prefs.autoStart = saved.autoStart;
    if (Number.isInteger(saved.startDistance) &&
        saved.startDistance >= 295 && saved.startDistance <= 360) {
      prefs.startDistance = saved.startDistance;
    }
  } catch (_) {
    // Storage may be unavailable in privacy-restricted browser sessions.
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  let state = "loading";
  let statusNote = "";
  let foundGameLoop = false;
  let gameReady = false;
  let keyDown = false;
  let lastTimestamp = null;
  let frameAverage = 1 / 59.3;
  let remainder = 0;
  let brakeTick = 0;
  let modeledForce = 0;
  let modeledHold = 0;
  let modeledPeak = 0;
  let lastAction = "off";
  let lastScore = null;
  let frameCount = 0;
  let shadow = null;

  function available() {
    return [
      "startBtn", "hudSpeed", "hudDistance", "hudTimer",
      "forceValue", "result", "statScore"
    ].every(id => Boolean($(id)));
  }

  function setKey(pressed) {
    if (pressed === keyDown) return;
    window.dispatchEvent(new KeyboardEvent(pressed ? "keydown" : "keyup", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true
    }));
    keyDown = pressed;
  }

  function applyAction(action) {
    if (action === "tap") {
      setKey(false);
      setKey(true);
      setKey(false);
    } else {
      setKey(action === "hold");
    }
    lastAction = action;
  }

  function pause(note) {
    applyAction("off");
    if (state !== "done") state = "paused";
    statusNote = note || "已停止 / Stopped";
    updatePanel();
  }

  function startRound() {
    if (!gameReady || !available()) {
      statusNote = "等待游戏加载 / Waiting for game";
      updatePanel();
      return false;
    }
    if (document.hidden) {
      statusNote = "请切回游戏标签页 / Focus the game tab";
      updatePanel();
      return false;
    }

    applyAction("off");
    brakeTick = 0;
    modeledForce = 0;
    modeledHold = 0;
    modeledPeak = 0;
    lastAction = "off";
    lastScore = null;
    statusNote = "";
    state = "running";
    $("startBtn").click();
    updatePanel();
    console.info("[BrakeBot] Round started. Brake at", prefs.startDistance, "m.");
    return true;
  }

  function countSteps(seconds, leftover) {
    let remaining = leftover + seconds;
    let ticks = 0;
    while (remaining >= STEP && ticks < 8) {
      remaining -= STEP;
      ticks++;
    }
    return { ticks, remaining };
  }

  // Same three-frame predictive braking policy as brake-bot.js.
  function chooseAction(stepsNow) {
    const future = [stepsNow];
    let carry = remainder;

    for (let i = 1; i < LOOK_AHEAD; i++) {
      const p = countSteps(frameAverage, carry);
      future.push(p.ticks);
      carry = p.remaining;
    }

    let bestReward = -Infinity;
    let bestAction = "off";

    function search(depth, force, held, reward, first) {
      if (depth === future.length) {
        const value = reward + 2 * force;
        if (value > bestReward) {
          bestReward = value;
          bestAction = first;
        }
        return;
      }

      for (const action of ["hold", "tap", "off"]) {
        let f = force;
        let h = held;
        let rewardHere = 0;
        let safe = true;

        for (let j = 0; j < future[depth]; j++) {
          const pressed = action === "hold" ||
            (action === "tap" && j === 0);
          if (pressed) {
            h += STEP;
            f += (200 + 800 * h) * STEP;
            if (f >= FORCE_CEIL) {
              safe = false;
              break;
            }
          } else {
            h = 0;
            f = Math.max(0, f - 900 * STEP);
          }
          rewardHere += f;
        }

        if (safe) {
          search(depth + 1, f, h, reward + rewardHere,
            depth === 0 ? action : first);
        }
      }
    }

    search(0, modeledForce, modeledHold, 0, "off");
    return bestAction;
  }

  function beforeGameFrame(ts) {
    const dt = lastTimestamp === null
      ? 1 / 59.3
      : Math.min(0.05, Math.max(0, (ts - lastTimestamp) / 1000));
    lastTimestamp = ts;
    frameAverage = 0.94 * frameAverage + 0.06 * dt;

    const current = countSteps(dt, remainder);
    remainder = current.remaining;

    if (state === "running") {
      if (number("hudSpeed") >= 100 &&
          number("hudDistance") <= prefs.startDistance) {
        state = "braking";
        brakeTick = 0;
        modeledForce = 0;
        modeledHold = 0;
        modeledPeak = 0;
        applyAction("hold");
        console.info("[BrakeBot] Braking:", number("hudSpeed"),
          "km/h;", number("hudDistance"), "m;",
          (1 / frameAverage).toFixed(1), "FPS");
      }
    } else if (state === "braking" && current.ticks > 0) {
      applyAction(chooseAction(current.ticks));
    }
  }

  function afterGameFrame() {
    if (state === "braking") {
      const nowTick = Math.round(number("hudTimer") * 120);
      const advanced = nowTick - brakeTick;

      if (!Number.isFinite(advanced) || advanced < 0 || advanced > 6) {
        pause("计时不同步 / Timing desynchronized");
        console.warn("[BrakeBot] Unexpected physics tick count:", advanced);
        return;
      }

      if (advanced > 0) {
        for (let i = 0; i < advanced; i++) {
          const pressed = lastAction === "hold" ||
            (lastAction === "tap" && i === 0);

          if (pressed) {
            modeledHold += STEP;
            modeledForce += (200 + 800 * modeledHold) * STEP;
          } else {
            modeledHold = 0;
            modeledForce = Math.max(0, modeledForce - 900 * STEP);
          }
          modeledPeak = Math.max(modeledPeak, modeledForce);
        }
        brakeTick = nowTick;

        if (Math.abs(Math.round(modeledForce) - number("forceValue")) > 1) {
          pause("踏板力不同步 / Pedal force desynchronized");
          console.warn("[BrakeBot] Force prediction mismatch; released brake.");
          return;
        }
      }

      if (number("hudSpeed") === 0 && brakeTick > 0) {
        state = "finishing";
        applyAction("off");
      }
    }

    if (["running", "braking", "finishing"].includes(state) &&
        !$("result").classList.contains("hidden")) {
      lastScore = number("statScore");
      state = "done";
      applyAction("off");
      statusNote = lastScore > 0
        ? "刹停成功 / Finished"
        : "本局未成功 / Run failed";
      console.info("[BrakeBot] Score:", lastScore,
        "| estimated peak force:", modeledPeak.toFixed(3), "N");
      updatePanel();
    }

    if (++frameCount % 8 === 0) updatePanel();
  }

  function stateName() {
    const labels = {
      loading: "等待加载 / Loading",
      idle: "就绪 / Ready",
      running: "加速中 / Accelerating",
      braking: "自动刹车 / Braking",
      finishing: "等待结算 / Finishing",
      done: "已结算 / Completed",
      paused: "已停止 / Paused",
      error: "无法接入 / Hook unavailable"
    };
    return labels[state] || state;
  }

  function updatePanel() {
    if (!shadow) return;
    shadow.getElementById("bb-state").textContent =
      statusNote || stateName();
    shadow.getElementById("bb-fps").textContent =
      Number.isFinite(frameAverage) && frameAverage > 0
        ? (1 / frameAverage).toFixed(1) + " FPS" : "--";
    shadow.getElementById("bb-score").textContent =
      Number.isFinite(lastScore) ? lastScore.toLocaleString("en-US") : "--";
    shadow.getElementById("bb-auto").textContent =
      prefs.autoStart ? "自动启动：开 / Auto ON" : "自动启动：关 / Auto OFF";
    shadow.getElementById("bb-auto").setAttribute(
      "aria-pressed", String(prefs.autoStart));
    const distanceInput = shadow.getElementById("bb-distance");
    if (document.activeElement !== distanceInput &&
        shadow.activeElement !== distanceInput) {
      distanceInput.value = String(prefs.startDistance);
    }
  }

  function mountPanel() {
    if (shadow || !document.body) return;

    const host = document.createElement("div");
    host.id = "brakebot-control-panel";
    host.style.cssText = "position:fixed;right:12px;top:12px;" +
      "z-index:2147483647;pointer-events:auto;";
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = [
      "<style>",
      ":host{all:initial;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;}",
      ".bb{width:250px;box-sizing:border-box;padding:12px;border-radius:12px;",
      "background:rgba(18,23,34,.95);color:#f2f4f8;border:1px solid #4b5363;",
      "box-shadow:0 8px 30px rgba(0,0,0,.4);font-size:12px;line-height:1.5;}",
      ".top{display:flex;justify-content:space-between;align-items:center;gap:8px;}",
      "strong{font-size:16px;letter-spacing:.2px}.sub{color:#c4cbd8}",
      ".stats{display:flex;justify-content:space-between;gap:8px;margin:8px 0;}",
      ".stats span{font-variant-numeric:tabular-nums;}",
      ".actions{display:flex;gap:7px;margin-top:8px;}",
      "button,input{font:inherit;border-radius:7px;box-sizing:border-box;}",
      "button{cursor:pointer;padding:7px 9px;border:1px solid #616b7d;",
      "background:#2a3447;color:#fff;}",
      "button:focus-visible,input:focus-visible{outline:2px solid #96c7ff;}",
      ".primary{background:#1761b2;border-color:#3382d1;flex:1;}",
      ".stop{flex:1}.auto{width:100%;margin:8px 0 6px;}",
      ".range{display:flex;align-items:center;justify-content:space-between;gap:6px;}",
      "input{width:68px;padding:5px;border:1px solid #667085;",
      "background:#131923;color:white;text-align:center;}",
      ".hint{color:#aeb8cb;margin-top:7px;font-size:11px;}",
      "#bb-body[hidden]{display:none}.collapse{padding:2px 8px;}",
      "@media(max-width:500px){.bb{width:210px;padding:9px}}",
      "</style>",
      "<section class='bb' aria-label='BrakeBot controls'>",
      "<div class='top'><strong>BrakeBot</strong>",
      "<button id='bb-collapse' class='collapse' title='Collapse / 折叠'>−</button></div>",
      "<div id='bb-body'>",
      "<div class='sub' id='bb-state' aria-live='polite'>Loading...</div>",
      "<div class='stats'><span id='bb-fps'>--</span>",
      "<span>Score: <b id='bb-score'>--</b></span></div>",
      "<button id='bb-auto' class='auto' type='button'></button>",
      "<label class='range'>起刹距离 / Brake at (m)",
      "<input id='bb-distance' type='number' min='295' max='360' step='1' value='297'></label>",
      "<div class='actions'><button id='bb-start' class='primary' type='button'>开始 / 重试</button>",
      "<button id='bb-stop' class='stop' type='button'>停止 / Stop</button></div>",
      "<div class='hint'>Auto-start runs once per page load. No leaderboard submission.</div>",
      "</div></section>"
    ].join("");

    shadow.getElementById("bb-start").addEventListener("click", startRound);
    shadow.getElementById("bb-stop").addEventListener("click", () => {
      pause("手动停止 / Stopped manually");
    });
    shadow.getElementById("bb-auto").addEventListener("click", () => {
      prefs.autoStart = !prefs.autoStart;
      savePrefs();
      if (!prefs.autoStart &&
          ["running", "braking"].includes(state)) {
        pause("自动运行已关闭 / Automation disabled");
      } else if (prefs.autoStart && gameReady &&
          ["idle", "paused", "done"].includes(state)) {
        startRound();
      }
      updatePanel();
    });
    shadow.getElementById("bb-distance").addEventListener("change", event => {
      const value = Number(event.target.value);
      if (Number.isInteger(value) && value >= 295 && value <= 360) {
        prefs.startDistance = value;
        savePrefs();
      }
      updatePanel();
    });
    shadow.getElementById("bb-collapse").addEventListener("click", event => {
      const body = shadow.getElementById("bb-body");
      body.hidden = !body.hidden;
      event.target.textContent = body.hidden ? "+" : "−";
      event.target.setAttribute("aria-expanded", String(!body.hidden));
    });

    updatePanel();
  }

  if (document.body) mountPanel();
  else {
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        mountPanel();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", mountPanel, { once: true });
  }

  function isGameCallback(fn) {
    if (typeof fn !== "function") return false;
    if (fn.name === "H_") return true;
    const source = Function.prototype.toString.call(fn);
    return source.includes("requestAnimationFrame(") &&
      /Math\.min\(\s*(?:0)?\.05/.test(source);
  }

  // The user's existing manual script uses the same public control methods.
  window.brakeBot = {
    start: startRound,
    stop: () => pause("手动停止 / Stopped manually"),
    status: () => ({
      state,
      autoStart: prefs.autoStart,
      startDistance: prefs.startDistance,
      fps: +(1 / frameAverage).toFixed(1),
      modeledForce: +modeledForce.toFixed(3),
      maxForce: +modeledPeak.toFixed(3),
      elapsed: number("hudTimer"),
      remainingDistance: number("hudDistance"),
      lastAction,
      score: lastScore
    })
  };
  window.__BrakeBotUserScript = window.brakeBot;

  function onGameFrame(ts, callback) {
    if (!gameReady) {
      callback(ts);
      lastTimestamp = ts;
      remainder = 0;
      gameReady = true;
      state = "idle";
      updatePanel();
      if (prefs.autoStart) startRound();
      return;
    }

    try {
      beforeGameFrame(ts);
    } catch (error) {
      console.error("[BrakeBot] Controller pre-frame error:", error);
      pause("控制器异常 / Controller error");
    }

    // Preserve the game's normal physics, rendering, and score calculation.
    callback(ts);

    try {
      afterGameFrame();
    } catch (error) {
      console.error("[BrakeBot] Controller post-frame error:", error);
      pause("控制器异常 / Controller error");
    }
  }

  function interceptedRAF(callback) {
    if (!isGameCallback(callback)) {
      return originalRAF.call(window, callback);
    }
    foundGameLoop = true;
    return originalRAF.call(window, ts => onGameFrame(ts, callback));
  }

  window.requestAnimationFrame = interceptedRAF;

  window.addEventListener("blur", () => {
    keyDown = false;
    if (["running", "braking"].includes(state)) {
      pause("失去焦点 / Window unfocused");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && ["running", "braking"].includes(state)) {
      pause("页面已隐藏 / Page hidden");
    }
  });

  setTimeout(() => {
    if (!foundGameLoop) {
      state = "error";
      statusNote = "未识别游戏循环：刷新页面 / Reload page";
      updatePanel();
      console.warn("[BrakeBot] Could not hook game RAF. Reload with Tampermonkey enabled.");
    }
  }, 8000);
})();