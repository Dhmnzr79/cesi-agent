console.log("WIDGET JS LOADED");

document.addEventListener("DOMContentLoaded", () => {

(() => {
  // 1) AgentFlow ID из Flowise (именно AgentFlow, не Chatflow)
  const AGENTFLOW_ID = "8bbbe87b-73c5-4a46-8feb-7c13d69e6a40";

  // 2) URL Flowise
  const FLOWISE_BASE = "https://bot.jeeptour41.ru";

  // 3) Prediction API (Flow ID — тот же AgentFlow ID по докам)
  const ENDPOINT = `${FLOWISE_BASE}/api/v1/prediction/${AGENTFLOW_ID}`;

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
    currentStage: 'discovery', // синхронизируется с meta.stage
    leadSent: false,           // защита от повторной отправки заявки
    leadName: null             // имя, собранное в диалоге (при leadIntent === 'awaiting_phone')
  };

  const LEAD_ENDPOINT = `${FLOWISE_BASE}/lead/send-lead`;

  async function sendLeadToBackend(name, phone, message) {
    console.log('LEAD ENDPOINT', LEAD_ENDPOINT);
    const res = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, message: message || undefined })
    });
    if (!res.ok) return false;
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      return true;
    }
    return data.success === true;
  }

  function setCompletedState() {
    input.disabled = true;
    send.disabled = true;
    input.placeholder = "Заявка отправлена";
  }

  function addMsg(text, who) {
    const d = document.createElement("div");
    d.className = `botMsg ${who === "user" ? "botUser" : "botBot"}`;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Парсинг ответа от Flowise (плоская структура: ui_ctaIntent, meta_stage и т.д.)
  function parseFlowiseResponse(data) {
    try {
      // 1. AgentFlow V2 (редко, но оставляем)
      if (Array.isArray(data) && data[0]?.json) {
        data = data[0].json;
      }
      // 2. Prediction API: structured output лежит в data.json
      if (data && typeof data === 'object' && data.json && typeof data.json === 'object') {
        data = { ...data.json, text: data.text ?? '' };
      }
      // 3. Structured Output пришёл как JSON-строка в data.text
      if (
        data &&
        typeof data === 'object' &&
        typeof data.text === 'string' &&
        data.text.trim().startsWith('{')
      ) {
        data = JSON.parse(data.text);
      }
      // 4. Если data — строка
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      // 5. Дальше — существующая логика
      if (data && typeof data === 'object') {
        return {
          answer: data.answer || data.text || '',
          ui: {
            ctaIntent: data.ui_ctaIntent ?? data.ui?.ctaIntent ?? 'none'
          },
          meta: {
            stage: data.meta_stage ?? data.meta?.stage ?? 'discovery',
            confidence: data.meta_confidence ?? data.meta?.confidence ?? 0
          },
          flags: {
            emotional: data.flags_emotional ?? data.flags?.emotional ?? false
          },
          leadIntent: data.leadIntent ?? 'none',
          isValid: true
        };
      }
    } catch (e) {
      console.error('parseFlowiseResponse error', e);
    }

    // Fallback
    const text = typeof data === 'string' ? data : (data?.text || data?.answer || JSON.stringify(data));
    return {
      answer: text,
      ui: { ctaIntent: 'none' },
      meta: { stage: widgetState.currentStage, confidence: 0 },
      flags: { emotional: false },
      leadIntent: 'none',
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
    console.log('askFlowise called', { text });
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
    console.log('Flowise raw response', data);

    // Парсим ответ от Flowise
    const parsed = parseFlowiseResponse(data);
    
    // Обновляем состояние
    widgetState.currentStage = parsed.meta.stage;
    
    // Сохраняем имя при переходе к запросу телефона
    if (parsed.isValid && parsed.leadIntent === 'awaiting_phone') {
      widgetState.leadName = text;
    }
    
    // Отображаем ответ бота
    renderAnswer(parsed.answer);
    
    // Отладка: что пришло перед проверкой отправки заявки
    console.log('LEAD CHECK', {
      leadIntent: parsed.leadIntent,
      leadName: widgetState.leadName,
      text
    });
    
    // leadIntent === 'complete' → отправка заявки (отдельный try/catch, не путать с ошибкой Flowise)
    if (parsed.isValid && parsed.leadIntent === 'complete' && !widgetState.leadSent && widgetState.leadName) {
      widgetState.leadSent = true;
      try {
        const ok = await sendLeadToBackend(widgetState.leadName, text);
        if (ok) {
          setCompletedState();
        } else {
          addMsg("Заявка отправлена, но без подтверждения. Мы свяжемся с вами.", "bot");
        }
      } catch (e) {
        console.error('Lead send error', e);
        addMsg("Заявка отправлена. Мы свяжемся с вами в ближайшее время.", "bot");
      }
    }
    
    // Показываем кнопку CTA если нужно
    if (parsed.isValid && parsed.ui.ctaIntent === 'booking' && parsed.meta.stage === 'ready' && parsed.flags.emotional === false) {
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