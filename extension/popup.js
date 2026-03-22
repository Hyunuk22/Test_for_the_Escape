'use strict';

// ── 유틸 ──────────────────────────────────────────────
function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch { return null; }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분`;
  if (m > 0) return `${m}분`;
  if (s > 0) return `${s}초`;
  return '';
}

function formatDate(d = new Date()) {
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
}

// ── 한국어/영어 불용어 ──────────────────────────────
const STOP = new Set([
  '의','을','를','이','가','에','에서','와','과','은','는','으로','로','도','만',
  '에게','한','하는','하고','또는','또','및','그','저','이것','저것','것','수','있',
  '없','하','되','된','될','했','있다','없다','합니다','입니다','했습니다',
  'the','a','an','and','or','of','in','on','at','to','for','is','are','was','were',
  'it','this','that','with','from','by','as','an','be','has','have',
  'com','www','http','https','co','kr','net','org','html','page',
  '-','|','·','/','·','—','–','...','>','<','(',')',
  '검색','결과','페이지','사이트','홈','메인','공식','바로가기',
  '뉴스','기사','블로그','카페','게시판','이미지','동영상',
]);

function extractKeywords(items) {
  const count = {};
  items.forEach(item => {
    if (!item.title) return;
    // 제목에서 단어 추출 (한글·영문·숫자 2자 이상)
    const words = item.title
      .replace(/[\[\]()【】《》「」『』]/g, ' ')
      .split(/[\s\-|·\/,·…]+/)
      .map(w => w.trim().replace(/[^\wㄱ-힣]/g, ''))
      .filter(w => w.length >= 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
    words.forEach(w => { count[w] = (count[w] || 0) + 1; });
  });
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
}

// ── 뷰 전환 ───────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoadingMsg(msg) {
  document.getElementById('loading-msg').textContent = msg;
}

// ── 분석 ──────────────────────────────────────────────
async function analyze() {
  showView('view-loading');
  setLoadingMsg('방문 기록 분석 중');

  try {
    const todayStart = getTodayStart();

    // 1. 히스토리 가져오기
    let historyItems = [];
    historyItems = await chrome.history.search({
      text: '',
      startTime: todayStart,
      maxResults: 500,
    });

    // 2. 체류 시간 데이터
    const today = new Date().toDateString();
    const storageResult = await chrome.storage.local.get(`time_${today}`);
    const timeData = storageResult[`time_${today}`] || {};

    // 3. 도메인별 집계
    const domainMap = {};
    const hourMap = new Array(24).fill(0);

    historyItems.forEach(item => {
      const domain = getDomain(item.url);
      if (!domain) return;

      if (!domainMap[domain]) domainMap[domain] = { count: 0 };
      domainMap[domain].count += 1;

      if (item.lastVisitTime) {
        const h = new Date(item.lastVisitTime).getHours();
        hourMap[h]++;
      }
    });

    // 4. 키워드 추출
    const keywords = extractKeywords(historyItems);

    // 5. 사이트 정렬
    const sortedSites = Object.entries(domainMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12);

    const totalVisits = historyItems.length;
    const totalTime = Object.values(timeData).reduce((a, b) => a + b, 0);

    renderDashboard({ sortedSites, timeData, hourMap, keywords, totalVisits, totalTime });
    showView('view-dashboard');

  } catch (e) {
    console.error('analyze error:', e);
    setLoadingMsg('오류가 발생했습니다: ' + e.message);
  }
}

// ── 렌더링 ─────────────────────────────────────────────
function renderDashboard({ sortedSites, timeData, hourMap, keywords, totalVisits, totalTime }) {

  // Header
  document.getElementById('dash-date').textContent = formatDate();
  document.getElementById('stat-sites').textContent = sortedSites.length;
  document.getElementById('stat-visits').textContent = totalVisits.toLocaleString();
  document.getElementById('stat-time').textContent = totalTime > 0 ? formatTime(totalTime) : '측정 중';

  // Site list
  const siteList = document.getElementById('site-list');
  siteList.innerHTML = '';

  if (sortedSites.length === 0) {
    siteList.innerHTML = '<p class="empty-msg">오늘 방문한 사이트가 없습니다.</p>';
  } else {
    const AVATAR_COLORS = [
      '#7c6fcd','#5b8dd9','#4caf87','#d97c5b','#c45b8d',
      '#8d5bc4','#5bc4b8','#c4a45b','#5b7dc4','#a45bc4',
    ];
    const maxCount = sortedSites[0][1].count;
    sortedSites.forEach(([domain, info], i) => {
      const pct = Math.round((info.count / maxCount) * 100);
      const timeMs = timeData[domain] || 0;
      const timeStr = timeMs > 0 ? formatTime(timeMs) : '';
      const letter = domain.replace(/^(www\.)/, '')[0].toUpperCase();
      const color = AVATAR_COLORS[i % AVATAR_COLORS.length];

      const row = document.createElement('div');
      row.className = 'site-row';
      row.innerHTML = `
        <span class="site-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <div class="site-avatar" style="background:${color}">${letter}</div>
        <div class="site-info">
          <div class="site-domain">${domain}</div>
          <div class="site-bar-wrap">
            <div class="site-bar-bg">
              <div class="site-bar" style="width:${pct}%"></div>
            </div>
            <span class="site-visits">${info.count}회</span>
          </div>
        </div>
        ${timeStr ? `<span class="site-time">${timeStr}</span>` : ''}
      `;
      siteList.appendChild(row);
    });
  }

  // Heatmap
  const heatmap = document.getElementById('heatmap');
  const labels = document.getElementById('heatmap-labels');
  heatmap.innerHTML = '';
  labels.innerHTML = '';

  const maxH = Math.max(...hourMap, 1);
  hourMap.forEach((count, h) => {
    const intensity = count / maxH;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.setAttribute('data-tip', `${h}시: ${count}회`);
    if (intensity > 0) {
      const alpha = 0.15 + intensity * 0.75;
      cell.style.background = `rgba(124, 111, 205, ${alpha.toFixed(2)})`;
    }
    heatmap.appendChild(cell);

    const lbl = document.createElement('div');
    lbl.className = 'heatmap-label';
    lbl.textContent = h % 3 === 0 ? `${h}` : '';
    labels.appendChild(lbl);
  });

  // Keywords
  const cloud = document.getElementById('keywords');
  cloud.innerHTML = '';

  if (keywords.length === 0) {
    cloud.innerHTML = '<p class="empty-msg">키워드를 추출할 수 없습니다.</p>';
  } else {
    const maxKw = keywords[0][1];
    const colors = ['kw-c0','kw-c1','kw-c2','kw-c3','kw-c4'];
    keywords.forEach(([word, cnt], i) => {
      const ratio = cnt / maxKw;
      const sizeClass = ratio > 0.7 ? 'kw-1' : ratio > 0.4 ? 'kw-2' : ratio > 0.2 ? 'kw-3' : 'kw-4';
      const colorClass = colors[i % colors.length];
      const tag = document.createElement('span');
      tag.className = `keyword-tag ${sizeClass} ${colorClass}`;
      tag.textContent = word;
      tag.title = `${cnt}회 등장`;
      cloud.appendChild(tag);
    });
  }
}

// ── 이벤트 ─────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', analyze);
document.getElementById('btn-refresh').addEventListener('click', analyze);
