import test from 'node:test';
import assert from 'node:assert';

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
  // Scenario: request started with 'old-token-123', but storage now has 'new-token-456'
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
  // Case A: Unpaired
  const unpaired = computePopupStatus({ credential: null, connectionStatus: null });
  assert.strictEqual(unpaired.cardClass, 'status disconnected');
  assert.strictEqual(unpaired.text, 'Unpaired — Disconnected');

  // Case B: Revoked
  const revoked = computePopupStatus({ credential: null, connectionStatus: 'REVOKED' });
  assert.strictEqual(revoked.cardClass, 'status disconnected');
  assert.strictEqual(revoked.text, 'Disconnected — Revoked');

  // Case C: Disabled
  const disabled = computePopupStatus({ credential: 'tok', connectionStatus: 'DISABLED' });
  assert.strictEqual(disabled.cardClass, 'status disabled');
  assert.strictEqual(disabled.text, 'Access Disabled by Admin');

  // Case D: Active protection
  const active = computePopupStatus({ credential: 'tok', connectionStatus: 'CONNECTED', employeeName: 'Alice' });
  assert.strictEqual(active.cardClass, 'status');
  assert.strictEqual(active.text, 'Protection Active (Alice)');
});

test('5. Content script pre-submit interception preserves fail-closed policy on failure', () => {
  // Case A: Revocation error
  const notice401 = mapContentScriptNotice('Extension credential revoked or invalid (HTTP 401)');
  assert.strictEqual(notice401.decision, 'BLOCK');
  assert.strictEqual(notice401.title, 'Extension Unpaired / Credential Revoked');

  // Case B: Disabled access
  const notice403 = mapContentScriptNotice('Extension access disabled by administrator (HTTP 403)');
  assert.strictEqual(notice403.decision, 'BLOCK');
  assert.strictEqual(notice403.title, 'Extension Access Disabled');

  // Case C: Unpaired
  const noticeUnpaired = mapContentScriptNotice('Extension must be paired first');
  assert.strictEqual(noticeUnpaired.decision, 'BLOCK');
  assert.strictEqual(noticeUnpaired.title, 'Extension Unpaired / Credential Revoked');

  // Case D: Network failure
  const noticeNet = mapContentScriptNotice('NetworkError: Failed to fetch');
  assert.strictEqual(noticeNet.decision, 'BLOCK');
  assert.strictEqual(noticeNet.title, 'Security Engine Unavailable');
});
