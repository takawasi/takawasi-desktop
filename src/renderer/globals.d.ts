// Global type declarations for the renderer process
// window.takawasi is injected by contextBridge in preload/index.ts

interface TakawasiAPI {
  auth: {
    check: () => Promise<{ loggedIn: boolean }>;
    login: () => Promise<{ ok: boolean }>;
    logout: () => Promise<{ ok: boolean }>;
    onCompleted: (cb: (data: { loggedIn: boolean }) => void) => void;
  };
  tba: {
    streamInfo: () => Promise<{ cookieHeader: string; endpoint: string }>;
  };
  terminal: {
    create: (id: string) => Promise<{ ok: boolean; error?: string }>;
    write: (id: string, data: string) => Promise<{ ok: boolean }>;
    resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
    destroy: (id: string) => Promise<{ ok: boolean }>;
    onData: (id: string, cb: (data: string) => void) => void;
    onExit: (id: string, cb: () => void) => void;
    removeListeners: (id: string) => void;
  };
  launchpad: {
    cookieHeader: () => Promise<{ cookieHeader: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean }>;
  };
}

interface Window {
  takawasi: TakawasiAPI;
}
