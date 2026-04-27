// renderer/app.ts — Takawasi Desktop renderer process
// Runs in contextIsolation. Access to main via window.takawasi (contextBridge)
// Types: see globals.d.ts

// ── Resizer ─────────────────────────────────────────────────────────────────

function initResizers(): void {
  // Horizontal resizers between panels
  document.querySelectorAll<HTMLElement>('.resizer[data-direction="h"]').forEach(resizer => {
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const prev = resizer.previousElementSibling as HTMLElement | null;
      const next = resizer.nextElementSibling as HTMLElement | null;
      if (!prev || !next) return;

      resizer.classList.add('dragging');
      const startX = e.clientX;
      const prevW = prev.getBoundingClientRect().width;
      const nextW = next.getBoundingClientRect().width;

      function onMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const newPrev = Math.max(180, prevW + dx);
        const newNext = Math.max(180, nextW - dx);
        prev!.style.flex = 'none';
        prev!.style.width = `${newPrev}px`;
        next!.style.flex = 'none';
        next!.style.width = `${newNext}px`;
      }
      function onUp() {
        resizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // Vertical resizer between panels-row and terminal
  const vResizer = document.getElementById('resizer-v');
  const terminalPanelEl = document.getElementById('terminal-panel');
  const panelsRow = document.getElementById('panels-row');
  if (vResizer && terminalPanelEl && panelsRow) {
    const capturedVResizer = vResizer;
    const capturedTermPanel = terminalPanelEl;
    capturedVResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      capturedVResizer.classList.add('dragging');
      const startY = e.clientY;
      const termH = capturedTermPanel.getBoundingClientRect().height;

      function onMove(ev: MouseEvent) {
        const dy = startY - ev.clientY;
        const newH = Math.max(120, Math.min(globalThis.innerHeight * 0.6, termH + dy));
        capturedTermPanel.style.height = `${newH}px`;
        capturedTermPanel.style.flexShrink = '0';
      }
      function onUp() {
        capturedVResizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        termFitAddon?.fit();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function updateAuthUI(loggedIn: boolean): void {
  const status = document.getElementById('auth-status')!;
  const btnLogin = document.getElementById('btn-login')!;
  const btnLogout = document.getElementById('btn-logout')!;
  if (loggedIn) {
    status.textContent = 'ログイン済み';
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    // Refresh LaunchPad after login
    loadLaunchPad();
  } else {
    status.textContent = '未ログイン';
    btnLogin.classList.remove('hidden');
    btnLogout.classList.add('hidden');
  }
}

async function initAuth(): Promise<void> {
  const { loggedIn } = await window.takawasi.auth.check();
  updateAuthUI(loggedIn);

  window.takawasi.auth.onCompleted((data) => {
    updateAuthUI(data.loggedIn);
  });

  document.getElementById('btn-login')!.addEventListener('click', () => {
    window.takawasi.auth.login();
  });
  document.getElementById('btn-logout')!.addEventListener('click', async () => {
    await window.takawasi.auth.logout();
    updateAuthUI(false);
    document.getElementById('lp-list')!.innerHTML = '<div class="lp-placeholder">ログイン後に生成物が表示されます</div>';
  });
}

// ── Service WebView ───────────────────────────────────────────────────────────

function initServicePanel(): void {
  const select = document.getElementById('service-select') as HTMLSelectElement;
  const wv = document.getElementById('wv-services') as Electron.WebviewTag;
  select.addEventListener('change', () => {
    (wv as unknown as { src: string }).src = select.value;
  });
}

// ── Panel tabs (single-panel mobile-like nav) ─────────────────────────────────
// In desktop mode we show all panels; nav buttons just scroll/focus

function initNav(): void {
  const mainLayout = document.getElementById('main-layout')!;
  // Enable multi-panel mode always (full desktop layout)
  mainLayout.classList.add('multi-panel');

  document.querySelectorAll<HTMLElement>('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Focus corresponding panel
      const panelId = `panel-${btn.dataset.panel}`;
      document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ── TBA Chat (Phase D) ────────────────────────────────────────────────────────

let tbaStreaming = false;

function appendTbaMsg(type: 'user' | 'assistant' | 'stage', text: string): HTMLElement {
  const messages = document.getElementById('tba-messages')!;
  const div = document.createElement('div');
  div.className = `tba-msg ${type}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

async function sendTbaMessage(message: string): Promise<void> {
  if (tbaStreaming || !message.trim()) return;
  tbaStreaming = true;

  const sendBtn = document.getElementById('tba-send') as HTMLButtonElement;
  const stageLabel = document.getElementById('tba-stage-label')!;
  sendBtn.disabled = true;

  appendTbaMsg('user', message);

  const { cookieHeader, endpoint } = await window.takawasi.tba.streamInfo();

  const assistantDiv = appendTbaMsg('assistant', '');
  let accumulated = '';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      assistantDiv.textContent = `エラー: HTTP ${response.status}`;
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      assistantDiv.textContent = 'ストリームを取得できませんでした';
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              stage?: number;
              stage_name?: string;
              content?: string;
              delta?: string;
            };
            if (parsed.type === 'stage' || parsed.stage !== undefined) {
              const stageName = parsed.stage_name || `段 ${parsed.stage}`;
              stageLabel.textContent = stageName;
              appendTbaMsg('stage', `[${stageName}]`);
            } else if (parsed.content) {
              accumulated += parsed.content;
              assistantDiv.textContent = accumulated;
              document.getElementById('tba-messages')!.scrollTop = document.getElementById('tba-messages')!.scrollHeight;
            } else if (parsed.delta) {
              accumulated += parsed.delta;
              assistantDiv.textContent = accumulated;
              document.getElementById('tba-messages')!.scrollTop = document.getElementById('tba-messages')!.scrollHeight;
            }
          } catch {
            // plain text chunk
            accumulated += data;
            assistantDiv.textContent = accumulated;
          }
        }
      }
    }

    stageLabel.textContent = '';
    if (!accumulated) assistantDiv.textContent = '(応答なし)';
  } catch (err) {
    assistantDiv.textContent = `接続エラー: ${String(err)}`;
    stageLabel.textContent = '';
  } finally {
    tbaStreaming = false;
    sendBtn.disabled = false;
  }
}

function initTba(): void {
  const input = document.getElementById('tba-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('tba-send')!;

  sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    sendTbaMessage(msg);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      sendTbaMessage(msg);
    }
  });
}

// ── LaunchPad (Phase D) ───────────────────────────────────────────────────────

interface LPItem {
  name: string;
  type: string;
  path: string;
}

async function loadLaunchPad(): Promise<void> {
  const list = document.getElementById('lp-list')!;
  list.innerHTML = '<div class="lp-placeholder">読み込み中...</div>';

  try {
    const { cookieHeader } = await window.takawasi.launchpad.cookieHeader();
    const res = await fetch('https://launchpad.takawasi-social.com/api/list', {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {},
      credentials: 'include',
    });

    if (res.status === 401) {
      list.innerHTML = '<div class="lp-placeholder">ログインが必要です</div>';
      return;
    }
    if (!res.ok) {
      list.innerHTML = `<div class="lp-placeholder">エラー: HTTP ${res.status}</div>`;
      return;
    }

    const data = await res.json() as { items?: LPItem[] };
    const items: LPItem[] = data.items || [];

    if (items.length === 0) {
      list.innerHTML = '<div class="lp-placeholder">生成物がありません</div>';
      return;
    }

    list.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'lp-item';
      row.innerHTML = `
        <span class="lp-item-type">${escapeHtml(item.type || 'file')}</span>
        <span class="lp-item-name">${escapeHtml(item.name)}</span>
        <button class="lp-dl-btn" data-path="${escapeHtml(item.path)}">DL</button>
      `;
      row.querySelector('.lp-dl-btn')!.addEventListener('click', () => downloadItem(item, cookieHeader));
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<div class="lp-placeholder">接続エラー: ${escapeHtml(String(err))}</div>`;
  }
}

async function downloadItem(item: LPItem, cookieHeader: string): Promise<void> {
  try {
    const res = await fetch(`https://launchpad.takawasi-social.com/api/download?path=${encodeURIComponent(item.path)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
      credentials: 'include',
    });
    if (!res.ok) { alert(`DL エラー: HTTP ${res.status}`); return; }
    const data = await res.json() as { url?: string; download_url?: string };
    const url = data.url || data.download_url;
    if (url) window.takawasi.shell.openExternal(url);
  } catch (err) {
    alert(`DL エラー: ${String(err)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initLaunchPad(): void {
  document.getElementById('btn-lp-refresh')!.addEventListener('click', loadLaunchPad);
}

// ── Terminal (Phase C) ────────────────────────────────────────────────────────

let termFitAddon: { fit: () => void } | null = null;

interface XTermLike {
  open: (el: HTMLElement) => void;
  loadAddon: (addon: object) => void;
  onData: (cb: (data: string) => void) => void;
  write: (data: string) => void;
  dispose: () => void;
}
interface FitAddonLike { fit: () => void; }

async function initTerminal(): Promise<void> {
  // In Electron renderer (file:// origin), we load xterm via script tags in HTML
  // or use a typed require shim. The Terminal class is expected to be globally
  // available from the xterm CSS/JS link in index.html, OR loaded via require.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as unknown as Record<string, unknown>;
  // Try global (if xterm was loaded via <script> tag), then skip gracefully
  const TerminalClass = (g['Terminal'] as (new (opts: object) => XTermLike) | undefined);
  const FitAddonClass = (g['FitAddon'] as (new () => FitAddonLike) | undefined);

  if (!TerminalClass) {
    const container = document.getElementById('terminal-container');
    if (container) container.textContent = 'xterm.js を読み込めませんでした（開発モードでは npm run dev で起動してください）';
    return;
  }

  const term: XTermLike = new TerminalClass({
    theme: {
      background: '#000000',
      foreground: '#e8e8f5',
      cursor: '#60a5fa',
    },
    fontSize: 13,
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    cursorBlink: true,
  });

  if (FitAddonClass) {
    const fitAddon: FitAddonLike = new FitAddonClass();
    term.loadAddon(fitAddon);
    termFitAddon = fitAddon;
  }

  const container = document.getElementById('terminal-container')!;
  term.open(container);
  termFitAddon?.fit();

  const termId = 'main';
  window.takawasi.terminal.onData(termId, (data: string) => term.write(data));
  window.takawasi.terminal.onExit(termId, () => term.write('\r\n[プロセス終了]\r\n'));

  const result = await window.takawasi.terminal.create(termId);
  if (!result.ok) {
    term.write(`\r\nターミナル初期化エラー: ${result.error || 'unknown'}\r\n`);
    return;
  }

  term.onData((data: string) => window.takawasi.terminal.write(termId, data));

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      termFitAddon?.fit();
      const cols = Math.max(40, Math.floor(container.clientWidth / 8));
      const rows = Math.max(4, Math.floor(container.clientHeight / 18));
      window.takawasi.terminal.resize(termId, cols, rows);
    });
    ro.observe(container);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initResizers();
  initServicePanel();
  initAuth();
  initTba();
  initLaunchPad();
  await initTerminal();
});
