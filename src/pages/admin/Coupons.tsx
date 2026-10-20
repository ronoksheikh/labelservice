import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, NumberInput, Paper, SegmentedControl, Select, Skeleton, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import type { AdminCourse, Coupon, CouponInput } from '../../../shared/types';
import { api } from '../../api';
import { formatDate, taka } from '../../format';
import { notifyError, notifySuccess } from '../../notify';
import { useApi } from '../../useApi';
import { PageHeader } from './AdminApp';

const empty: CouponInput = { code: '', kind: 'percent', amount: 10, courseId: null, maxUses: null, expiresAt: null, active: true };

// <input type="datetime-local"> works in local time.
const toLocalInput = (ms: number | null) => (ms === null ? '' : new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16));

export function CouponsAdmin() {
  const coupons = useApi<Coupon[]>('/admin/coupons');
  const courses = useApi<AdminCourse[]>('/admin/courses');
  const [editing, setEditing] = useState<{ id: number | null; form: CouponInput } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(editing.id ? `/admin/coupons/${editing.id}` : '/admin/coupons', { method: editing.id ? 'PUT' : 'POST', body: editing.form });
      notifySuccess('Coupon saved.');
      setEditing(null);
      await coupons.reload();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(coupon: Coupon) {
    try {
      const { id: _id, usedCount: _used, createdAt: _created, courseTitle: _title, ...input } = coupon;
      await api(`/admin/coupons/${coupon.id}`, { method: 'PUT', body: { ...input, active: !coupon.active } });
      await coupons.reload();
    } catch (reason) {
      notifyError(reason);
    }
  }

  function remove(coupon: Coupon) {
    modals.openConfirmModal({
      title: `Delete ${coupon.code}?`, children: <Text fz={14}>Past orders keep their discount. To stop new use but keep the record, deactivate it instead.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' }, confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await api(`/admin/coupons/${coupon.id}`, { method: 'DELETE' }); await coupons.reload(); } catch (reason) { notifyError(reason); }
      },
    });
  }

  const set = <K extends keyof CouponInput>(key: K, value: CouponInput[K]) => setEditing((current) => current && { ...current, form: { ...current.form, [key]: value } });
  const form = editing?.form;

  return (
    <>
      <PageHeader title="Coupons" description="Discount codes buyers enter at checkout."
        action={<Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ id: null, form: empty })}>New coupon</Button>} />
      {coupons.error && <Alert color="red" variant="light" mb="md">{coupons.error.message}</Alert>}
      <Paper className="table-wrap">
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead><Table.Tr><Table.Th>Code</Table.Th><Table.Th>Discount</Table.Th><Table.Th>Course</Table.Th><Table.Th>Used</Table.Th><Table.Th>Expires</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {!coupons.data && [0, 1].map((key) => <Table.Tr key={key}><Table.Td colSpan={7}><Skeleton h={28} /></Table.Td></Table.Tr>)}
              {coupons.data?.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center" py="lg">No coupons yet.</Text></Table.Td></Table.Tr>}
              {coupons.data?.map((coupon) => {
                const expired = coupon.expiresAt !== null && coupon.expiresAt < Date.now();
                const usedUp = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
                return (
                  <Table.Tr key={coupon.id} opacity={coupon.active && !expired && !usedUp ? 1 : 0.55}>
                    <Table.Td><Text ff="monospace" fw={700}>{coupon.code}</Text></Table.Td>
                    <Table.Td>{coupon.kind === 'percent' ? `${coupon.amount}%` : taka(coupon.amount)} off</Table.Td>
                    <Table.Td><Text fz={14} lineClamp={1}>{coupon.courseTitle ?? 'All courses'}</Text></Table.Td>
                    <Table.Td>{coupon.usedCount}{coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ''}</Table.Td>
                    <Table.Td>{coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Never'}</Table.Td>
                    <Table.Td>
                      <Badge radius="sm" variant="light" color={!coupon.active ? 'gray' : expired || usedUp ? 'orange' : 'teal'}>
                        {!coupon.active ? 'Inactive' : expired ? 'Expired' : usedUp ? 'Used up' : 'Active'}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Actions"><IconDots size={18} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setEditing({ id: coupon.id, form: { code: coupon.code, kind: coupon.kind, amount: coupon.amount, courseId: coupon.courseId, maxUses: coupon.maxUses, expiresAt: coupon.expiresAt, active: coupon.active } })}>Edit</Menu.Item>
                          <Menu.Item onClick={() => void toggle(coupon)}>{coupon.active ? 'Deactivate' : 'Activate'}</Menu.Item>
                          <Menu.Item color="red" onClick={() => remove(coupon)}>Delete</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title={<Text fw={700}>{editing?.id ? 'Edit coupon' : 'New coupon'}</Text>} radius="lg">
        {form && (
          <Stack>
            <TextInput label="Code" required placeholder="LAUNCH50" value={form.code} styles={{ input: { fontFamily: 'monospace', textTransform: 'uppercase' } }}
              onChange={(e) => set('code', e.currentTarget.value.toUpperCase().replace(/\s/g, ''))} />
            <SegmentedControl value={form.kind} onChange={(value) => set('kind', value as CouponInput['kind'])}
              data={[{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Taka off' }]} />
            <NumberInput label={form.kind === 'percent' ? 'Percent' : 'Amount'} required min={1} max={form.kind === 'percent' ? 100 : 1_000_000}
              leftSection={form.kind === 'percent' ? '%' : '৳'} value={form.amount} onChange={(value) => set('amount', Number(value) || 0)} />
            <Select label="Course" placeholder="All courses" clearable value={form.courseId ? String(form.courseId) : null}
              data={(courses.data ?? []).map((course) => ({ value: String(course.id), label: course.title }))}
              onChange={(value) => set('courseId', value ? Number(value) : null)} />
            <Group grow>
              <NumberInput label="Max uses" placeholder="Unlimited" min={1} value={form.maxUses ?? ''} onChange={(value) => set('maxUses', value === '' ? null : Number(value))} />
              <TextInput label="Expires" type="datetime-local" value={toLocalInput(form.expiresAt)}
                onChange={(e) => set('expiresAt', e.currentTarget.value ? new Date(e.currentTarget.value).getTime() : null)} />
            </Group>
            <Switch label="Active" checked={form.active} onChange={(e) => set('active', e.currentTarget.checked)} color="ink" />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => void save()} loading={saving}>Save coupon</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
