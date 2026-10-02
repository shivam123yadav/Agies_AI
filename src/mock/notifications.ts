import type { NotificationItem } from '@/types';

export const notifications: NotificationItem[] = [
  {
    id: 'N-001',
    title: 'High-risk incident blocked',
    description: 'INC-2048 contained an API key and was blocked before submission.',
    time: '14:32',
    type: 'danger',
    read: false,
  },
  {
    id: 'N-002',
    title: 'Medium-risk submission detected',
    description: 'INC-2047 flagged for potential financial information.',
    time: '13:11',
    type: 'warn',
    read: false,
  },
  {
    id: 'N-003',
    title: 'Security policy updated',
    description: 'Block High-Risk Credentials policy was revised.',
    time: '09:18',
    type: 'info',
    read: true,
  },
  {
    id: 'N-004',
    title: 'Extension is active',
    description: 'AgiesAI Sentinel extension is operational on ChatGPT.',
    time: '08:00',
    type: 'success',
    read: true,
  },
  {
    id: 'N-005',
    title: 'Detection engine operational',
    description: 'All detection rules passed health checks.',
    time: '07:55',
    type: 'success',
    read: true,
  },
];
