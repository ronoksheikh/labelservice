import { useMemo, useState } from 'react';
import { Alert, Button, Card, Center, Group, Loader, Paper, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconLink, IconRefresh, IconRepeat, IconSearch } from '@tabler/icons-react';
import { api } from '../api';
import { useApi } from '../useApi';
import { plural } from '../format';
import { OrdersTable } from '../components/OrdersTable';
import { CreateLinkModal } from '../components/CreateLinkModal';
import type { ArvonoOrder, OrdersPage } from '../../shared/api';
import { notifyError } from '../notify';

export function Queue({ today }: { today: string }) {
  const [status, setStatus] = useState<'unprinted' | 'printed'>('unprinted');
  const [upTo, setUpTo] = useState(today);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const page = useApi<OrdersPage>(`/orders?status=${status}&upTo=${upTo}`);
  const orders = page.data?.orders ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order: ArvonoOrder) => [order.orderName, order.customer.name, order.customer.phone, order.consignmentId,
      order.shippingAddress.address, order.shippingAddress.city].some((value) => value?.toLowerCase().includes(term)));
  }, [orders, search]);

  const switchTab = (value: string) => { setStatus(value as typeof status); setSelected(new Set()); };
  const loadMore = async () => {
    if (!page.data?.nextCursor) return;
    setMoreLoading(true);
    try {
      const next = await api<OrdersPage>(`/orders?status=${status}&upTo=${upTo}&cursor=${encodeURIComponent(page.data.nextCursor)}`);
      page.setData({ ...next, orders: [...orders, ...next.orders] });
    } catch (error) { notifyError(error); } finally { setMoreLoading(false); }
  };
  const reprint = status === 'printed';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Print queue</Title>
          <Text c="dimmed" size="sm">
            {reprint ? 'Printed labels. Select labels to print again — a reason is required.' : 'Labels booked with Steadfast and not printed yet, oldest first.'}
          </Text>
        </div>
        <SegmentedControl value={status} onChange={switchTab}
          data={[{ value: 'unprinted', label: 'Waiting to print' }, { value: 'printed', label: 'Printed · reprint' }]} />
      </Group>

      <Card withBorder radius="md" p={0}>
        <Group p="sm" gap="sm" wrap="wrap">
          <TextInput type="date" label="Booked up to" value={upTo} max={today} onChange={(event) => { setUpTo(event.currentTarget.value || today); setSelected(new Set()); }} w={170} />
          <TextInput label="Search" placeholder="Order, name, phone, parcel ID" leftSection={<IconSearch size={16} />}
            value={search} onChange={(event) => setSearch(event.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} />
          <Button variant="default" mt="auto" onClick={page.reload} loading={page.loading} leftSection={<IconRefresh size={16} />}>Reload</Button>
        </Group>
        {page.error && <Alert color="red" m="sm" title="Could not load labels">{page.error}</Alert>}
        {page.loading && !page.data ? (
          <Center p="xl"><Loader /></Center>
        ) : filtered.length === 0 ? (
          <Center p="xl"><Text c="dimmed">{search ? 'No labels match your search.' : reprint ? 'No printed labels in this range.' : 'Nothing waiting to print. 🎉'}</Text></Center>
        ) : (
          <OrdersTable orders={filtered} selected={selected} onSelect={setSelected} />
        )}
        {page.data && (
          <Group justify="space-between" p="sm">
            <Text size="sm" c="dimmed">{plural(orders.length, 'label')} loaded{page.data.nextCursor ? ' · more available' : ''}</Text>
            {page.data.nextCursor && <Button variant="subtle" onClick={loadMore} loading={moreLoading}>Load more</Button>}
          </Group>
        )}
      </Card>

      {selected.size > 0 && (
        <Paper className="selection-bar" withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Group gap="sm">
              <Text fw={600}>{plural(selected.size, 'label')} selected</Text>
              <Button variant="subtle" size="compact-sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </Group>
            <Button onClick={() => setCreating(true)} color={reprint ? 'grape' : undefined}
              leftSection={reprint ? <IconRepeat size={16} /> : <IconLink size={16} />}>
              {reprint ? 'Request reprint' : 'Create print link'}
            </Button>
          </Group>
        </Paper>
      )}

      <CreateLinkModal opened={creating} onClose={() => setCreating(false)} mode={reprint ? 'reprint' : 'new'}
        orderIds={[...selected]} upTo={upTo}
        onCreated={() => { setSelected(new Set()); void page.reload(); }} />
    </Stack>
  );
}
