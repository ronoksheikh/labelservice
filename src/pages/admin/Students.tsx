import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Menu, Modal, Paper, Select, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDots, IconPlus, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import type { AdminCourse, AdminStudent } from '../../../shared/types';
import { api } from '../../api';
import { formatDate, taka } from '../../format';
import { notifyError, notifySuccess } from '../../notify';
import { useApi } from '../../useApi';
import { PageHeader } from './AdminApp';

export function StudentsAdmin() {
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search.trim(), 300);
  const students = useApi<AdminStudent[]>(`/admin/students?q=${encodeURIComponent(query)}`);
  const courses = useApi<AdminCourse[]>('/admin/courses');
  const [grant, setGrant] = useState<{ email: string; name: string; courseId: string | null; notify: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitGrant() {
    if (!grant?.courseId) return;
    setBusy(true);
    try {
      await api('/admin/students/grant', { body: { ...grant, courseId: Number(grant.courseId) } });
      notifySuccess(`Access granted to ${grant.email}.`);
      setGrant(null);
      await students.reload();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(student: AdminStudent, title: string) {
    const course = courses.data?.find((item) => item.title === title);
    if (!course || !window.confirm(`Remove ${student.email}'s access to ${title}?`)) return;
    try {
      await api(`/admin/students/${student.id}/revoke`, { body: { courseId: course.id } });
      await students.reload();
    } catch (reason) {
      notifyError(reason);
    }
  }

  return (
    <>
      <PageHeader title="Students" description="Everyone with access to at least one course."
        action={<Button leftSection={<IconPlus size={16} />} onClick={() => setGrant({ email: '', name: '', courseId: null, notify: true })}>Grant access</Button>} />
      <TextInput placeholder="Search name, email or phone" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md" w={{ base: '100%', sm: 320 }} />
      {students.error && <Alert color="red" variant="light" mb="md">{students.error.message}</Alert>}
      <Paper className="table-wrap">
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead><Table.Tr><Table.Th>Student</Table.Th><Table.Th>Courses</Table.Th><Table.Th ta="right">Spent</Table.Th><Table.Th>Joined</Table.Th><Table.Th>Last sign-in</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {!students.data && [0, 1, 2].map((key) => <Table.Tr key={key}><Table.Td colSpan={6}><Skeleton h={32} /></Table.Td></Table.Tr>)}
              {students.data?.length === 0 && <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="lg">No students yet.</Text></Table.Td></Table.Tr>}
              {students.data?.map((student) => (
                <Table.Tr key={student.id}>
                  <Table.Td>
                    <Text fz={14} fw={500}>{student.name || '—'}</Text>
                    <Text fz={12} c="dimmed">{student.email}{student.phone ? ` · ${student.phone}` : ''}</Text>
                  </Table.Td>
                  <Table.Td><Group gap={4}>{student.courses.map((title) => <Badge key={title} variant="default" radius="sm" tt="none" fw={500}>{title}</Badge>)}</Group></Table.Td>
                  <Table.Td ta="right" fw={600}>{taka(student.spent)}</Table.Td>
                  <Table.Td><Text fz={13}>{formatDate(student.createdAt)}</Text></Table.Td>
                  <Table.Td><Text fz={13} c="dimmed">{student.lastLoginAt ? formatDate(student.lastLoginAt) : 'Never'}</Text></Table.Td>
                  <Table.Td ta="right">
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Actions"><IconDots size={18} /></ActionIcon></Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => setGrant({ email: student.email, name: student.name, courseId: null, notify: true })}>Grant another course…</Menu.Item>
                        {student.courses.length > 0 && <Menu.Divider />}
                        {student.courses.map((title) => <Menu.Item key={title} color="red" onClick={() => void revoke(student, title)}>Remove {title}</Menu.Item>)}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal opened={Boolean(grant)} onClose={() => setGrant(null)} title={<Text fw={700}>Grant course access</Text>} radius="lg">
        {grant && (
          <Stack>
            <TextInput label="Email" required type="email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.currentTarget.value })} />
            <TextInput label="Name" value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.currentTarget.value })} />
            <Select label="Course" required data={(courses.data ?? []).map((course) => ({ value: String(course.id), label: course.title }))}
              value={grant.courseId} onChange={(courseId) => setGrant({ ...grant, courseId })} />
            <Checkbox label="Email them a sign-in link" checked={grant.notify} onChange={(e) => setGrant({ ...grant, notify: e.currentTarget.checked })} color="ink" />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setGrant(null)}>Cancel</Button>
              <Button onClick={() => void submitGrant()} loading={busy} disabled={!grant.courseId || !grant.email}>Grant access</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
