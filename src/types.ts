export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type ActionType = 'ALLOW' | 'WARN' | 'BLOCK';

export type IncidentCategory =
  | 'API Key'
  | 'PII'
  | 'Financial'
  | 'Source Code'
  | 'Credentials'
  | 'Database Information'
  | 'Business Information'
  | 'Other';

export type Platform = 'ChatGPT' | 'Gemini' | 'Claude' | 'Copilot' | 'Perplexity';

export type DetectionType = 'LOCAL' | 'CONTEXTUAL';

export interface Incident {
  id: string;
  timestamp: string;
  employeeId: string;
  employeeName: string;
  platform: Platform;
  category: IncidentCategory;
  riskScore: number;
  riskLevel: RiskLevel;
  action: ActionType;
  status: 'Resolved' | 'Open' | 'Acknowledged';
  matchedRule: string;
  detectionMethod: 'Pattern Detection' | 'Contextual Analysis' | 'Both';
  policy: string;
  confidence: number;
  maskedInput: string;
  reasonSteps: { label: string; detail: string; passed: boolean }[];
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  avatarColor: string;
  incidents: number;
  warnings: number;
  blocked: number;
  riskLevel: RiskLevel;
  riskTrend: number[];
  extensionActive: boolean;
  lastActive: string;
  categoryBreakdown: { category: IncidentCategory; count: number }[];
  recentIncidents: string[];
}

export interface Policy {
  id: string;
  name: string;
  category: string;
  riskMin: number;
  riskMax: number;
  action: ActionType;
  status: 'Active' | 'Draft' | 'Disabled';
  lastUpdated: string;
  description: string;
}

export interface DetectionRule {
  id: string;
  name: string;
  category: IncidentCategory;
  detectionType: DetectionType;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Disabled';
  pattern?: string;
  description: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  event: string;
  actor: string;
  action: string;
  risk: RiskLevel | '—';
  hash: string;
  previousHash: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'danger' | 'warn' | 'info' | 'success';
  read: boolean;
}

export interface PlatformStat {
  platform: Platform;
  incidents: number;
  share: number;
}
