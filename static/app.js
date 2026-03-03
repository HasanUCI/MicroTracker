'use strict';

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  currentDate: todayStr(),
  goals: null,
  log: [],
  selectedFood: null,
  scanner: null,
  searchMap: {},   // index → food object for search results
};

// ── Utilities ─────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr) {
  const t = todayStr();
  if (dateStr === t) return 'Today';
  const yesterday = addDays(t, -1);
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n, decimals = 1) {
  return (n ?? 0).toFixed(decimals);
}

// ── API ───────────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(data.detail || 'Request failed');
  }
  if (method === 'DELETE') return { ok: true };
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── SVG Ring ──────────────────────────────────────────────────────────────
function svgRing(current, max, color, size = 140) {
  const r    = (size - 18) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? Math.min(current / max, 1) : 0;
  const off  = circ * (1 - pct);
  const cx   = size / 2, cy = size / 2;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="9"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    </svg>`;
}

// ── Macro Summary ─────────────────────────────────────────────────────────
function renderMacroSummary(log, goals) {
  const el = document.getElementById('macro-summary');
  if (!goals) { el.innerHTML = ''; return; }

  const totals = {
    calories: log.reduce((s, e) => s + (e.calories ?? 0), 0),
    protein:  log.reduce((s, e) => s + (e.protein  ?? 0), 0),
    carbs:    log.reduce((s, e) => s + (e.carbs    ?? 0), 0),
    fat:      log.reduce((s, e) => s + (e.fat      ?? 0), 0),
    fiber:    log.reduce((s, e) => s + (e.fiber    ?? 0), 0),
  };

  const rem = goals.calories - totals.calories;

  el.innerHTML = `
    <div class="summary-card">
      <div class="calorie-ring-wrap">
        <div class="ring-container">
          ${svgRing(totals.calories, goals.calories, 'var(--primary)', 140)}
          <div class="ring-center">
            <span class="ring-value">${Math.round(totals.calories)}</span>
            <span class="ring-unit">kcal</span>
            <span class="ring-sub">of ${Math.round(goals.calories)}</span>
          </div>
        </div>
        <div class="calorie-stats">
          <div class="stat-row">Eaten: <strong>${Math.round(totals.calories)}</strong> kcal</div>
          <div class="stat-row">Goal: <strong>${Math.round(goals.calories)}</strong> kcal</div>
          <span class="remaining-tag ${rem < 0 ? 'over' : ''}">
            ${rem >= 0 ? `${Math.round(rem)} remaining` : `${Math.round(-rem)} over goal`}
          </span>
        </div>
      </div>
      <div class="macro-bars">
        ${macroBar('Protein', totals.protein, goals.protein, 'var(--protein)')}
        ${macroBar('Carbs',   totals.carbs,   goals.carbs,   'var(--carbs)')}
        ${macroBar('Fat',     totals.fat,     goals.fat,     'var(--fat)')}
        ${macroBar('Fiber',   totals.fiber,   goals.fiber,   'var(--fiber)')}
      </div>
    </div>`;
}

function macroBar(name, current, max, color) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return `
    <div class="macro-bar-item">
      <div class="macro-bar-header">
        <span class="macro-bar-name" style="color:${color}">${name}</span>
        <span class="macro-bar-value">${fmt(current)}g / ${max}g</span>
      </div>
      <div class="macro-bar-track">
        <div class="macro-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
      </div>
    </div>`;
}

// ── Food Log ──────────────────────────────────────────────────────────────
const MEAL_ORDER  = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

function renderFoodLog(log) {
  const el = document.getElementById('food-log');
  if (log.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍽️</div>
        <p>Nothing logged yet</p>
        <button class="btn-secondary" onclick="switchTab('search')">Add your first meal</button>
      </div>`;
    return;
  }

  const grouped = Object.fromEntries(MEAL_ORDER.map(m => [m, []]));
  log.forEach(e => {
    const key = grouped[e.meal] ? e.meal : 'snack';
    grouped[key].push(e);
  });

  el.innerHTML = MEAL_ORDER
    .filter(m => grouped[m].length)
    .map(m => {
      const cal = grouped[m].reduce((s, e) => s + (e.calories ?? 0), 0);
      return `
        <div class="meal-section">
          <div class="meal-header">
            <span class="meal-name">${MEAL_LABELS[m]}</span>
            <span class="meal-cal">${Math.round(cal)} kcal</span>
          </div>
          ${grouped[m].map(foodEntryHTML).join('')}
        </div>`;
    }).join('');
}

function foodEntryHTML(e) {
  const details = [
    e.brand ? esc(e.brand) : null,
    `${fmt(e.servings, 1)} × ${fmt(e.serving_size, 0)}${esc(e.serving_unit)}`,
  ].filter(Boolean).join(' · ');

  return `
    <div class="food-entry" data-id="${e.id}">
      <div class="food-entry-main">
        <div class="food-name">${esc(e.food_name)}</div>
        <div class="food-details">${details}</div>
      </div>
      <div class="food-entry-macros">
        <span class="entry-cal">${Math.round(e.calories)}</span>
        <span class="entry-macros-detail">P:${fmt(e.protein, 0)} C:${fmt(e.carbs, 0)} F:${fmt(e.fat, 0)}</span>
      </div>
      <button class="delete-btn" onclick="deleteEntry(${e.id})" title="Remove">✕</button>
    </div>`;
}

// ── Load Day ──────────────────────────────────────────────────────────────
async function loadDay(dateStr) {
  document.getElementById('current-date-label').textContent = formatDateLabel(dateStr);
  document.getElementById('next-day').disabled = (dateStr >= todayStr());

  try {
    const [log, goals] = await Promise.all([
      api(`/log/${dateStr}`),
      state.goals ? Promise.resolve(state.goals) : api('/goals'),
    ]);
    state.log = log;
    if (!state.goals) state.goals = goals;
    renderMacroSummary(log, state.goals);
    renderFoodLog(log);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Delete Entry ──────────────────────────────────────────────────────────
async function deleteEntry(id) {
  try {
    await api(`/log/${id}`, 'DELETE');
    await loadDay(state.currentDate);
    showToast('Removed from log', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Search ────────────────────────────────────────────────────────────────
let searchTimer = null;

function handleSearchInput() {
  const q = document.getElementById('search-input').value.trim();
  document.getElementById('clear-search').style.display = q ? '' : 'none';
  clearTimeout(searchTimer);

  if (!q) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  document.getElementById('search-results').innerHTML = '<div class="loading">Searching</div>';
  searchTimer = setTimeout(() => doSearch(q), 420);
}

async function doSearch(q) {
  try {
    const results = await api(`/search?q=${encodeURIComponent(q)}`);
    renderSearchResults(results);
  } catch (e) {
    document.getElementById('search-results').innerHTML =
      `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function renderSearchResults(foods) {
  state.searchMap = {};
  const el = document.getElementById('search-results');

  if (!foods.length) {
    el.innerHTML = '<div class="empty-state"><p>No results — try a different term.</p></div>';
    return;
  }

  foods.forEach((f, i) => (state.searchMap[i] = f));
  el.innerHTML = foods.map((f, i) => `
    <div class="search-result" onclick="selectFood(${i})" tabindex="0"
         onkeydown="if(event.key==='Enter')selectFood(${i})">
      <div class="result-main">
        <div class="result-name">${esc(f.description)}</div>
        ${f.brandOwner ? `<div class="result-brand">${esc(f.brandOwner)}</div>` : ''}
        <div class="result-serving">Per ${f.servingSize}${esc(f.servingSizeUnit)}</div>
      </div>
      <div class="result-macros">
        <span class="result-cal">${Math.round(f.calories)} kcal</span>
        <span class="result-pfc">P:${f.protein}g · C:${f.carbs}g · F:${f.fat}g</span>
      </div>
    </div>`).join('');
}

// ── Select Food (open modal) ──────────────────────────────────────────────
function selectFood(index) {
  state.selectedFood = state.searchMap[index];
  openAddModal(state.selectedFood);
}

function openAddModal(food) {
  document.getElementById('modal-food-name').textContent = food.description;
  document.getElementById('modal-food-brand').textContent = food.brandOwner || '';
  document.getElementById('modal-serving-info').textContent =
    `per ${food.servingSize}${food.servingSizeUnit}`;
  document.getElementById('modal-servings').value = '1';
  updateModalMacros(food, 1);
  openModal('add-modal');
}

function updateModalMacros(food, servings) {
  const defs = [
    { key: 'calories', label: 'Calories', color: 'var(--primary)',  unit: 'kcal' },
    { key: 'protein',  label: 'Protein',  color: 'var(--protein)',  unit: 'g' },
    { key: 'carbs',    label: 'Carbs',    color: 'var(--carbs)',    unit: 'g' },
    { key: 'fat',      label: 'Fat',      color: 'var(--fat)',      unit: 'g' },
    { key: 'fiber',    label: 'Fiber',    color: 'var(--fiber)',    unit: 'g' },
  ];
  document.getElementById('modal-macros').innerHTML = defs.map(d => {
    const val = (food[d.key] ?? 0) * servings;
    const disp = d.key === 'calories' ? Math.round(val) : fmt(val);
    return `
      <div class="macro-chip" style="border-color:${d.color}">
        <span class="macro-chip-value" style="color:${d.color}">${disp}</span>
        <span class="macro-chip-label">${d.label}</span>
      </div>`;
  }).join('');
}

// ── Add to Log ────────────────────────────────────────────────────────────
async function addFoodToLog() {
  const food     = state.selectedFood;
  const servings = parseFloat(document.getElementById('modal-servings').value) || 1;
  const meal     = document.getElementById('modal-meal').value;

  const entry = {
    date:         state.currentDate,
    meal,
    food_name:    food.description,
    brand:        food.brandOwner ?? '',
    serving_size: food.servingSize,
    serving_unit: food.servingSizeUnit,
    servings,
    calories: parseFloat(fmt(food.calories * servings)),
    protein:  parseFloat(fmt(food.protein  * servings)),
    carbs:    parseFloat(fmt(food.carbs    * servings)),
    fat:      parseFloat(fmt(food.fat      * servings)),
    fiber:    parseFloat(fmt(food.fiber    * servings)),
  };

  try {
    await api('/log', 'POST', entry);
    closeModal('add-modal');
    showToast(`Added ${food.description}`, 'success');
    await loadDay(state.currentDate);
    switchTab('today');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Barcode Scanner ───────────────────────────────────────────────────────
async function startScanner() {
  openModal('scanner-modal');
  document.getElementById('scanner-status').textContent = 'Starting camera…';

  try {
    state.scanner = new Html5Qrcode('reader');
    await state.scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 120 } },
      async (barcode) => {
        document.getElementById('scanner-status').textContent = `Found: ${barcode}`;
        await stopScanner();
        await lookupBarcode(barcode);
      },
      () => { /* ignore per-frame failures */ },
    );
    document.getElementById('scanner-status').textContent = 'Aim at a product barcode';
  } catch (e) {
    document.getElementById('scanner-status').textContent = '';
    closeModal('scanner-modal');
    showToast('Camera access denied or unavailable', 'error');
  }
}

async function stopScanner() {
  if (state.scanner) {
    try { await state.scanner.stop(); state.scanner.clear(); } catch (_) {}
    state.scanner = null;
  }
  closeModal('scanner-modal');
}

async function lookupBarcode(barcode) {
  showToast('Looking up product…', 'info');
  try {
    const food = await api(`/barcode/${barcode}`);
    state.selectedFood = food;
    switchTab('search');
    openAddModal(food);
  } catch (e) {
    showToast('Product not found', 'error');
  }
}

// ── Goals ─────────────────────────────────────────────────────────────────
async function loadGoals() {
  try {
    if (!state.goals) state.goals = await api('/goals');
    const g = state.goals;
    document.getElementById('goal-calories').value = g.calories;
    document.getElementById('goal-protein').value  = g.protein;
    document.getElementById('goal-carbs').value    = g.carbs;
    document.getElementById('goal-fat').value      = g.fat;
    document.getElementById('goal-fiber').value    = g.fiber;
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveGoals() {
  const goals = {
    calories: parseFloat(document.getElementById('goal-calories').value) || 2000,
    protein:  parseFloat(document.getElementById('goal-protein').value)  || 150,
    carbs:    parseFloat(document.getElementById('goal-carbs').value)    || 200,
    fat:      parseFloat(document.getElementById('goal-fat').value)      || 65,
    fiber:    parseFloat(document.getElementById('goal-fiber').value)    || 25,
  };
  try {
    state.goals = await api('/goals', 'PUT', goals);
    showToast('Goals saved!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── History ───────────────────────────────────────────────────────────────
async function loadHistory() {
  const el = document.getElementById('history-list');
  el.innerHTML = '<div class="loading">Loading</div>';
  try {
    const [history, goals] = await Promise.all([
      api('/history'),
      state.goals ? Promise.resolve(state.goals) : api('/goals'),
    ]);
    if (!state.goals) state.goals = goals;
    renderHistory(history, goals);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function renderHistory(history, goals) {
  const el = document.getElementById('history-list');
  if (!history.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No history yet — start logging your meals!</p></div>';
    return;
  }
  el.innerHTML = history.map(day => {
    const pct = goals.calories > 0 ? Math.min((day.calories / goals.calories) * 100, 100) : 0;
    return `
      <div class="history-card" onclick="viewDay('${day.date}')" tabindex="0"
           onkeydown="if(event.key==='Enter')viewDay('${day.date}')">
        <div class="history-card-top">
          <span class="history-date">${formatDateLabel(day.date)}</span>
          <span class="history-cal">${Math.round(day.calories)} kcal</span>
        </div>
        <div class="history-bar-track">
          <div class="history-bar-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="history-macros">
          P:${fmt(day.protein, 0)}g &nbsp;·&nbsp; C:${fmt(day.carbs, 0)}g &nbsp;·&nbsp; F:${fmt(day.fat, 0)}g
          &nbsp;·&nbsp; ${day.entries} item${day.entries !== 1 ? 's' : ''}
        </div>
      </div>`;
  }).join('');
}

function viewDay(dateStr) {
  state.currentDate = dateStr;
  switchTab('today');
}

// ── Tab Switching ─────────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tabName));
  document.querySelectorAll('.view').forEach(view =>
    view.classList.toggle('active', view.id === `${tabName}-view`));

  if (tabName === 'today')   loadDay(state.currentDate);
  if (tabName === 'goals')   loadGoals();
  if (tabName === 'history') loadHistory();
}

// ── Modal Helpers ─────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Event Listeners ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tab nav
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Date navigation
  document.getElementById('prev-day').addEventListener('click', () => {
    state.currentDate = addDays(state.currentDate, -1);
    loadDay(state.currentDate);
  });
  document.getElementById('next-day').addEventListener('click', () => {
    if (state.currentDate < todayStr()) {
      state.currentDate = addDays(state.currentDate, 1);
      loadDay(state.currentDate);
    }
  });

  // Search
  document.getElementById('search-input').addEventListener('input', handleSearchInput);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('search-input').value = '';
      document.getElementById('clear-search').style.display = 'none';
      document.getElementById('search-results').innerHTML = '';
    }
  });
  document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-search').style.display = 'none';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-input').focus();
  });

  // Barcode button
  document.getElementById('barcode-btn').addEventListener('click', startScanner);

  // Modal close buttons (data-modal attribute)
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.modal;
      if (id === 'scanner-modal') stopScanner();
      else closeModal(id);
    });
  });

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      const modal = overlay.closest('.modal');
      if (modal.id === 'scanner-modal') stopScanner();
      else closeModal(modal.id);
    });
  });

  // Servings input → live macro update
  document.getElementById('modal-servings').addEventListener('input', () => {
    if (!state.selectedFood) return;
    const s = parseFloat(document.getElementById('modal-servings').value) || 1;
    updateModalMacros(state.selectedFood, s);
  });

  // Add food confirmation
  document.getElementById('modal-add-btn').addEventListener('click', addFoodToLog);

  // Goals save
  document.getElementById('save-goals-btn').addEventListener('click', saveGoals);

  // Initial load
  loadDay(state.currentDate);
});
