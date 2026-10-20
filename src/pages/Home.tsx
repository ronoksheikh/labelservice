import { Accordion, Alert, Box, Button, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowRight, IconBolt, IconDeviceMobile, IconInfinity, IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FAQ } from '../../shared/content';
import { SITE } from '../../shared/site';
import type { CourseSummary } from '../../shared/types';
import { takeBoot } from '../boot';
import { CourseCard, CourseCardSkeleton } from '../components/CourseCard';
import { Founders } from '../components/Founders';
import { LogoMark } from '../components/Logo';
import { useSeo } from '../components/Seo';
import { useApi } from '../useApi';

const perks = [
  { icon: IconBolt, title: 'Practical, no filler', text: 'Short lessons built around real projects you can use right away.' },
  { icon: IconInfinity, title: 'Lifetime access', text: 'Pay once in Taka. Rewatch any time and get every update.' },
  { icon: IconDeviceMobile, title: 'Learn on any device', text: 'Phone, laptop or tablet. Pick up exactly where you left off.' },
  { icon: IconLock, title: 'No account needed', text: 'Check out with your email. We send you a one-click sign-in link.' },
];

export function Home() {
  useSeo(SITE.name, SITE.description);
  const [boot] = useState(() => takeBoot<CourseSummary[]>('/'));
  const { data: courses, error, loading, reload } = useApi<CourseSummary[]>('/courses', boot);

  return (
    <>
      <Box pos="relative" style={{ overflow: 'hidden' }}>
        <Box className="hero-grid" pos="absolute" inset={0} aria-hidden />
        <Container size="lg" pos="relative" pt={{ base: 56, sm: 96 }} pb={{ base: 48, sm: 80 }}>
          <Stack align="center" ta="center" gap="lg" maw={860} mx="auto">
            <span className="eyebrow"><LogoMark size={16} /> Built by two developers in Bangladesh</span>
            <h1 className="hero-title" style={{ margin: 0 }}>Learn the skills that <em>actually</em> get you paid.</h1>
            <Text c="dimmed" fz={{ base: 17, sm: 20 }} maw={620} lh={1.55}>
              Focused video courses on code, content and careers. Priced in Taka, made for learners in Bangladesh.
            </Text>
            <Group gap="sm" mt="xs">
              <Button component={Link} to="/#courses" size="lg" radius="xl" rightSection={<IconArrowRight size={18} />}>Browse courses</Button>
              <Button component={Link} to="/my" size="lg" radius="xl" variant="default">My courses</Button>
            </Group>
          </Stack>
        </Container>
      </Box>

      <Container size="lg" pb={{ base: 64, sm: 96 }} id="courses" style={{ scrollMarginTop: 80 }}>
        <Group justify="space-between" align="flex-end" mb="xl">
          <Stack gap={6}>
            <Title order={2}>All courses</Title>
            <Text c="dimmed">Pick one and start learning in minutes.</Text>
          </Stack>
        </Group>
        {error ? (
          <Alert color="red" variant="light" title="Couldn't load courses">
            {error.message} <Button variant="subtle" size="compact-sm" onClick={() => void reload()}>Try again</Button>
          </Alert>
        ) : loading || !courses ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">{[0, 1, 2].map((key) => <CourseCardSkeleton key={key} />)}</SimpleGrid>
        ) : courses.length === 0 ? (
          <Box p={48} ta="center" style={{ border: '1px dashed var(--tb-border)', borderRadius: 16 }}>
            <Text fw={600} fz={18}>New courses are on the way</Text>
            <Text c="dimmed" mt={4}>Check back soon.</Text>
          </Box>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {courses.map((course, index) => <CourseCard key={course.id} course={course} eager={index < 3} />)}
          </SimpleGrid>
        )}
      </Container>

      <Box bg="var(--tb-subtle)" py={{ base: 64, sm: 96 }} style={{ borderTop: '1px solid var(--tb-border)', borderBottom: '1px solid var(--tb-border)' }}>
        <Container size="lg">
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="xl">
            {perks.map((perk) => (
              <Stack key={perk.title} gap="sm">
                <ThemeIcon size={44} radius="md" color="ink"><perk.icon size={22} /></ThemeIcon>
                <Text fw={700} fz={17}>{perk.title}</Text>
                <Text c="dimmed" fz={15} lh={1.55}>{perk.text}</Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      <Container size="lg" py={{ base: 64, sm: 96 }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48}>
          <Stack gap="md">
            <Title order={2}>Two people. Every course, every reply.</Title>
            <Text c="dimmed" fz={17} lh={1.6}>
              {SITE.name} is run end to end by {SITE.founders.join(' and ')}. No big team and no outsourcing. We make the courses we wish we had,
              and when you email us, one of us answers.
            </Text>
            <Button component={Link} to="/about" variant="default" radius="xl" w="fit-content" rightSection={<IconArrowRight size={16} />}>
              About us
            </Button>
          </Stack>
          <Founders />
        </SimpleGrid>
      </Container>

      <Container size={760} pb={{ base: 64, sm: 112 }}>
        <Title order={2} ta="center" mb="xl">Questions, answered</Title>
        <Accordion variant="separated" radius="lg" chevronPosition="right">
          {FAQ.map((item) => (
            <Accordion.Item key={item.q} value={item.q} style={{ border: '1px solid var(--tb-border)', background: '#fff' }}>
              <Accordion.Control><Text fw={600}>{item.q}</Text></Accordion.Control>
              <Accordion.Panel><Text c="dimmed" lh={1.6}>{item.a}</Text></Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Container>
    </>
  );
}
