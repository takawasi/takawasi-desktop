import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';

const TBA_ENGINE = process.env.TBA_ENGINE_URL || 'https://engine.takawasi-social.com';
const CREDITGATE_URL = 'https://creditgate.takawasi-social.com';
const CG_SESSION_COOKIE = 'cg_session';
const PARTITION = 'persist:takawasi';

let mainWin: BrowserWindow | null = null;
let authWin: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Takawasi Desktop',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      session: session.fromPartition(PARTITION),
    },
  });

  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWin.on('closed', () => {
    mainWin = null;
    app.quit();
  });
}

async function openAuthWindow(): Promise<void> {
  if (authWin) { authWin.focus(); return; }

  authWin = new BrowserWindow({
    width: 520,
    height: 700,
    title: 'ログイン — Takawasi',
    parent: mainWin || undefined,
    modal: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: session.fromPartition(PARTITION),
    },
  });

  authWin.loadURL(`${CREDITGATE_URL}/auth/login`);

  const checkCookieInterval = setInterval(async () => {
    const cookies = await session.fromPartition(PARTITION).cookies.get({
      url: CREDITGATE_URL,
      name: CG_SESSION_COOKIE,
    });
    if (cookies.length > 0) {
      clearInterval(checkCookieInterval);
      mainWin?.webContents.send('auth:completed', { loggedIn: true });
      authWin?.close();
    }
  }, 1000);

  authWin.on('closed', () => {
    clearInterval(checkCookieInterval);
    authWin = null;
  });
}

// IPC: auth
ipcMain.handle('auth:check', async () => {
  const cookies = await session.fromPartition(PARTITION).cookies.get({
    url: CREDITGATE_URL,
    name: CG_SESSION_COOKIE,
  });
  return { loggedIn: cookies.length > 0 };
});

ipcMain.handle('auth:login', async () => {
  await openAuthWindow();
  return { ok: true };
});

ipcMain.handle('auth:logout', async () => {
  await session.fromPartition(PARTITION).clearStorageData({ storages: ['cookies'] });
  mainWin?.webContents.send('auth:completed', { loggedIn: false });
  return { ok: true };
});

// IPC: TBA stream info (renderer fetches directly using returned cookie header)
ipcMain.handle('tba:streamInfo', async () => {
  const cookies = await session.fromPartition(PARTITION).cookies.get({
    url: TBA_ENGINE,
  });
  const cookieHeader = cookies.map((c: Electron.Cookie) => `${c.name}=${c.value}`).join('; ');
  return { cookieHeader, endpoint: `${TBA_ENGINE}/api/tba/chat/stream` };
});

// IPC: terminal
let pty: typeof import('node-pty') | null = null;
try { pty = require('node-pty'); } catch (e) { console.error('node-pty unavailable:', e); }

const ptySessions = new Map<string, import('node-pty').IPty>();

ipcMain.handle('terminal:create', async (event, { id }: { id: string }) => {
  if (!pty) return { ok: false, error: 'node-pty not available' };
  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
  const cliDir = app.isPackaged
    ? path.join(process.resourcesPath, 'cli')
    : path.join(app.getAppPath(), 'dist', 'cli');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: `${cliDir}${path.delimiter}${process.env.PATH || ''}`,
    TERM: 'xterm-256color',
  };
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color', cols: 80, rows: 24, cwd: os.homedir(), env,
  });
  ptySessions.set(id, ptyProcess);
  ptyProcess.onData((data: string) => event.sender.send(`terminal:data:${id}`, data));
  ptyProcess.onExit(() => { ptySessions.delete(id); event.sender.send(`terminal:exit:${id}`); });
  return { ok: true };
});

ipcMain.handle('terminal:write', (_e, { id, data }: { id: string; data: string }) => {
  ptySessions.get(id)?.write(data); return { ok: true };
});

ipcMain.handle('terminal:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  ptySessions.get(id)?.resize(cols, rows); return { ok: true };
});

ipcMain.handle('terminal:destroy', (_e, { id }: { id: string }) => {
  const p = ptySessions.get(id);
  if (p) { p.kill(); ptySessions.delete(id); }
  return { ok: true };
});

// IPC: LaunchPad cookie pass-through
ipcMain.handle('launchpad:cookieHeader', async () => {
  const cookies = await session.fromPartition(PARTITION).cookies.get({
    url: 'https://launchpad.takawasi-social.com',
  });
  return { cookieHeader: cookies.map((c: Electron.Cookie) => `${c.name}=${c.value}`).join('; ') };
});

// IPC: open external
ipcMain.handle('shell:openExternal', (_e, { url }: { url: string }) => {
  shell.openExternal(url); return { ok: true };
});

// Lifecycle
app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });
