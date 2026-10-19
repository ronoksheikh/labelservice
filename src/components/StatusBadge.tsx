import { Badge } from '@mantine/core';
import type { PrintRequest } from '../../shared/api';

const LABELS: Record<PrintRequest['status'], [string, string]> = {
  claiming: ['Reserving…', 'yellow'],
  ready: ['Waiting for print', 'blue'],
  confirming: ['Confirming…', 'yellow'],
  releasing: ['Releasing…', 'yellow'],
  printed: ['Printed', 'teal'],
  partial: ['Partly printed', 'orange'],
  released: ['Released', 'gray'],
  failed: ['Failed', 'red'],
};

export function StatusBadge({ request }: { request: Pick<PrintRequest, 'status' | 'expired'> }) {
  if (request.expired) return <Badge color="red" variant="light">Expired</Badge>;
  const [label, color] = LABELS[request.status];
  return <Badge color={color} variant="light">{label}</Badge>;
}

export const ModeBadge = ({ mode }: { mode: PrintRequest['mode'] }) =>
  mode === 'reprint' ? <Badge color="grape" variant="outline">Reprint</Badge> : <Badge color="gray" variant="outline">New</Badge>;
