console.log("WIDGET JS LOADED");

document.addEventListener("DOMContentLoaded", () => {

(() => {
  // 1) ВСТАВЬ СЮДА Chatflow ID из Flowise
  const CHATFLOW_ID = "0c91c79c-28db-4d06-9b9b-94ca5abf3862";

  // 2) URL Flowise (у тебя уже есть)
  const FLOWISE_BASE = "https://bot.jeeptour41.ru";

  // 3) Куда стучаться (самый частый endpoint Flowise)
  // Если у тебя endpoint другой — ниже дам как проверить.
  const ENDPOINT = `${FLOWISE_BASE}/api/v1/prediction/${CHATFLOW_ID}`;

  // SessionId для контекста диалога
  function getOrCreateSessionId() {
    const STORAGE_KEY = "botWidgetSessionId";
    let sessionId = localStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
  }
  const SESSION_ID = getOrCreateSessionId();

  // ---- UI ----
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${FLOWISE_BASE}/widget/widget.css`;
  document.head.appendChild(css);

  const btn = document.createElement("button");
  btn.id = "botWidgetBtn";
  btn.textContent = "Чат";
  document.body.appendChild(btn);

  const box = document.createElement("div");
  box.id = "botWidgetBox";
  box.innerHTML = `
    <div id="botWidgetHeader">
      <div>Бот клиники</div>
      <button id="botWidgetClose" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px">×</button>
    </div>
    <div id="botWidgetMsgs"></div>
    <div id="botWidgetForm">
      <input id="botWidgetInput" placeholder="Напишите сообщение..." />
      <button id="botWidgetSend">Отправить</button>
    </div>
  `;
  document.body.appendChild(box);

  const msgs = box.querySelector("#botWidgetMsgs");
  const input = box.querySelector("#botWidgetInput");
  const send = box.querySelector("#botWidgetSend");
  const close = box.querySelector("#botWidgetClose");

  // Состояние виджета
  const widgetState = {
    currentStage: 'discovery' // синхронизируется с meta.stage
  };

  function addMsg(text, who) {
    const d = document.createElement("div");
    d.className = `botMsg ${who === "user" ? "botUser" : "botBot"}`;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Парсинг ответа от Flowise
  function parseFlowiseResponse(data) {
    try {
      // Пытаемся распарсить как JSON
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      
      // Проверяем структуру
      if (data && typeof data === 'object') {
        return {
          answer: data.answer || data.text || '',
          meta: {
            stage: data.meta?.stage || 'discovery'
          },
          flags: {
            emotional: data.flags?.emotional || false
          },
          isValid: true
        };
      }
    } catch (e) {
      // Если не JSON, возвращаем как обычный текст
    }
    
    // Fallback: обычный текст
    const text = typeof data === 'string' ? data : (data?.text || data?.answer || JSON.stringify(data));
    return {
      answer: text,
      meta: { stage: widgetState.currentStage },
      flags: { emotional: false },
      isValid: false
    };
  }

  // Отображение ответа бота
  function renderAnswer(answer) {
    addMsg(answer, "bot");
  }

  // Отображение кнопки CTA
  function renderCTAButton() {
    // Удаляем предыдущую кнопку если есть
    const existingCTA = msgs.querySelector(".botCTAButton");
    if (existingCTA) {
      existingCTA.parentElement.remove();
    }

    const ctaBtn = document.createElement("button");
    ctaBtn.className = "botCTAButton";
    ctaBtn.textContent = "Хочу записаться";
    ctaBtn.style.cssText = "margin: 8px 0; padding: 10px 16px; background: #4ECDC4; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;";
    
    ctaBtn.onclick = () => {
      ctaBtn.parentElement.remove();
      onCTAClick();
    };

    const msgContainer = document.createElement("div");
    msgContainer.style.cssText = "display: flex; flex-direction: column; align-items: flex-start;";
    msgContainer.appendChild(ctaBtn);
    msgs.appendChild(msgContainer);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Обработчик клика на кнопку CTA
  function onCTAClick() {
    // Отправляем сообщение в чат, а не открываем форму
    const text = "Хочу записаться";
    input.value = "";
    addMsg(text, "user");
    askFlowise(text);
  }

  btn.onclick = () => {
    box.style.display = "block";
    btn.style.display = "none";
    addMsg("Привет! Напишите «Привет», чтобы проверить связь 🙂", "bot");
    input.focus();
  };

  close.onclick = () => {
    box.style.display = "none";
    btn.style.display = "block";
  };

  async function askFlowise(text) {
    // Flowise обычно ждёт { question: "..." }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, overrideConfig: { sessionId: SESSION_ID } })
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    const data = await res.json();

    // Парсим ответ от Flowise
    const parsed = parseFlowiseResponse(data);
    
    // Обновляем состояние
    widgetState.currentStage = parsed.meta.stage;
    
    // Отображаем ответ
    renderAnswer(parsed.answer);
    
    // Показываем кнопку CTA если нужно
    if (parsed.isValid && parsed.meta.stage === 'ready' && parsed.flags.emotional === false) {
      renderCTAButton();
    }
  }

  async function onSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMsg(text, "user");

    try {
      await askFlowise(text);
    } catch (e) {
      addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
      addMsg(String(e.message || e), "bot");
    }
  }

  send.onclick = onSend;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });
})();

});