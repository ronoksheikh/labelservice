import { Badge, Card, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconClock, IconPlayerPlay } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { CourseSummary } from '../../shared/types';
import { formatDuration, taka } from '../format';
import { Cover } from './Cover';

export function Price({ price, comparePrice, size = 'lg' }: { price: number; comparePrice: number | null; size?: 'md' | 'lg' }) {
  return (
    <Group gap={8} align="baseline" wrap="nowrap">
      <Text fw={700} fz={size === 'lg' ? 20 : 16} lh={1} style={{ letterSpacing: '-0.02em' }}>{price ? taka(price) : 'Free'}</Text>
      {comparePrice && <Text c="dimmed" td="line-through" fz={size === 'lg' ? 15 : 13} lh={1}>{taka(comparePrice)}</Text>}
    </Group>
  );
}

export function CourseCard({ course, eager }: { course: CourseSummary; eager?: boolean }) {
  const save = course.comparePrice ? Math.round((1 - course.price / course.comparePrice) * 100) : 0;
  return (
    <Card component={Link} to={`/courses/${course.slug}`} className="course-card" padding={0} shadow="none">
      <Card.Section m={0} pos="relative">
        <Cover src={course.imageUrl} alt={course.title} eager={eager} />
        {save >= 5 && <Badge pos="absolute" top={12} left={12} color="ink" radius="sm" size="lg">Save {save}%</Badge>}
      </Card.Section>
      <Stack gap={8} p="lg" style={{ flex: 1 }}>
        <Text fw={700} fz={18} lh={1.3} style={{ letterSpacing: '-0.015em' }}>{course.title}</Text>
        {course.subtitle && <Text c="dimmed" fz={14} lh={1.5} lineClamp={2}>{course.subtitle}</Text>}
        <Group gap="md" mt="auto" pt={8} justify="space-between" align="flex-end">
          <Price price={course.price} comparePrice={course.comparePrice} />
          {course.lessonCount > 0 && (
            <Group gap={10} c="dimmed" fz={13}>
              <Group gap={4}><IconPlayerPlay size={14} />{course.lessonCount}</Group>
              {course.totalMinutes > 0 && <Group gap={4}><IconClock size={14} />{formatDuration(course.totalMinutes)}</Group>}
            </Group>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export function CourseCardSkeleton() {
  return (
    <Card className="course-card" padding={0}>
      <Skeleton radius={0} style={{ aspectRatio: '16 / 9', height: 'auto' }} />
      <Stack gap={10} p="lg">
        <Skeleton h={20} w="85%" />
        <Skeleton h={14} w="100%" />
        <Skeleton h={14} w="60%" />
        <Group justify="space-between" mt={8}><Skeleton h={20} w={80} /><Skeleton h={14} w={90} /></Group>
      </Stack>
    </Card>
  );
}
