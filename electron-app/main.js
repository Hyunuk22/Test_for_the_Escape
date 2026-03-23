'use strict';

const { app, BrowserWindow, ipcMain, systemPreferences, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ── 이메일 설정 파일 ──────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'email-config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { email: '' }; }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ── 요약 메일 본문 생성 ───────────────────────────────
function buildEmailBody(data) {
  const { appTimeMap, totalActiveMs, topApp, switchCount, keywords } = data;

  const fmt = ms => {
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    return h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`;
  };

  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const sorted = Object.entries(appTimeMap).sort((a,b) => b[1]-a[1]).slice(0, 7);
  const max = sorted[0]?.[1] || 1;

  const appLines = sorted.map(([name, ms]) => {
    const bars = Math.round((ms / max) * 10);
    return `  ${name.padEnd(14)} ${fmt(ms).padStart(8)}  ${'■'.repeat(bars)}${'□'.repeat(10-bars)}`;
  }).join('\n');

  const kwLine = keywords.slice(0, 10).map(([w]) => w).join('  ·  ') || '(없음)';

  const subject = `[활동 리포트] ${today}`;

  const body = [
    `안녕하세요!`,
    `오늘의 데스크탑 활동 리포트를 보내드립니다.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  📊 ${today} 활동 요약`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `  ⏱  총 활성 시간   : ${fmt(totalActiveMs)}`,
    `  🏆 가장 많이 쓴 앱 : ${topApp}`,
    `  🔀 앱 전환 횟수   : ${switchCount}회`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  📱 앱별 사용 시간`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    appLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  🔍 오늘의 관심 키워드`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `  ${kwLine}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `오늘도 수고하셨습니다! 🎉`,
  ].join('\n');

  return { subject, body };
}

// ── 활동 추적 데이터 ──────────────────────────────────
const activityLog = [];   // [{ time, app, title }]
const appTimeMap  = {};   // { appName: ms }
let lastApp  = null;
let lastTime = null;
let trackingInterval = null;

// ── AppleScript 헬퍼 ──────────────────────────────────
function runScript(script) {
  return new Promise(resolve => {
    exec(`osascript -e '${script}'`, { timeout: 2000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

async function getActiveApp() {
  return runScript('tell application "System Events" to get name of first application process whose frontmost is true');
}

async function getWindowTitle(appName) {
  const safe = appName.replace(/"/g, '\\"');
  return runScript(`tell application "System Events" to tell process "${safe}" to get title of front window`);
}

// ── 앱 추적 루프 (3초마다) ───────────────────────────
async function trackActivity() {
  const now = Date.now();
  const currentApp = await getActiveApp();
  if (!currentApp) return;

  // 이전 앱 체류 시간 누적
  if (lastApp && lastTime) {
    const duration = now - lastTime;
    appTimeMap[lastApp] = (appTimeMap[lastApp] || 0) + duration;
  }

  // 앱이 바뀌었으면 로그 추가
  if (currentApp !== lastApp) {
    const title = await getWindowTitle(currentApp);
    activityLog.push({ time: now, app: currentApp, title: title || currentApp });
    lastApp = currentApp;
  }

  lastTime = now;
}

// ── 시간대별 집계 ─────────────────────────────────────
function buildHourMap() {
  const map = new Array(24).fill(0);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  activityLog
    .filter(e => e.time >= todayStart.getTime())
    .forEach(e => { map[new Date(e.time).getHours()]++; });
  return map;
}

// ── 키워드 추출 ───────────────────────────────────────
const STOP = new Set([
  '의','을','를','이','가','에','에서','와','과','은','는','으로','로','도',
  'the','a','an','and','or','of','in','on','at','to','for','is','are',
  '-','|','·','/','—','–','...','untitled','document','window',
]);

function extractKeywords() {
  const count = {};
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  activityLog
    .filter(e => e.time >= todayStart.getTime())
    .forEach(e => {
      if (!e.title) return;
      e.title
        .replace(/[[\]()【】]/g, ' ')
        .split(/[\s\-|·\/,]+/)
        .map(w => w.trim().replace(/[^\wㄱ-힣]/g, ''))
        .filter(w => w.length >= 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w))
        .forEach(w => { count[w] = (count[w] || 0) + 1; });
    });
  return Object.entries(count).sort((a,b) => b[1]-a[1]).slice(0, 20);
}

// ── IPC ──────────────────────────────────────────────
ipcMain.handle('get-activity-data', () => {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  // 오늘 앱별 시간 (appTimeMap은 세션 전체이므로 오늘 로그 기반으로 재계산)
  const todayAppTime = {};
  let prev = null;
  activityLog
    .filter(e => e.time >= todayStart.getTime())
    .forEach((e, i, arr) => {
      const duration = (i + 1 < arr.length ? arr[i+1].time : Date.now()) - e.time;
      todayAppTime[e.app] = (todayAppTime[e.app] || 0) + duration;
    });

  const totalActiveMs = Object.values(todayAppTime).reduce((a,b) => a+b, 0);
  const topApp = Object.entries(todayAppTime).sort((a,b) => b[1]-a[1])[0]?.[0] || '-';
  const recentLog = activityLog.filter(e => e.time >= todayStart.getTime()).slice(-30);

  return {
    appTimeMap: todayAppTime,
    hourMap: buildHourMap(),
    keywords: extractKeywords(),
    totalActiveMs,
    topApp,
    switchCount: recentLog.length,
    recentLog,
  };
});

// 이메일 설정 저장/불러오기
ipcMain.handle('load-email-config', () => loadConfig());
ipcMain.handle('save-email-config', (_, cfg) => { saveConfig(cfg); return true; });

// 이메일 전송 (기본 메일 앱으로 열기)
ipcMain.handle('send-email', (_, data) => {
  const cfg = loadConfig();
  if (!cfg.email) throw new Error('이메일 주소를 먼저 입력해주세요.');
  const { subject, body } = buildEmailBody(data);
  const mailto = `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  shell.openExternal(mailto);
  return true;
});

ipcMain.handle('check-permission', () => {
  return systemPreferences.isTrustedAccessibilityClient(false);
});

ipcMain.handle('request-permission', () => {
  systemPreferences.isTrustedAccessibilityClient(true);
});

// ── 윈도우 생성 ───────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 660,
    minWidth: 820,
    minHeight: 580,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0c0c14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 추적 시작
  trackingInterval = setInterval(trackActivity, 3000);
  trackActivity(); // 즉시 1회 실행
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (trackingInterval) clearInterval(trackingInterval);
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
