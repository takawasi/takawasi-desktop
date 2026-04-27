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
    streamInfo: () => ipcRenderer.invoke('tba:streamInfo'),
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
    cookieHeader: () => ipcRenderer.invoke('launchpad:cookieHeader'),
  },
  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', { url }),
  },
});
