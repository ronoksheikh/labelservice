import { Alert, Box, Button, Container, Divider, Group, Loader, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconClockHour4, IconMail } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { OrderReceipt } from '../../shared/types';
import { Logo } from '../components/Logo';
import { useSeo } from '../components/Seo';
import { formatDateTime, shortId, taka } from '../format';
import { useApi } from '../useApi';

export function CheckoutStatus() {
  useSeo('Your order');
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('k') ?? '';
  const { data: order, error, reload } = useApi<OrderReceipt>(`/orders/${encodeURIComponent(id)}?k=${encodeURIComponent(key)}`);

  // Payment results can arrive a moment after the buyer comes back from the gateway.
  useEffect(() => {
    if (order?.status !== 'initiated') return;
    const timer = setInterval(() => void reload(), 5000);
    const stop = setTimeout(() => clearInterval(timer), 10 * 60 * 1000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [order?.status, reload]);

  const first = order?.items[0];
  return (
    <Box mih="100dvh" bg="var(--tb-subtle)">
      <Container size={560} py={32}>
        <Group justify="center" mb={40}><Logo /></Group>
        {error ? (
          <Alert color="red" variant="light" title="We couldn't find this order">
            {error.message} If you paid, check your email for your course link or contact hello@2bytes.dev.
          </Alert>
        ) : !order ? (
          <Paper p="xl" withBorder><Stack><Skeleton h={56} w={56} circle mx="auto" /><Skeleton h={24} w="60%" mx="auto" /><Skeleton h={120} /></Stack></Paper>
        ) : (
          <Paper p={{ base: 'lg', sm: 'xl' }} withBorder shadow="sm">
            <Stack gap="lg">
              {order.status === 'paid' ? (
                <Stack align="center" ta="center" gap="sm">
                  <ThemeIcon size={64} radius="xl" color="ink"><IconCheck size={34} /></ThemeIcon>
                  <Title order={1} fz={28}>You're in, {order.name.split(' ')[0]}!</Title>
                  <Text c="dimmed">Payment received. Your course is ready to watch now.</Text>
                  <Group gap={6} c="dimmed" fz={14}><IconMail size={16} />We also emailed your access link to <b>{order.email}</b></Group>
                  <Button component={Link} size="lg" mt="sm" fullWidth
                    to={order.signedIn && first ? `/learn/${first.slug}` : order.signedIn ? '/my' : '/login'}>
                    {order.signedIn ? 'Start learning' : 'Sign in to start learning'}
                  </Button>
                </Stack>
              ) : order.status === 'initiated' ? (
                <Stack align="center" ta="center" gap="sm">
                  <ThemeIcon size={64} radius="xl" color="ink" variant="light"><IconClockHour4 size={32} /></ThemeIcon>
                  <Title order={1} fz={26}>Order received</Title>
                  <Text c="dimmed" maw={420}>
                    We've saved your order and are waiting for payment. Online payment is being connected. We'll contact you
                    at <b>{order.email}</b> to complete it, and this page updates the moment it's paid.
                  </Text>
                  <Group gap={8} c="dimmed" fz={13}><Loader size={12} color="gray" />Checking payment status…</Group>
                </Stack>
              ) : (
                <Stack align="center" ta="center" gap="sm">
                  <ThemeIcon size={64} radius="xl" color="red" variant="light"><IconAlertTriangle size={32} /></ThemeIcon>
                  <Title order={1} fz={26}>{order.status === 'cancelled' ? 'Order cancelled' : "Payment didn't go through"}</Title>
                  <Text c="dimmed">No money was taken. You can try again; it only takes a minute.</Text>
                  {first && <Button component={Link} to={`/courses/${first.slug}`} size="lg" mt="sm" fullWidth>Try again</Button>}
                </Stack>
              )}

              <Divider />
              <Stack gap="xs">
                <Group justify="space-between"><Text fz={13} c="dimmed">Order</Text><Text fz={13} ff="monospace">#{shortId(order.id)}</Text></Group>
                <Group justify="space-between"><Text fz={13} c="dimmed">Date</Text><Text fz={13}>{formatDateTime(order.paidAt ?? order.createdAt)}</Text></Group>
              </Stack>
              <Stack gap="xs">
                {order.items.map((item) => (
                  <Group key={item.courseId} justify="space-between" wrap="nowrap">
                    <Text fz={15}>{item.title}</Text><Text fw={600}>{taka(item.price)}</Text>
                  </Group>
                ))}
                {order.discount > 0 && <Group justify="space-between"><Text fz={15} c="dimmed">Discount</Text><Text fw={600}>−{taka(order.discount)}</Text></Group>}
                <Group justify="space-between" pt="xs" className="dashed"><Text fw={700}>Total</Text><Text fw={700} fz={18}>{taka(order.total)}</Text></Group>
              </Stack>
            </Stack>
          </Paper>
        )}
        <Text ta="center" c="dimmed" fz={13} mt="lg">Questions? Email <a href="mailto:hello@2bytes.dev">hello@2bytes.dev</a></Text>
      </Container>
    </Box>
  );
}
