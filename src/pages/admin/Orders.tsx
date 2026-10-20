import { ActionIcon, Alert, Button, Group, Menu, Modal, Paper, SegmentedControl, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDots, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import type { AdminOrder } from '../../../shared/types';
import { api } from '../../api';
import { formatDateTime, shortId, taka } from '../../format';
import { notifyError, notifySuccess } from '../../notify';
import { useApi } from '../../useApi';
import { PageHeader } from './AdminApp';
import { OrderStatusBadge } from './StatusBadge';

export function OrdersAdmin() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search.trim(), 300);
  const params = new URLSearchParams({ ...(status !== 'all' ? { status } : {}), ...(query ? { q: query } : {}) });
  const { data, error, reload } = useApi<AdminOrder[]>(`/admin/orders?${params}`);
  const [paying, setPaying] = useState<AdminOrder | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    if (!paying) return;
    setBusy(true);
    try {
      await api(`/admin/orders/${paying.id}/mark-paid`, { body: { reference } });
      notifySuccess(`Order paid. ${paying.email} has been enrolled and emailed.`);
      setPaying(null);
      await reload();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function checkPayment(order: AdminOrder) {
    try {
      const { paid } = await api<{ paid: boolean }>(`/admin/orders/${order.id}/check-payment`, { body: {} });
      if (paid) notifySuccess(`EPS confirmed the payment. ${order.email} has been enrolled and emailed.`);
      else notifications.show({ color: 'gray', message: 'EPS has no completed payment for this order yet.' });
      await reload();
    } catch (reason) {
      notifyError(reason);
    }
  }

  function cancel(order: AdminOrder) {
    modals.openConfirmModal({
      title: 'Cancel this order?', children: <Text fz={14}>The buyer's order page will show it as cancelled.</Text>,
      labels: { confirm: 'Cancel order', cancel: 'Keep' }, confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await api(`/admin/orders/${order.id}/cancel`, { body: {} }); await reload(); } catch (reason) { notifyError(reason); }
      },
    });
  }

  return (
    <>
      <PageHeader title="Orders" description="Every checkout, paid or not. Unpaid checkouts are people to follow up with." />
      <Group mb="md" justify="space-between">
        <SegmentedControl value={status} onChange={setStatus}
          data={[{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'initiated', label: 'Started' }, { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' }]} />
        <TextInput placeholder="Search name, email, phone, order" leftSection={<IconSearch size={16} />} value={search}
          onChange={(e) => setSearch(e.currentTarget.value)} w={{ base: '100%', sm: 300 }} />
      </Group>
      {error && <Alert color="red" variant="light" mb="md">{error.message}</Alert>}
      <Paper className="table-wrap">
        <Table.ScrollContainer minWidth={860}>
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Buyer</Table.Th><Table.Th>Items</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th>Status</Table.Th><Table.Th>Source</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {!data && [0, 1, 2].map((key) => <Table.Tr key={key}><Table.Td colSpan={7}><Skeleton h={36} /></Table.Td></Table.Tr>)}
              {data?.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center" py="lg">No orders found.</Text></Table.Td></Table.Tr>}
              {data?.map((order) => (
                <Table.Tr key={order.id}>
                  <Table.Td><Text fz={13}>{formatDateTime(order.createdAt)}</Text><Text fz={11} c="dimmed" ff="monospace">#{shortId(order.id)}</Text></Table.Td>
                  <Table.Td>
                    <Text fz={14} fw={500}>{order.name}</Text>
                    <Text fz={12} c="dimmed">{order.email}</Text>
                    <Text fz={12} c="dimmed"><a href={`tel:${order.phone}`} style={{ color: 'inherit' }}>{order.phone}</a></Text>
                  </Table.Td>
                  <Table.Td maw={260}>
                    {order.items.map((item) => <Text key={item} fz={13} lineClamp={1}>{item}</Text>)}
                    {order.couponCode && <Text fz={12} c="dimmed">Coupon {order.couponCode} (−{taka(order.discount)})</Text>}
                  </Table.Td>
                  <Table.Td ta="right" fw={600}>{taka(order.total)}</Table.Td>
                  <Table.Td>
                    <OrderStatusBadge status={order.status} />
                    {order.paymentProvider && (
                      <Text fz={11} c="dimmed" mt={2} tt="none">
                        {[order.paymentProvider.toUpperCase(), order.paymentMethod, order.paymentRef].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td><Text fz={13} tt="capitalize">{order.source ?? '—'}</Text></Table.Td>
                  <Table.Td ta="right">
                    {order.status !== 'paid' && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Actions"><IconDots size={18} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          {order.paymentProvider === 'eps' && <Menu.Item onClick={() => void checkPayment(order)}>Check payment with EPS</Menu.Item>}
                          <Menu.Item onClick={() => { setPaying(order); setReference(''); }}>Mark as paid…</Menu.Item>
                          {order.status === 'initiated' && <Menu.Item color="red" onClick={() => cancel(order)}>Cancel order</Menu.Item>}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal opened={Boolean(paying)} onClose={() => setPaying(null)} title={<Text fw={700}>Mark order as paid</Text>} radius="lg">
        {paying && (
          <Stack>
            <Text fz={14}>
              Use this for payments taken outside the website (for example a bKash transfer). <b>{paying.name}</b> gets access to{' '}
              {paying.items.join(' and ')} right away and an email with their course link at <b>{paying.email}</b>.
            </Text>
            <TextInput label="Payment reference (optional)" placeholder="e.g. bKash TrxID" value={reference} onChange={(e) => setReference(e.currentTarget.value)} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPaying(null)}>Cancel</Button>
              <Button onClick={() => void markPaid()} loading={busy}>Mark paid · {taka(paying.total)}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
