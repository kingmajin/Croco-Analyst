const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    
  selectFile: () => ipcRenderer.invoke('select-file'),

  readExcel: (filePath, fromRow, toRow) =>
    ipcRenderer.invoke('read-excel', { filePath, fromRow, toRow }),

  saveMappings: (data) => ipcRenderer.invoke('save-mappings', data),

  getMappings: () => ipcRenderer.invoke('get-mappings'),

  showError: (msg) => ipcRenderer.invoke('show-error', msg)
  
});