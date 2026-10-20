import {
  ActionIcon, Alert, Anchor, Box, Button, Center, FileButton, Grid, Group, Loader, NumberInput, Paper, SegmentedControl, Select, Stack, Tabs, Text,
  Textarea, TextInput, Title, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { slugify } from '../../../shared/site';
import type { AdminCourse, AdminCourseInput, AdminLesson } from '../../../shared/types';
import { api } from '../../api';
import { Cover } from '../../components/Cover';
import { Prose } from '../../components/Prose';
import { taka } from '../../format';
import { notifyError, notifySuccess } from '../../notify';
import { useApi } from '../../useApi';

const blank: AdminCourseInput = {
  slug: '', title: '', subtitle: '', description: '', imageUrl: '', price: 0, comparePrice: null, status: 'draft', position: 0,
  bumpCourseId: null, bumpPrice: null, lessons: [],
};
const blankLesson = (section = ''): AdminLesson => ({ section, title: '', videoUrl: '', body: '', durationMinutes: 0 });

export function CourseEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const courses = useApi<AdminCourse[]>('/admin/courses');
  const lessons = useApi<AdminLesson[]>(isNew ? null : `/admin/courses/${id}/lessons`);
  const [form, setForm] = useState<AdminCourseInput | null>(isNew ? blank : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isNew || form || !courses.data || !lessons.data) return;
    const course = courses.data.find((item) => String(item.id) === id);
    if (!course) return;
    setForm({
      slug: course.slug, title: course.title, subtitle: course.subtitle, description: course.description, imageUrl: course.imageUrl,
      price: course.price, comparePrice: course.comparePrice, status: course.status, position: course.position,
      bumpCourseId: course.bumpCourseId, bumpPrice: course.bumpPrice, lessons: lessons.data,
    });
  }, [isNew, form, courses.data, lessons.data, id]);

  if (courses.error || lessons.error) return <Alert color="red" variant="light">{(courses.error ?? lessons.error)!.message}</Alert>;
  if (!form) {
    if (courses.data && !courses.data.some((item) => String(item.id) === id)) return <Alert color="red" variant="light">Course not found.</Alert>;
    return <Center h={300}><Loader color="ink" type="dots" /></Center>;
  }

  const set = <K extends keyof AdminCourseInput>(key: K, value: AdminCourseInput[K]) => setForm((current) => current && { ...current, [key]: value });
  const current = form;
  const setLesson = (index: number, patch: Partial<AdminLesson>) =>
    set('lessons', current.lessons.map((lesson, position) => (position === index ? { ...lesson, ...patch } : lesson)));
  const moveLesson = (index: number, by: number) => {
    const next = [...form.lessons];
    const [lesson] = next.splice(index, 1);
    next.splice(index + by, 0, lesson!);
    set('lessons', next);
  };
  const offerOptions = (courses.data ?? []).filter((course) => String(course.id) !== id)
    .map((course) => ({ value: String(course.id), label: `${course.title} (${taka(course.price)})${course.status === 'draft' ? ' · draft' : ''}` }));

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      set('imageUrl', (await api<{ url: string }>('/admin/uploads', { body })).url);
    } catch (reason) {
      notifyError(reason);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...current, slug: current.slug || slugify(current.title) };
      const result = isNew
        ? await api<{ id: number }>('/admin/courses', { body: payload })
        : await api<{ id: number }>(`/admin/courses/${id}`, { method: 'PUT', body: payload });
      notifySuccess('Course saved.');
      if (isNew) navigate(`/admin/courses/${result.id}`, { replace: true });
      else {
        // Reload so new lessons get their ids (needed to keep student progress on the next save).
        setForm(null);
        await Promise.all([courses.reload(), lessons.reload()]);
      }
    } catch (reason) {
      notifyError(reason);
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    modals.openConfirmModal({
      title: 'Delete this course?',
      children: <Text fz={14}>This removes the course and its lessons. Courses with orders can't be deleted; set them to Draft instead.</Text>,
      labels: { confirm: 'Delete course', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/admin/courses/${id}`, { method: 'DELETE' });
          notifySuccess('Course deleted.');
          navigate('/admin/courses');
        } catch (reason) {
          notifyError(reason);
        }
      },
    });
  }

  return (
    <Stack gap="lg" pb={96}>
      <Group justify="space-between">
        <Group gap="sm">
          <ActionIcon component={Link} to="/admin/courses" variant="default" size="lg" aria-label="Back"><IconArrowLeft size={18} /></ActionIcon>
          <Title order={1} fz={24}>{isNew ? 'New course' : form.title || 'Untitled course'}</Title>
        </Group>
        <Group gap="xs">
          {!isNew && <Button variant="subtle" color="red" onClick={remove}>Delete</Button>}
          {!isNew && form.status === 'published' && <Button component="a" href={`/courses/${form.slug}`} target="_blank" variant="default">View page</Button>}
          <Button onClick={() => void save()} loading={saving}>Save course</Button>
        </Group>
      </Group>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="lg">
            <Paper p="lg" withBorder>
              <Stack>
                <TextInput label="Title" required value={form.title} placeholder="The YouTube Blueprint: Make content creation your career"
                  onChange={(e) => {
                    const title = e.currentTarget.value;
                    setForm((current) => current && { ...current, title, ...(slugTouched ? {} : { slug: slugify(title) }) });
                  }} />
                <TextInput label="URL" leftSection={<Text fz={13} c="dimmed" pl={8}>/courses/</Text>} leftSectionWidth={80}
                  value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.currentTarget.value.toLowerCase()); }}
                  onBlur={() => set('slug', slugify(form.slug || form.title))} />
                <Textarea label="Short description" description="One or two sentences. Used on course cards, in Google results and when shared on Facebook."
                  autosize minRows={2} maxLength={300} value={form.subtitle} onChange={(e) => set('subtitle', e.currentTarget.value)} />
                <Tabs defaultValue="write" variant="outline" radius="md">
                  <Tabs.List>
                    <Tabs.Tab value="write">Description</Tabs.Tab>
                    <Tabs.Tab value="preview">Preview</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="write" pt="sm">
                    <Textarea autosize minRows={8} maxRows={24} value={form.description} onChange={(e) => set('description', e.currentTarget.value)}
                      placeholder={'Have you ever dreamt of…\n\n*Note: This course is in Bangla with English subtitles.*\n\n**Bold text**, - bullet lists, ## headings and links work.'} />
                    <Text fz={12} c="dimmed" mt={6}>Formatting: **bold**, *italic*, ## Heading, - bullet, 1. numbered, &gt; quote, [link](https://…). Leave a blank line between paragraphs.</Text>
                  </Tabs.Panel>
                  <Tabs.Panel value="preview" pt="sm">
                    <Box p="md" style={{ border: '1px solid var(--tb-border)', borderRadius: 10 }}>
                      {form.description ? <Prose source={form.description} /> : <Text c="dimmed">Nothing to preview yet.</Text>}
                    </Box>
                  </Tabs.Panel>
                </Tabs>
              </Stack>
            </Paper>

            <Paper p="lg" withBorder>
              <Group justify="space-between" mb="md">
                <Stack gap={0}><Text fw={600}>Lessons</Text><Text fz={13} c="dimmed">YouTube (unlisted), Vimeo, Bunny/Cloudflare Stream embed links or .mp4 files.</Text></Stack>
                <Text fz={13} c="dimmed">{form.lessons.length} lessons · {form.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)} min</Text>
              </Group>
              <Stack gap="sm">
                {form.lessons.map((lesson, index) => (
                  <Paper key={lesson.id ?? `new-${index}`} p="md" bg="var(--tb-subtle)" radius="md" style={{ border: '1px solid var(--tb-border)' }}>
                    <Group justify="space-between" mb="xs">
                      <Text fz={13} fw={700} c="dimmed">Lesson {index + 1}</Text>
                      <Group gap={4}>
                        <Tooltip label="Move up"><ActionIcon variant="subtle" color="gray" disabled={index === 0} onClick={() => moveLesson(index, -1)}><IconArrowUp size={16} /></ActionIcon></Tooltip>
                        <Tooltip label="Move down"><ActionIcon variant="subtle" color="gray" disabled={index === form.lessons.length - 1} onClick={() => moveLesson(index, 1)}><IconArrowDown size={16} /></ActionIcon></Tooltip>
                        <Tooltip label="Remove"><ActionIcon variant="subtle" color="red" onClick={() => set('lessons', form.lessons.filter((_, position) => position !== index))}><IconTrash size={16} /></ActionIcon></Tooltip>
                      </Group>
                    </Group>
                    <Grid gap="sm">
                      <Grid.Col span={{ base: 12, sm: 8 }}><TextInput label="Title" required value={lesson.title} onChange={(e) => setLesson(index, { title: e.currentTarget.value })} /></Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 4 }}><TextInput label="Section" placeholder="e.g. Getting started" value={lesson.section} onChange={(e) => setLesson(index, { section: e.currentTarget.value })} /></Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 9 }}><TextInput label="Video link" placeholder="https://youtu.be/…" value={lesson.videoUrl} onChange={(e) => setLesson(index, { videoUrl: e.currentTarget.value.trim() })} /></Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 3 }}><NumberInput label="Minutes" min={0} max={10000} value={lesson.durationMinutes} onChange={(value) => setLesson(index, { durationMinutes: Number(value) || 0 })} /></Grid.Col>
                      <Grid.Col span={12}><Textarea label="Notes (optional)" autosize minRows={1} maxRows={8} value={lesson.body} onChange={(e) => setLesson(index, { body: e.currentTarget.value })} /></Grid.Col>
                    </Grid>
                  </Paper>
                ))}
                <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => set('lessons', [...form.lessons, blankLesson(form.lessons.at(-1)?.section)])}>Add lesson</Button>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="lg">
            <Paper p="lg" withBorder>
              <Stack>
                <Text fw={600}>Visibility</Text>
                <SegmentedControl fullWidth value={form.status} onChange={(value) => set('status', value as AdminCourseInput['status'])}
                  data={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }]} />
                <NumberInput label="Sort order" description="Lower numbers show first on the home page." min={0} value={form.position}
                  onChange={(value) => set('position', Number(value) || 0)} />
              </Stack>
            </Paper>

            <Paper p="lg" withBorder>
              <Stack>
                <Text fw={600}>Cover image</Text>
                <Cover src={form.imageUrl} alt="" radius={10} />
                <Group gap="xs" grow>
                  <FileButton onChange={(file) => void upload(file)} accept="image/png,image/jpeg,image/webp,image/avif,image/gif">
                    {(props) => <Button {...props} variant="default" leftSection={<IconUpload size={16} />} loading={uploading}>Upload</Button>}
                  </FileButton>
                  {form.imageUrl && <Button variant="subtle" color="gray" onClick={() => set('imageUrl', '')}>Remove</Button>}
                </Group>
                <TextInput label="…or image URL" placeholder="https://…" value={form.imageUrl} onChange={(e) => set('imageUrl', e.currentTarget.value.trim())} />
                <Text fz={12} c="dimmed">1280×720 (16:9) works best. This is also the preview image on Facebook.</Text>
              </Stack>
            </Paper>

            <Paper p="lg" withBorder>
              <Stack>
                <Text fw={600}>Pricing (BDT)</Text>
                <NumberInput label="Price" leftSection="৳" min={0} max={1_000_000} thousandSeparator="," value={form.price}
                  onChange={(value) => set('price', Number(value) || 0)} description="0 makes the course free (no payment step)." />
                <NumberInput label="Regular price (optional)" leftSection="৳" min={0} max={1_000_000} thousandSeparator="," value={form.comparePrice ?? ''}
                  onChange={(value) => set('comparePrice', value === '' ? null : Number(value))} description="Shown struck through when higher than the price." />
              </Stack>
            </Paper>

            <Paper p="lg" withBorder>
              <Stack>
                <Stack gap={2}><Text fw={600}>Exclusive offer</Text><Text fz={13} c="dimmed">A second course buyers can add at checkout with one tick.</Text></Stack>
                <Select placeholder="No offer" clearable data={offerOptions} value={form.bumpCourseId ? String(form.bumpCourseId) : null}
                  onChange={(value) => set('bumpCourseId', value ? Number(value) : null)} />
                {form.bumpCourseId && (
                  <NumberInput label="Offer price" leftSection="৳" min={0} thousandSeparator="," value={form.bumpPrice ?? ''}
                    onChange={(value) => set('bumpPrice', value === '' ? null : Number(value))} />
                )}
                {form.bumpCourseId && form.bumpPrice === null && <Text fz={12} c="red">Set an offer price to show the offer.</Text>}
              </Stack>
            </Paper>
            {!isNew && <Anchor component={Link} to="/admin/coupons" fz={14}>Create a coupon for this course →</Anchor>}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
