/**
 * oml2d-chat.js
 * Chieko3020 Blog — oh-my-live2d 看板娘增强模块
 * 提供：聊天(DeepSeek) / 随机表情 / 拍照下载 三个能力，并通过 oml2d 菜单按钮触发。
 *
 * 依赖：oh-my-live2d (window.__oml2d 实例，由 oml2d 的 then 回调注入)
 * 用法：页面 <body> 末尾引入本文件即可。
 */
(function () {
  "use strict";

  const API_BASE = "https://chat.chieko3020.xyz";
  const CHAT_API = API_BASE + "/api/chat";
  const TOKEN_API = API_BASE + "/api/token";
  const STORE_KEY = "oml2d-chat-history";

  // ---- 图标注入：给 oml2d 的 SVG sprite 追加自定义 symbol ----
  const CUSTOM_ICONS = [
    {
      id: "icon-chat",
      viewBox: "0 0 1024 1024",
      path: "M512 128c-212 0-384 154-384 344 0 78 30 150 82 208-10 52-38 100-70 132-10 10-2 26 12 24 58-8 114-38 150-72 66 22 139 36 210 36 212 0 384-154 384-328S724 128 512 128z m-64 384a32 32 0 1 1 0-64 32 32 0 0 1 0 64z m128 0a32 32 0 1 1 0-64 32 32 0 0 1 0 64z m128 0a32 32 0 1 1 0-64 32 32 0 0 1 0 64z",
    },
    {
      id: "icon-expression",
      viewBox: "0 0 1024 1024",
      path: "M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896z m0 128a320 320 0 1 1 0 640 320 320 0 0 1 0-640zM352 448a48 48 0 1 0 0-96 48 48 0 0 0 0 96z m320 0a48 48 0 1 0 0-96 48 48 0 0 0 0 96z m-160 224c-74 0-139-40-172-99l-6-11 62-33 5 10c19 35 62 61 111 61s92-26 111-61l5-10 62 33-6 11c-33 59-98 99-172 99z",
    },
    {
      id: "icon-photo",
      viewBox: "0 0 1024 1024",
      path: "M384 128l-64 96H192c-53 0-96 43-96 96v448c0 53 43 96 96 96h640c53 0 96-43 96-96V320c0-53-43-96-96-96h-128l-64-96H384z m128 256c106 0 192 86 192 192s-86 192-192 192-192-86-192-192 86-192 192-192z m0 96c-53 0-96 43-96 96s43 96 96 96 96-43 96-96-43-96-96-96z",
    },
  ];

  function injectIcons() {
    const tryInject = () => {
      // oml2d 把 sprite svg 注入 body 首个子元素，内含 icon-rest symbol
      const svgs = document.querySelectorAll("body svg[aria-hidden='true']");
      for (const svg of svgs) {
        if (!svg.querySelector("#icon-rest")) continue;
        let changed = false;
        for (const icon of CUSTOM_ICONS) {
          if (svg.querySelector("#" + icon.id)) continue;
          const sym = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "symbol"
          );
          sym.id = icon.id;
          sym.setAttribute("viewBox", icon.viewBox);
          const p = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );
          p.setAttribute("d", icon.path);
          sym.appendChild(p);
          svg.appendChild(sym);
          changed = true;
        }
        if (changed) return true;
      }
      return false;
    };
    // 多次尝试直到 sprite 出现
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (tryInject() || tries > 30) clearInterval(timer);
    }, 300);
  }

  // ---- 聊天状态 ----
  let oml2d = null; // 主实例引用
  let token = null;
  let tokenExpiry = 0;
  let chatHistory = [];
  let isWaiting = false;
  let bubbleEl = null;

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) chatHistory = JSON.parse(raw);
    } catch (_) {}
  }
  function saveHistory() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(chatHistory));
    } catch (_) {}
  }

  async function getToken() {
    if (token && Date.now() < tokenExpiry - 60000) return token;
    try {
      const resp = await fetch(TOKEN_API, { credentials: "omit" });
      if (!resp.ok) throw new Error("token fetch failed: " + resp.status);
      const data = await resp.json();
      token = data.token;
      tokenExpiry = Date.now() + (data.expires_in || 1800) * 1000;
      return token;
    } catch (err) {
      console.error("[oml2d-chat] 获取 token 失败:", err.message);
      return null;
    }
  }

  // 当前展示的模型（0=March7th 三月七, 1=EverNight 长夜月）
  function currentModelName() {
    try {
      const idx = oml2d ? oml2d.modelIndex : 0;
      return idx === 1 ? "evernight" : "march7th";
    } catch (_) {
      return "march7th";
    }
  }

  function notify(text, duration) {
    try {
      // 优先 oml2d 气泡（tips 组件真实挂载时显示在模型上方）
      const t = oml2d && oml2d.tips;
      if (t && typeof t.showMessage === "function") {
        t.showMessage(text, duration || 5000, 5);
        return;
      }
      if (oml2d && typeof oml2d.tipsMessage === "function") {
        oml2d.tipsMessage(text, duration || 5000, 5);
        return;
      }
    } catch (_) {}
    // 回退：聊天气泡内提示
    const box = document.getElementById("oml2d-chat-msg");
    if (box) {
      box.textContent = text;
      box.style.display = "block";
      setTimeout(() => (box.style.display = "none"), duration || 5000);
    }
  }

  async function sendMessage(message) {
    const t = await getToken();
    if (!t) {
      notify("唔…我现在连接不上，等一下再试试？", 5000);
      return;
    }
    const historySlice = chatHistory.slice(-8);
    try {
      const resp = await fetch(CHAT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t,
        },
        body: JSON.stringify({
          message,
          history: historySlice,
          model: currentModelName(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        notify(data.message || "出错了…待会再试吧~", 5000);
        return;
      }
      notify(data.reply, 10000);
      chatHistory.push({ role: "user", content: message });
      chatHistory.push({ role: "assistant", content: data.reply });
      if (chatHistory.length > 14) chatHistory = chatHistory.slice(-14);
      saveHistory();
    } catch (err) {
      console.error("[oml2d-chat] 发送失败:", err.message);
      notify("呜呜，网络不太好…再试一次？", 5000);
    }
  }

  function buildChatUI() {
    const old = document.getElementById("oml2d-chat-panel");
    if (old) old.remove();
    bubbleEl = document.createElement("div");
    bubbleEl.id = "oml2d-chat-panel";
    bubbleEl.innerHTML =
      '<div class="oml2d-chat-head">和看板娘聊天<button id="oml2d-chat-close" title="关闭">×</button></div>' +
      '<div class="oml2d-chat-body"><div id="oml2d-chat-msg"></div>' +
      '<textarea id="oml2d-chat-input" placeholder="说点什么吧~" rows="2" maxlength="1000"></textarea>' +
      '<div class="oml2d-chat-actions"><button id="oml2d-chat-clear" title="清除对话">🗑</button>' +
      '<button id="oml2d-chat-send">发送 ✈</button></div></div>';
    document.body.appendChild(bubbleEl);

    const input = document.getElementById("oml2d-chat-input");
    const sendBtn = document.getElementById("oml2d-chat-send");
    const clearBtn = document.getElementById("oml2d-chat-clear");
    const closeBtn = document.getElementById("oml2d-chat-close");
    const msgBox = document.getElementById("oml2d-chat-msg");

    function doSend() {
      const msg = input.value.trim();
      if (!msg || isWaiting) return;
      isWaiting = true;
      input.disabled = true;
      sendBtn.textContent = "…";
      sendMessage(msg).finally(() => {
        isWaiting = false;
        input.value = "";
        input.disabled = false;
        sendBtn.textContent = "发送 ✈";
        input.focus();
      });
    }
    sendBtn.addEventListener("click", doSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
      if (e.key === "Escape") closeChat();
    });
    clearBtn.addEventListener("click", () => {
      chatHistory = [];
      saveHistory();
      msgBox.textContent = "记忆已清空，重新开始吧~";
      msgBox.style.display = "block";
      setTimeout(() => (msgBox.style.display = "none"), 3000);
    });
    closeBtn.addEventListener("click", closeChat);
  }

  function openChat() {
    if (!bubbleEl) buildChatUI();
    bubbleEl.classList.add("show");
    const input = document.getElementById("oml2d-chat-input");
    setTimeout(() => input && input.focus(), 80);
  }
  function closeChat() {
    if (bubbleEl) bubbleEl.classList.remove("show");
  }
  function toggleChat() {
    if (bubbleEl && bubbleEl.classList.contains("show")) {
      closeChat();
    } else {
      greetRandomIdle(); // 打开聊天时先随机弹一句
      openChat();
    }
  }

  // ---- 点击聊天时弹随机一句话（复用 idleTips 语料与气泡）----
  function greetRandomIdle() {
    const doGreet = () => {
      try {
        if (!oml2d) return false;
        const idleTips = oml2d.options && oml2d.options.tips && oml2d.options.tips.idleTips;
        const pool = idleTips && Array.isArray(idleTips.message) ? idleTips.message : [];
        if (!pool.length) return false;
        const text = pool[Math.floor(Math.random() * pool.length)];
        const duration = idleTips.duration || 5000;
        const priority = idleTips.priority !== undefined ? idleTips.priority : 0;
        const tips = oml2d && oml2d.tips;
        // tips 组件挂载后 showMessage 才会真正显示气泡：以 #oml2d-tips 在 DOM 为准
        const tipsMounted = !!document.getElementById("oml2d-tips");
        if (tipsMounted && tips && typeof tips.showMessage === "function") {
          tips.showMessage(text, duration, priority);
          return true;
        }
        // 未挂载时若走主实例 notification 也无法显示，返回 false 触发重试
        return false;
      } catch (e) {
        console.error("[oml2d-chat] greetRandomIdle:", e);
        return false;
      }
    };
    // 立即尝试；若 tips 尚未挂载（模型还在加载），最多重试 3 次
    let attempt = 0;
    const tryGreet = () => {
      attempt++;
      if (doGreet()) return;
      if (attempt < 4) setTimeout(tryGreet, 1200);
    };
    tryGreet();
  }

  // ---- 表情 ----
  async function randomExpression() {
    try {
      // 主路径：oml2d.models.model 是 pixi Live2DModel，expression() 无参 = 随机表情
      if (oml2d && oml2d.models && oml2d.models.model) {
        const m = oml2d.models.model;
        if (typeof m.expression === "function") {
          const ok = await m.expression();
          if (ok === false) notify("当前模型没有更多表情啦~", 3000);
          return;
        }
      }
    } catch (e) {
      console.error("[oml2d-chat] expression:", e);
    }
    notify("表情切换暂不可用", 3000);
  }

  // ---- 拍照：用 pixi extract 读像素，绕过 preserveDrawingBuffer=false 空帧 ----
  async function photo() {
    try {
      const o = oml2d;
      if (!o) return notify("看板娘还没准备好", 3000);
      const canvas = document.getElementById("oml2d-canvas");
      if (!canvas) return notify("找不到画布", 3000);

      let dataUrl = null;
      // oml2d.pixiApp = { app: PixiApplication(真容器), stage: oml2d自定义DOM层 }
      // 截图必须用 app.stage（真 pixi Container，有 enableTempParent/extract 支持）
      const pixiApp = o.pixiApp;
      const app = pixiApp && pixiApp.app;
      const renderer = app ? app.renderer : null;
      const pixiStage = app ? app.stage : null;
      // pixi 6: renderer.plugins.extract.canvas() 不受 preserveDrawingBuffer 限制
      try {
        if (renderer && pixiStage) {
          const extract = renderer.plugins && renderer.plugins.extract;
          if (extract && typeof extract.canvas === "function") {
            // 先强制渲染当前帧到 app.stage
            renderer.render(pixiStage);
            const snap = extract.canvas(pixiStage);
            if (snap) dataUrl = snap.toDataURL("image/png");
          }
        }
      } catch (e) {
        console.warn("[oml2d-chat] extract 截图失败，回退 toDataURL:", e.message);
        dataUrl = null;
      }
      // 回退：直接 canvas.toDataURL（加手动渲染）
      if (!dataUrl || dataUrl.length < 2000) {
        try {
          if (renderer && pixiStage) {
            renderer.render(pixiStage);
          }
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise((resolve) => setTimeout(resolve, 80));
          dataUrl = canvas.toDataURL("image/png");
        } catch (e) {
          dataUrl = null;
        }
      }
      if (!dataUrl || dataUrl.length < 2000) {
        return notify("截图失败：画布未保留绘制内容", 4000);
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "live2d_" + Date.now() + ".png";
      a.click();
      notify("照好了，是不是很可爱呢？", 4000);
    } catch (err) {
      console.error("[oml2d-chat] photo:", err);
      notify("拍照失败了…", 3000);
    }
  }

  // ---- 供 oml2d 菜单按钮与 then 回调调用 ----
  window.__oml2dChat = {
    toggle: toggleChat,
    randomExpression: randomExpression,
    photo: photo,
    // 菜单 onClick 会把 oml2d 实例传入，此处接管实例
    attach: (instance) => {
      if (!instance) return;
      oml2d = instance;
      loadHistory();
      // 存入全局供调试/其他逻辑
      window.__oml2d = instance;
    },
    onReady: (instance) => {
      oml2d = instance;
      loadHistory();
    },
  };

  // 若 oml2d 已先初始化（then 回调早于本模块 defer 执行），补接管
  const existing = window.__oml2d;
  if (existing) {
    oml2d = existing;
    loadHistory();
  }

  // ---- monkey-patch OML2D.loadOml2d：主动捕获实例（插件序列化 bug 导致 then 回调不执行）----
  // 插件把 option.then 字符串化后传入，oml2d 从不执行它，window.__oml2d 因此永远为空。
  // 这里包装 loadOml2d，在返回实例时立即接管，保证聊天/表情/拍照无需依赖菜单点击也能拿到实例。
  function patchLoadOml2d() {
    if (window.OML2D && typeof window.OML2D.loadOml2d === "function" && !window.OML2D.__chatPatched) {
      const original = window.OML2D.loadOml2d;
      window.OML2D.__chatPatched = true;
      window.OML2D.loadOml2d = function (...args) {
        const instance = original.apply(this, args);
        // loadOml2d 可能返回实例或 Promise，两者都尝试接管
        const take = (inst) => {
          if (inst) {
            oml2d = inst;
            window.__oml2d = inst;
            loadHistory();
          }
        };
        take(instance);
        if (instance && typeof instance.then === "function") {
          instance.then(take).catch(() => {});
        }
        return instance;
      };
      return true;
    }
    return false;
  }
  // SDK 加载时机不定：立即尝试 + 轮询兜底
  if (!patchLoadOml2d()) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (patchLoadOml2d() || tries > 40) clearInterval(t);
    }, 500);
  }

  // ---- 注入自定义图标 ----
  injectIcons();

  // 样式
  const style = document.createElement("style");
  style.textContent =
    "#oml2d-chat-panel{position:fixed;right:120px;bottom:40px;width:280px;z-index:2147483000;background:rgba(30,30,40,.92);color:#eee;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4);display:none;font-size:13px;font-family:inherit;overflow:hidden}" +
    "#oml2d-chat-panel.show{display:block}" +
    "#oml2d-chat-panel .oml2d-chat-head{padding:8px 12px;background:rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center}" +
    "#oml2d-chat-panel #oml2d-chat-close{background:none;border:none;color:#bbb;font-size:18px;cursor:pointer;line-height:1}" +
    "#oml2d-chat-panel .oml2d-chat-body{padding:10px 12px}" +
    "#oml2d-chat-panel #oml2d-chat-msg{color:#8ec9ff;margin-bottom:6px;min-height:1em;display:none;white-space:pre-wrap;word-break:break-word}" +
    "#oml2d-chat-panel textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#eee;border-radius:8px;padding:8px;font-size:13px;resize:none;font-family:inherit}" +
    "#oml2d-chat-panel textarea:disabled{opacity:.6}" +
    "#oml2d-chat-panel .oml2d-chat-actions{margin-top:8px;display:flex;gap:8px;justify-content:flex-end}" +
    "#oml2d-chat-panel .oml2d-chat-actions button{background:rgba(100,140,255,.25);border:1px solid rgba(100,140,255,.35);color:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:13px}" +
    "#oml2d-chat-panel .oml2d-chat-actions button:hover{background:rgba(100,140,255,.4)}" +
    /* 菜单两列布局：避免 7 项竖排过高遮挡气泡 */
    "#oml2d-stage #oml2d-menus{display:grid !important;grid-template-columns:repeat(2,36px) !important;gap:10px 8px !important;align-content:center;right:auto !important;left:auto !important;bottom:auto !important;top:50% !important;transform:translateY(-50%);max-height:none !important}" +
    "#oml2d-stage #oml2d-menus .oml2d-menus-item{margin-bottom:0 !important}" +
    /* 气泡置顶：显示在菜单之上，避免被盖 */
    "#oml2d-stage #oml2d-tips{z-index:10000 !important}";
  document.head.appendChild(style);

  console.log("[oml2d-chat] 增强模块就绪 | 聊天/表情/拍照 已挂载");
})();
