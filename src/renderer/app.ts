// renderer/app.ts — Takawasi Desktop renderer process
// Runs in contextIsolation. Access to main via window.takawasi (contextBridge)
// Types: see globals.d.ts

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

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

function scrollTbaMessages(): void {
  const messages = document.getElementById('tba-messages')!;
  messages.scrollTop = messages.scrollHeight;
}

interface TbaSsePayload {
  stage?: string;
  text?: string;
  final?: boolean;
  code?: string;
  message?: string;
  turn_id?: string;
  credits_used?: number;
}

async function sendTbaMessage(message: string): Promise<void> {
  if (tbaStreaming || !message.trim()) return;
  tbaStreaming = true;

  const sendBtn = document.getElementById('tba-send') as HTMLButtonElement;
  const stageLabel = document.getElementById('tba-stage-label')!;
  sendBtn.disabled = true;

  appendTbaMsg('user', message);

  const assistantDiv = appendTbaMsg('assistant', '');
  let accumulated = '';
  let sseBuffer = '';
  let finished = false;
  const streamId = `tba-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function finish(): void {
    if (finished) return;
    finished = true;
    window.takawasi.tba.removeListeners(streamId);
    stageLabel.textContent = '';
    if (!accumulated && !assistantDiv.textContent.trim()) {
      assistantDiv.textContent = '(応答なし)';
    }
    tbaStreaming = false;
    sendBtn.disabled = false;
  }

  function handleSseEvent(eventName: string, rawData: string): void {
    let payload: TbaSsePayload;
    try {
      payload = JSON.parse(rawData) as TbaSsePayload;
    } catch {
      accumulated += rawData;
      assistantDiv.textContent = accumulated;
      scrollTbaMessages();
      return;
    }

    if (eventName === 'chunk') {
      const stage = payload.stage || '';
      const text = payload.text || '';
      const finalSuffix = payload.final ? ' final' : '';
      if (stage) stageLabel.textContent = `${stage}${finalSuffix}`;

      if (stage && stage !== 'execute') {
        appendTbaMsg('stage', `[${stage}${finalSuffix}] ${text}`);
        return;
      }

      if (text) {
        accumulated += text;
        assistantDiv.textContent = accumulated;
        scrollTbaMessages();
      }
      return;
    }

    if (eventName === 'done') {
      const credits = typeof payload.credits_used === 'number' ? ` credits=${payload.credits_used}` : '';
      appendTbaMsg('stage', `[done]${credits}`);
      return;
    }

    if (eventName === 'error') {
      const code = payload.code ? `${payload.code}: ` : '';
      assistantDiv.textContent = `エラー: ${code}${payload.message || rawData}`;
      scrollTbaMessages();
    }
  }

  function parseSseBlock(block: string): void {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      if (!rawLine || rawLine.startsWith(':')) continue;
      const colon = rawLine.indexOf(':');
      const field = colon >= 0 ? rawLine.slice(0, colon) : rawLine;
      let value = colon >= 0 ? rawLine.slice(colon + 1) : '';
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') eventName = value;
      if (field === 'data') dataLines.push(value);
    }
    if (dataLines.length > 0) {
      handleSseEvent(eventName, dataLines.join('\n'));
    }
  }

  function consumeSse(chunk: string): void {
    sseBuffer = `${sseBuffer}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = sseBuffer.split('\n\n');
    sseBuffer = blocks.pop() || '';
    for (const block of blocks) parseSseBlock(block);
  }

  window.takawasi.tba.onChunk(streamId, consumeSse);
  window.takawasi.tba.onError(streamId, (err) => {
    assistantDiv.textContent = `接続エラー: ${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`;
    scrollTbaMessages();
  });
  window.takawasi.tba.onEnd(streamId, () => {
    if (sseBuffer.trim()) parseSseBlock(sseBuffer);
    finish();
  });

  try {
    const started = await window.takawasi.tba.start(streamId, message);
    if (!started.ok) {
      assistantDiv.textContent = `エラー: ${started.error || 'stream start failed'}`;
      finish();
    }
  } catch (err) {
    assistantDiv.textContent = `接続エラー: ${String(err)}`;
    finish();
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
  service: string;
  runId: string;
  fileCount: number;
  sizeBytes: number;
  updatedAt?: string | null;
}

async function loadLaunchPad(): Promise<void> {
  const list = document.getElementById('lp-list')!;
  list.innerHTML = '<div class="lp-placeholder">読み込み中...</div>';

  try {
    const result = await window.takawasi.launchpad.list();
    if (!result.ok || !result.data) {
      list.innerHTML = `<div class="lp-placeholder">${escapeHtml(result.error || 'LaunchPad の読み込みに失敗しました')}</div>`;
      return;
    }

    const items: LPItem[] = [];
    for (const [service, artifacts] of Object.entries(result.data.artifacts || {})) {
      for (const artifact of artifacts) {
        items.push({
          service,
          runId: artifact.id,
          fileCount: artifact.file_count,
          sizeBytes: artifact.size_bytes,
          updatedAt: artifact.updated_at,
        });
      }
    }
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    if (items.length === 0) {
      list.innerHTML = '<div class="lp-placeholder">生成物がありません</div>';
      return;
    }

    list.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'lp-item';
      row.innerHTML = `
        <span class="lp-item-type">${escapeHtml(item.service)}</span>
        <span class="lp-item-name">${escapeHtml(item.runId)}</span>
        <span class="lp-item-meta">${escapeHtml(formatArtifactMeta(item))}</span>
        <button class="lp-dl-btn" data-service="${escapeHtml(item.service)}" data-run-id="${escapeHtml(item.runId)}">DL</button>
      `;
      row.querySelector('.lp-dl-btn')!.addEventListener('click', () => downloadItem(item));
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<div class="lp-placeholder">接続エラー: ${escapeHtml(String(err))}</div>`;
  }
}

async function downloadItem(item: LPItem): Promise<void> {
  try {
    const result = await window.takawasi.launchpad.download(item.service, item.runId);
    if (!result.ok || !result.data) {
      alert(`DL エラー: ${result.error || 'LaunchPad MCP error'}`);
      return;
    }
    const url = result.data.download_url;
    if (url) window.takawasi.shell.openExternal(url);
  } catch (err) {
    alert(`DL エラー: ${String(err)}`);
  }
}

function formatArtifactMeta(item: LPItem): string {
  const size = item.sizeBytes >= 1024 * 1024
    ? `${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(item.sizeBytes / 1024))} KB`;
  return `${item.fileCount} files / ${size}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initLaunchPad(): void {
  document.getElementById('btn-lp-refresh')!.addEventListener('click', loadLaunchPad);
}

// ── Terminal (Phase C) ────────────────────────────────────────────────────────

let termFitAddon: FitAddon | null = null;

async function initTerminal(): Promise<void> {
  const term = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e8e8f5',
      cursor: '#60a5fa',
    },
    fontSize: 13,
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    cursorBlink: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  termFitAddon = fitAddon;

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
