/* === Trading Mini App (client-only) ===
   - Симуляция цен (3 монеты)
   - Chart.js для графиков
   - Позиции, история, рейтинг (localStorage)
*/
(() => {
  // config
  const START_BALANCE_KEY = 'tm_start_balance_v1';
  const STATE_KEY = 'tm_state_v1';

  const defaultBalance = 1000;
  const coins = [
    { id: 'COIN-A', name: 'COIN-A', price: 0.50 },
    { id: 'COIN-B', name: 'COIN-B', price: 1.20 },
    { id: 'COIN-C', name: 'COIN-C', price: 0.08 }
  ];

  // app state
  let state = loadState() || {
    balance: defaultBalance,
    positions: [], // {id, coinId, side:'long'|'short', entryPrice, margin, leverage, qty, openedAt}
    history: [],
    leaderboard: {}, // playerId: {name, balance}
  };

  // UI refs
  const selectCoin = document.getElementById('selectCoin');
  const priceNow = document.getElementById('priceNow');
  const marginInput = document.getElementById('marginInput');
  const buyBtn = document.getElementById('buyBtn');
  const sellBtn = document.getElementById('sellBtn');
  const openCount = document.getElementById('openCount');
  const priceChartCanvas = document.getElementById('priceChart');
  const positionsList = document.getElementById('positionsList');
  const historyList = document.getElementById('historyList');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const liquidationEst = document.getElementById('liquidationEst');
  const levButtons = document.querySelectorAll('.lev');
  const initialBalanceInput = document.getElementById('initialBalanceInput');
  const resetBtn = document.getElementById('resetBtn');
  const leaderboardList = document.getElementById('leaderboardList');
  const telegramShareBtn = document.getElementById('telegramShareBtn');

  // chart
  let chart;
  let chartData = { labels: [], datasets: [] };
  let currentCoin = coins[0].id;
  let currentPrices = {}; coins.forEach(c=> currentPrices[c.id] = c.price);

  // selected leverage
  let selectedLeverage = 2;

  // init UI
  function init(){
    // fill coin select
    coins.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} — ${c.price.toFixed(4)} $`;
      selectCoin.appendChild(opt);
    });

    // set start balance input
    initialBalanceInput.value = state.balance;

    // chart init
    initChart();

    // events
    selectCoin.addEventListener('change', onCoinChange);
    buyBtn.addEventListener('click', ()=>openPosition('long'));
    sellBtn.addEventListener('click', ()=>openPosition('short'));
    levButtons.forEach(b => b.addEventListener('click', onLevClick));
    resetBtn.addEventListener('click', resetAll);
    document.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab').forEach(t=>t.style.display='none');
        document.getElementById(btn.dataset.tab).style.display = 'block';
        // refresh views
        refreshPositions();
        refreshHistory();
        refreshLeaderboard();
      });
    });

    telegramShareBtn.addEventListener('click', () => {
      // открывать Telegram Web App если доступен
      if(window.Telegram && window.Telegram.WebApp){
        Telegram.WebApp.openTelegram();
      } else {
        alert('Откройте в Telegram Web App или используйте ссылку Web App URL в настройках бота.');
      }
    });

    // start price simulation
    setInterval(stepPrices, 1500);
    // update UI rate
    setInterval(uiTick, 700);

    // initial render
    onCoinChange();
    refreshPositions();
    refreshHistory();
    refreshLeaderboard();
  }

  function initChart(){
    chartData = {
      labels: [],
      datasets: [{
        label: 'Price',
        data: [],
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.2,
        borderColor: '#4a90e2',
        fill: false
      }]
    };
    chart = new Chart(priceChartCanvas.getContext('2d'), {
      type: 'line',
      data: chartData,
      options: {
        animation: false,
        interaction: {mode:'index',intersect:false},
        scales: {
          x: { display: false },
          y: { ticks: { callback: v => v.toFixed(6) } }
        },
        plugins: {
          legend: { display: false },
        }
      }
    });
  }

  // Simulate prices: random walk with coin-specific volatility
  function stepPrices(){
    coins.forEach(c => {
      const vol = Math.max(0.0003, Math.random() * 0.01 * (c.price < 1 ? 1.5 : 1));
      const shock = (Math.random() - 0.5) * vol;
      c.price = Math.max(0.00001, c.price * (1 + shock));
      currentPrices[c.id] = c.price;
    });

    // append chart data for current coin
    const val = currentPrices[currentCoin];
    const now = new Date().toLocaleTimeString();
    chartData.labels.push(now);
    chartData.datasets[0].data.push(val);
    if(chartData.labels.length > 80){
      chartData.labels.shift(); chartData.datasets[0].data.shift();
    }
    // update entry markers dataset
    drawEntryMarkers();
    chart.update();
    // update P/L
    checkPositionsForLiquidation();
  }

  function drawEntryMarkers(){
    // remove previous marker datasets
    chart.data.datasets = chart.data.datasets.filter(ds => ds.label === 'Price');
    const markers = state.positions.filter(p => p.coinId === currentCoin);
    markers.forEach((p, idx) => {
      const marker = {
        type: 'line',
        label: 'entry-' + p.id,
        data: Array(chart.data.labels.length).fill(null),
        borderColor: p.side === 'long' ? '#10b981' : '#ff4d4d',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: true,
      };
      // add a horizontal line at entry price: Chart.js doesn't have built-in horizontal lines easily without plugin,
      // so we add a dataset with two points that create a near-horizontal line across ranges
      marker.data[chart.data.labels.length - 1] = p.entryPrice;
      chart.data.datasets.push(marker);
    });
  }

  function onCoinChange(){
    currentCoin = selectCoin.value;
    // reset chart history for clarity
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    // prefill small history
    for(let i=30;i>0;i--){
      const noise = (Math.random()-0.5)*0.01;
      chart.data.labels.push('');
      chart.data.datasets[0].data.push(currentPrices[currentCoin] * (1 + noise));
    }
    chart.update();
  }

  function onLevClick(e){
    levButtons.forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    selectedLeverage = Number(e.target.dataset.lev);
  }

  function openPosition(side){
    const margin = Number(marginInput.value);
    if(!margin || margin <= 0){ alert('Укажи маржу > 0'); return; }
    if(margin > state.balance){ alert('Недостаточно баланса для маржи'); return; }

    const price = currentPrices[currentCoin];
    const qty = (margin * selectedLeverage) / price; // количество монеты под позицию
    const pos = {
      id: 'pos-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
      coinId: currentCoin,
      side,
      entryPrice: price,
      margin,
      leverage: selectedLeverage,
      qty,
      openedAt: Date.now()
    };

    state.positions.push(pos);
    state.balance -= margin; // маржа блокируется
    saveState();
    refreshPositions();
    refreshHistory();
    updateBalanceUI();
    // mark entry on chart
    drawEntryMarkers();
  }

  function refreshPositions(){
    positionsList.innerHTML = '';
    openCount.textContent = state.positions.length;
    if(state.positions.length === 0){
      positionsList.innerHTML = '<div class="muted">Нет открытых позиций</div>';
      return;
    }
    state.positions.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'position-item';
      const priceNowVal = currentPrices[p.coinId];
      // calculate unrealized P/L
      let pl;
      if(p.side === 'long') pl = (priceNowVal - p.entryPrice) * p.qty;
      else pl = (p.entryPrice - priceNowVal) * p.qty;
      const plPerc = (pl / p.margin) * 100;
      div.innerHTML = `
        <div>
          <div><b>${p.coinId}</b> • ${p.side.toUpperCase()} • ${p.leverage}x</div>
          <div class="muted">entry ${p.entryPrice.toFixed(6)} • qty ${p.qty.toFixed(6)}</div>
        </div>
        <div style="text-align:right">
          <div>${formatMoney(pl)} $</div>
          <div class="muted">${plPerc.toFixed(2)}%</div>
          <div style="margin-top:6px">
            <button class="btn-small" data-close="${p.id}">Закрыть</button>
          </div>
        </div>
      `;
      positionsList.appendChild(div);
      div.querySelector('button[data-close]').addEventListener('click', ()=>closePosition(p.id));
    });
  }

  function closePosition(id){
    const idx = state.positions.findIndex(p=>p.id===id);
    if(idx===-1) return;
    const p = state.positions[idx];
    const priceNowVal = currentPrices[p.coinId];
    let pl;
    if(p.side === 'long') pl = (priceNowVal - p.entryPrice) * p.qty;
    else pl = (p.entryPrice - priceNowVal) * p.qty;
    // return margin + P/L to balance
    state.balance += p.margin + pl;
    // push to history
    state.history.unshift({
      id: 'h-'+Date.now(),
      coinId: p.coinId,
      side: p.side,
      entryPrice: p.entryPrice,
      exitPrice: priceNowVal,
      margin: p.margin,
      leverage: p.leverage,
      pnl: pl,
      time: Date.now()
    });
    state.positions.splice(idx,1);
    saveState();
    refreshPositions();
    refreshHistory();
    updateBalanceUI();
  }

  function refreshHistory(){
    historyList.innerHTML = '';
    if(state.history.length === 0){
      historyList.innerHTML = '<div class="muted">История пуста</div>';
      return;
    }
    state.history.slice(0,80).forEach(h=>{
      const div = document.createElement('div');
      div.className = 'position-item';
      div.innerHTML = `
        <div>
          <div><b>${h.coinId}</b> • ${h.side.toUpperCase()} • ${h.leverage}x</div>
          <div class="muted">entry ${h.entryPrice.toFixed(6)} → exit ${h.exitPrice.toFixed(6)}</div>
        </div>
        <div style="text-align:right">
          <div>${formatMoney(h.pnl)} $</div>
          <div class="muted">${new Date(h.time).toLocaleString()}</div>
        </div>
      `;
      historyList.appendChild(div);
    });
  }

  function refreshLeaderboard(){
    leaderboardList.innerHTML = '';
    // local leaderboard based on stored leaderboard + this session
    // For demo, use only local player: "You"
    const players = [{name: 'You', balance: state.balance}];
    // add from state.leaderboard
    for(const k in state.leaderboard) players.push({name: state.leaderboard[k].name, balance: state.leaderboard[k].balance});
    players.sort((a,b)=>b.balance-a.balance);
    players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'leader-item';
      div.innerHTML = `<div>#${i+1} ${p.name}</div><div><b>${p.balance.toFixed(2)} $</b></div>`;
      leaderboardList.appendChild(div);
    });
  }

  function uiTick(){
    priceNow.textContent = currentPrices[currentCoin].toFixed(6);
    balanceDisplay.textContent = state.balance.toFixed(2);
    // liquidation estimate for a hypothetical new position with given margin/leverage
    const margin = Number(marginInput.value) || 0;
    if(margin > 0){
      const lev = selectedLeverage;
      const posSize = margin * lev;
      // for long: liquidation when price drops such that loss >= margin
      const entry = currentPrices[currentCoin];
      const lossPerUnit = margin / posSize * entry; // approximate => simpler compute: loss margin occurs when price moves by (margin/posSize)*entry
      const liqPriceLong = Math.max(0.000001, entry - (entry * (margin / posSize)));
      const liqPriceShort = entry + (entry * (margin / posSize));
      liquidationEst.textContent = `long ≈ ${liqPriceLong.toFixed(6)} / short ≈ ${liqPriceShort.toFixed(6)}`;
    } else liquidationEst.textContent = '—';

    refreshPositions(); // updates P/L numbers, may be heavy but ok for demo
  }

  // check for liquidation: if any position's unrealized loss ≤ -margin => liquidation -> full reset / balance = 0
  function checkPositionsForLiquidation(){
    for(const p of state.positions){
      const priceNowVal = currentPrices[p.coinId];
      let pl;
      if(p.side === 'long') pl = (priceNowVal - p.entryPrice) * p.qty;
      else pl = (p.entryPrice - priceNowVal) * p.qty;
      if(pl <= -p.margin - 1e-9){ // ликвидация
        // close all positions and set balance to 0
        state.positions = [];
        state.history.unshift({
          id: 'liq-'+Date.now(),
          coinId: p.coinId,
          side: p.side,
          entryPrice: p.entryPrice,
          exitPrice: priceNowVal,
          margin: p.margin,
          leverage: p.leverage,
          pnl: -p.margin,
          time: Date.now(),
          note: 'LIQUIDATION'
        });
        state.balance = 0;
        alert('Ликвидация! Баланс обнулён.');
        saveState();
        refreshPositions();
        refreshHistory();
        updateBalanceUI();
        break;
      }
    }
  }

  // helpers
  function formatMoney(v){ return (v >= 0 ? '+' : '') + v.toFixed(2); }

  function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  function loadState(){
    try{
      const s = localStorage.getItem(STATE_KEY);
      return s ? JSON.parse(s) : null;
    }catch(e){ return null; }
  }

  function updateBalanceUI(){ balanceDisplay.textContent = state.balance.toFixed(2); initialBalanceInput.value = state.balance; refreshLeaderboard(); }

  function resetAll(){
    if(!confirm('Сбросить все данные (баланс, истории, позиции)?')) return;
    state = {
      balance: Number(initialBalanceInput.value) || defaultBalance,
      positions: [],
      history: [],
      leaderboard: {}
    };
    saveState();
    updateBalanceUI();
    refreshPositions(); refreshHistory(); refreshLeaderboard();
  }

  // initialize default selected leverage UI
  document.querySelector('.lev[data-lev="2"]').classList.add('active');

  // start app
  init();

})();
