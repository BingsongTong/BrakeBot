(() => {
  window.brakeBot?.stop?.();

  const $ = id => document.getElementById(id);
  const required = [
    "startBtn", "hudSpeed", "hudDistance", "hudTimer",
    "forceValue", "statScore", "result"
  ];
  if (!required.every(id => $(id))) {
    console.error("请在游戏网页运行");
    return;
  }

  // ===== Edge 60 FPS 极限配置 =====
  const STEP = 1 / 120;
  const START_DISTANCE = 297;
  const FORCE_CEIL = 1611.96;
  const LOOK_AHEAD = 3;

  const nativeRAF = window.requestAnimationFrame;
  let active = true;
  let foundGameFrame = false;
  let state = "arming";
  let down = false;
  let lastTS = 0;
  let frameAverage = 1 / 59.3;
  let remainder = 0;
  let brakeTick = 0;
  let modeledForce = 0;
  let modeledHold = 0;
  let modeledPeak = 0;
  let lastAction = "off";

  const val = id => parseFloat($(id).textContent);

  function setKey(pressed) {
    if (pressed === down) return;
    window.dispatchEvent(
      new KeyboardEvent(pressed ? "keydown" : "keyup", {
        code: "Space",
        key: " ",
        bubbles: true,
        cancelable: true
      })
    );
    down = pressed;
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

  function stop() {
    if (!active) return;
    active = false;
    setKey(false);
    if (window.requestAnimationFrame === hookedRAF) {
      window.requestAnimationFrame = nativeRAF;
    }
    console.log("BrakeBot 已停止");
  }

  window.brakeBot = {
    stop,
    status: () => ({
      state,
      fps: +(1 / frameAverage).toFixed(1),
      modeledForce: +modeledForce.toFixed(3),
      maxForce: +modeledPeak.toFixed(3),
      brakeTime: val("hudTimer"),
      distance: val("hudDistance"),
      lastAction
    })
  };

  // 精确计算每一帧的物理步数
  function countSteps(seconds, leftover) {
    let remaining = leftover + seconds;
    let ticks = 0;

    while (remaining >= STEP && ticks < 8) {
      remaining -= STEP;
      ticks++;
    }

    return { ticks, remaining };
  }

  // ===== 三帧预测控制 =====
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
    const options = ["hold", "tap", "off"];

    function search(depth, force, held, reward, first) {
      if (depth === future.length) {
        const value = reward + 2 * force;

        if (value > bestReward) {
          bestReward = value;
          bestAction = first;
        }
        return;
      }

      for (const action of options) {
        let f = force;
        let h = held;
        let rewardHere = 0;
        let safe = true;

        for (let j = 0; j < future[depth]; j++) {
          const pressed =
            action === "hold" ||
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
          search(
            depth + 1,
            f,
            h,
            reward + rewardHere,
            depth === 0 ? action : first
          );
        }
      }
    }

    search(0, modeledForce, modeledHold, 0, "off");
    return bestAction;
  }

  // ===== 游戏每帧执行之前 =====
  function beforeGameFrame(ts) {
    const dt = Math.min(
      0.05,
      Math.max(0, (ts - lastTS) / 1000)
    );

    lastTS = ts;
    frameAverage =
      0.94 * frameAverage + 0.06 * dt;

    const current = countSteps(dt, remainder);
    remainder = current.remaining;

    if (state === "running") {
      if (
        val("hudSpeed") >= 100 &&
        val("hudDistance") <= START_DISTANCE
      ) {
        state = "braking";
        brakeTick = 0;
        modeledForce = 0;
        modeledHold = 0;
        modeledPeak = 0;

        applyAction("hold");

        console.log(
          "开始制动：",
          val("hudSpeed"), "km/h；距路障",
          val("hudDistance"), "米；FPS",
          (1 / frameAverage).toFixed(1)
        );
      }

    } else if (state === "braking") {
      if (current.ticks > 0) {
        applyAction(chooseAction(current.ticks));
      }
    }
  }

  // ===== 游戏每帧执行之后 =====
  function afterGameFrame() {
    if (state === "braking") {
      const nowTick = Math.round(
        val("hudTimer") * 120
      );
      const advance = nowTick - brakeTick;

      if (advance > 0 && advance <= 6) {
        for (let i = 0; i < advance; i++) {
          const pressed =
            lastAction === "hold" ||
            (lastAction === "tap" && i === 0);

          if (pressed) {
            modeledHold += STEP;
            modeledForce +=
              (200 + 800 * modeledHold) * STEP;
          } else {
            modeledHold = 0;
            modeledForce = Math.max(
              0,
              modeledForce - 900 * STEP
            );
          }

          modeledPeak = Math.max(
            modeledPeak,
            modeledForce
          );
        }

        brakeTick = nowTick;

        // 检查模拟状态是否仍与实际游戏同步
        const error = Math.abs(
          Math.round(modeledForce) -
          val("forceValue")
        );

        if (error > 1) {
          console.warn(
            "模型不同步，自动停止以避免踩断踏板"
          );
          stop();
          return;
        }

      } else if (advance > 6 || advance < 0) {
        console.warn("物理计时异常，停止自动控制");
        stop();
        return;
      }

      if (
        val("hudSpeed") === 0 &&
        brakeTick > 0
      ) {
        state = "finishing";
        applyAction("off");
      }
    }

    if (!$("result").classList.contains("hidden")) {
      console.log(
        "网页最终得分：",
        val("statScore")
      );
      console.log(
        "估计最大踏板力：",
        modeledPeak.toFixed(3), "N"
      );
      stop();
    }
  }

  // ===== 挂接游戏动画回调 =====
  function isGameCallback(fn) {
    if (fn.name === "H_") return true;

    const source =
      Function.prototype.toString.call(fn);

    return (
      source.includes("requestAnimationFrame(") &&
      /Math\.min\(\s*(?:0)?\.05/.test(source)
    );
  }

  function hookedRAF(callback) {
    if (!isGameCallback(callback)) {
      return nativeRAF.call(window, callback);
    }

    foundGameFrame = true;

    return nativeRAF.call(window, ts => {
      if (!active) {
        callback(ts);
        return;
      }

      try {
        if (state === "arming") {
          callback(ts);

          // 与游戏自身的物理时钟同步
          lastTS = ts;
          remainder = 0;
          state = "running";

          $("startBtn").click();

          console.log(
            "BrakeBot 已启动：Edge 60 FPS 专用控制器"
          );
          return;
        }

        beforeGameFrame(ts);
        callback(ts);
        afterGameFrame();

      } catch (error) {
        console.error("BrakeBot 运行出错：", error);
        stop();
      }
    });
  }

  window.requestAnimationFrame = hookedRAF;

  setTimeout(() => {
    if (active && !foundGameFrame) {
      console.error(
        "未找到游戏动画循环，请刷新页面重试"
      );
      stop();
    }
  }, 2500);
})();
