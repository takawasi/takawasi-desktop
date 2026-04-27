import { contextBridge, ipcRenderer } from 'electron';

// Expose only required APIs to renderer — contextIsolation enforced
contextBridge.exposeInMainWorld('takawasi', {
  // Auth
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onCompleted: (cb: (data: { loggedIn: boolean }) => void) => {
      ipcRenderer.on('auth:completed', (_e, data) => cb(data));
    },
  },
  // TBA
  tba: {
    start: (id: string, message: string) => ipcRenderer.invoke('tba:start', { id, message }),
    cancel: (id: string) => ipcRenderer.invoke('tba:cancel', { id }),
    onChunk: (id: string, cb: (chunk: string) => void) => {
      ipcRenderer.on(`tba:chunk:${id}`, (_e, chunk) => cb(chunk));
    },
    onError: (id: string, cb: (data: { status?: number; message: string }) => void) => {
      ipcRenderer.on(`tba:error:${id}`, (_e, data) => cb(data));
    },
    onEnd: (id: string, cb: () => void) => {
      ipcRenderer.on(`tba:end:${id}`, () => cb());
    },
    removeListeners: (id: string) => {
      ipcRenderer.removeAllListeners(`tba:chunk:${id}`);
      ipcRenderer.removeAllListeners(`tba:error:${id}`);
      ipcRenderer.removeAllListeners(`tba:end:${id}`);
    },
  },
  // Terminal
  terminal: {
    create: (id: string) => ipcRenderer.invoke('terminal:create', { id }),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    destroy: (id: string) => ipcRenderer.invoke('terminal:destroy', { id }),
    onData: (id: string, cb: (data: string) => void) => {
      ipcRenderer.on(`terminal:data:${id}`, (_e, data) => cb(data));
    },
    onExit: (id: string, cb: () => void) => {
      ipcRenderer.on(`terminal:exit:${id}`, () => cb());
    },
    removeListeners: (id: string) => {
      ipcRenderer.removeAllListeners(`terminal:data:${id}`);
      ipcRenderer.removeAllListeners(`terminal:exit:${id}`);
    },
  },
  // LaunchPad
  launchpad: {
    list: () => ipcRenderer.invoke('launchpad:list'),
    download: (service: string, runId: string) => ipcRenderer.invoke('launchpad:download', { service, runId }),
  },
  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', { url }),
  },
});
