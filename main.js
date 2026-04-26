const { app, BrowserWindow } = require('electron')
const { ipcMain, dialog } = require('electron');

const Store = require('electron-store').default;

const path = require('path');
const XLSX = require('xlsx');

const store = new Store();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Select file
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xls', 'xlsx'] }]
  });

  if (result.canceled) return null;

  return result.filePaths[0]; // ✅ always valid path
});

// Read excel file and return the object
ipcMain.handle('read-excel', async (event, { filePath, fromRow, toRow }) => {

    const workbook = XLSX.readFile(filePath);

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON (array of arrays)
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let endRow = fromRow - 1
    if( toRow == -1){
      for (let i= fromRow-1; i<data.length; i++){
        let cell = data[i];
        if (!cell || String(cell).trim() === "") break;
        endRow ++
      }
      toRow = endRow
    }

    // Slice based on row range
    const slicedData = data.slice(fromRow - 1, toRow);

    // Convert to object format 
    const headers = slicedData[0];
    const rows = slicedData.slice(1);

    const result = rows.map(row => {
      let obj = {};
      headers.forEach((key, index) => {
          obj[key] = row[index];
      });
      return obj;
    });

    return result;
});

ipcMain.handle('save-mappings', (event, data) => {
    store.set('mappings', data);
});

ipcMain.handle('get-mappings', () => {
    return store.get('mappings');
});

ipcMain.handle('show-error', async (event, message) => {
  dialog.showErrorBox('Error', message);
});