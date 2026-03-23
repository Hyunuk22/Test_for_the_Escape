'use strict';

// ── 유틸 ──────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분`;
  if (m > 0) return `${m}분`;
  if (s > 0) return `${s}초`;
  return '0초';
}

function formatHM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDate() {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
}

// 앱 이름으로 색상 결정 (결정론적)
const PALETTE = ['#7c6fcd','#5b8dd9','#4caf87','#d97c5b','#c45b8d','#8d5bc4','#5bc4b8','#c4a45b','#5b7dc4','#a45bc4'];
function appColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}

// ── 뷰 전환 ───────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Chart 인스턴스 관리 ───────────────────────────────
let appChartInstance = null;

// ── 분석 실행 ──────────────────────────────────────────
async function analyze() {
  showView('view-loading');
  document.getElementById('loading-msg').textContent = '활동 데이터 집계 중';

  try {
    const data = await window.api.getActivityData();
    render(data);
    showView('view-dashboard');
  } catch (e) {
    document.getElementById('loading-msg').textContent = '오류: ' + e.message;
    console.error(e);
  }
}

// ── 렌더링 ────────────────────────────────────────────
function render(data) {
  const { appTimeMap, hourMap, keywords, totalActiveMs, topApp, switchCount, recentLog } = data;

  // Header
  document.getElementById('dash-date').textContent = formatDate();

  // Stats
  document.getElementById('stat-time').textContent   = totalActiveMs > 0 ? formatTime(totalActiveMs) : '측정 중';
  document.getElementById('stat-top').textContent    = topApp || '-';
  document.getElementById('stat-switch').textContent = switchCount + '회';
  document.getElementById('stat-apps').textContent   = Object.keys(appTimeMap).length + '개';

  // App chart + list
  renderAppChart(appTimeMap);
  renderAppList(appTimeMap);

  // Heatmap
  renderHeatmap(hourMap);

  // Timeline
  renderTimeline(recentLog);

  // Keywords
  renderKeywords(keywords);
}

function renderAppChart(appTimeMap) {
  const sorted = Object.entries(appTimeMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
  if (sorted.length === 0) return;

  const labels = sorted.map(([name]) => name);
  const values = sorted.map(([,ms]) => Math.round(ms / 60000)); // → 분
  const colors = labels.map(appColor);

  if (appChartInstance) appChartInstance.destroy();

  appChartInstance = new Chart(document.getElementById('appChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1.5,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9a9ab0',
            font: { size: 11 },
            padding: 12,
            boxWidth: 10,
            boxHeight: 10,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed}분`
          }
        }
      }
    }
  });
}

function renderAppList(appTimeMap) {
  const list = document.getElementById('app-list');
  list.innerHTML = '';

  const sorted = Object.entries(appTimeMap).sort((a,b) => b[1]-a[1]).slice(0, 10);
  if (sorted.length === 0) {
    list.innerHTML = '<p class="empty">아직 추적된 데이터가 없습니다.<br/>잠시 후 다시 분석해보세요.</p>';
    return;
  }

  const max = sorted[0][1];
  sorted.forEach(([name, ms]) => {
    const pct = Math.round((ms / max) * 100);
    const color = appColor(name);
    const letter = name[0].toUpperCase();
    const row = document.createElement('div');
    row.className = 'app-row';
    row.innerHTML = `
      <div class="app-avatar" style="background:${color}">${letter}</div>
      <div class="app-info">
        <div class="app-name">${name}</div>
        <div class="app-bar-wrap">
          <div class="app-bar-bg">
            <div class="app-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
      </div>
      <span class="app-time">${formatTime(ms)}</span>
    `;
    list.appendChild(row);
  });
}

function renderHeatmap(hourMap) {
  const heatmap = document.getElementById('heatmap');
  const labels  = document.getElementById('heatmap-labels');
  heatmap.innerHTML = '';
  labels.innerHTML  = '';

  const max = Math.max(...hourMap, 1);
  hourMap.forEach((count, h) => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.setAttribute('data-tip', `${h}시: ${count}회`);
    if (count > 0) {
      const alpha = 0.12 + (count / max) * 0.78;
      cell.style.background = `rgba(124,111,205,${alpha.toFixed(2)})`;
    }
    heatmap.appendChild(cell);

    const lbl = document.createElement('div');
    lbl.className = 'heatmap-label';
    lbl.textContent = h % 3 === 0 ? `${h}` : '';
    labels.appendChild(lbl);
  });
}

function renderTimeline(log) {
  const container = document.getElementById('timeline');
  container.innerHTML = '';

  const items = [...log].reverse().slice(0, 20);
  if (items.length === 0) {
    container.innerHTML = '<p class="empty">아직 기록이 없습니다.</p>';
    return;
  }

  items.forEach(entry => {
    const color = appColor(entry.app);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <span class="timeline-time">${formatHM(entry.time)}</span>
      <div class="timeline-dot" style="background:${color}"></div>
      <div class="timeline-info">
        <div class="timeline-app">${entry.app}</div>
        ${entry.title && entry.title !== entry.app
          ? `<div class="timeline-title">${entry.title}</div>`
          : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

function renderKeywords(keywords) {
  const cloud = document.getElementById('keywords');
  cloud.innerHTML = '';

  if (!keywords || keywords.length === 0) {
    cloud.innerHTML = '<p class="empty">키워드를 추출하지 못했습니다.<br/>잠시 후 다시 시도해보세요.</p>';
    return;
  }

  const max = keywords[0][1];
  const colors = ['kw-c0','kw-c1','kw-c2','kw-c3','kw-c4'];
  keywords.forEach(([word, cnt], i) => {
    const ratio = cnt / max;
    const size = ratio > 0.7 ? 'kw-1' : ratio > 0.4 ? 'kw-2' : ratio > 0.2 ? 'kw-3' : 'kw-4';
    const tag = document.createElement('span');
    tag.className = `kw-tag ${size} ${colors[i % colors.length]}`;
    tag.textContent = word;
    tag.title = `${cnt}회 등장`;
    cloud.appendChild(tag);
  });
}

// ── 권한 확인 ─────────────────────────────────────────
async function checkPermission() {
  const granted = await window.api.checkPermission();
  if (!granted) {
    document.getElementById('permission-box').style.display = 'flex';
  }
}

// ── 이벤트 바인딩 ──────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', analyze);
document.getElementById('btn-refresh').addEventListener('click', analyze);
document.getElementById('btn-perm').addEventListener('click', () => {
  window.api.requestPermission();
});

// 시작 시 권한 확인
checkPermission();
