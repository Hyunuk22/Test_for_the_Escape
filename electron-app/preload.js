'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getActivityData:   () => ipcRenderer.invoke('get-activity-data'),
  checkPermission:   () => ipcRenderer.invoke('check-permission'),
  requestPermission: () => ipcRenderer.invoke('request-permission'),
  loadEmailConfig:   () => ipcRenderer.invoke('load-email-config'),
  saveEmailConfig:   (cfg) => ipcRenderer.invoke('save-email-config', cfg),
  sendEmail:         (data) => ipcRenderer.invoke('send-email', data),
});
