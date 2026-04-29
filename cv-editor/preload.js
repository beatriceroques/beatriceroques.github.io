const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cvApi', {
  getAll: () => ipcRenderer.invoke('cv:getAll'),
  save: (payload) => ipcRenderer.invoke('cv:save', payload),
  pickPhoto: () => ipcRenderer.invoke('cv:pickPhoto'),
  photoDataUrl: (photoPath) => ipcRenderer.invoke('cv:photoDataUrl', photoPath),
  exportPdf: (html, suggestedName) =>
    ipcRenderer.invoke('cv:exportPdf', html, suggestedName),
});
