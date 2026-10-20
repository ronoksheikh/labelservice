import { Anchor, Box, Burger, Button, Container, Drawer, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { SITE } from '../../shared/site';
import { Logo } from './Logo';

const links = [{ to: '/#courses', label: 'Courses' }, { to: '/about', label: 'About' }];

export function SiteHeader() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();
  useEffect(close, [location.pathname, close]);
  return (
    <header className="site-header">
      <Container size="lg" h={64}>
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Logo />
          <Group gap={28} visibleFrom="sm">
            {links.map((link) => <NavLink key={link.to} to={link.to} className="nav-link" end>{link.label}</NavLink>)}
            <Button component={Link} to="/my" size="sm" radius="xl" px="lg">My courses</Button>
          </Group>
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Open menu" />
        </Group>
      </Container>
      <Drawer opened={opened} onClose={close} position="top" size="auto" hiddenFrom="sm" withCloseButton={false} padding="lg">
        <Stack gap="lg" pt="xs">
          <Group justify="space-between"><Logo /><Burger opened onClick={close} size="sm" aria-label="Close menu" /></Group>
          {links.map((link) => <Anchor key={link.to} component={Link} to={link.to} c="dark" fz={20} fw={600} underline="never">{link.label}</Anchor>)}
          <Button component={Link} to="/my" size="lg" radius="xl">My courses</Button>
        </Stack>
      </Drawer>
    </header>
  );
}

export function SiteFooter() {
  return (
    <Box component="footer" py={48} style={{ borderTop: '1px solid var(--tb-border)' }} bg="var(--tb-subtle)">
      <Container size="lg">
        <Group justify="space-between" align="flex-start" gap="xl">
          <Stack gap="sm" maw={340}>
            <Logo />
            <Text c="dimmed" fz={14}>{SITE.tagline} Run by {SITE.founders.join(' & ')}.</Text>
          </Stack>
          <Group gap={48} align="flex-start">
            <Stack gap={8}>
              <Text fw={600} fz={14}>Learn</Text>
              <Anchor component={Link} to="/#courses" c="dimmed" fz={14}>All courses</Anchor>
              <Anchor component={Link} to="/my" c="dimmed" fz={14}>My courses</Anchor>
              <Anchor component={Link} to="/login" c="dimmed" fz={14}>Sign in</Anchor>
            </Stack>
            <Stack gap={8}>
              <Text fw={600} fz={14}>Company</Text>
              <Anchor component={Link} to="/about" c="dimmed" fz={14}>About us</Anchor>
              <Anchor href="mailto:hello@twobytes.dev" c="dimmed" fz={14}>Contact</Anchor>
            </Stack>
            <Stack gap={8}>
              <Text fw={600} fz={14}>Legal</Text>
              <Anchor component={Link} to="/privacy" c="dimmed" fz={14}>Privacy</Anchor>
              <Anchor component={Link} to="/terms" c="dimmed" fz={14}>Terms</Anchor>
              <Anchor component={Link} to="/refunds" c="dimmed" fz={14}>Refunds</Anchor>
            </Stack>
          </Group>
        </Group>
        <Text c="dimmed" fz={13} mt={40}>© {new Date().getFullYear()} {SITE.name}. Prices in Bangladeshi Taka (BDT).</Text>
      </Container>
    </Box>
  );
}

export function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <main style={{ minHeight: 'calc(100dvh - 64px)' }}><Outlet /></main>
      <SiteFooter />
    </>
  );
}
