// ──────────────────────────────────────────────
//  Volvo EX30 Şarj Takip – app.js
// ──────────────────────────────────────────────

const BATTERY_KWH   = 69;          // Toplam batarya kapasitesi
const STORAGE_KEY   = 'ex30_charges';
const GIST_TOKEN_KEY = 'ex30_gist_token';
const GIST_ID_KEY    = 'ex30_gist_id';
const GIST_FILENAME  = 'ex30_charges.json';

// ── Başlangıç ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDate();
  calcResult();
  renderHistory();
  renderStats();
  initGistTab();
  registerSW();

  // Değer değişince sonucu güncelle
  ['startPercent', 'endPercent'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      syncInput(id === 'startPercent' ? 'start' : 'end',
                document.getElementById(id).value);
      calcResult();
    });
  });
});

// ── Service Worker ─────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Tarih başlat ───────────────────────────────
function initDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('chargeDate').value = local;
}

// ── Sekme geçişi ───────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');

  if (name === 'history') renderHistory();
  if (name === 'stats')   renderStats();
  if (name === 'sync')    initGistTab();
}

// ── Slider ↔ Input senkronizasyon ──────────────
function syncRange(side, val) {
  const inputId = side === 'start' ? 'startPercent' : 'endPercent';
  document.getElementById(inputId).value = val;
  calcResult();
}

function syncInput(side, val) {
  const rangeId = side === 'start' ? 'startRange' : 'endRange';
  const v = Math.min(100, Math.max(0, parseInt(val) || 0));
  document.getElementById(rangeId).value = v;
}

function stepPercent(side, delta) {
  const inputId = side === 'start' ? 'startPercent' : 'endPercent';
  const el = document.getElementById(inputId);
  const newVal = Math.min(100, Math.max(0, (parseInt(el.value) || 0) + delta));
  el.value = newVal;
  syncInput(side, newVal);
  calcResult();
}

// ── Hesaplama ──────────────────────────────────
function calcResult() {
  const start = parseInt(document.getElementById('startPercent').value) || 0;
  const end   = parseInt(document.getElementById('endPercent').value) || 0;
  const diff  = end - start;
  const kwh   = (BATTERY_KWH * Math.max(0, diff) / 100).toFixed(1);

  document.getElementById('resultKwh').textContent = kwh;
  document.getElementById('resultDiff').textContent =
    `%${start} → %${end} (+${Math.max(0, diff)}%)`;

  const box = document.getElementById('resultBox');
  box.classList.toggle('result-negative', diff < 0);
  return { start, end, diff, kwh: parseFloat(kwh) };
}

// ── Kaydet ─────────────────────────────────────
function saveCharge() {
  const { start, end, diff, kwh } = calcResult();

  if (diff <= 0) {
    showToast('Bitiş yüzdesi başlangıçtan büyük olmalı!', 'error');
    return;
  }

  const dateVal = document.getElementById('chargeDate').value;
  if (!dateVal) {
    showToast('Lütfen tarih seçin.', 'error');
    return;
  }

  const kmRaw = parseFloat(document.getElementById('chargeKm').value);
  const km    = kmRaw > 0 ? kmRaw : null;

  const record = {
    id:   Date.now(),
    date: dateVal,
    start,
    end,
    diff,
    kwh,
    km,
    note: document.getElementById('chargeNote').value.trim()
  };

  const charges = loadCharges();
  charges.unshift(record);
  saveCharges(charges);

  const effStr = km ? `  ·  ${(kwh / km * 100).toFixed(1)} kWh/100km` : '';
  showToast(`${kwh} kWh kaydedildi!${effStr}`, 'success');
  document.getElementById('chargeNote').value = '';
  document.getElementById('chargeKm').value   = '';
  initDate();
}

// ── Geçmiş ─────────────────────────────────────
function renderHistory() {
  const charges = loadCharges();
  const list  = document.getElementById('historyList');
  const empty = document.getElementById('emptyMsg');

  if (charges.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = charges.map(c => {
    const effRow = c.km
      ? `<p class="history-efficiency">🛣 ${c.km.toLocaleString('tr-TR')} km &nbsp;·&nbsp; ${(c.kwh / c.km * 100).toFixed(1)} kWh/100km</p>`
      : '';
    return `
    <div class="history-item" id="item-${c.id}">
      <div class="history-top">
        <span class="history-date">${formatDate(c.date)}</span>
        <button class="delete-btn" onclick="deleteCharge(${c.id})">✕</button>
      </div>
      <div class="history-main">
        <span class="history-kwh">${c.kwh} kWh</span>
        <span class="history-percent">%${c.start} → %${c.end}</span>
      </div>
      ${effRow}
      ${c.note ? `<p class="history-note">${escapeHtml(c.note)}</p>` : ''}
    </div>`;
  }).join('');
}

function deleteCharge(id) {
  const charges = loadCharges().filter(c => c.id !== id);
  saveCharges(charges);
  renderHistory();
  renderStats();
  showToast('Kayıt silindi.', 'info');
}

function confirmClear() {
  if (loadCharges().length === 0) return;
  if (confirm('Tüm şarj geçmişi silinsin mi?')) {
    saveCharges([]);
    renderHistory();
    renderStats();
    showToast('Tüm kayıtlar silindi.', 'info');
  }
}

// ── İstatistikler ──────────────────────────────
function renderStats() {
  const charges = loadCharges();

  if (charges.length === 0) {
    ['statTotal','statAvg','statCount','statMax',
     'statMonthKwh','statMonthCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id.includes('Count') ? '0' : '0 kWh';
    });
    document.getElementById('rangeEstimate').innerHTML = '';
    document.getElementById('efficiencyCard').style.display = 'none';
    return;
  }

  const totalKwh = charges.reduce((s, c) => s + c.kwh, 0);
  const avgKwh   = totalKwh / charges.length;
  const maxKwh   = Math.max(...charges.map(c => c.kwh));

  const now = new Date();
  const thisMonth = charges.filter(c => {
    const d = new Date(c.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthKwh = thisMonth.reduce((s, c) => s + c.kwh, 0);

  document.getElementById('statTotal').textContent    = totalKwh.toFixed(1) + ' kWh';
  document.getElementById('statAvg').textContent      = avgKwh.toFixed(1) + ' kWh';
  document.getElementById('statCount').textContent    = charges.length;
  document.getElementById('statMax').textContent      = maxKwh.toFixed(1) + ' kWh';
  document.getElementById('statMonthKwh').textContent  = monthKwh.toFixed(1) + ' kWh';
  document.getElementById('statMonthCount').textContent = thisMonth.length;

  // Verimlilik (sadece km girilmiş kayıtlardan)
  const withKm = charges.filter(c => c.km && c.km > 0);
  const effCard = document.getElementById('efficiencyCard');
  if (withKm.length > 0) {
    const avgEff = withKm.reduce((s, c) => s + (c.kwh / c.km * 100), 0) / withKm.length;
    document.getElementById('statEfficiency').textContent = avgEff.toFixed(1);
    document.getElementById('statEfficiencySub').textContent =
      `${withKm.length} kayıttan hesaplandı (km girilmiş seanslara göre)`;
    effCard.style.display = '';
  } else {
    effCard.style.display = 'none';
  }

  // Menzil tahmini (ortalama 15 kWh/100km)
  const kmPer100 = 15;
  const estimatedKm = (totalKwh / kmPer100 * 100).toFixed(0);
  document.getElementById('rangeEstimate').innerHTML = `
    <p class="range-text">
      Toplam şarj ettiğiniz <strong>${totalKwh.toFixed(1)} kWh</strong> ile
      yaklaşık <strong>${Number(estimatedKm).toLocaleString('tr-TR')} km</strong> yol gidebilirdiniz.
    </p>
  `;
}

// ── localStorage ───────────────────────────────
function loadCharges() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveCharges(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Yardımcılar ────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => { t.classList.remove('show'); }, 2800);
}

// ── GitHub Gist Sync ───────────────────────────
function initGistTab() {
  const token  = localStorage.getItem(GIST_TOKEN_KEY) || '';
  const gistId = localStorage.getItem(GIST_ID_KEY) || '';
  const tokenEl  = document.getElementById('gistToken');
  const gistIdEl = document.getElementById('gistId');
  if (tokenEl && !tokenEl.value)  tokenEl.value  = token;
  if (gistIdEl && !gistIdEl.value) gistIdEl.value = gistId;
}

function saveGistSettings() {
  const token  = document.getElementById('gistToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  if (token)  localStorage.setItem(GIST_TOKEN_KEY, token);
  if (gistId) localStorage.setItem(GIST_ID_KEY, gistId);
}

function setSyncStatus(msg, type) {
  const el = document.getElementById('syncStatus');
  el.textContent = msg;
  el.className = `sync-status sync-status-${type}`;
}

async function pushToGist() {
  const token  = document.getElementById('gistToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();

  if (!token) { showToast('GitHub token gerekli!', 'error'); return; }

  const charges = loadCharges();
  const content = JSON.stringify(charges, null, 2);
  setSyncStatus('Yükleniyor…', 'pending');

  try {
    let response;
    if (gistId) {
      response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } })
      });
    } else {
      response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Volvo EX30 Şarj Takip Verileri',
          public: false,
          files: { [GIST_FILENAME]: { content } }
        })
      });
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data      = await response.json();
    const newGistId = data.id;
    document.getElementById('gistId').value = newGistId;
    localStorage.setItem(GIST_ID_KEY, newGistId);
    localStorage.setItem(GIST_TOKEN_KEY, token);

    setSyncStatus(`Başarıyla yüklendi! ${charges.length} kayıt. Gist ID: ${newGistId}`, 'success');
    showToast(`${charges.length} kayıt Gist'e yüklendi!`, 'success');
  } catch (err) {
    setSyncStatus(`Hata: ${err.message}`, 'error');
    showToast('Yükleme başarısız!', 'error');
  }
}

async function pullFromGist() {
  const token  = document.getElementById('gistToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();

  if (!token || !gistId) {
    showToast('Token ve Gist ID gerekli!', 'error');
    return;
  }

  setSyncStatus('İndiriliyor…', 'pending');

  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'Authorization': `token ${token}` }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data        = await response.json();
    const fileContent = data.files[GIST_FILENAME]?.content;
    if (!fileContent) throw new Error('Dosya bulunamadı');

    const charges = JSON.parse(fileContent);
    saveCharges(charges);

    localStorage.setItem(GIST_TOKEN_KEY, token);
    localStorage.setItem(GIST_ID_KEY, gistId);

    setSyncStatus(`Başarıyla indirildi! ${charges.length} kayıt.`, 'success');
    showToast(`${charges.length} kayıt indirildi!`, 'success');
    renderHistory();
    renderStats();
  } catch (err) {
    setSyncStatus(`Hata: ${err.message}`, 'error');
    showToast('İndirme başarısız!', 'error');
  }
}
