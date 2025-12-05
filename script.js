/* script.js
   Основные возможности:
   - симулятор рынка (реалистичный генератор цены)
   - открытие/закрытие позиций, стоп-лосс
   - хранение в localStorage, автосохранение
   - отправка/загрузка состояния через Telegram WebApp (отправить данные боту)
   - история (одна запись при закрытии позиции)
   - влияние покупок/продаж на цену
   - события рынка (30 преднастроенных)
*/

(() => {
  /* ==== Конфигурация ==== */
  const STARTING_BALANCE = 1000;
  const ASSETS = ['BTC','SHIB','DOGE'];
  const SAVE_KEY = 'minitrade:v1';
  const AUTOSAVE_INTERVAL = 5000; // ms

  /* ==== Состояние приложения (сохраняется) ==== */
  let state = {
    profile: { id: null, name: 'Player', balance: STARTING_BALANCE, stars: 0 },
    market: {
      BTC: { price: 60000, history: [], demand: 0 },
      SHIB: { price: 0.00002, history: [], demand: 0 },
      DOGE: { price: 0.08, history: [], demand: 0 },
      volatility: 0.02 // базовая волатильность
    },
    position: null, // {asset, sizeUsd, entryPrice, leverage, entryTime, stop}
    history: [], // закрытые позиции: {asset, openTime, closeTime, entryPrice, exitPrice, sizeUsd, pnl, roePercent}
    leaderboard: [], // локальный быстрый список игроков [{id,name,balance}]
    eventsSeed: 0
  };

  /* ==== Преднастроенные рыночные события (15 положительных, 15 негативных) ==== */
  const MARKET_EVENTS = [
    // Положительные (пример)
    { id:'e1', title:'Позитивный отчёт', impact: 0.06, volBoost: 0.5 },
    { id:'e2', title:'Инвесторы входят в рынок', impact: 0.04, volBoost: 0.3 },
    { id:'e3', title:'Партнёрство проекта', impact: 0.08, volBoost: 0.6 },
    { id:'e4', title:'Регуляторы смягчают правила', impact: 0.07, volBoost: 0.4 },
    { id:'e5', title:'Крупный обмен объявил листинг', impact: 0.05, volBoost: 0.2 },
    { id:'e6', title:'Технологическое обновление успешно', impact: 0.09, volBoost: 0.6 },
    { id:'e7', title:'Рост объёмов торгов', impact: 0.03, volBoost: 0.2 },
    { id:'e8', title:'Аналитик дал рекомендацию купить', impact: 0.04, volBoost: 0.25 },
    { id:'e9', title:'Положительный макроэкономический отчёт', impact: 0.05, volBoost: 0.35 },
    { id:'e10', title:'Фонды увеличили свои позиции', impact: 0.06, volBoost: 0.5 },
    { id:'e11', title:'Волатильность снижается', impact: 0.02, volBoost: -0.2 },
    { id:'e12', title:'Ликвидность повышена', impact: 0.03, volBoost: -0.1 },
    { id:'e13', title:'Ожидание халвинга', impact: 0.07, volBoost: 0.45 },
    { id:'e14', title:'Ренессанс интереса у розницы', impact: 0.05, volBoost: 0.3 },
    { id:'e15', title:'Положительный твит знаменитости', impact: 0.08, volBoost: 0.5 },

    // Негативные
    { id:'e16', title:'Регуляторный удар', impact: -0.09, volBoost: 0.7 },
    { id:'e17', title:'Биржа подверглась хакерской атаке', impact: -0.1, volBoost: 0.9 },
    { id:'e18', title:'Негативный отчёт СМИ', impact: -0.06, volBoost: 0.5 },
    { id:'e19', title:'Великий кредитный кризис', impact: -0.12, volBoost: 1.0 },
    { id:'e20', title:'Крупный маркет-мейкер уходит', impact: -0.07, volBoost: 0.4 },
    { id:'e21', title:'Отмена листинга', impact: -0.08, volBoost: 0.6 },
    { id:'e22', title:'Техническая уязвимость', impact: -0.05, volBoost: 0.3 },
    { id:'e23', title:'Большие распродажи институционалов', impact: -0.06, volBoost: 0.5 },
    { id:'e24', title:'Макрооткат экономики', impact: -0.03, volBoost: 0.25 },
    { id:'e25', title:'Штатный суд запретил операции', impact: -0.11, volBoost: 0.9 },
    { id:'e26', title:'Проблемы с ликвидностью', impact: -0.04, volBoost: 0.35 },
    { id:'e27', title:'Отрицательная корреляция с рынком акций', impact: -0.03, volBoost: 0.2 },
    { id:'e28', title:'Краш пула», impact: -0.09, volBoost: 0.8 },
    { id:'e29', title:'Негативный твит знаменитости', impact: -0.07, volBoost: 0.5 },
    { id:'e30', title:'Технический сбой в крупной бирже', impact: -0.08, volBoost: 0.6 },
  ];

  /* ==== UI элементы ==== */
  const ui = {};
  function $id(id){return document.getElementById(id)}
  function $(sel){return document.querySelector(sel)}

  /* ==== Инициализация UI ==== */
  function initUI(){
    ui.price = $id('price');
    ui.roe = $id('roe');
    ui.positionInfo = $id('position-info');
    ui.entryMarker = $id('entry-marker');
    ui.exitMarker = $id('exit-marker');
    ui.historyList = $id('history-list');
    ui.leaderboardList = $id('leaderboard-list');
    ui.eventsList = $id('events-list');
    ui.balance = $id('balance');

    // табы
    document.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click', ()=> {
        document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelectorAll('.pane').forEach(p=>p.classList.remove('visible'));
        $id(tab).classList.add('visible');
      });
    });

    // кнопки торговли
    $id('open-btn').addEventListener('click', openPosition);
    $id('close-btn').addEventListener('click', closePosition);
    $id('asset-select').addEventListener('change', onAssetChange);
    $id('trigger-event').addEventListener('click', ()=>applyRandomEvent(true));
    $id('buy-stars').addEventListener('click', buyStarsFlow);
    $id('sync-cloud').addEventListener('click', saveToCloud);
    $id('load-cloud').addEventListener('click', loadFromCloud);

    // автосохранение
    setInterval(()=>saveLocal(), AUTOSAVE_INTERVAL);
    window.addEventListener('beforeunload', saveLocal);

    // init Telegram WebApp if exists
    if(window.Telegram && window.Telegram.WebApp){
      try {
        window.Telegram.WebApp.init();
        // можно использовать initData или user передать в state.profile
        const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
        if(tgUser){
          state.profile.id = tgUser.id;
          state.profile.name = tgUser.first_name || state.profile.name;
        }
      } catch(e){ console.warn('Telegram init failed', e) }
    }
  }

  /* ==== Сохранение / Загрузка локально ==== */
  function saveLocal(){
    try{
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      // обновляем баланс в UI
      ui.balance.textContent = `$${formatNumber(state.profile.balance)}`;
      // обновление лидера
      renderLeaderboard();
      // console.log('saved');
    }catch(e){ console.error('saveLocal', e) }
  }
  function loadLocal(){
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if(raw){
        const s = JSON.parse(raw);
        // аккуратно слить состояние (на будущее — миграция версий)
        Object.assign(state, s);
      } else {
        // первый запуск: инициализация истории цен
        ASSETS.forEach(a => {
          state.market[a].history = Array.from({length:200}, ()=>state.market[a].price);
        });
      }
    } catch(e){ console.error('loadLocal', e) }
  }

  /* ==== Сохранение/загрузка в облако через бота ====
     Замечание: Telegram Web Apps не предоставляют прямого "cloud storage" — обычно
     WebApp отправляет данные боту (Telegram.WebApp.sendData) — бот их сохраняет (DB).
     Здесь — пример: sendData отправляет JSON боту; бот должен принять и сохранить.
  */
  function saveToCloud(){
    const payload = { type:'save_state', data: state };
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.sendData){
      window.Telegram.WebApp.sendData(JSON.stringify(payload));
      alert('Отправлено боту для сохранения (бот должен поддерживать сохранение).');
    } else {
      // fallback: отправка на ваш сервер (пример)
      fetch('/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
        .then(res=>res.ok?alert('Сохранено на сервере'):alert('Ошибка сохранения на сервер'))
        .catch(e=>alert('Ошибка сети: '+e));
    }
  }
  function loadFromCloud(){
    // Backend должен вернуть JSON со state. Пример запроса.
    fetch('/api/load')
      .then(r=>r.json())
      .then(data=>{
        if(data && data.state){
          Object.assign(state, data.state);
          saveLocal();
          renderAll();
          alert('Загружено из облака');
        } else alert('Нет сохранения в облаке');
      }).catch(e=>alert('Ошибка загрузки: '+e));
  }

  /* ==== Торговые операции ==== */
  function openPosition(){
    if(state.position) { alert('У вас уже есть открытая позиция. Закройте её перед открытием новой.'); return; }
    const asset = $id('asset-select').value;
    let sizeUsd = parseFloat($id('size').value)||0;
    const lev = parseInt($id('leverage').value)||1;
    const stopVal = parseFloat($id('stop').value) || null;
    if(sizeUsd <= 0) { alert('Введите сумму >0'); return; }
    if(sizeUsd > state.profile.balance*10) { // ограничение
      if(!confirm('Вы открываете позицию более чем в 10x от баланса. Продолжить?')) return;
    }

    const price = getPrice(asset);
    const marginRequired = sizeUsd / lev;
    if(marginRequired > state.profile.balance){
      // недостаточная маржа — можно купить звезды (пользовательское решение) — мы предложим докупить
      if(confirm('Недостаточно маржи для открытия позиции. Докупить доллары за Stars?')){
        buyDollarsForStars((marginRequired - state.profile.balance)).then(() => {
          // после оплаты — повторный проверка
          if(marginRequired > state.profile.balance) { alert('Оплата не пополнила баланс. Отмена.'); return; }
          createPosition(asset, sizeUsd, lev, price, stopVal);
        }).catch(()=>alert('Покупка отменена'));
      } else {
        alert('Недостаточно маржи');
      }
      return;
    }

    createPosition(asset, sizeUsd, lev, price, stopVal);
  }

  function createPosition(asset, sizeUsd, lev, price, stopVal){
    // change balance: margin reserved (we model просто как уменьшение баланса)
    const margin = sizeUsd / lev;
    state.profile.balance -= margin;

    state.position = {
      asset, sizeUsd, entryPrice: price, leverage: lev,
      entryTime: Date.now(), stop: stopVal, margin
    };

    // apply immediate market impact (buying increases price proportionally to size)
    applyMarketImpact(asset, sizeUsd, 'buy');

    updateUI();
    saveLocal();
    // enable close button
    $id('close-btn').disabled = false;
  }

  function closePosition(){
    if(!state.position) return;
    const pos = state.position;
    const asset = pos.asset;
    const exitPrice = getPrice(asset);
    // PnL для лонга = (exit-entry)/entry * sizeUsd * leverage? Мы считаем PnL = (exitPrice - entryPrice)/entryPrice * sizeUsd * leverage
    const priceChangePct = (exitPrice - pos.entryPrice) / pos.entryPrice;
    const pnl = priceChangePct * pos.sizeUsd * pos.leverage;
    // возврат маржи + pnl
    state.profile.balance += pos.margin + pnl;

    // ROE = pnl / margin * 100
    const roe = (pnl / pos.margin) * 100;

    const record = {
      asset,
      openTime: pos.entryTime,
      closeTime: Date.now(),
      entryPrice: pos.entryPrice,
      exitPrice,
      sizeUsd: pos.sizeUsd,
      pnl,
      roePercent: roe
    };
    state.history.unshift(record); // последняя сверху

    // apply impact for closing (sell)
    applyMarketImpact(asset, pos.sizeUsd, 'sell');

    // clear position
    state.position = null;
    $id('close-btn').disabled = true;

    // Если баланс упал ниже 0 — ликвидация
    if(state.profile.balance <= 0){
      handleLiquidation();
    }

    updateUI();
    saveLocal();
  }

  /* ==== Ликвидация ==== */
  function handleLiquidation(){
    // при ликвидации баланс становится 0, история обнуляется? У нас — баланс = 0 и сохранение
    state.profile.balance = 0;
    // Предложим выкуп за звезды — UI-логика: показать кнопку в settings
    alert('Вы ликвидированы. Вы можете восстановиться, купив доллары за Telegram Stars.');
    saveLocal();
  }

  /* ==== ROE вычисления в UI (если есть открытая позиция) ==== */
  function computeROE(){
    if(!state.position) return null;
    const pos = state.position;
    const current = getPrice(pos.asset);
    const priceChangePct = (current - pos.entryPrice)/pos.entryPrice;
    const pnl = priceChangePct * pos.sizeUsd * pos.leverage;
    const roe = (pnl / pos.margin) * 100;
    return {pnl, roe};
  }

  /* ==== Цена и симуляция рынка ==== */
  // Получаем текущую цену (последняя в истории)
  function getPrice(asset){
    return state.market[asset].price;
  }

  // Простейший realistic generator: случайное блуждание + влияние событий + спрос/предложение
  function tickMarket(){
    ASSETS.forEach(asset=>{
      const m = state.market[asset];
      // базовая случайная компонента
      const vol = state.market.volatility;
      // demand влияет на тренд: положительная demand -> повышает цену
      const demandFactor = Math.tanh(m.demand / 1000); // нормируем
      // шум
      const rnd = gaussianRandom(0, vol) + demandFactor * 0.01;
      // price moves multiplicatively
      let newPrice = m.price * (1 + rnd + (Math.random()-0.5)*vol*0.1);
      // ensure price > tiny
      if(newPrice <= 1e-8) newPrice = m.price * 0.5;
      // store
      m.price = newPrice;
      m.history.push(newPrice);
      if(m.history.length > 1000) m.history.shift();
      // slight mean reversion
      m.demand *= 0.99;
    });

    // проверка стоп-лосса и маржи
    if(state.position){
      const pos = state.position;
      const curPrice = getPrice(pos.asset);
      // если стоп задан и сработал
      if(pos.stop && ((curPrice <= pos.stop && pos.entryPrice > pos.stop) || (curPrice >= pos.stop && pos.entryPrice < pos.stop))){
        // автоматическое закрытие
        alert('Стоп-лосс сработал — позиция закрыта.');
        closePosition();
      } else {
        // проверяем маржу: если убыток > margin (ликвидация)
        const priceChangePct = (curPrice - pos.entryPrice)/pos.entryPrice;
        const pnl = priceChangePct * pos.sizeUsd * pos.leverage;
        if(Math.abs(pnl) >= pos.margin){
          // ликвидируем
          alert('Ликвидация: убыток превысил маржу. Баланс обнулён.');
          state.position = null;
          state.profile.balance = 0;
          saveLocal();
        }
      }
    }
    updateUI();
  }

  // влияние покупок/продаж на цену: simple impact model
  function applyMarketImpact(asset, sizeUsd, side){
    // impact ~ k * (size / marketCapEquivalent), but у нас упрощённо
    const m = state.market[asset];
    // настроечный коэффициент — для быстрой видимости изменений можно увеличить
    const k = 0.0000005; // подберите эмпирически
    // если монета малая (SHIB/DOGE) — эффективный k сильнее
    const multiplier = asset === 'BTC' ? 1 : 12;
    const impactPct = k * sizeUsd * multiplier;
    // увеличим/уменьшим цену и изменим demand
    if(side === 'buy'){
      m.price *= (1 + impactPct);
      m.demand += sizeUsd;
    } else {
      m.price *= (1 - impactPct);
      m.demand -= sizeUsd;
    }
  }

  /* ==== События рынка ==== */
  function applyRandomEvent(showAlert=false){
    const i = Math.floor(Math.random() * MARKET_EVENTS.length);
    const ev = MARKET_EVENTS[i];
    // Выберем случайный asset для применения эффекта
    const asset = ASSETS[Math.floor(Math.random()*ASSETS.length)];
    const m = state.market[asset];
    // применим прямое влияние
    m.price *= (1 + ev.impact);
    // увеличим волатильность временно
    state.market.volatility = Math.min(0.5, state.market.volatility + Math.abs(ev.impact) * ev.volBoost);
    // добавим запись в UI событий
    const li = document.createElement('li');
    li.textContent = `${(new Date()).toLocaleTimeString()} — ${ev.title} — ${asset} ${ev.impact>0?'+':''}${(ev.impact*100).toFixed(2)}%`;
    ui.eventsList.prepend(li);

    if(showAlert) alert(`Событие: ${ev.title} — ${asset} ${(ev.impact*100).toFixed(2)}%`);

    // со временем волатильность вернётся назад
    setTimeout(()=>{ state.market.volatility = Math.max(0.005, state.market.volatility * 0.7); }, 5000);

    saveLocal();
  }

  /* ==== Помощники ==== */
  function gaussianRandom(mean=0, stdev=1) {
    // Box-Muller
    let u = 0, v = 0;
    while(u===0) u = Math.random();
    while(v===0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0*Math.PI*v);
    return num * stdev + mean;
  }
  function formatNumber(n){ return Number(n).toLocaleString(undefined, {maximumFractionDigits:2}) }

  /* ==== UI отображение ==== */
  function updateUI(){
    // price
    const asset = $id('asset-select').value;
    const price = getPrice(asset);
    ui.price.textContent = formatNumber(price);
    // roe
    const roeData = computeROE();
    ui.roe.textContent = roeData ? `${roeData.roe.toFixed(2)}%` : '—';
    // position info
    if(state.position){
      ui.positionInfo.textContent = `${state.position.asset} ${state.position.sizeUsd}$ @ ${formatNumber(state.position.entryPrice)} x${state.position.leverage}`;
    } else ui.positionInfo.textContent = 'Нет';

    // enable/disable buttons
    $id('close-btn').disabled = !state.position;

    // history list
    renderHistory();
    // leaderboard
    renderLeaderboard();

    // update balance display
    ui.balance.textContent = `$${formatNumber(state.profile.balance)}`;

    // draw chart
    drawChart(asset);
  }

  function renderHistory(){
    ui.historyList.innerHTML = '';
    state.history.slice(0,50).forEach(r=>{
      const li = document.createElement('li');
      li.innerHTML = `<strong>${r.asset}</strong> ${new Date(r.openTime).toLocaleString()} → ${new Date(r.closeTime).toLocaleString()}<br>
        Вход: ${formatNumber(r.entryPrice)} / Выход: ${formatNumber(r.exitPrice)} | P&L: ${formatNumber(r.pnl)}$ | ROE: ${r.roePercent.toFixed(2)}%`;
      ui.historyList.appendChild(li);
    });
  }

  function renderLeaderboard(){
    ui.leaderboardList.innerHTML = '';
    // локальная сортировка
    const list = (state.leaderboard || []).slice().sort((a,b)=>b.balance - a.balance);
    list.slice(0,20).forEach(p=>{
      const li = document.createElement('li');
      li.textContent = `${p.name} — $${formatNumber(p.balance)}`;
      ui.leaderboardList.appendChild(li);
    });
  }

  /* ==== График (Canvas) с точками входа/выхода ==== */
  const canvas = $id('priceChart');
  const ctx = canvas.getContext('2d');
  function drawChart(asset){
    const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    const h = canvas.height = 220 * (window.devicePixelRatio || 1);
    ctx.clearRect(0,0,w,h);

    const hist = state.market[asset].history.slice(-100);
    if(hist.length < 2) return;

    // find min/max
    const min = Math.min(...hist);
    const max = Math.max(...hist);
    const pad = (max - min) * 0.1 || max*0.05;
    const yMin = min - pad, yMax = max + pad;

    // draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for(let i=0;i<4;i++){
      const yy = h * i/4;
      ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(w,yy); ctx.stroke();
    }

    // draw price line
    ctx.beginPath();
    hist.forEach((p,i)=>{
      const x = (i/(hist.length-1)) * w;
      const y = h - ((p - yMin) / (yMax - yMin)) * h;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    // draw entry/exit markers if exist in visible range
    if(state.position && state.position.asset === asset){
      const entryPrice = state.position.entryPrice;
      const idx = hist.findIndex(p => Math.abs(p-entryPrice)/entryPrice < 0.0005); // approximate index
      if(idx >= 0){
        const x = (idx/(hist.length-1))*w;
        const y = h - ((entryPrice - yMin) / (yMax - yMin)) * h;
        drawMarker(x,y,'ENTRY');
      }
    }

    // last closed position marker (most recent history[0]) — show exit
    if(state.history.length > 0 && state.history[0].asset === asset){
      const exit = state.history[0].exitPrice;
      // attempt to find approx index
      const idx = hist.findIndex(p => Math.abs(p-exit)/exit < 0.0005);
      if(idx >= 0){
        const x = (idx/(hist.length-1))*w;
        const y = h - ((exit - yMin) / (yMax - yMin)) * h;
        drawMarker(x,y,'EXIT');
      }
    }

    function drawMarker(x,y,label){
      ctx.fillStyle = '#ffb86b';
      ctx.beginPath(); ctx.arc(x,y,6*(window.devicePixelRatio||1),0,Math.PI*2); ctx.fill();
      ctx.font = `${12*(window.devicePixelRatio||1)}px Arial`;
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x+8*(window.devicePixelRatio||1), y-8*(window.devicePixelRatio||1));
    }
  }

  /* ==== Market impact: покупка долларов за Stars (шаблон) ==== */
  function buyStarsFlow(){
    // WebApp обычно инициирует запрос к боту, бот вызывает Invoice. Здесь — пример отправки события боту.
    const payload = { type:'buy_stars_request', user: state.profile.id };
    if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.sendData){
      window.Telegram.WebApp.sendData(JSON.stringify(payload));
      alert('Запрос на покупку Stars отправлен боту. Бот должен инициировать оплату.');
    } else {
      alert('В режиме веб без Telegram. Реализуйте оплату через бота или сервер.');
    }
  }

  /* ==== Пополнение долларов за Stars — пример API вызова/функция для вызова после оплаты ==== */
  function buyDollarsForStars(amountUsd){
    // Возвращаем Promise, который выполняется, если пользователь оплатил через интеграцию
    return new Promise((resolve, reject) => {
      // Пример: проверяем, есть ли у пользователя stars
      if(state.profile.stars >= Math.ceil(amountUsd/1)){ // условный курс: 1 star = 1$
        state.profile.stars -= Math.ceil(amountUsd/1);
        state.profile.balance += amountUsd;
        saveLocal();
        resolve();
      } else {
        // в реальности нужно инициировать оплату через Telegram Payment API (бот)
        // Предложим отправить пользователю запрос (placeholder)
        if(confirm('У вас недостаточно Stars. Отправить запрос на покупку Stars через бота?')){
          buyStarsFlow();
          // мы не можем завершить promise — пользователь оплатит через бота и бот должен прислать webhook, который обновит состояние
          reject();
        } else reject();
      }
    });
  }

  /* ==== Влияние массовых покупок/продаж: подстройка цены через demand ==== */
  // Для демонстрации: если много игроков покупают актив, его demand растёт и цена подтягивается в tickMarket()
  // В реальном мультиплеере нужно агрегировать ордера и применять impact

  /* ==== Инициализация рынка и loop ==== */
  function initMarket(){
    // подготовка историй
    ASSETS.forEach(a=>{
      if(!state.market[a].history || state.market[a].history.length === 0){
        state.market[a].history = Array.from({length:200}, ()=>state.market[a].price);
      }
    });

    // основной тик
    setInterval(()=>tickMarket(), 1000);
    // UI обновление
    setInterval(()=>updateUI(), 1000);
  }

  /* ==== События UI при смене актива ==== */
  function onAssetChange(){ drawChart($id('asset-select').value); }

  /* ==== Рендер всех ==== */
  function renderAll(){
    updateUI();
    renderHistory();
    renderLeaderboard();
    // render events
    ui.eventsList.innerHTML = '';
    saveLocal();
  }

  /* ==== Запуск приложения ==== */
  function run(){
    loadLocal();
    initUI();
    initMarket();
    renderAll();
  }

  run();

  /* ==== Экспорт (для консоли) ==== */
  window._MINITRADE = { state, saveLocal, loadLocal, applyRandomEvent };

})();
