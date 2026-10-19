import { useState } from 'react';
import { Alert, Anchor, Badge, Button, Card, Center, CopyButton, Grid, Group, Loader, Paper, Stack, Text, TextInput, Timeline, Title } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconCopy, IconExternalLink, IconRefresh, IconRepeat, IconX } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApi } from '../useApi';
import { dateTime, plural, shareUrl } from '../format';
import { notifyError, notifySuccess } from '../notify';
import { OrdersTable } from '../components/OrdersTable';
import { ModeBadge, StatusBadge } from '../components/StatusBadge';
import { CreateLinkModal } from '../components/CreateLinkModal';
import { ReleaseModal } from '../components/ReleaseModal';
import type { PrintRequest } from '../../shared/api';

const EVENT_TITLES: Record<string, string> = {
  created: 'Link created', reserved: 'Reserved in ARVONO', reprint_requested: 'Reprint requested', downloaded: 'Downloaded',
  printed: 'Printing confirmed', released: 'Released', failed: 'Failed',
};

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>{label}</Text>
      <Text size="sm" component="div">{children}</Text>
    </div>
  );
}

export function LinkDetail({ today }: { today: string }) {
  const { id } = useParams();
  const request = useApi<PrintRequest>(`/requests/${id}`);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (request.error && !request.data) return <Alert color="red" title="Could not load this link">{request.error}</Alert>;
  const data = request.data;
  if (!data) return <Center p="xl"><Loader /></Center>;

  const done = data.status === 'printed' || data.status === 'partial';
  const inFlight = ['claiming', 'confirming', 'releasing'].includes(data.status);
  const printed = new Set(data.printedIds ?? []);
  const reprintable = done ? data.orders.filter((order) => printed.has(order.orderId)) : [];

  const retry = async () => {
    setBusy(true);
    try { await api(`/requests/${data.id}/retry`, { body: {} }); notifySuccess('Done.'); }
    catch (error) { notifyError(error); }
    finally { setBusy(false); void request.reload(); }
  };
  const release = async (reason: string) => {
    try {
      await api(`/requests/${data.id}/release`, { body: { reason } });
      notifySuccess(data.mode === 'new' ? 'Labels are back in the print queue.' : 'Reprint cancelled.');
    } catch (error) { notifyError(error); throw error; }
    finally { void request.reload(); }
  };

  return (
    <Stack gap="md">
      <Anchor component={Link} to="/links" size="sm" c="dimmed"><Group gap={4}><IconArrowLeft size={14} />All print links</Group></Anchor>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{plural(data.orders.length || data.requestedCount, 'label')}</Title>
            <ModeBadge mode={data.mode} />
            <StatusBadge request={data} />
          </Group>
          <Text c="dimmed" size="sm">Created {dateTime(data.createdAt)} · updated {dateTime(data.updatedAt)}</Text>
        </div>
        <Group>
          {inFlight && (
            <Button variant="default" onClick={retry} loading={busy} leftSection={<IconRefresh size={16} />}>Retry</Button>
          )}
          {(data.status === 'ready' || data.status === 'failed') && (
            <Button variant="light" color="red" onClick={() => setReleasing(true)} leftSection={<IconX size={16} />}>
              {data.mode === 'new' ? 'Release labels' : 'Cancel reprint'}
            </Button>
          )}
        </Group>
      </Group>

      {data.error && <Alert color="red" title="Last attempt failed">{data.error}</Alert>}
      {data.expired && (
        <Alert color="orange" title="Reservation expired">
          ARVONO returned these labels to the queue after 24 hours. Release this link and create a new one.
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <TextInput label="Print-shop link" readOnly value={shareUrl(data.token)} onFocus={(event) => event.currentTarget.select()}
                  rightSectionWidth={170} rightSection={
                    <Group gap={4} wrap="nowrap">
                      <CopyButton value={shareUrl(data.token)}>
                        {({ copied, copy }) => (
                          <Button size="compact-sm" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                            {copied ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </CopyButton>
                      <Button size="compact-sm" variant="subtle" component="a" href={shareUrl(data.token)} target="_blank" leftSection={<IconExternalLink size={14} />}>Open</Button>
                    </Group>
                  } />
                <Group grow align="flex-start">
                  {data.reason && <Info label="Reprint reason">{data.reason}</Info>}
                  {data.note && <Info label="Note">{data.note}</Info>}
                  {data.expiresAt && <Info label="Reserved until">{dateTime(data.expiresAt)}</Info>}
                  {data.upstreamJobId && <Info label="ARVONO job"><Text size="xs" ff="monospace">{data.upstreamJobId}</Text></Info>}
                </Group>
              </Stack>
            </Paper>

            <Card withBorder radius="md" p={0}>
              <Group justify="space-between" p="sm">
                <Text fw={600}>Labels</Text>
                {reprintable.length > 0 && (
                  <Button size="xs" color="grape" variant={selected.size ? 'filled' : 'light'} disabled={!selected.size}
                    onClick={() => setReprinting(true)} leftSection={<IconRepeat size={14} />}>
                    {selected.size ? `Reprint ${plural(selected.size, 'label')}` : 'Select labels to reprint'}
                  </Button>
                )}
              </Group>
              {data.orders.length === 0 ? (
                <Text c="dimmed" size="sm" p="md">No labels were reserved.</Text>
              ) : (
                <OrdersTable orders={data.orders}
                  selected={reprintable.length ? selected : undefined}
                  onSelect={reprintable.length ? setSelected : undefined} canSelect={(order) => printed.has(order.orderId)}
                  status={done ? (order) => printed.has(order.orderId)
                    ? <Badge size="xs" color="teal" variant="light">printed</Badge>
                    : <Badge size="xs" color="red" variant="light">not printed</Badge> : undefined} />
              )}
            </Card>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="md">History</Text>
            <Timeline bulletSize={14} lineWidth={2} active={(data.events?.length ?? 0) - 1}>
              {data.events?.map((event) => (
                <Timeline.Item key={event.id} title={<Text size="sm" fw={600}>{EVENT_TITLES[event.action] ?? event.action}</Text>}>
                  {event.detail && <Text size="sm">{event.detail}</Text>}
                  <Text size="xs" c="dimmed">{event.actor} · {dateTime(event.createdAt)}</Text>
                </Timeline.Item>
              ))}
            </Timeline>
          </Paper>
        </Grid.Col>
      </Grid>

      <ReleaseModal opened={releasing} onClose={() => setReleasing(false)} onConfirm={release}
        title={data.mode === 'new' ? 'Release these labels?' : 'Cancel this reprint?'}
        description={data.mode === 'new'
          ? 'The labels go back to the print queue in ARVONO and this link stops working.'
          : 'The print shop will no longer be able to print from this link.'}
        confirmLabel={data.mode === 'new' ? 'Release labels' : 'Cancel reprint'} />
      <CreateLinkModal opened={reprinting} onClose={() => setReprinting(false)} mode="reprint" orderIds={[...selected]} upTo={today}
        onCreated={() => setSelected(new Set())} />
    </Stack>
  );
}
