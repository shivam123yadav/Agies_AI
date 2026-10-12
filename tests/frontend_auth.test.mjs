import test from 'node:test';
import assert from 'node:assert';
import {
  API_BASE_URL,
  loginAdmin,
  getAuthMe,
  logoutAdmin,
  getIncidents,
  getEmployees,
  getPolicies,
  generatePairingCode,
  revokeExtension,
  createEmployee,
} from '../src/lib/api.ts';

// Helper to mock global fetch
function createMockFetch(mockHandler) {
  const originalFetch = globalThis.fetch;
  const recordedCalls = [];

  globalThis.fetch = async (url, options) => {
    recordedCalls.push({ url, options });
    return mockHandler(url, options);
  };

  return {
    recordedCalls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test('1. Login sends credentials to the backend and handles success', async () => {
  const mock = createMockFetch(async (url, options) => {
    assert.strictEqual(url, `${API_BASE_URL}/api/auth/login`);
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.credentials, 'include');
    assert.deepStrictEqual(JSON.parse(options.body), {
      email: 'admin@northwind.co',
      password: 'valid-password',
    });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Authenticated successfully',
        admin: { email: 'admin@northwind.co', role: 'admin' },
      }),
    };
  });

  try {
    const response = await loginAdmin({
      email: 'admin@northwind.co',
      password: 'valid-password',
    });
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.admin.email, 'admin@northwind.co');
    assert.strictEqual(mock.recordedCalls.length, 1);
  } finally {
    mock.restore();
  }
});

test('2. Incorrect credentials display an error from the backend', async () => {
  const mock = createMockFetch(async (url, options) => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid administrator credentials' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await loginAdmin({
          email: 'wrong@admin.co',
          password: 'wrong-password',
        });
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid administrator credentials');
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

test('3. API requests include browser credentials (credentials: "include")', async () => {
  const calls = [];
  const mock = createMockFetch(async (url, options) => {
    calls.push({ url, credentials: options.credentials });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, incidents: [], employees: [], policies: [] }),
    };
  });

  try {
    await getIncidents(10);
    await getEmployees();
    await getPolicies();

    assert.strictEqual(calls.length, 3);
    for (const call of calls) {
      assert.strictEqual(
        call.credentials,
        'include',
        `Call to ${call.url} must include credentials: 'include'`
      );
    }
  } finally {
    mock.restore();
  }
});

test('4. Page refresh restores a valid session through /api/auth/me', async () => {
  const mock = createMockFetch(async (url, options) => {
    assert.strictEqual(url, `${API_BASE_URL}/api/auth/me`);
    assert.strictEqual(options.credentials, 'include');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        authenticated: true,
        admin: { email: 'admin@northwind.co', role: 'admin' },
      }),
    };
  });

  try {
    const res = await getAuthMe();
    assert.strictEqual(res.authenticated, true);
    assert.strictEqual(res.admin.email, 'admin@northwind.co');
    assert.strictEqual(mock.recordedCalls.length, 1);
  } finally {
    mock.restore();
  }
});

test('5. An unauthenticated session returns 401 to trigger redirect to login', async () => {
  const mock = createMockFetch(async (url) => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Admin authentication required' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await getAuthMe();
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Admin authentication required');
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

test('6. Logout calls the backend and handles errors without falsely clearing session', async () => {
  // Test 6a: Successful logout calls POST /api/auth/logout with credentials: 'include'
  let logoutCalled = false;
  const mockSuccess = createMockFetch(async (url, options) => {
    assert.strictEqual(url, `${API_BASE_URL}/api/auth/logout`);
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.credentials, 'include');
    logoutCalled = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Logged out successfully' }),
    };
  });

  try {
    const result = await logoutAdmin();
    assert.strictEqual(logoutCalled, true);
    assert.strictEqual(result.success, true);
  } finally {
    mockSuccess.restore();
  }

  // Test 6b: Failed logout propagates error so UI doesn't pretend session was invalidated
  const mockFailure = createMockFetch(async () => {
    return {
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Internal session error during logout' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await logoutAdmin();
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Internal session error during logout');
        return true;
      }
    );
  } finally {
    mockFailure.restore();
  }
});

test('7. Extension bearer authentication remains intact and separate from dashboard requests', async () => {
  const mock = createMockFetch(async (url, options) => {
    // Verify dashboard requests do not attach arbitrary Authorization headers
    assert.strictEqual(options.headers?.Authorization, undefined);
    assert.strictEqual(options.credentials, 'include');
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, incidents: [] }),
    };
  });

  try {
    const res = await getIncidents();
    assert.strictEqual(res.success, true);
  } finally {
    mock.restore();
  }
});

test('8. Admin can generate single-use extension pairing code for an employee', async () => {
  const empId = 'EMP-DEV-001';
  let calledUrl = null;
  let calledOptions = null;

  const mock = createMockFetch(async (url, options) => {
    calledUrl = url;
    calledOptions = options;
    assert.strictEqual(
      url,
      `${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}/extension/pairing-code`
    );
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.credentials, 'include');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        employee_id: empId,
        code: 'ABCD-EFGH',
        expires_at: '2026-10-12T04:00:00.000Z',
        expires_in_seconds: 600,
      }),
    };
  });

  try {
    const response = await generatePairingCode(empId);
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.employee_id, empId);
    assert.strictEqual(response.code, 'ABCD-EFGH');
    assert.strictEqual(response.expires_in_seconds, 600);
    assert.strictEqual(mock.recordedCalls.length, 1);
  } finally {
    mock.restore();
  }
});

test('9. Pairing code generation handles error responses from backend', async () => {
  // Test 9a: 401 unauthenticated
  const mock401 = createMockFetch(async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Admin authentication required' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await generatePairingCode('EMP-DEV-001');
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Admin authentication required');
        return true;
      }
    );
  } finally {
    mock401.restore();
  }

  // Test 9b: 404 employee not found
  const mock404 = createMockFetch(async () => {
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Employee not found' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await generatePairingCode('EMP-NONEXISTENT');
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Employee not found');
        return true;
      }
    );
  } finally {
    mock404.restore();
  }
});

test('10. Admin can revoke employee extension credential', async () => {
  const empId = 'EMP-DEV-001';
  let calledUrl = null;
  let calledOptions = null;

  const mock = createMockFetch(async (url, options) => {
    calledUrl = url;
    calledOptions = options;
    assert.strictEqual(
      url,
      `${API_BASE_URL}/api/employees/${encodeURIComponent(empId)}/extension/revoke`
    );
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.credentials, 'include');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Extension credential revoked successfully',
        employee_id: empId,
      }),
    };
  });

  try {
    const response = await revokeExtension(empId);
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.employee_id, empId);
    assert.strictEqual(mock.recordedCalls.length, 1);
  } finally {
    mock.restore();
  }
});

test('11. Revoking extension credential handles errors from backend', async () => {
  // Test 11a: 401 unauthenticated
  const mock401 = createMockFetch(async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Admin authentication required' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await revokeExtension('EMP-DEV-001');
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Admin authentication required');
        return true;
      }
    );
  } finally {
    mock401.restore();
  }

  // Test 11b: 404 employee not found
  const mock404 = createMockFetch(async () => {
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Employee not found' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await revokeExtension('EMP-NONEXISTENT');
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Employee not found');
        return true;
      }
    );
  } finally {
    mock404.restore();
  }
});

test('12. createEmployee sends POST /api/employees with payload and credentials: "include"', async () => {
  const newEmp = {
    name: 'Maya Lin',
    email: 'maya.lin@northwind.co',
    department: 'Security',
    role: 'Staff Architect',
  };

  const mock = createMockFetch(async (url, options) => {
    assert.strictEqual(url, `${API_BASE_URL}/api/employees`);
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.credentials, 'include');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');

    const body = JSON.parse(options.body);
    assert.strictEqual(body.name, 'Maya Lin');
    assert.strictEqual(body.email, 'maya.lin@northwind.co');
    assert.strictEqual(body.department, 'Security');
    assert.strictEqual(body.role, 'Staff Architect');
    assert.strictEqual(body.status, 'Active');
    assert.strictEqual(body.extension_active, true);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        employee: {
          employee_id: 'EMP-A1B2C3D4',
          name: 'Maya Lin',
          email: 'maya.lin@northwind.co',
          department: 'Security',
          role: 'Staff Architect',
          extension_active: true,
          status: 'Active',
          incidents: 0,
          warnings: 0,
          blocked: 0,
          risk_level: 'LOW',
          risk_score: 0,
        },
      }),
    };
  });

  try {
    const res = await createEmployee(newEmp);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.employee.employee_id, 'EMP-A1B2C3D4');
    assert.strictEqual(res.employee.name, 'Maya Lin');
    assert.strictEqual(mock.recordedCalls.length, 1);
  } finally {
    mock.restore();
  }
});

test('13. createEmployee handles duplicate email 409 Conflict error from backend', async () => {
  const mock409 = createMockFetch(async () => {
    return {
      ok: false,
      status: 409,
      json: async () => ({ detail: 'An employee with this email already exists' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await createEmployee({
          name: 'Duplicate User',
          email: 'existing@northwind.co',
          department: 'Engineering',
          role: 'Developer',
        });
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'An employee with this email already exists');
        return true;
      }
    );
  } finally {
    mock409.restore();
  }
});

test('14. createEmployee handles 401 unauthenticated session error', async () => {
  const mock401 = createMockFetch(async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Admin authentication required' }),
    };
  });

  try {
    await assert.rejects(
      async () => {
        await createEmployee({
          name: 'Maya Lin',
          email: 'maya@northwind.co',
          department: 'Security',
          role: 'Engineer',
        });
      },
      (err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Admin authentication required');
        return true;
      }
    );
  } finally {
    mock401.restore();
  }
});
