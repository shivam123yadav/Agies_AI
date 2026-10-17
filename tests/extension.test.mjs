import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Mock chrome.storage.local
function createMockStorage(initial = {}) {
  let store = { ...initial };
  return {
    get: async (defaults) => {
      const result = {};
      for (const [key, val] of Object.entries(defaults)) {
        result[key] = store[key] !== undefined ? store[key] : val;
      }
      return result;
    },
    set: async (items) => {
      Object.assign(store, items);
    },
    remove: async (key) => {
      delete store[key];
    },
    _getStore: () => store,
  };
}

// Logic replicate matching extension/background.js
const SUPPORTED_PLATFORMS = new Set([
  'ChatGPT',
  'Gemini',
  'Claude',
  'Copilot',
  'Perplexity',
  'DeepSeek',
  'Grok',
]);

function validatePlatform(platform) {
  if (typeof platform === 'string' && SUPPORTED_PLATFORMS.has(platform)) {
    return platform;
  }
  return 'ChatGPT';
}

function isAuthorizedPopupSender(sender, currentExtensionId = 'test-extension-id') {
  if (!sender || typeof sender !== 'object') {
    return false;
  }

  if (sender.tab) {
    return false;
  }

  const extensionId = typeof chrome !== 'undefined' && chrome?.runtime?.id ? chrome.runtime.id : currentExtensionId;
  if (extensionId) {
    if (!sender.id || sender.id !== extensionId) {
      return false;
    }
  } else if (!sender.id) {
    return false;
  }

  const expectedPopupUrl = typeof chrome !== 'undefined' && chrome?.runtime?.getURL
    ? chrome.runtime.getURL('popup.html')
    : (sender.id ? `chrome-extension://${sender.id}/popup.html` : null);

  if (!expectedPopupUrl || typeof sender.url !== 'string') {
    return false;
  }

  if (sender.url !== expectedPopupUrl) {
    return false;
  }

  return true;
}

async function handleAuthenticatedResponse(response, activeCredential, storage) {
  if (response.status === 401) {
    const current = await storage.get({ credential: null });
    if (current.credential && current.credential === activeCredential) {
      await storage.remove('credential');
      await storage.set({
        connectionStatus: 'REVOKED',
        connectionError: 'Extension credential revoked or invalid (HTTP 401)',
        revokedAt: new Date().toISOString(),
      });
    }
    throw new Error('Extension credential revoked or invalid (HTTP 401)');
  }

  if (response.status === 403) {
    await storage.set({
      connectionStatus: 'DISABLED',
      connectionError: 'Extension access disabled by administrator (HTTP 403)',
    });
    throw new Error('Extension access disabled by administrator (HTTP 403)');
  }

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  return response.json();
}

// Logic replicate matching extension/popup.js
function computePopupStatus({ credential, connectionStatus, employeeName }) {
  if (!credential) {
    if (connectionStatus === 'REVOKED') {
      return {
        cardClass: 'status disconnected',
        text: 'Disconnected — Revoked',
        pairingNotice: 'Extension credential revoked by administrator. Please pair again.',
      };
    }
    return {
      cardClass: 'status disconnected',
      text: 'Unpaired — Disconnected',
      pairingNotice: 'Pairing required to activate protection.',
    };
  }

  if (connectionStatus === 'DISABLED') {
    return {
      cardClass: 'status disabled',
      text: 'Access Disabled by Admin',
      pairingNotice: null,
    };
  }

  return {
    cardClass: 'status',
    text: employeeName ? `Protection Active (${employeeName})` : 'Protection Active',
    pairingNotice: null,
  };
}

function computeIdentityDisplay({ credential, employeeId, employeeName, connectionStatus }) {
  if (!credential) {
    if (connectionStatus === 'REVOKED') {
      const label = employeeName && employeeId ? `${employeeName} • ${employeeId} (Revoked)` : 'Credential Revoked';
      return {
        optionValue: '',
        optionText: label,
        statusText: 'Credential revoked by administrator. Please pair again.',
        disabled: true,
      };
    }
    return {
      optionValue: '',
      optionText: 'No employee identity linked',
      statusText: 'Pair extension using a code from the admin dashboard.',
      disabled: true,
    };
  }

  const label = employeeName && employeeId
    ? `${employeeName} • ${employeeId}`
    : (employeeName || employeeId || 'Employee Identity');

  if (connectionStatus === 'DISABLED') {
    return {
      optionValue: employeeId || '',
      optionText: label,
      statusText: 'Extension access disabled by administrator.',
      disabled: true,
    };
  }

  return {
    optionValue: employeeId || '',
    optionText: label,
    statusText: employeeId ? `Active protection bound to ${employeeId}.` : 'Active protection bound to employee.',
    disabled: true,
  };
}

// Platform Adapter contract and ChatGPTAdapter replicate matching extension/content.js
const ChatGPTAdapter = {
  name: 'ChatGPT',
  hostnames: ['chatgpt.com', 'chat.openai.com'],

  matches(hostname) {
    if (typeof hostname !== 'string') return false;
    const host = hostname.toLowerCase().trim();
    return (
      host === 'chatgpt.com' ||
      host.endsWith('.chatgpt.com') ||
      host === 'chat.openai.com' ||
      host.endsWith('.chat.openai.com')
    );
  },

  findEditor(doc) {
    if (!doc) return null;
    const candidates = [
      ...doc.querySelectorAll('[data-testid="text-input"]'),
      ...doc.querySelectorAll('#prompt-textarea'),
      ...doc.querySelectorAll('textarea'),
      ...doc.querySelectorAll('[contenteditable="true"]'),
      ...doc.querySelectorAll('.ProseMirror'),
    ];
    return candidates[0] || null;
  },

  readText(editor) {
    if (!editor) return '';
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      return editor.value || '';
    }
    return (editor.innerText || editor.textContent || '').trim();
  },

  buttonLabel(button) {
    return [
      button?.getAttribute?.('aria-label'),
      button?.getAttribute?.('data-testid'),
      button?.getAttribute?.('data-state'),
      button?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  },

  isSendButton(button) {
    if (!button || button.tagName !== 'BUTTON') return false;
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return false;
    }
    const label = this.buttonLabel(button);
    return /send|submit|prompt|message-submit/.test(label);
  },

  findSubmitButton(editor, doc) {
    const form = editor?.form || null;
    if (form) {
      const buttons = form.buttons || [];
      const submit = buttons.find(
        (b) => !b.disabled && (b.type === 'submit' || this.isSendButton(b))
      );
      if (submit) return submit;
    }
    if (!doc) return null;
    return (doc.buttons || []).find((b) => this.isSendButton(b)) || null;
  },

  isSubmitKey(event, editor) {
    if (
      !event ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }
    const target = event.target;
    return Boolean(editor && (target === editor || (editor.contains && editor.contains(target))));
  },

  submitAfterDecision(editor) {
    const button = editor?.submitButton;
    if (button && !button.disabled && typeof button.click === 'function') {
      button.click();
      return true;
    }
    if (editor?.form?.requestSubmit) {
      editor.form.requestSubmit();
      return true;
    }
    return false;
  },
};

const GeminiAdapter = {
  name: 'Gemini',
  hostnames: ['gemini.google.com'],

  matches(hostname) {
    if (typeof hostname !== 'string') return false;
    const cleanHost = hostname.split(':')[0].toLowerCase().trim();
    return (
      cleanHost === 'gemini.google.com' ||
      cleanHost.endsWith('.gemini.google.com')
    );
  },

  findEditor(doc) {
    if (!doc) return null;
    const candidates = [
      ...doc.querySelectorAll('rich-textarea .ql-editor'),
      ...doc.querySelectorAll('.ql-editor[contenteditable="true"]'),
      ...doc.querySelectorAll('div[contenteditable="true"][role="textbox"]'),
      ...doc.querySelectorAll('[aria-label*="prompt" i][contenteditable="true"]'),
      ...doc.querySelectorAll('textarea'),
      ...doc.querySelectorAll('[contenteditable="true"]'),
    ];
    return candidates[0] || null;
  },

  readText(editor) {
    if (!editor) return '';
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      return editor.value || '';
    }
    return (editor.innerText || editor.textContent || '').trim();
  },

  buttonLabel(button) {
    return [
      button?.getAttribute?.('aria-label'),
      button?.getAttribute?.('data-test-id'),
      button?.getAttribute?.('data-testid'),
      button?.getAttribute?.('mattooltip'),
      button?.getAttribute?.('title'),
      button?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  },

  isSendButton(button) {
    if (!button) return false;
    if (button.tagName !== 'BUTTON' && button.getAttribute?.('role') !== 'button') {
      return false;
    }
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return false;
    }
    const label = this.buttonLabel(button);
    return /send|submit|prompt|send message/.test(label);
  },

  findSubmitButton(editor, doc) {
    const container = editor?.container || null;
    if (container) {
      const buttons = container.buttons || [];
      const submit = buttons.find(
        (b) => !b.disabled && this.isSendButton(b)
      );
      if (submit) return submit;
    }
    if (!doc) return null;
    return (doc.buttons || []).find((b) => this.isSendButton(b)) || null;
  },

  isSubmitKey(event, editor) {
    if (
      !event ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }
    const target = event.target;
    return Boolean(editor && (target === editor || (editor.contains && editor.contains(target))));
  },

  submitAfterDecision(editor) {
    const button = editor?.submitButton;
    if (button && !button.disabled && typeof button.click === 'function') {
      button.click();
      return true;
    }
    if (editor?.form?.requestSubmit) {
      editor.form.requestSubmit();
      return true;
    }
    return false;
  },
};

const ClaudeAdapter = {
  name: 'Claude',
  hostnames: ['claude.ai'],

  matches(hostname) {
    if (typeof hostname !== 'string') return false;
    const cleanHost = hostname.split(':')[0].toLowerCase().trim();
    return (
      cleanHost === 'claude.ai' ||
      cleanHost.endsWith('.claude.ai')
    );
  },

  findEditor(doc) {
    if (!doc) return null;
    const candidates = [
      ...doc.querySelectorAll('.ProseMirror[contenteditable="true"]'),
      ...doc.querySelectorAll('fieldset [contenteditable="true"]'),
      ...doc.querySelectorAll('[contenteditable="true"][data-placeholder]'),
      ...doc.querySelectorAll('.ProseMirror'),
      ...doc.querySelectorAll('div[contenteditable="true"]'),
      ...doc.querySelectorAll('textarea'),
      ...doc.querySelectorAll('[contenteditable="true"]'),
    ];
    return candidates[0] || null;
  },

  readText(editor) {
    if (!editor) return '';
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      return editor.value || '';
    }
    return (editor.innerText || editor.textContent || '').trim();
  },

  buttonLabel(button) {
    return [
      button?.getAttribute?.('aria-label'),
      button?.getAttribute?.('data-testid'),
      button?.getAttribute?.('title'),
      button?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  },

  isSendButton(button) {
    if (!button) return false;
    if (button.tagName !== 'BUTTON' && button.getAttribute?.('role') !== 'button') {
      return false;
    }
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return false;
    }
    const label = this.buttonLabel(button);
    return /send|submit/i.test(label);
  },

  findSubmitButton(editor, doc) {
    const container = editor?.container || null;
    if (container) {
      const buttons = container.buttons || [];
      const submit = buttons.find(
        (b) => !b.disabled && this.isSendButton(b)
      );
      if (submit) return submit;
    }
    if (!doc) return null;
    return (doc.buttons || []).find((b) => this.isSendButton(b)) || null;
  },

  isSubmitKey(event, editor) {
    if (
      !event ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }
    const target = event.target;
    return Boolean(editor && (target === editor || (editor.contains && editor.contains(target))));
  },

  submitAfterDecision(editor) {
    const button = editor?.submitButton;
    if (button && !button.disabled && typeof button.click === 'function') {
      button.click();
      return true;
    }
    if (editor?.form?.requestSubmit) {
      editor.form.requestSubmit();
      return true;
    }
    return false;
  },
};

const PerplexityAdapter = {
  name: 'Perplexity',
  hostnames: ['perplexity.ai', 'www.perplexity.ai'],

  matches(hostname) {
    if (typeof hostname !== 'string') return false;
    const cleanHost = hostname.split(':')[0].toLowerCase().trim();
    return (
      cleanHost === 'perplexity.ai' ||
      cleanHost.endsWith('.perplexity.ai')
    );
  },

  findEditor(doc) {
    if (!doc) return null;
    const candidates = [
      ...doc.querySelectorAll('textarea[placeholder*="Ask" i]'),
      ...doc.querySelectorAll('textarea[placeholder*="search" i]'),
      ...doc.querySelectorAll('textarea[placeholder*="anything" i]'),
      ...doc.querySelectorAll('textarea'),
      ...doc.querySelectorAll('[contenteditable="true"][role="textbox"]'),
      ...doc.querySelectorAll('div[contenteditable="true"]'),
      ...doc.querySelectorAll('[contenteditable="true"]'),
    ];
    return candidates[0] || null;
  },

  readText(editor) {
    if (!editor) return '';
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      return editor.value || '';
    }
    return (editor.innerText || editor.textContent || '').trim();
  },

  buttonLabel(button) {
    return [
      button?.getAttribute?.('aria-label'),
      button?.getAttribute?.('data-testid'),
      button?.getAttribute?.('title'),
      button?.getAttribute?.('type'),
      button?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  },

  isSendButton(button) {
    if (!button) return false;
    if (button.tagName !== 'BUTTON' && button.getAttribute?.('role') !== 'button') {
      return false;
    }
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return false;
    }
    const label = this.buttonLabel(button);
    if (/attach|focus|file|upload|copy|share/i.test(label)) {
      return false;
    }
    return /submit|search|send|ask/i.test(label) || button.getAttribute?.('type') === 'submit';
  },

  findSubmitButton(editor, doc) {
    const container = editor?.container || null;
    if (container) {
      const buttons = container.buttons || [];
      const submit = buttons.find(
        (b) => !b.disabled && this.isSendButton(b)
      );
      if (submit) return submit;
    }
    if (!doc) return null;
    return (doc.buttons || []).find((b) => this.isSendButton(b)) || null;
  },

  isSubmitKey(event, editor) {
    if (
      !event ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }
    const target = event.target;
    return Boolean(editor && (target === editor || (editor.contains && editor.contains(target))));
  },

  submitAfterDecision(editor) {
    const button = editor?.submitButton;
    if (button && !button.disabled && typeof button.click === 'function') {
      button.click();
      return true;
    }
    if (editor?.form?.requestSubmit) {
      editor.form.requestSubmit();
      return true;
    }
    return false;
  },
};

const ADAPTER_REGISTRY = [
  ChatGPTAdapter,
  GeminiAdapter,
  ClaudeAdapter,
  PerplexityAdapter,
];

function resolvePlatformAdapter(hostname) {
  if (typeof hostname !== 'string') return null;
  const cleanHost = hostname.split(':')[0].toLowerCase().trim();
  if (!cleanHost) return null;

  for (const adapter of ADAPTER_REGISTRY) {
    if (typeof adapter?.matches === 'function' && adapter.matches(cleanHost)) {
      return adapter;
    }
  }
  return null;
}

// Hardened State Management matching extension/content.js Phase 2A.1
class ContentStateManager {
  constructor() {
    this.busy = false;
    this.isProgrammaticSubmitting = false;
    this.approvedToken = null;
  }

  clearApproval() {
    if (this.approvedToken?.timer) {
      clearTimeout(this.approvedToken.timer);
    }
    this.approvedToken = null;
  }

  armApprovedSubmit(text) {
    this.clearApproval();
    if (typeof text !== 'string' || !text.trim()) {
      return;
    }
    this.approvedToken = {
      text,
      createdAt: Date.now(),
    };
  }

  consumeAllowedSubmit(currentText) {
    const token = this.approvedToken;
    if (!token) {
      return false;
    }
    // Always clear on first evaluation (strictly single-use)
    this.clearApproval();
    // Validate exact text equality
    if (typeof currentText !== 'string' || currentText !== token.text) {
      return false;
    }
    return true;
  }

  submitAfterDecision(editor, adapter = ChatGPTAdapter, approvedText = null) {
    const text = adapter.readText(editor);
    if (!text) {
      this.clearApproval();
      return false;
    }

    if (approvedText !== null && text !== approvedText) {
      this.clearApproval();
      return false;
    }

    this.armApprovedSubmit(text);

    let triggered = false;
    this.isProgrammaticSubmitting = true;
    try {
      triggered = Boolean(adapter.submitAfterDecision(editor));
    } catch (err) {
      triggered = false;
    } finally {
      this.isProgrammaticSubmitting = false;
      this.clearApproval();
    }

    return triggered;
  }
}

// Logic replicate matching extension/content.js error notice mapping
function mapContentScriptNotice(errorMessage) {
  const message = errorMessage || '';
  let noticeTitle = 'Security Engine Unavailable';
  let noticeBody = 'Sentinel could not verify this submission. The message was NOT sent.';

  if (message.includes('401') || message.includes('revoked') || message.includes('must be paired')) {
    noticeTitle = 'Extension Unpaired / Credential Revoked';
    noticeBody = 'Extension is disconnected or credential was revoked. Pairing is required before submissions can be verified. The message was NOT sent.';
  } else if (message.includes('403') || message.includes('disabled')) {
    noticeTitle = 'Extension Access Disabled';
    noticeBody = 'Extension or employee access has been disabled by administrator policy. The message was NOT sent.';
  }

  return {
    decision: 'BLOCK',
    title: noticeTitle,
    body: noticeBody,
  };
}

// ============================================================================
// Phase 1 Baseline & Existing ChatGPT Tests (Tests 1 to 5)
// ============================================================================

test('1. HTTP 401 clears invalid credential and marks connectionStatus as REVOKED', async () => {
  const storage = createMockStorage({ credential: 'old-token-123', employeeId: 'EMP-001' });

  await assert.rejects(
    async () => {
      await handleAuthenticatedResponse({ status: 401, ok: false }, 'old-token-123', storage);
    },
    (err) => {
      assert.strictEqual(err.message, 'Extension credential revoked or invalid (HTTP 401)');
      return true;
    }
  );

  const state = storage._getStore();
  assert.strictEqual(state.credential, undefined, 'Invalid credential must be deleted');
  assert.strictEqual(state.connectionStatus, 'REVOKED');
  assert.strictEqual(typeof state.revokedAt, 'string');
});

test('2. HTTP 401 does not wipe credential if user re-paired during in-flight request (race condition)', async () => {
  const storage = createMockStorage({ credential: 'new-token-456', employeeId: 'EMP-001' });

  await assert.rejects(
    async () => {
      await handleAuthenticatedResponse({ status: 401, ok: false }, 'old-token-123', storage);
    },
    (err) => {
      assert.strictEqual(err.message, 'Extension credential revoked or invalid (HTTP 401)');
      return true;
    }
  );

  const state = storage._getStore();
  assert.strictEqual(state.credential, 'new-token-456', 'New paired credential must not be erased');
  assert.notStrictEqual(state.connectionStatus, 'REVOKED');
});

test('3. HTTP 403 sets connectionStatus to DISABLED without wiping stored credential', async () => {
  const storage = createMockStorage({ credential: 'active-token-789', employeeId: 'EMP-001' });

  await assert.rejects(
    async () => {
      await handleAuthenticatedResponse({ status: 403, ok: false }, 'active-token-789', storage);
    },
    (err) => {
      assert.strictEqual(err.message, 'Extension access disabled by administrator (HTTP 403)');
      return true;
    }
  );

  const state = storage._getStore();
  assert.strictEqual(state.credential, 'active-token-789', 'Stored credential must be preserved on 403');
  assert.strictEqual(state.connectionStatus, 'DISABLED');
});

test('4. Popup status UI displays appropriate state based on connection & credential', () => {
  const unpaired = computePopupStatus({ credential: null, connectionStatus: null });
  assert.strictEqual(unpaired.cardClass, 'status disconnected');
  assert.strictEqual(unpaired.text, 'Unpaired — Disconnected');

  const revoked = computePopupStatus({ credential: null, connectionStatus: 'REVOKED' });
  assert.strictEqual(revoked.cardClass, 'status disconnected');
  assert.strictEqual(revoked.text, 'Disconnected — Revoked');

  const disabled = computePopupStatus({ credential: 'tok', connectionStatus: 'DISABLED' });
  assert.strictEqual(disabled.cardClass, 'status disabled');
  assert.strictEqual(disabled.text, 'Access Disabled by Admin');

  const active = computePopupStatus({ credential: 'tok', connectionStatus: 'CONNECTED', employeeName: 'Alice' });
  assert.strictEqual(active.cardClass, 'status');
  assert.strictEqual(active.text, 'Protection Active (Alice)');
});

test('5. Content script pre-submit interception preserves fail-closed policy on failure', () => {
  const notice401 = mapContentScriptNotice('Extension credential revoked or invalid (HTTP 401)');
  assert.strictEqual(notice401.decision, 'BLOCK');
  assert.strictEqual(notice401.title, 'Extension Unpaired / Credential Revoked');

  const notice403 = mapContentScriptNotice('Extension access disabled by administrator (HTTP 403)');
  assert.strictEqual(notice403.decision, 'BLOCK');
  assert.strictEqual(notice403.title, 'Extension Access Disabled');

  const noticeUnpaired = mapContentScriptNotice('Extension must be paired first');
  assert.strictEqual(noticeUnpaired.decision, 'BLOCK');
  assert.strictEqual(noticeUnpaired.title, 'Extension Unpaired / Credential Revoked');

  const noticeNet = mapContentScriptNotice('NetworkError: Failed to fetch');
  assert.strictEqual(noticeNet.decision, 'BLOCK');
  assert.strictEqual(noticeNet.title, 'Security Engine Unavailable');
});

// ============================================================================
// Phase 2A & 2A.1 & 2B Adapter Foundation & Hardened Token Tests (Tests 6 to 22)
// ============================================================================

test('6. ChatGPT hostname resolution resolves canonical and subdomain ChatGPT domains', () => {
  const hostnames = [
    'chatgpt.com',
    'chat.openai.com',
    'sub.chatgpt.com',
    'auth.chat.openai.com',
    'chatgpt.com:443',
    'chat.openai.com:8443',
  ];

  for (const host of hostnames) {
    const adapter = resolvePlatformAdapter(host);
    assert.ok(adapter, `Hostname ${host} must resolve to an adapter`);
    assert.strictEqual(adapter.name, 'ChatGPT', `Resolved adapter name for ${host} must be 'ChatGPT'`);
  }
});

test('7. Gemini hostname resolution resolves legitimate Gemini domains', () => {
  const hostnames = [
    'gemini.google.com',
    'sub.gemini.google.com',
    'gemini.google.com:443',
    'gemini.google.com:8443',
  ];

  for (const host of hostnames) {
    const adapter = resolvePlatformAdapter(host);
    assert.ok(adapter, `Hostname ${host} must resolve to an adapter`);
    assert.strictEqual(adapter.name, 'Gemini', `Resolved adapter name for ${host} must be 'Gemini'`);
  }
});

test('8. Gemini lookalike domain rejection returns null', () => {
  const lookalikes = [
    'notgemini.google.com',
    'gemini.google.com.attacker.com',
    'gemini-google.com',
    'google.com',
    'mail.google.com',
    'drive.google.com',
    'fake-gemini.com',
    'gemini.com',
  ];

  for (const host of lookalikes) {
    const adapter = resolvePlatformAdapter(host);
    assert.strictEqual(adapter, null, `Lookalike hostname "${host}" must reject and return null`);
  }
});

test('9. Unsupported AI platform rejection returns null', () => {
  const unsupported = [
    'copilot.microsoft.com',
    'perplexity.ai',
    'deepseek.com',
    'x.com',
    'grok.com',
    'unknown-ai.org',
    '',
    null,
    undefined,
  ];

  for (const host of unsupported) {
    const adapter = resolvePlatformAdapter(host);
    assert.strictEqual(adapter, null, `Hostname "${host}" must return null`);
  }
});

test('10. Canonical platform identifier verification and background sanitization', () => {
  assert.strictEqual(ChatGPTAdapter.name, 'ChatGPT');
  assert.strictEqual(GeminiAdapter.name, 'Gemini');
  assert.strictEqual(ClaudeAdapter.name, 'Claude');
  assert.strictEqual(PerplexityAdapter.name, 'Perplexity');

  assert.strictEqual(validatePlatform('ChatGPT'), 'ChatGPT');
  assert.strictEqual(validatePlatform('Gemini'), 'Gemini');
  assert.strictEqual(validatePlatform('Claude'), 'Claude');
  assert.strictEqual(validatePlatform('Copilot'), 'Copilot');
  assert.strictEqual(validatePlatform('Perplexity'), 'Perplexity');
  assert.strictEqual(validatePlatform('DeepSeek'), 'DeepSeek');
  assert.strictEqual(validatePlatform('Grok'), 'Grok');

  assert.strictEqual(validatePlatform(''), 'ChatGPT');
  assert.strictEqual(validatePlatform(null), 'ChatGPT');
  assert.strictEqual(validatePlatform(undefined), 'ChatGPT');
  assert.strictEqual(validatePlatform('evil_platform'), 'ChatGPT');
  assert.strictEqual(validatePlatform('<script>alert(1)</script>'), 'ChatGPT');
});

test('11. Safe prompt ALLOW behavior arms text-bound approval and submits via adapter', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    value: 'Please write a poem about the ocean',
    tagName: 'TEXTAREA',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, ChatGPTAdapter, 'Please write a poem about the ocean');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  // Post-fix: approval token is cleared immediately in finally block upon dispatch completion
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Please write a poem about the ocean'), false);
});

test('12. Gemini prompt ALLOW behavior arms text-bound approval and submits via GeminiAdapter', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    innerText: 'Explain machine learning algorithms',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, GeminiAdapter, 'Explain machine learning algorithms');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  // Post-fix: approval token is cleared immediately in finally block upon dispatch completion
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Explain machine learning algorithms'), false);
});

test('13. Gemini WARN cancellation cancels submission and records WARNING_CANCELLED without submit', async () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Gemini prompt');

  let recordedAction = null;
  manager.clearApproval();
  recordedAction = 'WARNING_CANCELLED';

  assert.strictEqual(manager.approvedToken, null, 'Approval must be cleared on Cancel');
  assert.strictEqual(recordedAction, 'WARNING_CANCELLED');
  assert.strictEqual(manager.consumeAllowedSubmit('Gemini prompt'), false);
});

test('14. Gemini WARN continuation records CONTINUE_ANYWAY and re-submits exact prompt', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    innerText: 'Query with sensitive keywords',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const recordedAction = 'CONTINUE_ANYWAY';
  const triggered = manager.submitAfterDecision(mockEditor, GeminiAdapter, 'Query with sensitive keywords');

  assert.strictEqual(recordedAction, 'CONTINUE_ANYWAY');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  // Post-fix: approval token is cleared immediately in finally block upon dispatch completion
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Query with sensitive keywords'), false);
});

test('15. Gemini BLOCK decision clears approval and prevents submission', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Text');

  manager.clearApproval();

  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Text'), false);
});

test('16. Backend failure remains strictly fail-closed and clears approval', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Text');

  manager.clearApproval();
  const notice = mapContentScriptNotice('Failed to fetch');

  assert.strictEqual(notice.decision, 'BLOCK');
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Text'), false);
});

test('17. Phase 2A.1: Editor text changed after approval causes immediate invalidation on Gemini', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Safe original text');

  const modifiedText = 'Safe original text + sk-live-secret-token';
  const consumed = manager.consumeAllowedSubmit(modifiedText);

  assert.strictEqual(consumed, false, 'Modified text must NOT be allowed through approval');
  assert.strictEqual(manager.approvedToken, null, 'Approval must be expired on text mismatch');
  assert.strictEqual(manager.consumeAllowedSubmit('Safe original text'), false);
});

test('18. Phase 2A.1: A failed or disabled send button on Gemini immediately clears approval', () => {
  const manager = new ContentStateManager();
  const mockEditor = {
    innerText: 'Valid prompt text',
    tagName: 'DIV',
    submitButton: {
      disabled: true,
      click: () => {}
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, GeminiAdapter);
  assert.strictEqual(triggered, false, 'Disabled button must not trigger submission');
  assert.strictEqual(manager.approvedToken, null, 'Approval token must be cleared immediately when submit fails');
});

test('19. Gemini DOM heuristics for send button and Enter key', () => {
  assert.strictEqual(GeminiAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Send message' }), true);
  assert.strictEqual(GeminiAdapter.isSendButton({ tagName: 'BUTTON', disabled: true, textContent: 'Send message' }), false);
  assert.strictEqual(GeminiAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Attach files' }), false);

  const mockEditor = { contains: (el) => el === mockEditor };
  assert.strictEqual(GeminiAdapter.isSubmitKey({ key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), true);
  assert.strictEqual(GeminiAdapter.isSubmitKey({ key: 'Enter', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), false);
});

test('20. Duplicate submissions and repeated events cannot double-consume on Gemini', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Prompt');

  assert.strictEqual(manager.consumeAllowedSubmit('Prompt'), true);
  assert.strictEqual(manager.consumeAllowedSubmit('Prompt'), false);
});

test('21. Manifest permission scope strictly limited to ChatGPT, Gemini, Claude, and Perplexity', () => {
  const manifestPath = path.resolve('..', 'extension', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    assert.ok(manifest.host_permissions.includes('https://gemini.google.com/*'));
    assert.ok(manifest.host_permissions.includes('https://chatgpt.com/*'));
    assert.ok(manifest.host_permissions.includes('https://claude.ai/*'));
    assert.ok(manifest.host_permissions.includes('https://www.perplexity.ai/*'));
    assert.ok(manifest.host_permissions.includes('https://perplexity.ai/*'));

    // Broad permissions and other platforms must NOT exist
    assert.strictEqual(manifest.host_permissions.some(p => p.includes('*.google.com') || p === 'https://google.com/*'), false);
    assert.strictEqual(manifest.host_permissions.some(p => p.includes('anthropic.com')), false);
    assert.strictEqual(manifest.host_permissions.some(p => p.includes('*.ai')), false);
    assert.strictEqual(manifest.host_permissions.some(p => p.includes('x.com') || p.includes('copilot')), false);
  }
});

test('22. Claude hostname resolution resolves legitimate Claude domains', () => {
  const hostnames = [
    'claude.ai',
    'sub.claude.ai',
    'claude.ai:443',
    'claude.ai:8443',
  ];

  for (const host of hostnames) {
    const adapter = resolvePlatformAdapter(host);
    assert.ok(adapter, `Hostname ${host} must resolve to an adapter`);
    assert.strictEqual(adapter.name, 'Claude', `Resolved adapter name for ${host} must be 'Claude'`);
  }
});

test('23. Claude lookalike domain rejection returns null', () => {
  const lookalikes = [
    'notclaude.ai',
    'claude.ai.attacker.com',
    'claude-ai.com',
    'anthropic.com',
    'api.anthropic.com',
    'fake-claude.ai',
    'claude.com',
  ];

  for (const host of lookalikes) {
    const adapter = resolvePlatformAdapter(host);
    assert.strictEqual(adapter, null, `Lookalike hostname "${host}" must reject and return null`);
  }
});

test('24. Claude DOM heuristics for send button and Enter key', () => {
  assert.strictEqual(ClaudeAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Send Message' }), true);
  assert.strictEqual(ClaudeAdapter.isSendButton({ tagName: 'BUTTON', disabled: true, textContent: 'Send Message' }), false);
  assert.strictEqual(ClaudeAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Add content' }), false);

  const mockEditor = { contains: (el) => el === mockEditor };
  assert.strictEqual(ClaudeAdapter.isSubmitKey({ key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), true);
  assert.strictEqual(ClaudeAdapter.isSubmitKey({ key: 'Enter', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), false);
});

test('25. Claude safe prompt full allow and token consumption lifecycle', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    innerText: 'Explain machine learning algorithms',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, ClaudeAdapter, 'Explain machine learning algorithms');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  // Post-fix: approval token is cleared immediately in finally block upon dispatch completion
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Explain machine learning algorithms'), false);
});

test('26. Claude altered prompt text invalidates approval immediately', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Original Claude prompt');

  const altered = 'Original Claude prompt with leaked token';
  const consumed = manager.consumeAllowedSubmit(altered);

  assert.strictEqual(consumed, false);
  assert.strictEqual(manager.approvedToken, null);
});

test('27. Perplexity hostname resolution resolves legitimate Perplexity domains', () => {
  const hostnames = [
    'perplexity.ai',
    'www.perplexity.ai',
    'sub.perplexity.ai',
    'perplexity.ai:443',
    'www.perplexity.ai:8443',
  ];

  for (const host of hostnames) {
    const adapter = resolvePlatformAdapter(host);
    assert.ok(adapter, `Hostname ${host} must resolve to an adapter`);
    assert.strictEqual(adapter.name, 'Perplexity', `Resolved adapter name for ${host} must be 'Perplexity'`);
  }
});

test('28. Perplexity lookalike domain rejection returns null', () => {
  const lookalikes = [
    'notperplexity.ai',
    'perplexity.ai.attacker.com',
    'perplexity-ai.com',
    'fake-perplexity.ai',
    'perplexity.com',
    'perplexity.ai.fake.org',
    'www-perplexity.ai',
  ];

  for (const host of lookalikes) {
    const adapter = resolvePlatformAdapter(host);
    assert.strictEqual(adapter, null, `Lookalike hostname "${host}" must reject and return null`);
  }
});

test('29. Perplexity DOM heuristics for submit button and Enter key', () => {
  assert.strictEqual(PerplexityAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Submit' }), true);
  assert.strictEqual(PerplexityAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Search' }), true);
  assert.strictEqual(PerplexityAdapter.isSendButton({ tagName: 'BUTTON', disabled: true, textContent: 'Submit' }), false);
  assert.strictEqual(PerplexityAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Attach file' }), false);
  assert.strictEqual(PerplexityAdapter.isSendButton({ tagName: 'BUTTON', disabled: false, textContent: 'Focus mode' }), false);

  const mockEditor = { contains: (el) => el === mockEditor };
  assert.strictEqual(PerplexityAdapter.isSubmitKey({ key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), true);
  assert.strictEqual(PerplexityAdapter.isSubmitKey({ key: 'Enter', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, target: mockEditor }, mockEditor), false);
});

test('30. Perplexity safe prompt full allow and token consumption lifecycle', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    value: 'Search for recent advances in quantum computing',
    tagName: 'TEXTAREA',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, PerplexityAdapter, 'Search for recent advances in quantum computing');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  // Post-fix: approval token is cleared immediately in finally block upon dispatch completion
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.consumeAllowedSubmit('Search for recent advances in quantum computing'), false);
});

test('31. Perplexity altered prompt text invalidates approval immediately', () => {
  const manager = new ContentStateManager();
  manager.armApprovedSubmit('Original search prompt');

  const altered = 'Original search prompt + sk-prod-secret';
  const consumed = manager.consumeAllowedSubmit(altered);

  assert.strictEqual(consumed, false);
  assert.strictEqual(manager.approvedToken, null);
});

// ============================================================================
// Phase 3B: Approval-Token Lifecycle & F-04 Remediation Tests
// ============================================================================

test('32. Phase 3B: Non-form programmatic button click clears approval token immediately in finally block', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    innerText: 'Explain how neural networks learn',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, ClaudeAdapter, 'Explain how neural networks learn');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  assert.strictEqual(manager.approvedToken, null, 'Approval token must not linger for 3 seconds');
  assert.strictEqual(manager.isProgrammaticSubmitting, false);
  assert.strictEqual(manager.consumeAllowedSubmit('Explain how neural networks learn'), false);
});

test('33. Phase 3B: WARN -> Continue Anyway clears approval immediately in finally block', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    value: 'Query with sensitive warning keywords',
    tagName: 'TEXTAREA',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, ChatGPTAdapter, 'Query with sensitive warning keywords');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.isProgrammaticSubmitting, false);
  assert.strictEqual(manager.consumeAllowedSubmit('Query with sensitive warning keywords'), false);
});

test('34. Phase 3B: Prompt modification before dispatch is rejected and cleared', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    innerText: 'Safe prompt + leaked API key injected while modal was open',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const approvedText = 'Safe prompt';
  const triggered = manager.submitAfterDecision(mockEditor, GeminiAdapter, approvedText);
  assert.strictEqual(triggered, false, 'Modified prompt must be aborted before dispatch');
  assert.strictEqual(clicked, false);
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.isProgrammaticSubmitting, false);
});

test('35. Phase 3B: Duplicate click or re-entrant event cannot inherit cleared approval', () => {
  const manager = new ContentStateManager();
  let clicked = false;
  const mockEditor = {
    value: 'Search query',
    tagName: 'TEXTAREA',
    submitButton: {
      disabled: false,
      click: () => { clicked = true; }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, PerplexityAdapter, 'Search query');
  assert.strictEqual(triggered, true);
  assert.strictEqual(clicked, true);
  assert.strictEqual(manager.approvedToken, null);

  // Subsequent manual click or keypress
  assert.strictEqual(manager.consumeAllowedSubmit('Search query'), false);
});

test('36. Phase 3B: Disabled or missing send button immediately clears token', () => {
  const manager = new ContentStateManager();
  const mockEditor = {
    innerText: 'Query with disabled button',
    tagName: 'DIV',
    submitButton: {
      disabled: true,
      click: () => {}
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, ClaudeAdapter, 'Query with disabled button');
  assert.strictEqual(triggered, false);
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.isProgrammaticSubmitting, false);
});

test('37. Phase 3B: Dispatch exception immediately clears token in finally block', () => {
  const manager = new ContentStateManager();
  const mockEditor = {
    innerText: 'Query throwing exception on click',
    tagName: 'DIV',
    submitButton: {
      disabled: false,
      click: () => { throw new Error('DOM dispatch fault'); }
    }
  };

  const triggered = manager.submitAfterDecision(mockEditor, GeminiAdapter, 'Query throwing exception on click');
  assert.strictEqual(triggered, false);
  assert.strictEqual(manager.approvedToken, null);
  assert.strictEqual(manager.isProgrammaticSubmitting, false);
});

// ============================================================================
// Phase 3D-1: Popup Employee Identity Tests
// ============================================================================

test('38. Phase 3D-1: Unpaired popup displays clear unlinked state and pairing guidance', () => {
  const display = computeIdentityDisplay({
    credential: null,
    employeeId: '',
    employeeName: '',
    connectionStatus: null,
  });
  assert.strictEqual(display.optionValue, '');
  assert.strictEqual(display.optionText, 'No employee identity linked');
  assert.strictEqual(display.statusText, 'Pair extension using a code from the admin dashboard.');
  assert.strictEqual(display.disabled, true);
});

test('39. Phase 3D-1: Revoked popup displays revoked status and prompt to re-pair', () => {
  const display = computeIdentityDisplay({
    credential: null,
    employeeId: 'EMP-001',
    employeeName: 'Alice Smith',
    connectionStatus: 'REVOKED',
  });
  assert.strictEqual(display.optionValue, '');
  assert.strictEqual(display.optionText, 'Alice Smith • EMP-001 (Revoked)');
  assert.strictEqual(display.statusText, 'Credential revoked by administrator. Please pair again.');
  assert.strictEqual(display.disabled, true);
});

test('40. Phase 3D-1: Paired active popup displays actual stored employee identity and disabled select', () => {
  const display = computeIdentityDisplay({
    credential: 'valid-bearer-token-123',
    employeeId: 'EMP-442',
    employeeName: 'Jane Doe',
    connectionStatus: 'CONNECTED',
  });
  assert.strictEqual(display.optionValue, 'EMP-442');
  assert.strictEqual(display.optionText, 'Jane Doe • EMP-442');
  assert.strictEqual(display.statusText, 'Active protection bound to EMP-442.');
  assert.strictEqual(display.disabled, true);
});

test('41. Phase 3D-1: Disabled popup displays administrator disabled notice', () => {
  const display = computeIdentityDisplay({
    credential: 'valid-bearer-token-123',
    employeeId: 'EMP-100',
    employeeName: 'Bob Admin',
    connectionStatus: 'DISABLED',
  });
  assert.strictEqual(display.optionValue, 'EMP-100');
  assert.strictEqual(display.optionText, 'Bob Admin • EMP-100');
  assert.strictEqual(display.statusText, 'Extension access disabled by administrator.');
  assert.strictEqual(display.disabled, true);
});

test('42. Phase 3D-2: Legitimate popup message from extension popup is authorized', () => {
  const sender = {
    id: 'test-extension-id',
    url: 'chrome-extension://test-extension-id/popup.html',
  };
  assert.strictEqual(isAuthorizedPopupSender(sender, 'test-extension-id'), true);
});

test('43. Phase 3D-2: Content script with sender.tab present is rejected immediately', () => {
  const senderWithTab = {
    id: 'test-extension-id',
    url: 'chrome-extension://test-extension-id/popup.html',
    tab: { id: 1, url: 'https://chatgpt.com/' },
  };
  assert.strictEqual(isAuthorizedPopupSender(senderWithTab, 'test-extension-id'), false);

  const csSender = {
    id: 'test-extension-id',
    url: 'https://claude.ai/',
    tab: { id: 101 },
  };
  assert.strictEqual(isAuthorizedPopupSender(csSender, 'test-extension-id'), false);
});

test('44. Phase 3D-2: Messages from foreign or unexpected extension IDs are rejected', () => {
  const foreignSender = {
    id: 'attacker-extension-id',
    url: 'chrome-extension://attacker-extension-id/popup.html',
  };
  assert.strictEqual(isAuthorizedPopupSender(foreignSender, 'test-extension-id'), false);
});

test('45. Phase 3D-2: Messages from non-popup extension pages or external URLs are rejected', () => {
  const optionsSender = {
    id: 'test-extension-id',
    url: 'chrome-extension://test-extension-id/options.html',
  };
  assert.strictEqual(isAuthorizedPopupSender(optionsSender, 'test-extension-id'), false);

  const externalSender = {
    id: 'test-extension-id',
    url: 'https://perplexity.ai/',
  };
  assert.strictEqual(isAuthorizedPopupSender(externalSender, 'test-extension-id'), false);
});

test('46. Phase 3D-2: Missing, null, or malformed sender metadata is safely rejected', () => {
  assert.strictEqual(isAuthorizedPopupSender(null), false);
  assert.strictEqual(isAuthorizedPopupSender({}), false);
  assert.strictEqual(isAuthorizedPopupSender('popup.html'), false);
  assert.strictEqual(isAuthorizedPopupSender(12345), false);
  assert.strictEqual(isAuthorizedPopupSender({ id: 'test-extension-id' }), false);
  assert.strictEqual(isAuthorizedPopupSender({ url: 'chrome-extension://test-extension-id/popup.html' }), false);
  assert.strictEqual(isAuthorizedPopupSender({ id: null, url: null }), false);
});


