'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getActivityData:   () => ipcRenderer.invoke('get-activity-data'),
  checkPermission:   () => ipcRenderer.invoke('check-permission'),
  requestPermission: () => ipcRenderer.invoke('request-permission'),
});
