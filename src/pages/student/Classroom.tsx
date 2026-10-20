import { Alert, Box, Button, Container, Grid, Group, Paper, Progress, ScrollArea, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconCircle, IconCircleCheckFilled, IconLayoutGrid } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Classroom as ClassroomData, Lesson } from '../../../shared/types';
import { api } from '../../api';
import { LoginForm } from '../../components/LoginForm';
import { Logo } from '../../components/Logo';
import { Prose } from '../../components/Prose';
import { useSeo } from '../../components/Seo';
import { VideoPlayer } from '../../components/VideoPlayer';
import { formatDuration } from '../../format';
import { notifyError } from '../../notify';
import { useApi } from '../../useApi';

export function Classroom() {
  const { slug = '', lessonId } = useParams();
  const navigate = useNavigate();
  const { data, setData, error } = useApi<ClassroomData>(`/my/courses/${encodeURIComponent(slug)}`);
  useSeo(data?.course.title ?? 'Course');

  const lessons = data?.lessons ?? [];
  const index = useMemo(() => {
    const byId = lessons.findIndex((lesson) => String(lesson.id) === lessonId);
    if (byId >= 0) return byId;
    const next = lessons.findIndex((lesson) => !lesson.completed);
    return next >= 0 ? next : 0;
  }, [lessons, lessonId]);
  const lesson = lessons[index];
  const completed = lessons.filter((item) => item.completed).length;
  const progress = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const go = (target: Lesson | undefined) => target && navigate(`/learn/${slug}/${target.id}`);

  async function setComplete(target: Lesson, value: boolean) {
    setData((current) => current && { ...current, lessons: current.lessons.map((item) => (item.id === target.id ? { ...item, completed: value } : item)) });
    try {
      await api(`/my/lessons/${target.id}/progress`, { method: 'PUT', body: { completed: value } });
    } catch (reason) {
      setData((current) => current && { ...current, lessons: current.lessons.map((item) => (item.id === target.id ? { ...item, completed: !value } : item)) });
      notifyError(reason);
    }
  }

  return (
    <Box mih="100dvh" bg="var(--tb-subtle)">
      <header className="site-header">
        <Container size="xl" h={60}>
          <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
            <Group gap="md" wrap="nowrap" miw={0}>
              <Logo size={22} />
              {data && <Text fw={600} fz={15} truncate visibleFrom="sm" c="dimmed">/ {data.course.title}</Text>}
            </Group>
            <Group gap="md" wrap="nowrap">
              {data && (
                <Group gap={8} wrap="nowrap" visibleFrom="xs">
                  <Progress value={progress} w={120} size="sm" color="ink" radius="xl" />
                  <Text fz={13} fw={600}>{progress}%</Text>
                </Group>
              )}
              <Button component={Link} to="/my" variant="default" size="sm" leftSection={<IconLayoutGrid size={16} />}>My courses</Button>
            </Group>
          </Group>
        </Container>
      </header>

      <Container size="xl" py="lg">
        {error ? (
          error.status === 401 ? (
            <Paper maw={460} mx="auto" mt={48} p="xl" withBorder><Title order={2} fz={22} mb="md">Sign in to watch</Title><LoginForm /></Paper>
          ) : (
            <Paper maw={520} mx="auto" mt={48} p="xl" withBorder>
              <Stack>
                <Alert color="red" variant="light">{error.message}</Alert>
                <Group><Button component={Link} to={`/courses/${slug}`}>View course</Button><Button component={Link} to="/my" variant="default">My courses</Button></Group>
              </Stack>
            </Paper>
          )
        ) : !data ? (
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 8 }}><Skeleton style={{ aspectRatio: '16 / 9', height: 'auto' }} radius={14} /><Skeleton h={28} w="60%" mt="lg" /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><Skeleton h={420} radius="lg" /></Grid.Col>
          </Grid>
        ) : !lesson ? (
          <Paper p="xl" withBorder ta="center"><Text fw={600}>Lessons are coming soon.</Text><Text c="dimmed">We'll email you when the first lesson is up.</Text></Paper>
        ) : (
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Stack gap="lg">
                <VideoPlayer url={lesson.videoUrl} title={lesson.title} />
                <Group justify="space-between" align="flex-start" gap="md">
                  <Stack gap={4} style={{ flex: 1, minWidth: 220 }}>
                    <Text fz={13} c="dimmed" fw={500}>Lesson {index + 1} of {lessons.length}{lesson.section ? ` · ${lesson.section}` : ''}</Text>
                    <Title order={1} fz={{ base: 22, sm: 26 }}>{lesson.title}</Title>
                  </Stack>
                  <Group gap="xs">
                    <Button variant={lesson.completed ? 'default' : 'filled'} onClick={() => void setComplete(lesson, !lesson.completed)}
                      leftSection={lesson.completed ? <IconCircleCheckFilled size={18} /> : <IconCircle size={18} />}>
                      {lesson.completed ? 'Completed' : 'Mark as complete'}
                    </Button>
                  </Group>
                </Group>
                <Group justify="space-between">
                  <Button variant="default" leftSection={<IconArrowLeft size={16} />} disabled={index === 0} onClick={() => go(lessons[index - 1])}>Previous</Button>
                  {index < lessons.length - 1 && (
                    <Button rightSection={<IconArrowRight size={16} />} onClick={() => {
                      if (!lesson.completed) void setComplete(lesson, true);
                      go(lessons[index + 1]);
                    }}>{lesson.completed ? 'Next lesson' : 'Complete & continue'}</Button>
                  )}
                </Group>
                {lesson.body && <Paper p="lg" withBorder><Prose source={lesson.body} small /></Paper>}
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="xs" pos="sticky" top={76}>
                <Group justify="space-between" px="sm" py="xs">
                  <Text fw={700}>Course content</Text>
                  <Text fz={13} c="dimmed">{completed}/{lessons.length} done</Text>
                </Group>
                <ScrollArea.Autosize mah="calc(100dvh - 160px)" type="auto">
                  <Stack gap={2}>
                    {lessons.map((item, position) => (
                      <Box key={item.id}>
                        {item.section && item.section !== lessons[position - 1]?.section && (
                          <Text fz={11} fw={700} tt="uppercase" c="dimmed" px="sm" pt="md" pb={4} style={{ letterSpacing: '0.06em' }}>{item.section}</Text>
                        )}
                        <Link to={`/learn/${slug}/${item.id}`} className="lesson-row" data-active={position === index}>
                          {item.completed
                            ? <IconCircleCheckFilled size={18} style={{ flex: 'none', marginTop: 2 }} />
                            : <IconCircle size={18} style={{ flex: 'none', marginTop: 2, opacity: 0.4 }} />}
                          <Box style={{ flex: 1 }}>
                            <Text fz={14} fw={500} lh={1.4}>{item.title}</Text>
                            {item.durationMinutes > 0 && <Text fz={12} c="dimmed">{formatDuration(item.durationMinutes)}</Text>}
                          </Box>
                        </Link>
                      </Box>
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Paper>
            </Grid.Col>
          </Grid>
        )}
      </Container>
    </Box>
  );
}
