'use strict';

const { app, BrowserWindow, ipcMain, systemPreferences, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');

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
