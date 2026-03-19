// ──────────────────────────────────────────────
//  Volvo EX30 Şarj Takip – app.js
// ──────────────────────────────────────────────

const BATTERY_KWH = 69;          // Toplam batarya kapasitesi
const STORAGE_KEY = 'ex30_charges';

// ── Başlangıç ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDate();
  calcResult();
  renderHistory();
  renderStats();
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
  // datetime-local formatı: YYYY-MM-DDTHH:MM
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
  if (name === 'stats') renderStats();
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

  const record = {
    id: Date.now(),
    date: dateVal,
    start,
    end,
    diff,
    kwh,
    note: document.getElementById('chargeNote').value.trim()
  };

  const charges = loadCharges();
  charges.unshift(record);   // en yeni başa
  saveCharges(charges);

  showToast(`${kwh} kWh kaydedildi!`, 'success');
  document.getElementById('chargeNote').value = '';
  initDate();
}

// ── Geçmiş ─────────────────────────────────────
function renderHistory() {
  const charges = loadCharges();
  const list = document.getElementById('historyList');
  const empty = document.getElementById('emptyMsg');

  if (charges.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = charges.map(c => `
    <div class="history-item" id="item-${c.id}">
      <div class="history-top">
        <span class="history-date">${formatDate(c.date)}</span>
        <button class="delete-btn" onclick="deleteCharge(${c.id})">✕</button>
      </div>
      <div class="history-main">
        <span class="history-kwh">${c.kwh} kWh</span>
        <span class="history-percent">%${c.start} → %${c.end}</span>
      </div>
      ${c.note ? `<p class="history-note">${escapeHtml(c.note)}</p>` : ''}
    </div>
  `).join('');
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

  document.getElementById('statTotal').textContent   = totalKwh.toFixed(1) + ' kWh';
  document.getElementById('statAvg').textContent     = avgKwh.toFixed(1) + ' kWh';
  document.getElementById('statCount').textContent   = charges.length;
  document.getElementById('statMax').textContent     = maxKwh.toFixed(1) + ' kWh';
  document.getElementById('statMonthKwh').textContent = monthKwh.toFixed(1) + ' kWh';
  document.getElementById('statMonthCount').textContent = thisMonth.length;

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
