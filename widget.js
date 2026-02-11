// Виджет ЦЭСИ. Для работы аватара: avatar.png должен быть в /widget/ на сервере (рядом с widget.js).
console.log("WIDGET JS LOADED");

document.addEventListener("DOMContentLoaded", () => {

(() => {
  // 1) AgentFlow ID из Flowise (именно AgentFlow, не Chatflow)
  const AGENTFLOW_ID = "8bbbe87b-73c5-4a46-8feb-7c13d69e6a40";

  // 2) URL Flowise
  const FLOWISE_BASE = "https://bot.jeeptour41.ru";
  const PAGE_LOAD_TIME = Date.now();

  // 3) Prediction API (Flow ID — тот же AgentFlow ID по докам)
  const ENDPOINT = `${FLOWISE_BASE}/api/v1/prediction/${AGENTFLOW_ID}`;

  // Session management: один sessionId на пользователя, создаётся при первом открытии виджета
  const SESSION_STORAGE_KEY = "cesi_chat_session_id";
  const HISTORY_STORAGE_KEY = "cesi_chat_history";

  let sessionId = null;

  function getOrCreateSessionId() {
    if (sessionId) return sessionId;
    let stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      sessionId = stored;
      return sessionId;
    }
    sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    return sessionId;
  }

  // ---- UI ----
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${FLOWISE_BASE}/widget/widget.css`;
  document.head.appendChild(css);

  const AVATAR_URL = `${FLOWISE_BASE}/widget/avatar.png`;

  const btn = document.createElement("div");
  btn.id = "botWidgetBtn";
  btn.className = "botWidgetClosed";
  btn.setAttribute("aria-label", "Открыть чат с Анной");
  btn.innerHTML = `
    <div class="botWidgetClosed-inner">
      <div class="botWidgetClosed-avatarWrap">
        <img src="${AVATAR_URL}" alt="Анна" class="botWidgetClosed-avatar" onerror="this.style.display='none'">
        <span class="botWidgetClosed-status" aria-hidden="true"></span>
      </div>
      <div class="botWidgetClosed-main">
        <div class="botWidgetClosed-info">
          <span class="botWidgetClosed-name">Анна</span>
          <span class="botWidgetClosed-role">Онлайн консультант ЦЭСИ</span>
          <span class="botWidgetClosed-online botWidgetClosed-online--desktop">🟢 Онлайн 24/7</span>
        </div>
        <button type="button" class="botWidgetClosed-btn botWidgetClosed-btn--desktop" tabindex="-1">Задать вопрос</button>
        <span class="botWidgetClosed-hint botWidgetClosed-hint--desktop">Без звонков и спама</span>
      </div>
    </div>
  `;
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  document.body.appendChild(btn);

  const box = document.createElement("div");
  box.id = "botWidgetBox";
  box.innerHTML = `
    <div id="botWidgetHeader">
      <div class="botWidgetHeader-info">
        <img src="${AVATAR_URL}" alt="" class="botWidgetHeader-avatar" onerror="this.style.display='none'">
        <div>
          <div class="botWidgetHeader-name">Анна</div>
          <div class="botWidgetHeader-role">Онлайн консультант ЦЭСИ</div>
          <div class="botWidgetHeader-online">🟢 Онлайн 24/7</div>
        </div>
      </div>
      <button id="botWidgetClose" class="botWidgetHeader-close" type="button" aria-label="Закрыть">×</button>
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
    currentStage: 'discovery',
    leadSent: false,
    leadName: null,
    messageCount: 0,
    dialogState: 'normal',
    leadIntent: 'none',
    hasInteracted: false,
    suggestedShownCount: 0,
    lastBotMessageTime: 0,
    lastParsedResponse: null,
    startMenuUsed: false,
    lastInputAt: 0,
    suggestedCheckInterval: null,
    scrollTriggerShown: false,
    chatOpenedOnce: false
  };

  const LEAD_ENDPOINT = `${FLOWISE_BASE}/lead/send-lead`;

  // Определение рабочего времени (Камчатка, UTC+12)
  function isWorkingHours() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const kamchatkaMs = utcMs + 12 * 60 * 60000;
    const k = new Date(kamchatkaMs);
    const day = k.getUTCDay(); // 0 воскресенье, 1 понедельник ...
    const hour = k.getUTCHours();

    // Воскресенье — выходной
    if (day === 0) return false;
    // Пн–Пт 8:00–20:00
    if (day >= 1 && day <= 5) {
      return hour >= 8 && hour < 20;
    }
    // Суббота 8:00–14:00
    if (day === 6) {
      return hour >= 8 && hour < 14;
    }
    return false;
  }

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

  function updateDialogState() {
    if (widgetState.leadSent) {
      widgetState.dialogState = 'blocked';
    } else if (widgetState.leadIntent === 'awaiting_name' || widgetState.leadIntent === 'awaiting_phone') {
      widgetState.dialogState = 'collecting_contact';
    } else {
      widgetState.dialogState = 'normal';
    }
  }

  // Scroll-триггер: плавное расширение карточки один раз за сессию
  function maybeShowScrollTeaser() {
    if (widgetState.scrollTriggerShown) return;
    if (widgetState.chatOpenedOnce) return;
    if (!btn || btn.style.display === "none") return;

    const now = Date.now();
    if (now - PAGE_LOAD_TIME < 15000) return;

    const doc = document.documentElement;
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const fullHeight = doc.scrollHeight || 0;
    if (fullHeight <= 0) return;

    const scrolled = (scrollTop + viewport) / fullHeight;
    if (scrolled < 0.35) return;

    widgetState.scrollTriggerShown = true;

    const working = isWorkingHours();
    const line1 = working ? "Есть вопрос по лечению?" : "Клиника сейчас не работает.";
    const line2 = working ? "Могу коротко объяснить." : "Но я могу ответить на вопросы.";

    let collapseTimer = null;

    const collapseTeaser = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      btn.classList.remove("botWidgetClosed--teaser");
      btn.removeEventListener("mouseenter", cancelCollapse);
      btn.removeEventListener("touchstart", cancelCollapse);
      if (closeBtn.parentNode) closeBtn.remove();
      setTimeout(() => {
        if (teaserEl.parentNode) teaserEl.remove();
      }, 300);
    };

    const cancelCollapse = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    };

    const teaserEl = document.createElement("div");
    teaserEl.className = "botWidgetClosed-teaser";
    teaserEl.innerHTML = `
      <div class="botWidgetClosed-teaser-divider"></div>
      <div class="botWidgetClosed-teaser-body">
        <div class="botWidgetClosed-teaser-text">
          <span class="botWidgetClosed-teaser-line1">${line1}</span>
          <span class="botWidgetClosed-teaser-line2">${line2}</span>
        </div>
        <button type="button" class="botWidgetClosed-teaser-btn botWidgetClosed-teaser-btn--desktop">Открыть консультацию</button>
        <button type="button" class="botWidgetClosed-teaser-btn botWidgetClosed-teaser-btn--mobile">Задать вопрос</button>
      </div>
    `;

    const openChatFromTeaser = (e) => {
      e.stopPropagation();
      openChat();
    };

    teaserEl.querySelectorAll(".botWidgetClosed-teaser-btn").forEach((b) => {
      b.addEventListener("click", openChatFromTeaser);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "botWidgetClosed-teaser-close";
    closeBtn.setAttribute("aria-label", "Свернуть");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      collapseTeaser();
    });

    btn.appendChild(teaserEl);
    btn.appendChild(closeBtn);

    btn.addEventListener("mouseenter", cancelCollapse);
    btn.addEventListener("touchstart", cancelCollapse);

    requestAnimationFrame(() => {
      btn.classList.add("botWidgetClosed--teaser");
    });

    collapseTimer = setTimeout(collapseTeaser, 8000);
  }

  // Стартовое меню: 3 пункта до первого сообщения
  const START_MENU_ITEMS = [
    'Я переживаю насчёт боли',
    'Посмотреть цены',
    'Как проходит консультация'
  ];

  function renderStartMenu() {
    if (widgetState.messageCount > 0 || widgetState.dialogState !== 'normal') return;
    const existing = msgs.querySelector('.botStartMenu');
    if (existing) return;

    const container = document.createElement('div');
    container.className = 'botStartMenu';
    START_MENU_ITEMS.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'botStartMenuItem';
      btn.textContent = text;
      btn.onclick = () => {
        widgetState.startMenuUsed = true;
        sendAsUser(text);
      };
      container.appendChild(btn);
    });
    msgs.appendChild(container);
  }

  function hideStartMenu() {
    const el = msgs.querySelector('.botStartMenu');
    if (el) el.remove();
  }

  // Подсказки при зависании: 1 показ за сессию
  const SUGGESTED_ITEMS = [
    'Этапы имплантации',
    'Что входит в консультацию',
    'Какая приживаемость имплантов?'
  ];

  function renderSuggestedBlock() {
    if (widgetState.suggestedShownCount > 0) return;
    const existing = msgs.querySelector('.botSuggested');
    if (existing) return;

    const container = document.createElement('div');
    container.className = 'botSuggested';
    const title = document.createElement('div');
    title.className = 'botSuggestedTitle';
    title.textContent = 'Часто спрашивают:';
    container.appendChild(title);
    SUGGESTED_ITEMS.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'botSuggestedItem';
      btn.textContent = text;
      btn.onclick = () => {
        container.remove();
        widgetState.suggestedShownCount = 1;
        sendAsUser(text);
      };
      container.appendChild(btn);
    });
    msgs.appendChild(container);
    msgs.scrollTop = msgs.scrollHeight;
    widgetState.suggestedShownCount = 1;
  }

  function checkSuggestedConditions() {
    if (widgetState.suggestedShownCount > 0) return;
    if (widgetState.leadIntent !== 'none') return;
    if (widgetState.lastBotMessageTime === 0) return;
    if (Date.now() - widgetState.lastBotMessageTime < 15000) return;

    renderSuggestedBlock();
  }

  async function sendAsUser(text) {
    input.value = '';
    addMsg(text, 'user');
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    try {
      await askFlowise(text);
    } catch (e) {
      addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
      addMsg(String(e.message || e), "bot");
      widgetState.lastBotMessageTime = Date.now();
    }
  }

  function addMsg(text, who, skipSave) {
    const d = document.createElement("div");
    d.className = `botMsg ${who === "user" ? "botUser" : "botBot"}`;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    if (!skipSave) saveHistory();
  }

  function saveHistory() {
    const items = [];
    msgs.querySelectorAll(".botMsg").forEach((el) => {
      const who = el.classList.contains("botUser") ? "user" : "bot";
      items.push({ text: el.textContent, who });
    });
    const state = {
      messages: items,
      leadSent: widgetState.leadSent
    };
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state));
  }

  function restoreHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      const messages = state.messages || [];
      if (messages.length === 0) return false;

      messages.forEach(({ text, who }) => {
        addMsg(text, who, true);
      });
      if (state.leadSent) {
        widgetState.leadSent = true;
        setCompletedState();
      }
      widgetState.messageCount = messages.filter((m) => m.who === "user").length;
      return true;
    } catch (e) {
      console.warn("restoreHistory error", e);
      return false;
    }
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
            confidence: data.meta_confidence ?? data.meta?.confidence ?? 0,
            shouldHandoff: data.meta_shouldHandoff ?? data.meta?.shouldHandoff ?? false
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
      meta: { stage: widgetState.currentStage, confidence: 0, shouldHandoff: false },
      flags: { emotional: false },
      leadIntent: 'none',
      isValid: false
    };
  }

  // Отображение ответа бота
  function renderAnswer(answer) {
    addMsg(answer, "bot");
  }

  // Отображение кнопки CTA: booking или handoff
  function renderCTAButton(type) {
    const existingCTA = msgs.querySelector(".botCTAButton");
    if (existingCTA) existingCTA.parentElement.remove();

    const ctaBtn = document.createElement("button");
    ctaBtn.className = "botCTAButton";
    if (type === "handoff") {
      ctaBtn.textContent = "Связаться с администратором";
      ctaBtn.onclick = () => {
        ctaBtn.parentElement.remove();
        onHandoffClick();
      };
    } else {
      ctaBtn.textContent = "Хочу записаться";
      ctaBtn.onclick = () => {
        ctaBtn.parentElement.remove();
        onCTAClick();
      };
    }
    ctaBtn.style.cssText = "margin: 8px 0; padding: 10px 16px; background: #4ECDC4; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;";

    const msgContainer = document.createElement("div");
    msgContainer.style.cssText = "display: flex; flex-direction: column; align-items: flex-start;";
    msgContainer.appendChild(ctaBtn);
    msgs.appendChild(msgContainer);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function onCTAClick() {
    const text = "Хочу записаться";
    input.value = "";
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    addMsg(text, "user");
    askFlowise(text);
  }

  function onHandoffClick() {
    const text = "Хочу связаться с администратором";
    input.value = "";
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    addMsg(text, "user");
    askFlowise(text);
  }

  const WELCOME_TEXT = "Здравствуйте.\nЯ онлайн-консультант клиники ЦЭСИ.\nМогу помочь разобраться в вопросах лечения.";

  function openChat(intentMessage) {
    widgetState.chatOpenedOnce = true;
    box.style.display = "flex";
    btn.style.display = "none";

    getOrCreateSessionId();

    const hasContent = msgs.querySelectorAll(".botMsg").length > 0;
    if (!hasContent) {
      const hasHistory = restoreHistory();
      if (intentMessage) {
        // CTA: не показывать приветствие, сразу отправить intent
      } else if (!hasHistory) {
        addMsg(WELCOME_TEXT, "bot");
      }
      if (!intentMessage) renderStartMenu();
    } else if (widgetState.leadSent) {
      setCompletedState();
    }

    if (intentMessage) {
      addMsg(intentMessage, "user");
      widgetState.hasInteracted = true;
      widgetState.messageCount++;
      hideStartMenu();
      askFlowise(intentMessage).catch((e) => {
        addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
        addMsg(String(e.message || e), "bot");
        widgetState.lastBotMessageTime = Date.now();
      });
    }

    input.focus();
    if (!widgetState.suggestedCheckInterval) {
      widgetState.suggestedCheckInterval = setInterval(checkSuggestedConditions, 3000);
    }
  }

  window.openCesiChat = function(intent) {
    openChat(intent || null);
  };

  btn.onclick = () => openChat();
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChat();
    }
  });

  close.onclick = () => {
    box.style.display = "none";
    btn.style.display = "block";
    if (widgetState.suggestedCheckInterval) {
      clearInterval(widgetState.suggestedCheckInterval);
      widgetState.suggestedCheckInterval = null;
    }
  };

  // Инициализация scroll-триггера
  window.addEventListener("scroll", maybeShowScrollTeaser);

  async function askFlowise(text) {
    const sid = getOrCreateSessionId();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, overrideConfig: { sessionId: sid } })
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
    widgetState.leadIntent = parsed.leadIntent;
    widgetState.lastParsedResponse = parsed.isValid ? { flags: parsed.flags, ui: parsed.ui, meta: parsed.meta } : null;
    updateDialogState();
    
    // Сохраняем имя при переходе к запросу телефона
    if (parsed.isValid && parsed.leadIntent === 'awaiting_phone') {
      widgetState.leadName = text;
    }
    
    // Отображаем ответ бота
    renderAnswer(parsed.answer);
    widgetState.lastBotMessageTime = Date.now();
    
    // Отладка: что пришло перед проверкой отправки заявки
    console.log('LEAD CHECK', {
      leadIntent: parsed.leadIntent,
      leadName: widgetState.leadName,
      text
    });
    
    // leadIntent === 'complete' → отправка заявки (отдельный try/catch, не путать с ошибкой Flowise)
    if (parsed.isValid && parsed.leadIntent === 'complete' && !widgetState.leadSent && widgetState.leadName) {
      widgetState.leadSent = true;
      saveHistory();
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
    
    // Показываем кнопку CTA: handoff приоритетнее booking (в режиме записи CTA не показываем)
    if (parsed.isValid && parsed.leadIntent === 'none' && parsed.flags.emotional === false) {
      if (parsed.meta.shouldHandoff === true) {
        renderCTAButton("handoff");
      } else if (parsed.ui.ctaIntent === 'booking' && parsed.meta.stage === 'ready') {
        renderCTAButton("booking");
      }
    }
  }

  async function onSend() {
    const text = input.value.trim();
    if (!text) return;
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    input.value = "";
    addMsg(text, "user");

    try {
      await askFlowise(text);
    } catch (e) {
      addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
      addMsg(String(e.message || e), "bot");
      widgetState.lastBotMessageTime = Date.now();
    }
  }

  send.onclick = onSend;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });
  input.addEventListener("input", () => {
    widgetState.lastInputAt = Date.now();
  });
})();

});