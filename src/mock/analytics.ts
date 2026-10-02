export interface RiskPoint {
  day: string;
  low: number;
  medium: number;
  high: number;
}

const days7 = ['Aug 24', 'Aug 25', 'Aug 26', 'Aug 27', 'Aug 28', 'Aug 29', 'Aug 30'];
const days30 = Array.from({ length: 30 }, (_, i) => `D${i + 1}`);
const days90 = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);

const seed7: RiskPoint[] = [
  { day: 'Aug 24', low: 8, medium: 4, high: 2 },
  { day: 'Aug 25', low: 10, medium: 6, high: 1 },
  { day: 'Aug 26', low: 6, medium: 8, high: 3 },
  { day: 'Aug 27', low: 12, medium: 5, high: 2 },
  { day: 'Aug 28', low: 9, medium: 7, high: 4 },
  { day: 'Aug 29', low: 11, medium: 9, high: 3 },
  { day: 'Aug 30', low: 7, medium: 6, high: 5 },
];

const seed30: RiskPoint[] = days30.map((d, i) => ({
  day: d,
  low: 4 + ((i * 3) % 9),
  medium: 2 + ((i * 5) % 7),
  high: 1 + ((i * 7) % 5),
}));

const seed90: RiskPoint[] = days90.map((d, i) => ({
  day: d,
  low: 20 + ((i * 11) % 30),
  medium: 12 + ((i * 7) % 20),
  high: 5 + ((i * 5) % 12),
}));

export const riskActivity = {
  '7D': seed7,
  '30D': seed30,
  '90D': seed90,
};

export interface CategoryStat {
  category: string;
  count: number;
}

export const incidentCategories: CategoryStat[] = [
  { category: 'API Keys', count: 6 },
  { category: 'PII', count: 5 },
  { category: 'Financial', count: 4 },
  { category: 'Source Code', count: 4 },
  { category: 'Credentials', count: 3 },
  { category: 'Database Information', count: 2 },
  { category: 'Other', count: 2 },
];

export const actionDistribution = [
  { name: 'Allowed', value: 8, color: '#10b981' },
  { name: 'Warned', value: 7, color: '#f59e0b' },
  { name: 'Blocked', value: 8, color: '#ef4444' },
];

export const employeeRiskDistribution = [
  { name: 'Low', value: 18, color: '#10b981' },
  { name: 'Medium', value: 14, color: '#f59e0b' },
  { name: 'High', value: 10, color: '#ef4444' },
];

export const platformUsage = [
  { platform: 'ChatGPT', incidents: 9, share: 38 },
  { platform: 'Gemini', incidents: 5, share: 21 },
  { platform: 'Claude', incidents: 4, share: 17 },
  { platform: 'Copilot', incidents: 3, share: 13 },
  { platform: 'Perplexity', incidents: 2, share: 11 },
];

export const detectionMethodDistribution = [
  { name: 'Pattern Detection', value: 14, color: '#06b6d4' },
  { name: 'Contextual Analysis', value: 6, color: '#a855f7' },
  { name: 'Both', value: 3, color: '#10b981' },
];

export const incidentVolumeTrend = days7.map((d, i) => ({
  day: d,
  volume: [12, 15, 17, 14, 20, 23, 18][i],
}));

export const riskTrendLine = days7.map((d, i) => ({
  day: d,
  avg: [22, 28, 35, 30, 42, 48, 44][i],
  blocked: [2, 1, 3, 2, 4, 3, 5][i],
}));

export const kpis = {
  totalIncidents: 23,
  highRiskBlocked: 5,
  warnings: 11,
  employeesMonitored: 42,
  platformsCovered: 1,
};
