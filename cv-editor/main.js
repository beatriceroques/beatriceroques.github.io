const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const db = require('./src/db');

const SITE_DIR = path.resolve(__dirname, '..');

// Target pixel width for embedded images in the exported PDF.
// The CV photo renders at 38mm (~448px at 300dpi); 600px gives a sharp result
// while keeping file size small after JPEG recompression.
const EXPORT_IMAGE_MAX_WIDTH = 600;
const EXPORT_IMAGE_JPEG_QUALITY = 82;

function compressDataUrlForExport(dataUrl) {
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return dataUrl;
    const { width } = img.getSize();
    const resized =
      width > EXPORT_IMAGE_MAX_WIDTH
        ? img.resize({ width: EXPORT_IMAGE_MAX_WIDTH, quality: 'best' })
        : img;
    const jpeg = resized.toJPEG(EXPORT_IMAGE_JPEG_QUALITY);
    if (!jpeg || jpeg.length === 0) return dataUrl;
    const compressed = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    return compressed.length < dataUrl.length ? compressed : dataUrl;
  } catch {
    return dataUrl;
  }
}

function compressEmbeddedImages(html) {
  return html.replace(
    /data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g,
    (match) => compressDataUrlForExport(match)
  );
}

function resolvePhotoPath(photoPath) {
  if (!photoPath) return null;
  if (path.isAbsolute(photoPath)) return photoPath;
  // Bundled assets ship inside the app; check there first so a fresh install
  // can display the seeded photo even without the surrounding repo checkout.
  const bundled = path.join(__dirname, photoPath);
  if (fs.existsSync(bundled)) return bundled;
  return path.join(SITE_DIR, photoPath);
}

function photoToDataUrl(photoPath) {
  const abs = resolvePhotoPath(photoPath);
  if (!abs || !fs.existsSync(abs)) return null;
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'application/octet-stream';
  const buf = fs.readFileSync(abs);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'CV Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  db.open(app.getPath('userData'));

  ipcMain.handle('cv:getAll', () => db.getAll());
  ipcMain.handle('cv:save', (_e, payload) => db.saveAll(payload));
  ipcMain.handle('cv:photoDataUrl', (_e, photoPath) => photoToDataUrl(photoPath));

  ipcMain.handle('cv:pickPhoto', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir une photo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('cv:exportPdf', async (e, html, suggestedName) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win, {
      title: 'Exporter en PDF',
      defaultPath: path.join(SITE_DIR, suggestedName || 'CV.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;

    const compressedHtml = compressEmbeddedImages(html);
    const tmpFile = path.join(os.tmpdir(), `cv-export-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, compressedHtml, 'utf8');

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: false },
    });
    try {
      await printWin.loadFile(tmpFile);
      const buf = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        pageRanges: '1',
      });
      fs.writeFileSync(res.filePath, buf);
    } finally {
      if (!printWin.isDestroyed()) printWin.destroy();
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
    return res.filePath;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
