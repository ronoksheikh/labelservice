import { Badge, Checkbox, Group, Table, Text } from '@mantine/core';
import type { ArvonoOrder } from '../../shared/api';
import { taka } from '../format';

interface Props {
  orders: ArvonoOrder[];
  selected?: Set<number>;
  onSelect?: (selected: Set<number>) => void;
  /** Extra per-row badge, e.g. printed / not printed on a link. */
  status?: (order: ArvonoOrder) => React.ReactNode;
  /** Rows that can be selected; others show no checkbox. Default: all. */
  canSelect?: (order: ArvonoOrder) => boolean;
}

export function OrdersTable({ orders, selected, onSelect, status, canSelect = () => true }: Props) {
  const selectable = !!selected && !!onSelect;
  const choices = orders.filter(canSelect);
  const all = selectable && choices.length > 0 && choices.every((order) => selected.has(order.orderId));
  const some = selectable && choices.some((order) => selected.has(order.orderId));
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelect?.(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    for (const order of choices) if (all) next.delete(order.orderId); else next.add(order.orderId);
    onSelect?.(next);
  };
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {selectable && (
              <Table.Th w={40}><Checkbox aria-label="Select all" checked={all} indeterminate={some && !all} onChange={toggleAll} /></Table.Th>
            )}
            <Table.Th>Order</Table.Th>
            <Table.Th>Recipient</Table.Th>
            <Table.Th>Address</Table.Th>
            <Table.Th ta="right">COD</Table.Th>
            <Table.Th>Parcel ID</Table.Th>
            <Table.Th>Booked</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orders.map((order) => (
            <Table.Tr key={order.orderId} onClick={selectable && canSelect(order) ? () => toggle(order.orderId) : undefined}
              bg={selected?.has(order.orderId) ? 'var(--selected-bg)' : undefined}
              style={selectable && canSelect(order) ? { cursor: 'pointer' } : undefined}>
              {selectable && (
                <Table.Td onClick={(event) => event.stopPropagation()}>
                  {canSelect(order) && (
                    <Checkbox aria-label={`Select ${order.orderName}`} checked={selected.has(order.orderId)} onChange={() => toggle(order.orderId)} />
                  )}
                </Table.Td>
              )}
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text fw={600} size="sm">{order.orderName}</Text>
                  {(order.printCount ?? 0) > 0 && (
                    <Badge size="xs" color="grape" variant="light">printed ×{order.printCount}</Badge>
                  )}
                  {status?.(order)}
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{order.customer.name}</Text>
                <Text size="xs" c="dimmed">{order.customer.phone}</Text>
              </Table.Td>
              <Table.Td maw={280}>
                <Text size="sm" lineClamp={2}>{[order.shippingAddress.address, order.shippingAddress.city].filter(Boolean).join(', ')}</Text>
              </Table.Td>
              <Table.Td ta="right"><Text size="sm" fw={600}>{taka(order.codAmount)}</Text></Table.Td>
              <Table.Td><Text size="sm" ff="monospace">{order.consignmentId}</Text></Table.Td>
              <Table.Td><Text size="sm" c="dimmed">{order.bookedDate ?? '—'}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
