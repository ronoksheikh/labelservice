import { Alert, Box, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import type { DailyStat, Stats } from '../../../shared/types';
import { formatDateTime, percent, taka } from '../../format';
import { useApi } from '../../useApi';
import { PageHeader } from './AdminApp';
import { OrderStatusBadge } from './StatusBadge';

const number = new Intl.NumberFormat('en-IN');

export function Dashboard() {
  const [days, setDays] = useState('30');
  const { data, error } = useApi<Stats>(`/admin/stats?days=${days}`);

  return (
    <>
      <PageHeader title="Dashboard" description="Visitors, checkouts and sales. Days follow Bangladesh time."
        action={<SegmentedControl value={days} onChange={setDays} data={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
      {error && <Alert color="red" variant="light" mb="lg">{error.message}</Alert>}
      {!data ? (
        <Stack><SimpleGrid cols={{ base: 2, md: 5 }}>{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} h={96} radius="lg" />)}</SimpleGrid><Skeleton h={280} radius="lg" /></Stack>
      ) : (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 2, md: 5 }} spacing="md">
            <Stat label="Visitors" value={number.format(data.totals.visitors)} hint={`${number.format(data.totals.views)} page views`} />
            <Stat label="Checkouts started" value={number.format(data.totals.checkouts)} hint={data.totals.visitors ? `${percent(data.totals.checkouts / data.totals.visitors)} of visitors` : undefined} />
            <Stat label="Purchases" value={number.format(data.totals.purchases)} hint={data.totals.checkouts ? `${percent(data.totals.checkoutRate)} of checkouts` : undefined} />
            <Stat label="Revenue" value={taka(data.totals.revenue)} hint={data.totals.purchases ? `${taka(data.totals.revenue / data.totals.purchases)} per order` : undefined} />
            <Stat label="Conversion rate" value={percent(data.totals.conversionRate)} hint="Visitors who bought" />
          </SimpleGrid>

          <Paper p="lg" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={600}>Daily visitors</Text>
              <Text fz={13} c="dimmed">Hover a bar for that day's checkouts and sales</Text>
            </Group>
            <VisitorsChart daily={data.daily} />
          </Paper>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
              <Text fw={600} p="md">Courses</Text>
              <Table.ScrollContainer minWidth={420}>
                <Table verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead><Table.Tr><Table.Th>Course</Table.Th><Table.Th ta="right">Visitors</Table.Th><Table.Th ta="right">Checkouts</Table.Th><Table.Th ta="right">Sales</Table.Th><Table.Th ta="right">Revenue</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {data.courses.length === 0 && <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" fz={14}>No courses yet.</Text></Table.Td></Table.Tr>}
                    {data.courses.map((course) => (
                      <Table.Tr key={course.id}>
                        <Table.Td><Text fz={14} lineClamp={1}>{course.title}</Text></Table.Td>
                        <Table.Td ta="right">{number.format(course.views)}</Table.Td>
                        <Table.Td ta="right">{number.format(course.checkouts)}</Table.Td>
                        <Table.Td ta="right">{number.format(course.purchases)}</Table.Td>
                        <Table.Td ta="right" fw={600}>{taka(course.revenue)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
              <Breakdown title="Traffic sources" rows={data.sources.map((row) => ({ label: row.source, value: row.visitors, extra: row.purchases ? `${row.purchases} sales` : undefined }))} />
              <Breakdown title="Countries" rows={data.countries.map((row) => ({ label: row.country === '??' ? 'Unknown' : row.country, value: row.visitors }))} />
            </SimpleGrid>
          </SimpleGrid>

          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Text fw={600} p="md">Latest orders</Text>
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="sm" horizontalSpacing="md">
                <Table.Tbody>
                  {data.recentOrders.length === 0 && <Table.Tr><Table.Td><Text c="dimmed" fz={14}>No orders yet.</Text></Table.Td></Table.Tr>}
                  {data.recentOrders.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Td><Text fz={14} fw={500}>{order.name}</Text><Text fz={12} c="dimmed">{order.email}</Text></Table.Td>
                      <Table.Td><Text fz={14} lineClamp={1}>{order.items.join(' + ')}</Text></Table.Td>
                      <Table.Td><OrderStatusBadge status={order.status} /></Table.Td>
                      <Table.Td ta="right" fw={600}>{taka(order.total)}</Table.Td>
                      <Table.Td ta="right"><Text fz={13} c="dimmed">{formatDateTime(order.createdAt)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Stack>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper p="md" className="stat-card">
      <Text fz={13} c="dimmed" fw={500}>{label}</Text>
      <Text fz={26} fw={700} mt={4} style={{ letterSpacing: '-0.02em' }}>{value}</Text>
      {hint && <Text fz={12} c="dimmed" mt={2}>{hint}</Text>}
    </Paper>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; value: number; extra?: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Paper withBorder p="md">
      <Text fw={600} mb="sm">{title}</Text>
      <Stack gap={10}>
        {rows.length === 0 && <Text c="dimmed" fz={14}>No visits yet.</Text>}
        {rows.map((row) => (
          <Box key={row.label}>
            <Group justify="space-between" fz={13} mb={4} wrap="nowrap">
              <Text fz={13} fw={500} truncate tt="capitalize">{row.label}</Text>
              <Text fz={13} c="dimmed" style={{ whiteSpace: 'nowrap' }}>{row.extra ? `${row.extra} · ` : ''}{number.format(row.value)}</Text>
            </Group>
            <Box h={6} bg="ink.1" style={{ borderRadius: 3 }}>
              <Box h={6} bg="ink.9" style={{ borderRadius: 3, width: `${(row.value / max) * 100}%` }} />
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

/** One series (visitors per day) as thin bars; the tooltip carries the rest of that day's numbers. */
function VisitorsChart({ daily }: { daily: DailyStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 1000;
  const height = 220;
  const top = 12;
  const max = Math.max(4, ...daily.map((row) => row.visitors));
  const step = width / daily.length;
  const bar = Math.max(2, Math.min(28, step - 2));
  const ticks = [0, Math.round(max / 2), max];
  const label = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const active = hover === null ? null : daily[hover];

  return (
    <Box pos="relative">
      <svg viewBox={`0 0 ${width} ${height + 24}`} width="100%" role="img" aria-label="Daily visitors" style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => {
          const y = top + (height - top) * (1 - tick / max);
          return (
            <g key={tick}>
              <line x1={0} x2={width} y1={y} y2={y} stroke="#f0f0f2" strokeWidth={1} />
              <text x={0} y={y - 4} fontSize={11} fill="#a1a1aa">{tick}</text>
            </g>
          );
        })}
        {daily.map((row, index) => {
          const h = ((height - top) * row.visitors) / max;
          const x = index * step + (step - bar) / 2;
          const r = Math.min(4, bar / 2, h);
          return (
            <g key={row.date} onMouseEnter={() => setHover(index)}>
              <rect x={index * step} y={0} width={step} height={height} fill="transparent" />
              {h > 0 && (
                <path fill={hover === index ? '#09090b' : '#3f3f46'}
                  d={`M${x},${height} V${height - h + r} Q${x},${height - h} ${x + r},${height - h} H${x + bar - r} Q${x + bar},${height - h} ${x + bar},${height - h + r} V${height} Z`} />
              )}
            </g>
          );
        })}
        <line x1={0} x2={width} y1={height} y2={height} stroke="#d4d4d8" strokeWidth={1} />
        {daily.map((row, index) => (index % Math.ceil(daily.length / 7) === 0 || index === daily.length - 1) && (
          <text key={row.date} x={index * step + step / 2} y={height + 18} fontSize={11} fill="#71717a" textAnchor="middle">{label(row.date)}</text>
        ))}
      </svg>
      {active && hover !== null && (
        <Paper shadow="md" p="sm" withBorder pos="absolute" top={0} miw={170} style={{
          pointerEvents: 'none',
          left: `${Math.min(Math.max(((hover + 0.5) / daily.length) * 100, 10), 82)}%`, transform: 'translateX(-50%)',
        }}>
          <Text fz={12} fw={700} mb={4}>{label(active.date)}</Text>
          {[['Visitors', number.format(active.visitors)], ['Page views', number.format(active.views)], ['Checkouts', number.format(active.checkouts)],
            ['Purchases', number.format(active.purchases)], ['Revenue', taka(active.revenue)]].map(([name, value]) => (
            <Group key={name} justify="space-between" gap="lg"><Text fz={12} c="dimmed">{name}</Text><Text fz={12} fw={600}>{value}</Text></Group>
          ))}
        </Paper>
      )}
    </Box>
  );
}
