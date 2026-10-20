import { Badge } from '@mantine/core';
import type { OrderStatus } from '../../../shared/types';

const colors: Record<OrderStatus, string> = { paid: 'teal', initiated: 'gray', failed: 'red', cancelled: 'gray' };
const labels: Record<OrderStatus, string> = { paid: 'Paid', initiated: 'Checkout started', failed: 'Failed', cancelled: 'Cancelled' };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge color={colors[status]} variant={status === 'paid' ? 'light' : 'outline'} radius="sm">{labels[status]}</Badge>;
}
