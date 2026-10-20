import { Alert, Badge, Button, Group, Image, Paper, Skeleton, Stack, Table, Text } from '@mantine/core';
import { IconExternalLink, IconPlus } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AdminCourse } from '../../../shared/types';
import { taka } from '../../format';
import { useApi } from '../../useApi';
import { PageHeader } from './AdminApp';

export function CoursesAdmin() {
  const navigate = useNavigate();
  const { data, error } = useApi<AdminCourse[]>('/admin/courses');
  return (
    <>
      <PageHeader title="Courses" description="Create courses, set prices and add lessons."
        action={<Button component={Link} to="/admin/courses/new" leftSection={<IconPlus size={16} />}>New course</Button>} />
      {error && <Alert color="red" variant="light" mb="md">{error.message}</Alert>}
      <Paper className="table-wrap">
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>Course</Table.Th><Table.Th>Status</Table.Th><Table.Th ta="right">Price</Table.Th><Table.Th ta="right">Lessons</Table.Th><Table.Th ta="right">Students</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {!data && [0, 1, 2].map((key) => <Table.Tr key={key}><Table.Td colSpan={6}><Skeleton h={40} /></Table.Td></Table.Tr>)}
              {data?.length === 0 && (
                <Table.Tr><Table.Td colSpan={6}>
                  <Stack align="center" py="xl" gap="xs"><Text fw={600}>No courses yet</Text><Button component={Link} to="/admin/courses/new" size="xs">Create your first course</Button></Stack>
                </Table.Td></Table.Tr>
              )}
              {data?.map((course) => (
                <Table.Tr key={course.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/courses/${course.id}`)}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Image src={course.imageUrl || null} w={72} h={40} radius="sm" fit="cover" fallbackSrc="/favicon.svg" bg="gray.1" />
                      <Stack gap={0}><Text fw={600} fz={14} lineClamp={1}>{course.title}</Text><Text fz={12} c="dimmed">/courses/{course.slug}</Text></Stack>
                    </Group>
                  </Table.Td>
                  <Table.Td><Badge color={course.status === 'published' ? 'teal' : 'gray'} variant="light" radius="sm">{course.status === 'published' ? 'Published' : 'Draft'}</Badge></Table.Td>
                  <Table.Td ta="right">
                    <Text fw={600} fz={14}>{course.price ? taka(course.price) : 'Free'}</Text>
                    {course.comparePrice && course.comparePrice > course.price && <Text fz={12} c="dimmed" td="line-through">{taka(course.comparePrice)}</Text>}
                  </Table.Td>
                  <Table.Td ta="right">{course.lessonCount}</Table.Td>
                  <Table.Td ta="right">{course.studentCount}</Table.Td>
                  <Table.Td ta="right" onClick={(event) => event.stopPropagation()}>
                    {course.status === 'published' && (
                      <Button component="a" href={`/courses/${course.slug}`} target="_blank" variant="subtle" color="gray" size="xs" rightSection={<IconExternalLink size={14} />}>View</Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </>
  );
}
