import { Container, Stack, Text, Title } from '@mantine/core';
import type { StaticPage } from '../../shared/content';
import { SITE } from '../../shared/site';
import { Founders } from '../components/Founders';
import { LogoMark } from '../components/Logo';
import { Prose } from '../components/Prose';
import { useSeo } from '../components/Seo';

export function StaticPageView({ page }: { page: StaticPage }) {
  useSeo(page.title, page.description);
  const about = page.path === '/about';
  return (
    <Container size={720} py={{ base: 48, sm: 80 }}>
      <Stack gap="xl">
        <Stack gap="sm">
          {about && <LogoMark size={44} />}
          <Title order={1}>{about ? 'Two people. One platform.' : page.title}</Title>
          {about && <Text c="dimmed" fz={19}>{SITE.name} is built, taught and run by {SITE.founders.join(' and ')}.</Text>}
        </Stack>
        {about && <Founders />}
        <Prose source={page.body} />
      </Stack>
    </Container>
  );
}
