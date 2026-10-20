import { AppShell, Badge, Burger, Tooltip, Button, Center, Group, Loader, NavLink as MantineNavLink, Paper, PasswordInput, Stack, Text, Title, Alert } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBook2, IconChartBar, IconExternalLink, IconLogout, IconReceipt, IconTicket, IconUsers } from '@tabler/icons-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { Logo, LogoMark } from '../../components/Logo';
import { useSeo } from '../../components/Seo';
import { useApi } from '../../useApi';
import { Dashboard } from './Dashboard';
import { CoursesAdmin } from './Courses';
import { CourseEditor } from './CourseEditor';
import { CouponsAdmin } from './Coupons';
import { OrdersAdmin } from './Orders';
import { StudentsAdmin } from './Students';

const nav = [
  { to: '/admin', label: 'Dashboard', icon: IconChartBar, end: true },
  { to: '/admin/courses', label: 'Courses', icon: IconBook2 },
  { to: '/admin/coupons', label: 'Coupons', icon: IconTicket },
  { to: '/admin/orders', label: 'Orders', icon: IconReceipt },
  { to: '/admin/students', label: 'Students', icon: IconUsers },
];

export function AdminApp() {
  useSeo('Admin');
  const session = useApi<{ signedIn: boolean; configured: boolean; payments?: string }>('/admin/session');
  useEffect(() => {
    const onSignedOut = () => session.setData((current) => current && { ...current, signedIn: false });
    window.addEventListener('twobytes:admin-signed-out', onSignedOut);
    return () => window.removeEventListener('twobytes:admin-signed-out', onSignedOut);
  }, [session]);

  if (!session.data) return <Center h="100dvh"><Loader color="ink" type="dots" /></Center>;
  if (!session.data.signedIn) return <AdminLogin configured={session.data.configured} onSignedIn={() => void session.reload()} />;
  return <AdminShell payments={session.data.payments ?? 'off'} onSignedOut={() => session.setData({ signedIn: false, configured: true })} />;
}

function AdminLogin({ configured, onSignedIn }: { configured: boolean; onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/admin/login', { body: { password } });
      onSignedIn();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Center mih="100dvh" bg="var(--tb-subtle)" p="md">
      <Paper w="100%" maw={400} p="xl" withBorder shadow="sm">
        <form onSubmit={submit}>
          <Stack>
            <Stack gap={6} align="center"><LogoMark size={34} /><Title order={1} fz={22}>Admin sign in</Title></Stack>
            {!configured && <Alert color="orange" variant="light">Set the ADMIN_PASSWORD secret to enable the admin panel.</Alert>}
            <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoFocus size="md" error={error} />
            <Button type="submit" size="md" loading={busy} disabled={!configured}>Sign in</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

function AdminShell({ payments, onSignedOut }: { payments: string; onSignedOut: () => void }) {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  useEffect(close, [location.pathname, close]);
  async function signOut() {
    await api('/admin/logout', { body: {} }).catch(() => undefined);
    onSignedOut();
  }
  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="lg" bg="var(--tb-subtle)">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Logo size={22} to="/admin" />
            <Text fz={12} fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>Admin</Text>
          </Group>
          <Group gap="sm">
          <Tooltip label={payments === 'off' ? 'EPS is not configured: orders wait for Mark as paid' : `EPS ${payments} mode`}>
            <Badge variant="light" color={payments === 'live' ? 'teal' : payments === 'sandbox' ? 'orange' : 'gray'} radius="sm" visibleFrom="xs">
              Payments: {payments === 'off' ? 'off' : `EPS ${payments}`}
            </Badge>
          </Tooltip>
          <Button component="a" href="/" target="_blank" variant="default" size="xs" rightSection={<IconExternalLink size={14} />}>View site</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Stack gap={2}>
            {nav.map((item) => (
              <MantineNavLink key={item.to} component={NavLink} to={item.to} end={item.end} label={item.label}
                leftSection={<item.icon size={18} />} style={{ borderRadius: 8 }} fw={500}
                active={item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)} color="ink" variant="filled" />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <MantineNavLink label="Sign out" leftSection={<IconLogout size={18} />} onClick={() => void signOut()} style={{ borderRadius: 8 }} />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<CoursesAdmin />} />
          <Route path="courses/new" element={<CourseEditor />} />
          <Route path="courses/:id" element={<CourseEditor />} />
          <Route path="coupons" element={<CouponsAdmin />} />
          <Route path="orders" element={<OrdersAdmin />} />
          <Route path="students" element={<StudentsAdmin />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" gap="md">
      <Stack gap={2}>
        <Title order={1} fz={26}>{title}</Title>
        {description && <Text c="dimmed" fz={14}>{description}</Text>}
      </Stack>
      {action}
    </Group>
  );
}
