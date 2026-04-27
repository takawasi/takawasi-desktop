// renderer/app.ts — Takawasi Desktop v0.2 renderer
// VSCode-like dockable UI with activity bar using dockview-core

import { createDockview } from 'dockview-core';
import type {
  DockviewApi,
  IContentRenderer,
  GroupPanelPartInitParameters,
  CreateComponentOptions,
  IDockviewPanel,
} from 'dockview-core';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

// ── localStorage key for panel layout state ─────────────────────────────────
const LAYOUT_KEY = 'takawasi-desktop-v2-layout';

// ── Panel id enum ─────────────────────────────────────────────────────────────
const PANEL_IDS = ['services', 'tba', 'launchpad', 'terminal'] as const;
type PanelId = typeof PANEL_IDS[number];

// ── Helper: clone a <template> content ───────────────────────────────────────
function cloneTemplate(id: string): HTMLElement {
  const tmpl = document.getElementById(id) as HTMLTemplateElement | null;
  if (!tmpl) throw new Error(`Template not found: ${id}`);
  const node = tmpl.content.cloneNode(true) as DocumentFragment;
  const root = node.firstElementChild as HTMLElement;
  if (!root) throw new Error(`Template has no root element: ${id}`);
  return root;
}

// ── Content Renderers ─────────────────────────────────────────────────────────

class ServicesRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-services');
  }
  init(_params: GroupPanelPartInitParameters): void {
    const select = this.element.querySelector<HTMLSelectElement>('#service-select');
    const wv = this.element.querySelector<Element>('#wv-services');
    if (select && wv) {
      select.addEventListener('change', () => {
        (wv as unknown as { src: string }).src = select.value;
      });
    }
  }
}

class TbaRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-tba');
    // Wrap input + button in a row div
    const inputArea = this.element.querySelector<HTMLElement>('#tba-input-area');
    if (inputArea) {
      const input = inputArea.querySelector<HTMLElement>('#tba-input');
      const send = inputArea.querySelector<HTMLElement>('#tba-send');
      const stageLabel = inputArea.querySelector<HTMLElement>('#tba-stage-label');
      if (input && send) {
        const row = document.createElement('div');
        row.className = 'tba-input-row';
        if (stageLabel) inputArea.insertBefore(stageLabel, input);
        inputArea.insertBefore(row, input);
        row.appendChild(input);
        row.appendChild(send);
      }
    }
  }
  init(_params: GroupPanelPartInitParameters): void {
    initTbaInElement(this.element);
  }
}

class LaunchpadRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-launchpad');
  }
  init(_params: GroupPanelPartInitParameters): void {
    const btn = this.element.querySelector<HTMLButtonElement>('#btn-lp-refresh');
    if (btn) btn.addEventListener('click', () => { void loadLaunchPadInElement(this.element); });
  }
}

class TerminalRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  private _fitAddon: FitAddon | null = null;

  constructor() {
    this.element = cloneTemplate('tmpl-terminal');
  }

  init(_params: GroupPanelPartInitParameters): void {
    void initTerminalInElement(this.element, (fit) => { this._fitAddon = fit; });
  }

  layout(_width: number, _height: number): void {
    this._fitAddon?.fit();
  }

  dispose(): void {
    this._fitAddon = null;
  }
}

// ── Component factory (createDockview requires this) ──────────────────────────

function componentFactory(options: CreateComponentOptions): IContentRenderer {
  switch (options.name) {
    case 'services': return new ServicesRenderer();
    case 'tba': return new TbaRenderer();
    case 'launchpad': return new LaunchpadRenderer();
    case 'terminal': return new TerminalRenderer();
    default: return new ServicesRenderer();
  }
}

// ── Dockview setup ────────────────────────────────────────────────────────────

let dockviewApi: DockviewApi | null = null;

function buildDockview(container: HTMLElement): DockviewApi {
  return createDockview(container, {
    createComponent: componentFactory,
    theme: {
      name: 'dockview-theme-dark',
      className: 'dockview-theme-dark',
    },
    disableFloatingGroups: false,
  });
}

interface SavedLayout {
  version: number;
  layout: ReturnType<DockviewApi['toJSON']>;
}

function saveLayout(): void {
  if (!dockviewApi) return;
  try {
    const data: SavedLayout = { version: 1, layout: dockviewApi.toJSON() };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  } catch {
    // localStorage failures are non-fatal
  }
}

function tryRestoreLayout(api: DockviewApi): boolean {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as SavedLayout;
    if (saved.version !== 1 || !saved.layout) return false;
    api.fromJSON(saved.layout);
    return true;
  } catch {
    return false;
  }
}

function addDefaultPanels(api: DockviewApi): void {
  // Initial 3-column layout + terminal below services
  api.addPanel({
    id: 'services',
    component: 'services',
    title: 'サービス',
    initialWidth: 600,
  });

  api.addPanel({
    id: 'tba',
    component: 'tba',
    title: 'TBA チャット',
    position: { referencePanel: 'services', direction: 'right' },
    initialWidth: 400,
  });

  api.addPanel({
    id: 'launchpad',
    component: 'launchpad',
    title: 'LaunchPad',
    position: { referencePanel: 'tba', direction: 'right' },
    initialWidth: 280,
  });

  api.addPanel({
    id: 'terminal',
    component: 'terminal',
    title: 'ターミナル',
    position: { referencePanel: 'services', direction: 'below' },
    initialHeight: 220,
  });
}

// ── Activity bar state management ─────────────────────────────────────────────

function updateActivityBar(): void {
  if (!dockviewApi) return;
  document.querySelectorAll<HTMLElement>('.activity-item[data-panel]').forEach(btn => {
    const panelId = btn.dataset.panel as PanelId;
    const panel = dockviewApi!.getPanel(panelId);
    if (panel) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

const PANEL_TITLES: Record<PanelId, string> = {
  services: 'サービス',
  tba: 'TBA チャット',
  launchpad: 'LaunchPad',
  terminal: 'ターミナル',
};

function togglePanel(panelId: PanelId): void {
  if (!dockviewApi) return;
  const panel = dockviewApi.getPanel(panelId);

  if (panel) {
    // Panel exists — close (hide) it
    panel.api.close();
  } else {
    // Panel was closed — add it back
    const panels = dockviewApi.panels;
    const addOpts: Parameters<DockviewApi['addPanel']>[0] = {
      id: panelId,
      component: panelId,
      title: PANEL_TITLES[panelId],
    };
    if (panels.length > 0) {
      addOpts.position = { referencePanel: panels[panels.length - 1].id, direction: 'right' };
    }
    dockviewApi.addPanel(addOpts);
  }

  updateActivityBar();
  saveLayout();
}

// ── Terminal toggle (Ctrl+`) ──────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    togglePanel('terminal');
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

function updateAuthUI(loggedIn: boolean): void {
  const statusText = document.getElementById('auth-status-text')!;
  const btnLogin = document.getElementById('btn-login')!;
  const btnLogout = document.getElementById('btn-logout')!;
  const authBtn = document.getElementById('activity-auth')!;

  if (loggedIn) {
    statusText.textContent = 'ログイン済み';
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    authBtn.classList.add('active');
    // Refresh LaunchPad in current rendered instance
    const lpEl = document.getElementById('panel-content-launchpad');
    if (lpEl) void loadLaunchPadInElement(lpEl);
  } else {
    statusText.textContent = '未ログイン';
    btnLogin.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    authBtn.classList.remove('active');
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
    const lpEl = document.getElementById('panel-content-launchpad');
    if (lpEl) {
      const list = lpEl.querySelector<HTMLElement>('#lp-list');
      if (list) list.innerHTML = '<div class="lp-placeholder">ログイン後に生成物が表示されます</div>';
    }
  });

  // Activity bar auth button: toggle login/logout
  document.getElementById('activity-auth')!.addEventListener('click', () => {
    const isLoggedIn = !document.getElementById('btn-logout')!.classList.contains('hidden');
    if (isLoggedIn) {
      void window.takawasi.auth.logout().then(() => updateAuthUI(false));
    } else {
      void window.takawasi.auth.login();
    }
  });
}

// ── TBA Chat ──────────────────────────────────────────────────────────────────

interface TbaSsePayload {
  stage?: string;
  text?: string;
  final?: boolean;
  code?: string;
  message?: string;
  turn_id?: string;
  credits_used?: number;
}

function initTbaInElement(root: HTMLElement): void {
  let tbaStreaming = false;
  const input = root.querySelector<HTMLTextAreaElement>('#tba-input')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('#tba-send')!;
  const stageLabel = root.querySelector<HTMLElement>('#tba-stage-label')!;
  const messages = root.querySelector<HTMLElement>('#tba-messages')!;

  function appendMsg(type: 'user' | 'assistant' | 'stage', text: string): HTMLElement {
    const div = document.createElement('div');
    div.className = `tba-msg ${type}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function handleSseEvent(
    eventName: string,
    rawData: string,
    assistantDiv: HTMLElement,
    accumulated: { v: string },
  ): void {
    let payload: TbaSsePayload;
    try {
      payload = JSON.parse(rawData) as TbaSsePayload;
    } catch {
      accumulated.v += rawData;
      assistantDiv.textContent = accumulated.v;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    if (eventName === 'chunk') {
      const stage = payload.stage || '';
      const text = payload.text || '';
      const finalSuffix = payload.final ? ' final' : '';
      if (stage) stageLabel.textContent = `${stage}${finalSuffix}`;
      if (stage && stage !== 'execute') {
        appendMsg('stage', `[${stage}${finalSuffix}] ${text}`);
        return;
      }
      if (text) {
        accumulated.v += text;
        assistantDiv.textContent = accumulated.v;
        messages.scrollTop = messages.scrollHeight;
      }
      return;
    }

    if (eventName === 'done') {
      const credits = typeof payload.credits_used === 'number' ? ` credits=${payload.credits_used}` : '';
      appendMsg('stage', `[done]${credits}`);
      return;
    }

    if (eventName === 'error') {
      const code = payload.code ? `${payload.code}: ` : '';
      assistantDiv.textContent = `エラー: ${code}${payload.message || rawData}`;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function parseSseBlock(
    block: string,
    assistantDiv: HTMLElement,
    accumulated: { v: string },
  ): void {
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
      handleSseEvent(eventName, dataLines.join('\n'), assistantDiv, accumulated);
    }
  }

  async function send(): Promise<void> {
    if (tbaStreaming || !input.value.trim()) return;
    const message = input.value.trim();
    input.value = '';
    tbaStreaming = true;
    sendBtn.disabled = true;

    appendMsg('user', message);
    const assistantDiv = appendMsg('assistant', '');
    const accumulated = { v: '' };
    let sseBuffer = '';
    let finished = false;

    const streamId = `tba-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    function finish(): void {
      if (finished) return;
      finished = true;
      window.takawasi.tba.removeListeners(streamId);
      stageLabel.textContent = '';
      if (!accumulated.v && !assistantDiv.textContent.trim()) {
        assistantDiv.textContent = '(応答なし)';
      }
      tbaStreaming = false;
      sendBtn.disabled = false;
    }

    function consumeSse(chunk: string): void {
      sseBuffer = `${sseBuffer}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const blocks = sseBuffer.split('\n\n');
      sseBuffer = blocks.pop() || '';
      for (const block of blocks) parseSseBlock(block, assistantDiv, accumulated);
    }

    window.takawasi.tba.onChunk(streamId, consumeSse);
    window.takawasi.tba.onError(streamId, (err) => {
      assistantDiv.textContent = `接続エラー: ${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`;
      messages.scrollTop = messages.scrollHeight;
    });
    window.takawasi.tba.onEnd(streamId, () => {
      if (sseBuffer.trim()) parseSseBlock(sseBuffer, assistantDiv, accumulated);
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

  sendBtn.addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });
}

// ── LaunchPad ─────────────────────────────────────────────────────────────────

interface LPItem {
  service: string;
  runId: string;
  fileCount: number;
  sizeBytes: number;
  updatedAt?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatArtifactMeta(item: LPItem): string {
  const size = item.sizeBytes >= 1024 * 1024
    ? `${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(item.sizeBytes / 1024))} KB`;
  return `${item.fileCount} files / ${size}`;
}

async function downloadItem(item: LPItem): Promise<void> {
  try {
    const result = await window.takawasi.launchpad.download(item.service, item.runId);
    if (!result.ok || !result.data) {
      alert(`DL エラー: ${result.error || 'LaunchPad MCP error'}`);
      return;
    }
    const url = result.data.download_url;
    if (url) void window.takawasi.shell.openExternal(url);
  } catch (err) {
    alert(`DL エラー: ${String(err)}`);
  }
}

async function loadLaunchPadInElement(root: HTMLElement): Promise<void> {
  const list = root.querySelector<HTMLElement>('#lp-list');
  if (!list) return;
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
      row.querySelector('.lp-dl-btn')!.addEventListener('click', () => { void downloadItem(item); });
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<div class="lp-placeholder">接続エラー: ${escapeHtml(String(err))}</div>`;
  }
}

// ── Terminal ──────────────────────────────────────────────────────────────────

async function initTerminalInElement(root: HTMLElement, onFit: (fit: FitAddon) => void): Promise<void> {
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
  onFit(fitAddon);

  const container = root.querySelector<HTMLElement>('#terminal-container')!;
  term.open(container);
  fitAddon.fit();

  const termId = 'main';
  window.takawasi.terminal.onData(termId, (data: string) => term.write(data));
  window.takawasi.terminal.onExit(termId, () => term.write('\r\n[プロセス終了]\r\n'));

  const result = await window.takawasi.terminal.create(termId);
  if (!result.ok) {
    term.write(`\r\nターミナル初期化エラー: ${result.error || 'unknown'}\r\n`);
    return;
  }

  term.onData((data: string) => { void window.takawasi.terminal.write(termId, data); });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      const cols = Math.max(40, Math.floor(container.clientWidth / 8));
      const rows = Math.max(4, Math.floor(container.clientHeight / 18));
      void window.takawasi.terminal.resize(termId, cols, rows);
    });
    ro.observe(container);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('dockview-container')!;

  const api = buildDockview(container);
  dockviewApi = api;

  // Restore or create default layout
  const restored = tryRestoreLayout(api);
  if (!restored) {
    addDefaultPanels(api);
  }

  // Persist layout on changes
  api.onDidAddPanel((_p: IDockviewPanel) => { updateActivityBar(); saveLayout(); });
  api.onDidRemovePanel((_p: IDockviewPanel) => { updateActivityBar(); saveLayout(); });
  api.onDidLayoutChange(() => { saveLayout(); });

  updateActivityBar();

  // Wire activity bar panel toggles
  document.querySelectorAll<HTMLElement>('.activity-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel as PanelId;
      if ((PANEL_IDS as readonly string[]).includes(panelId)) {
        togglePanel(panelId);
      }
    });
  });

  await initAuth();
});
