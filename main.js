const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const BALL = 60;
const PANEL = { w: 360, h: 560 };
let win, pos, dragOff = null, expanded = false, pinnedOnTop = true;

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadPos() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}
function savePos() { try { fs.writeFileSync(stateFile(), JSON.stringify(pos)); } catch {} }
function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - BALL - 24, y: wa.y + 120 };
}
function inView(p) {
  return screen.getAllDisplays().some(d => {
    const b = d.workArea;
    return p.x >= b.x && p.y >= b.y && p.x + BALL <= b.x + b.width && p.y + BALL <= b.y + b.height;
  });
}
function applyTop() {
  win.setAlwaysOnTop(pinnedOnTop, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createWindow() {
  pos = loadPos();
  if (!pos || !inView(pos)) pos = defaultPos();
  win = new BrowserWindow({
    x: pos.x, y: pos.y, width: BALL, height: BALL,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    fullscreenable: false, skipTaskbar: true, minWidth: 1, minHeight: 1,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  applyTop();
  win.loadFile('index.html');
}

function setExpanded(v) {
  expanded = v;
  if (!win) return;
  if (v) {
    const wa = screen.getDisplayMatching({ x: pos.x, y: pos.y, width: BALL, height: BALL }).workArea;
    const x = Math.max(wa.x, Math.min(pos.x, wa.x + wa.width - PANEL.w));
    const y = Math.max(wa.y, Math.min(pos.y, wa.y + wa.height - PANEL.h));
    win.setBounds({ x, y, width: PANEL.w, height: PANEL.h });
    win.focus();
  } else {
    win.setBounds({ x: pos.x, y: pos.y, width: BALL, height: BALL });
  }
}

ipcMain.on('expanded', (_e, v) => setExpanded(v));
ipcMain.on('drag-start', () => {
  const c = screen.getCursorScreenPoint(), b = win.getBounds();
  dragOff = { x: c.x - b.x, y: c.y - b.y };
});
ipcMain.on('drag-move', () => {
  if (!dragOff) return;
  const c = screen.getCursorScreenPoint(), b = win.getBounds();
  win.setBounds({ x: c.x - dragOff.x, y: c.y - dragOff.y, width: b.width, height: b.height });
});
ipcMain.on('drag-end', () => {
  dragOff = null;
  const b = win.getBounds();
  pos = { x: b.x, y: b.y };
  savePos();
});
ipcMain.on('context-menu', () => {
  Menu.buildFromTemplate([
    { label: 'Always on top', type: 'checkbox', checked: pinnedOnTop,
      click: m => { pinnedOnTop = m.checked; applyTop(); } },
    { label: 'Launch at login', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: m => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { label: 'Reset position', click: () => { pos = defaultPos(); savePos(); setExpanded(expanded); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]).popup({ window: win });
});

// ---- macOS Calendar import (next 7 days) via AppleScript ----
const CAL_SCRIPT = `
set startD to current date
set time of startD to 0
set endD to startD + 7 * days
set out to ""
tell application "Calendar"
  repeat with c in calendars
    try
      set evs to (every event of c whose start date ≥ startD and start date < endD)
      repeat with e in evs
        set out to out & (summary of e) & "||" & ((start date of e) as «class isot» as string) & "||" & (uid of e) & linefeed
      end repeat
    end try
  end repeat
end tell
return out`;

ipcMain.handle('sync-calendar', () => new Promise(resolve => {
  if (process.platform !== 'darwin') return resolve({ error: 'Calendar sync is only available on macOS.' });
  execFile('osascript', ['-e', CAL_SCRIPT], { timeout: 90000 }, (err, stdout) => {
    if (err) return resolve({ error: 'Calendar access failed. Allow it in System Settings → Privacy & Security → Automation / Calendars.' });
    const events = stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [title, isot, uid] = l.split('||');
      const time = (isot || '').slice(11, 16);
      return { title, date: (isot || '').slice(0, 10), time: time === '00:00' ? '' : time, uid };
    });
    resolve({ events });
  });
}));

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
