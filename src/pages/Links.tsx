import { useState } from 'react';
import { Alert, Button, Card, Center, Group, Loader, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../useApi';
import { dateTime, plural } from '../format';
import { ModeBadge, StatusBadge } from '../components/StatusBadge';
import { LinkActions } from '../components/LinkActions';
import type { PrintRequest } from '../../shared/api';

const FILTERS: Record<string, (request: PrintRequest) => boolean> = {
  all: () => true,
  open: (request) => !['printed', 'partial', 'released'].includes(request.status) && !request.expired,
  reprints: (request) => request.mode === 'reprint',
};

export function Links() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const links = useApi<PrintRequest[]>('/requests');
  const rows = (links.data ?? []).filter(FILTERS[filter]!);
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Print links</Title>
          <Text c="dimmed" size="sm">Every link sent to a print shop, with what happened to it.</Text>
        </div>
        <Group>
          <SegmentedControl value={filter} onChange={setFilter}
            data={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'reprints', label: 'Reprints' }]} />
          <Button variant="default" onClick={links.reload} loading={links.loading} leftSection={<IconRefresh size={16} />}>Reload</Button>
        </Group>
      </Group>
      {links.error && <Alert color="red">{links.error}</Alert>}
      <Card withBorder radius="md" p={0}>
        {links.loading && !links.data ? <Center p="xl"><Loader /></Center> : rows.length === 0 ? (
          <Center p="xl"><Text c="dimmed">No print links yet. Create one from the print queue.</Text></Center>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Labels</Table.Th>
                  <Table.Th>Reason / note</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((request) => (
                  <Table.Tr key={request.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/links/${request.id}`)}>
                    <Table.Td><Text size="sm">{dateTime(request.createdAt)}</Text></Table.Td>
                    <Table.Td><ModeBadge mode={request.mode} /></Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{plural(request.orders.length || request.requestedCount, 'label')}</Text>
                      {request.printedIds && <Text size="xs" c="dimmed">{request.printedIds.length} printed</Text>}
                    </Table.Td>
                    <Table.Td maw={320}><Text size="sm" c="dimmed" lineClamp={1}>{request.reason ?? request.note ?? '—'}</Text></Table.Td>
                    <Table.Td><StatusBadge request={request} /></Table.Td>
                    <Table.Td><LinkActions token={request.token} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
