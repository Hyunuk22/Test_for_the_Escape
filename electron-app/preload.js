'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getActivityData:     () => ipcRenderer.invoke('get-activity-data'),
  checkPermission:     () => ipcRenderer.invoke('check-permission'),
  requestPermission:   () => ipcRenderer.invoke('request-permission'),
  loadTelegramConfig:  () => ipcRenderer.invoke('load-telegram-config'),
  saveTelegramConfig:  (cfg) => ipcRenderer.invoke('save-telegram-config', cfg),
  sendTelegram:        (data) => ipcRenderer.invoke('send-telegram', data),
});
