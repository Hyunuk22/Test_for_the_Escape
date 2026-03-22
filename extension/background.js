// 탭별 추적 상태 (메모리)
const tabStartTimes = {};

function getDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (!hostname || hostname === 'newtab') return null;
    return hostname;
  } catch {
    return null;
  }
}

async function recordDomainTime(domain, duration) {
  if (!domain || duration < 2000) return;
  const today = new Date().toDateString();
  const key = `time_${today}`;
  const result = await chrome.storage.local.get(key);
  const data = result[key] || {};
  data[domain] = (data[domain] || 0) + Math.round(duration);
  await chrome.storage.local.set({ [key]: data });
}

// 탭 전환 시
chrome.tabs.onActivated.addListener(async ({ tabId, previousTabId }) => {
  const now = Date.now();

  // 이전 탭 시간 기록
  if (previousTabId !== undefined && tabStartTimes[previousTabId]) {
    const { domain, startTime } = tabStartTimes[previousTabId];
    await recordDomainTime(domain, now - startTime);
    delete tabStartTimes[previousTabId];
  }

  // 새 탭 추적 시작
  try {
    const tab = await chrome.tabs.get(tabId);
    const domain = getDomain(tab.url);
    if (domain) tabStartTimes[tabId] = { domain, startTime: now };
  } catch {}
});

// 탭 URL 변경 시
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const now = Date.now();

  if (tabStartTimes[tabId]) {
    const { domain, startTime } = tabStartTimes[tabId];
    await recordDomainTime(domain, now - startTime);
    delete tabStartTimes[tabId];
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && active.id === tabId) {
    const domain = getDomain(tab.url);
    if (domain) tabStartTimes[tabId] = { domain, startTime: now };
  }
});

// 탭 닫힐 때
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabStartTimes[tabId]) {
    const { domain, startTime } = tabStartTimes[tabId];
    await recordDomainTime(domain, Date.now() - startTime);
    delete tabStartTimes[tabId];
  }
});
