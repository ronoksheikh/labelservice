import { Alert, Button, Card, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowRight, IconPlugConnectedX } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../useApi';
import { dateTime, plural } from '../format';
import { ModeBadge, StatusBadge } from '../components/StatusBadge';
import type { PrintRequest, Session, Summary } from '../../shared/api';

function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>{label}</Text>
      {value === undefined ? <Skeleton h={34} mt={6} w={60} /> : <Text fz={30} fw={700} lh={1.3}>{value}</Text>}
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Paper>
  );
}

export function Overview({ session }: { session: Session }) {
  const navigate = useNavigate();
  const summary = useApi<Summary>(session.configured ? `/summary?upTo=${session.today}` : null);
  const links = useApi<PrintRequest[]>('/requests');
  const open = links.data?.filter((request) => request.status === 'ready' && !request.expired) ?? [];
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Overview</Title>
          <Text c="dimmed" size="sm">Everything booked up to {session.today}, Asia/Dhaka.</Text>
        </div>
        <Button component={Link} to="/queue" rightSection={<IconArrowRight size={16} />}>Open print queue</Button>
      </Group>
      {!session.configured && (
        <Alert color="orange" icon={<IconPlugConnectedX />} title="ARVONO is not connected">
          Set the <code>ARVONO_API_KEY</code> secret with <code>dispatch:read</code> and <code>dispatch:print</code> scopes.
        </Alert>
      )}
      {summary.error && <Alert color="red" title="Could not load the summary">{summary.error}</Alert>}
      {session.configured && (
        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <Stat label="Waiting to print" value={summary.data?.backlog.unprinted} hint="All days" />
          <Stat label="Reserved" value={summary.data?.backlog.reserved} hint="On open print links" />
          <Stat label="Printed today" value={summary.data?.printedOnDate} />
          <Stat label="Awaiting pickup" value={summary.data?.backlog.awaitingPickup} hint="All days" />
        </SimpleGrid>
      )}
      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="sm">
          <div>
            <Text fw={600}>Open print links</Text>
            <Text size="sm" c="dimmed">{open.length ? `${plural(open.length, 'link')} waiting for the print shop` : 'Nothing waiting for the print shop'}</Text>
          </div>
          <Button variant="subtle" component={Link} to="/links" rightSection={<IconArrowRight size={14} />}>All links</Button>
        </Group>
        {links.loading && !links.data ? <Skeleton h={80} /> : open.length > 0 && (
          <Table highlightOnHover>
            <Table.Tbody>
              {open.slice(0, 8).map((request) => (
                <Table.Tr key={request.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/links/${request.id}`)}>
                  <Table.Td><ModeBadge mode={request.mode} /></Table.Td>
                  <Table.Td><Text size="sm" fw={500}>{plural(request.orders.length, 'label')}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed" lineClamp={1}>{request.reason ?? request.note ?? ''}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{dateTime(request.createdAt)}</Text></Table.Td>
                  <Table.Td><StatusBadge request={request} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
