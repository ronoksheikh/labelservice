import { Badge, Button, Card, Container, Group, Paper, Progress, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight, IconLogout } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import type { MyCourse, Student } from '../../../shared/types';
import { api } from '../../api';
import { Cover } from '../../components/Cover';
import { CourseCardSkeleton } from '../../components/CourseCard';
import { LoginForm } from '../../components/LoginForm';
import { LogoMark } from '../../components/Logo';
import { useSeo } from '../../components/Seo';
import { useApi } from '../../useApi';

export function MyCourses() {
  useSeo('My courses');
  const navigate = useNavigate();
  const me = useApi<{ student: Student | null }>('/me');
  const courses = useApi<MyCourse[]>(me.data?.student ? '/my/courses' : null);

  if (me.loading || !me.data) {
    return <Container size="lg" py={64}><Skeleton h={36} w={280} mb="xl" /><SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}><CourseCardSkeleton /><CourseCardSkeleton /></SimpleGrid></Container>;
  }
  if (!me.data.student) {
    return (
      <Container size={460} py={{ base: 48, sm: 96 }}>
        <Paper p={{ base: 'lg', sm: 'xl' }} withBorder shadow="sm">
          <Stack gap="lg">
            <Stack gap={8} align="center" ta="center"><LogoMark size={36} /><Title order={1} fz={26}>My courses</Title></Stack>
            <LoginForm intro="Enter the email you used at checkout and we'll send you a sign-in link." />
          </Stack>
        </Paper>
      </Container>
    );
  }

  const student = me.data.student;
  async function signOut() {
    await api('/auth/logout', { body: {} }).catch(() => undefined);
    navigate('/');
  }
  return (
    <Container size="lg" py={{ base: 40, sm: 64 }}>
      <Group justify="space-between" align="flex-end" mb="xl">
        <Stack gap={4}>
          <Title order={1} fz={{ base: 28, sm: 34 }}>Welcome back{student.name ? `, ${student.name.split(' ')[0]}` : ''}</Title>
          <Text c="dimmed">{student.email}</Text>
        </Stack>
        <Button variant="default" leftSection={<IconLogout size={16} />} onClick={() => void signOut()}>Sign out</Button>
      </Group>
      {courses.loading || !courses.data ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">{[0, 1].map((key) => <CourseCardSkeleton key={key} />)}</SimpleGrid>
      ) : courses.data.length === 0 ? (
        <Paper p={48} ta="center" withBorder style={{ borderStyle: 'dashed' }}>
          <Text fw={600} fz={18}>No courses yet</Text>
          <Text c="dimmed" mt={4} mb="lg">Courses you buy with {student.email} will show up here.</Text>
          <Button component={Link} to="/#courses">Browse courses</Button>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {courses.data.map((course) => {
            const progress = course.lessonCount ? Math.round((course.completedCount / course.lessonCount) * 100) : 0;
            const done = course.lessonCount > 0 && course.completedCount >= course.lessonCount;
            return (
              <Card key={course.id} component={Link} to={`/learn/${course.slug}${course.nextLessonId ? `/${course.nextLessonId}` : ''}`}
                className="course-card" padding={0}>
                <Card.Section m={0}><Cover src={course.imageUrl} alt={course.title} /></Card.Section>
                <Stack gap="sm" p="lg" style={{ flex: 1 }}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={700} fz={17} lh={1.3}>{course.title}</Text>
                    {done && <Badge color="ink" variant="light">Completed</Badge>}
                  </Group>
                  <Stack gap={6} mt="auto">
                    <Group justify="space-between"><Text fz={13} c="dimmed">{course.completedCount} of {course.lessonCount} lessons</Text><Text fz={13} fw={600}>{progress}%</Text></Group>
                    <Progress value={progress} color="ink" size="sm" radius="xl" />
                  </Stack>
                  <Button variant={progress ? 'filled' : 'default'} rightSection={<IconArrowRight size={16} />} mt={4} component="span">
                    {done ? 'Watch again' : progress ? 'Continue' : 'Start course'}
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Container>
  );
}
