const { app, BrowserWindow, screen } = require('electron')
const { ipcMain, dialog, shell } = require('electron');

const Store = require('electron-store').default;

const path = require('path');
const fs = require('fs');
const { readStatement } = require('./statement-reader');

const store = new Store();

const ABOUT_URL = "https://github.com/kingmajin/Croco-Analyst";

const createWindow = () => {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1600, screenWidth),
    height: Math.min(950, screenHeight),
    minWidth: 1280,
    minHeight: 720,
    icon: path.join(__dirname, "assets/croco-analyst.ico"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // The app is a single local page, never open or navigate to anything else
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

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
ipcMain.handle('select-file', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xls', 'xlsx'] }]
  });

  if (result.canceled) return null;

  return result.filePaths[0]; // ✅ always valid path
});

// Read excel file and return { headers, records } or { error }
ipcMain.handle('read-excel', async (event, { filePath, fromRow, toRow }) => {
  return readStatement(filePath, fromRow, toRow);
});

ipcMain.handle('save-mappings', (event, data) => {
    store.set('mappings', data);
});

ipcMain.handle('get-mappings', () => {
    return store.get('mappings', []);
});

ipcMain.handle('show-error', async (event, message) => {
  dialog.showErrorBox('Validation Error', message);
});

// Ask a yes/no question, resolves to true when the user confirms
ipcMain.handle('confirm', async (event, { message, confirmLabel }) => {
  const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: 'warning',
    buttons: ['Cancel', confirmLabel],
    defaultId: 0,
    cancelId: 0,
    message
  });
  return response === 1;
});

ipcMain.handle('set-tags', (event, data) => {
    store.set('tags', data);
});

ipcMain.handle('get-tags', () => {
    return store.get('tags', {});
});

// Save the page as it prints (the report's print styles) to a PDF the user picks
ipcMain.handle('save-report-pdf', async (event, fileName) => {
  const safeName = path.basename(String(fileName)).replace(/[<>:"\/\\|?*]/g, "_");

  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    defaultPath: path.join(app.getPath('documents'), safeName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return { saved: false };

  try {
    const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4' });
    await fs.promises.writeFile(filePath, pdf);
    return { saved: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("open-about", async () => {
  await shell.openExternal(ABOUT_URL);
});
