import type { ReactNode } from 'react';
import { ActionIcon, AppShell, Burger, Group, NavLink, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLayoutDashboard, IconLink, IconLogout, IconMoon, IconPrinter, IconSun } from '@tabler/icons-react';
import { NavLink as RouterLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import type { Session } from '../../shared/api';

const NAV = [
  { to: '/', label: 'Overview', icon: IconLayoutDashboard },
  { to: '/queue', label: 'Print queue', icon: IconPrinter },
  { to: '/links', label: 'Print links', icon: IconLink },
];

export function Layout({ session, children }: { session: Session; children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { pathname } = useLocation();
  const signOut = async () => {
    await api('/logout', { body: {} }).catch(() => undefined);
    window.dispatchEvent(new Event('arvono:signed-out'));
  };
  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text className="wordmark" size="28px">ARVONO</Text>
            <Text c="dimmed" size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.12em' }} visibleFrom="xs">Labels</Text>
          </Group>
          <Group gap="xs">
            <Tooltip label="Toggle theme">
              <ActionIcon variant="default" size="lg" onClick={toggleColorScheme} aria-label="Toggle theme">
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Sign out">
              <ActionIcon variant="default" size="lg" onClick={signOut} aria-label="Sign out"><IconLogout size={18} /></ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} component={RouterLink} to={to} label={label} onClick={close} color="gray" variant="light" leftSection={<Icon size={18} />}
            active={to === '/' ? pathname === '/' : pathname.startsWith(to)} />
        ))}
        <Text size="xs" c="dimmed" mt="auto" p="xs">
          {session.configured ? `Business date ${session.today} · Asia/Dhaka` : 'ARVONO API key not configured'}
        </Text>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
