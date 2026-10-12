// In the browser, VITE_API_BASE_URL overrides. When not set, use an empty
// string so all /api/* requests go to the same origin as the frontend —
// the Vite dev server proxy (see vite.config.ts) forwards them to FastAPI.
// In Node (tests), import.meta.env is not set, so we fall back to the direct
// backend URL so mock-fetch URL assertions remain correct.
const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env ? '' : 'http://127.0.0.1:8000');


export interface BackendContextSignal {
  signal: string;
  category: string;
  impact: number;
}

export interface BackendRiskReason {
  type: string;
  weight: number;
  count: number;
  contribution: number;
}

export interface BackendIncident {
  incident_id: string;
  timestamp: string;
  status?: 'Open' | 'Acknowledged' | 'Resolved';

  employee_id?: string | null;
  employee_name?: string | null;
  employee_department?: string | null;
  platform?: string | null;

  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  policy: string;
  policy_message?: string;
  detected: boolean;
  finding_count: number;
  finding_types: string[];
  risk_reasons?: BackendRiskReason[];
  context_level: 'LOW' | 'MEDIUM' | 'HIGH';
  context_modifier: number;
  context_signals: BackendContextSignal[];
}

export interface IncidentsResponse {
  success: boolean;
  count: number;
  incidents: BackendIncident[];
}

export interface IncidentResponse {
  success: boolean;
  incident: BackendIncident;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Backend returned HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) message = body.detail;
    } catch {
      // Keep the HTTP error message when the body is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface AdminUser {
  email: string;
  role: string;
}

export interface AuthLoginResponse {
  success: boolean;
  message: string;
  admin: AdminUser;
}

export interface AuthMeResponse {
  success: boolean;
  authenticated: boolean;
  admin: AdminUser;
}

export interface AuthLogoutResponse {
  success: boolean;
  message: string;
}

export function loginAdmin(credentials: { email: string; password: string }) {
  return request<AuthLoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function getAuthMe() {
  return request<AuthMeResponse>('/api/auth/me');
}

export function logoutAdmin() {
  return request<AuthLogoutResponse>('/api/auth/logout', {
    method: 'POST',
  });
}

export function getIncidents(limit = 100) {
  return request<IncidentsResponse>(`/api/incidents?limit=${limit}`);
}

export function getIncident(id: string) {
  return request<IncidentResponse>(
    `/api/incidents/${encodeURIComponent(id)}`,
  );
}

export function updateIncidentStatus(
  id: string,
  status: 'Open' | 'Acknowledged' | 'Resolved',
) {
  return request<IncidentResponse>(
    `/api/incidents/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}

export { API_BASE_URL };


export interface BackendPolicy {
  policy_id: string;
  name: string;
  category: string;
  risk_min: number;
  risk_max: number;
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  status: 'Active' | 'Draft' | 'Disabled';
  last_updated: string;
  description: string;
}

export interface PoliciesResponse {
  success: boolean;
  count: number;
  policies: BackendPolicy[];
}

export interface PolicyResponse {
  success: boolean;
  policy: BackendPolicy;
}

export function getPolicies() {
  return request<PoliciesResponse>('/api/policies');
}

export function createPolicy(policy: Omit<BackendPolicy, 'policy_id' | 'last_updated'>) {
  return request<PolicyResponse>('/api/policies', {
    method: 'POST',
    body: JSON.stringify({
      name: policy.name,
      category: policy.category,
      risk_min: policy.risk_min,
      risk_max: policy.risk_max,
      action: policy.action,
      status: policy.status,
      description: policy.description,
    }),
  });
}

export function updatePolicy(
  id: string,
  policy: Omit<BackendPolicy, 'policy_id' | 'last_updated'>,
) {
  return request<PolicyResponse>(`/api/policies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: policy.name,
      category: policy.category,
      risk_min: policy.risk_min,
      risk_max: policy.risk_max,
      action: policy.action,
      status: policy.status,
      description: policy.description,
    }),
  });
}

export function deletePolicy(id: string) {
  return request<{ success: boolean; policy_id: string }>(
    `/api/policies/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}


export interface BackendEmployee {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  extension_active: boolean;
  status: 'Active' | 'Disabled';
  created_at?: string;
  last_active?: string | null;
  incidents: number;
  warnings: number;
  blocked: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  high_risk_events: number;
  block_rate: number;
  top_violation: string;
  category_breakdown: Record<string, number>;
  risk_trend: { timestamp: string; risk_score: number }[];
  recent_incidents: string[];
  extension?: {
    paired?: boolean;
    access_enabled?: boolean;
    protection_enabled?: boolean;
    paired_at?: string | null;
    revoked_at?: string | null;
    last_seen?: string | null;
    device_info?: string | null;
  };
}

export interface EmployeesResponse {
  success: boolean;
  count: number;
  employees: BackendEmployee[];
}

export interface EmployeeResponse {
  success: boolean;
  employee: BackendEmployee & {
    stats: {
      incidents: number;
      warnings: number;
      blocked: number;
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      risk_score: number;
      high_risk_events: number;
      block_rate: number;
      top_violation: string;
      category_breakdown: Record<string, number>;
      risk_trend: { timestamp: string; risk_score: number }[];
      recent_incidents: string[];
    };
    incidents_detail: BackendIncident[];
  };
}

export function getEmployees() {
  return request<EmployeesResponse>('/api/employees');
}

export function getEmployee(id: string) {
  return request<EmployeeResponse>(`/api/employees/${encodeURIComponent(id)}`);
}

export interface CreateEmployeeRequest {
  name: string;
  email: string;
  department: string;
  role: string;
  status?: 'Active' | 'Disabled';
  extension_active?: boolean;
}

export interface CreateEmployeeResponse {
  success: boolean;
  employee: BackendEmployee;
}

export function createEmployee(data: CreateEmployeeRequest) {
  return request<CreateEmployeeResponse>('/api/employees', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      department: data.department,
      role: data.role,
      status: data.status || 'Active',
      extension_active: data.extension_active !== undefined ? data.extension_active : true,
    }),
  });
}

export interface PairingCodeResponse {
  success: boolean;
  employee_id: string;
  code: string;
  expires_at: string;
  expires_in_seconds: number;
}

export function generatePairingCode(employeeId: string) {
  return request<PairingCodeResponse>(
    `/api/employees/${encodeURIComponent(employeeId)}/extension/pairing-code`,
    {
      method: 'POST',
    },
  );
}

export interface RevokeExtensionResponse {
  success: boolean;
  message: string;
  employee_id: string;
}

export function revokeExtension(employeeId: string) {
  return request<RevokeExtensionResponse>(
    `/api/employees/${encodeURIComponent(employeeId)}/extension/revoke`,
    {
      method: 'POST',
    },
  );
}


export interface OrganizationAnalytics {
  success: boolean;
  range_days: number;
  overview: {
    total_incidents: number;
    blocked: number;
    warnings: number;
    high_risk: number;
    average_risk: number;
    block_rate: number;
    employees_impacted: number;
    departments_impacted: number;
  };
  trend: { date: string; incidents: number; blocked: number; warnings: number; average_risk: number }[];
  risk_distribution: { name: string; value: number }[];
  action_distribution: { name: string; value: number }[];
  categories: { category: string; count: number }[];
  platforms: { platform: string; incidents: number }[];
  departments: { department: string; incidents: number; average_risk: number; blocked: number; high_risk_events: number }[];
  employees: { employee_id: string; employee_name: string; department: string; incidents: number; blocked: number; warnings: number; high_risk_events: number; average_risk: number; block_rate: number; top_violation: string }[];
  detection_methods: { name: string; value: number }[];
}

export function getOrganizationAnalytics(rangeDays = 30) {
  return request<OrganizationAnalytics>(`/api/analytics/organization?range_days=${rangeDays}`);
}


export interface BackendDetectionRule {
  rule_id: string;
  name: string;
  category: string;
  detection_type: 'LOCAL' | 'CONTEXTUAL';
  severity: 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Disabled';
  pattern?: string;
  description: string;
  protected?: boolean;
  last_updated?: string;
}

export interface DetectionRulesResponse {
  success: boolean;
  count: number;
  rules: BackendDetectionRule[];
}

export function getDetectionRules() {
  return request<DetectionRulesResponse>('/api/detection-rules');
}

export function updateDetectionRuleStatus(id: string, status: 'Active' | 'Disabled') {
  return request<{ success: boolean; rule: BackendDetectionRule }>(
    `/api/detection-rules/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );
}

// BackendIncident is declared once above (near the top of this file).

export interface DetectionRuleInput {
  name: string;
  category: string;
  detection_type: 'LOCAL' | 'CONTEXTUAL';
  severity: 'High' | 'Medium' | 'Low';
  pattern: string;
  description: string;
  status?: 'Active' | 'Disabled';
  protected?: boolean;
}

export function createDetectionRule(rule: DetectionRuleInput) {
  return request<{ success: boolean; rule: BackendDetectionRule }>(
    '/api/detection-rules',
    {
      method: 'POST',
      body: JSON.stringify(rule),
    },
  );
}

export function updateDetectionRule(
  id: string,
  rule: Partial<DetectionRuleInput>,
) {
  return request<{ success: boolean; rule: BackendDetectionRule }>(
    `/api/detection-rules/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(rule),
    },
  );
}