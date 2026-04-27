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
    start: (id: string, message: string) => Promise<{ ok: boolean; error?: string }>;
    cancel: (id: string) => Promise<{ ok: boolean }>;
    onChunk: (id: string, cb: (chunk: string) => void) => void;
    onError: (id: string, cb: (data: { status?: number; message: string }) => void) => void;
    onEnd: (id: string, cb: () => void) => void;
    removeListeners: (id: string) => void;
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
    list: () => Promise<{ ok: boolean; data?: LaunchPadListResponse; error?: string }>;
    download: (service: string, runId: string) => Promise<{ ok: boolean; data?: LaunchPadDownloadResponse; error?: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean }>;
  };
}

interface Window {
  takawasi: TakawasiAPI;
}

interface LaunchPadArtifact {
  id: string;
  file_count: number;
  size_bytes: number;
  updated_at?: string | null;
  updated_at_ts?: number | null;
  deployed_at?: string | null;
  dl_available: boolean;
  registry_corrupted: boolean;
}

interface LaunchPadListResponse {
  user_id: string;
  artifacts: Record<string, LaunchPadArtifact[]>;
  generated_at: string;
}

interface LaunchPadDownloadResponse {
  download_url?: string;
  expires_in?: number;
  size_bytes?: number;
  service?: string;
  run_id?: string;
}
