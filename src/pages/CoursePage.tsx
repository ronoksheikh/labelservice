import {
  Accordion, Alert, Anchor, Badge, Box, Button, Checkbox, Collapse, Group, Image, Paper, Skeleton, Stack, Text, TextInput, Title, UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconClock, IconDiscount2, IconInfinity, IconLock, IconMinus, IconPlayerPlay, IconPlus, IconShieldCheck, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isBdPhone, isEmail, normalizePhone, SITE } from '../../shared/site';
import type { CheckoutResponse, CouponQuote, CourseDetail, LessonOutline } from '../../shared/types';
import { api, ApiError, errorMessage } from '../api';
import { takeBoot } from '../boot';
import { Cover } from '../components/Cover';
import { Price } from '../components/CourseCard';
import { Logo } from '../components/Logo';
import { Prose } from '../components/Prose';
import { useSeo } from '../components/Seo';
import { formatDuration, taka } from '../format';
import { visitorId, visitSource } from '../track';
import { useApi } from '../useApi';
import { NotFound } from './NotFound';

export function CoursePage() {
  const { slug = '' } = useParams();
  const [boot] = useState(() => takeBoot<CourseDetail>(`/courses/${slug}`));
  const { data: course, error } = useApi<CourseDetail>(`/courses/${encodeURIComponent(slug)}`, boot);
  useSeo(course?.title, course?.subtitle);

  if (error?.status === 404) return <NotFound title="Course not found" message="This course isn't available. Have a look at our other courses." />;
  return (
    <div className="checkout-page">
      <section className="checkout-info">
        <div className="checkout-inner">
          <Box mb={{ base: 28, md: 56 }}><Logo size={24} /></Box>
          {course ? <CourseInfo course={course} /> : <CourseInfoSkeleton />}
          {error && <Alert color="red" variant="light" mt="lg">{error.message}</Alert>}
        </div>
      </section>
      <section className="checkout-pay" id="checkout" style={{ scrollMarginTop: 0 }}>
        <div className="checkout-inner">{course ? <CheckoutForm course={course} /> : <CheckoutSkeleton />}</div>
      </section>
      {course && <BuyBar course={course} />}
    </div>
  );
}

/* ---------- Left column ---------- */

function CourseInfo({ course }: { course: CourseDetail }) {
  const save = course.comparePrice ? Math.round((1 - course.price / course.comparePrice) * 100) : 0;
  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Title order={1} fz={{ base: 26, sm: 34 }} style={{ letterSpacing: '-0.025em' }}>{course.title}</Title>
        <Text fz={14} c="dimmed">By <Text span c="dark" fw={600}>{SITE.name}</Text></Text>
      </Stack>
      <Group gap="sm" align="center">
        <span className="price-tag">{course.price ? taka(course.price) : 'Free'}</span>
        {course.comparePrice && <Text fz={20} c="dimmed" td="line-through">{taka(course.comparePrice)}</Text>}
        {save >= 5 && <Badge color="ink" size="lg" radius="sm">Save {save}%</Badge>}
      </Group>
      <Cover src={course.imageUrl} alt={course.title} eager radius={14} />
      {course.subtitle && <Text fz={18} fw={500} lh={1.5}>{course.subtitle}</Text>}
      {course.description && <Prose source={course.description} />}
      <Highlights course={course} />
      {course.lessons.length > 0 && <Curriculum lessons={course.lessons} totalMinutes={course.totalMinutes} />}
      <Stack gap="sm" pt="xl" mt="md" style={{ borderTop: '1px solid var(--tb-border)' }}>
        <Text fz={13} c="dimmed" lh={1.6}>
          You agree to share the information entered on this page with {SITE.name} (owner of this page) and our payment partner EPS (Easy Payment System), in line with applicable laws.
        </Text>
        <Group gap="lg" fz={13}>
          <Text fz={13}>{SITE.name} {new Date().getFullYear()}</Text>
          <Anchor component={Link} to="/privacy" fz={13} c="dark" underline="always">Privacy</Anchor>
          <Anchor component={Link} to="/terms" fz={13} c="dark" underline="always">Terms</Anchor>
          <Anchor component={Link} to="/refunds" fz={13} c="dark" underline="always">Refunds</Anchor>
        </Group>
      </Stack>
    </Stack>
  );
}

function Highlights({ course }: { course: CourseDetail }) {
  const items = [
    course.lessonCount > 0 && { icon: IconPlayerPlay, text: `${course.lessonCount} video lesson${course.lessonCount === 1 ? '' : 's'}` },
    course.totalMinutes > 0 && { icon: IconClock, text: `${formatDuration(course.totalMinutes)} of content` },
    { icon: IconInfinity, text: 'Lifetime access and updates' },
    { icon: IconShieldCheck, text: '7-day refund policy' },
  ].filter(Boolean) as { icon: typeof IconCheck; text: string }[];
  return (
    <Paper withBorder p="md" radius="lg">
      <Group gap="lg" grow preventGrowOverflow={false} wrap="wrap">
        {items.map((item) => (
          <Group key={item.text} gap={8} wrap="nowrap" miw={180}>
            <item.icon size={18} stroke={1.8} />
            <Text fz={14} fw={500}>{item.text}</Text>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}

function Curriculum({ lessons, totalMinutes }: { lessons: LessonOutline[]; totalMinutes: number }) {
  const sections = useMemo(() => {
    const groups: { name: string; lessons: LessonOutline[] }[] = [];
    for (const lesson of lessons) {
      const last = groups.at(-1);
      if (last && last.name === lesson.section) last.lessons.push(lesson);
      else groups.push({ name: lesson.section, lessons: [lesson] });
    }
    return groups;
  }, [lessons]);
  return (
    <Stack gap="sm" mt="md">
      <Group justify="space-between" align="baseline">
        <Title order={2} fz={22}>What's inside</Title>
        <Text c="dimmed" fz={14}>{lessons.length} lesson{lessons.length === 1 ? '' : 's'}{totalMinutes ? ` · ${formatDuration(totalMinutes)}` : ''}</Text>
      </Group>
      <Accordion variant="separated" radius="md" multiple defaultValue={['0']}>
        {sections.map((section, index) => (
          <Accordion.Item key={index} value={String(index)} style={{ border: '1px solid var(--tb-border)', background: '#fff' }}>
            <Accordion.Control>
              <Group justify="space-between" pr="sm" wrap="nowrap">
                <Text fw={600} fz={15}>{section.name || (sections.length > 1 ? `Part ${index + 1}` : 'Lessons')}</Text>
                <Text c="dimmed" fz={13} style={{ whiteSpace: 'nowrap' }}>{section.lessons.length} lesson{section.lessons.length === 1 ? '' : 's'}</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={10}>
                {section.lessons.map((lesson) => (
                  <Group key={lesson.id} justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap={10} wrap="nowrap"><IconPlayerPlay size={14} color="#a1a1aa" style={{ flex: 'none' }} /><Text fz={14}>{lesson.title}</Text></Group>
                    {lesson.durationMinutes > 0 && <Text c="dimmed" fz={13} style={{ whiteSpace: 'nowrap' }}>{formatDuration(lesson.durationMinutes)}</Text>}
                  </Group>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

function CourseInfoSkeleton() {
  return (
    <Stack gap="lg">
      <Skeleton h={34} w="90%" /><Skeleton h={34} w="60%" /><Skeleton h={14} w={140} /><Skeleton h={40} w={160} />
      <Skeleton style={{ aspectRatio: '16 / 9', height: 'auto' }} radius={14} />
      <Stack gap={10}>{[100, 96, 98, 70].map((width, index) => <Skeleton key={index} h={14} w={`${width}%`} />)}</Stack>
    </Stack>
  );
}

/* ---------- Right column: checkout ---------- */

function BdFlag() {
  return (
    <svg width="22" height="14" viewBox="0 0 10 6" aria-hidden="true" style={{ borderRadius: 2, flex: 'none' }}>
      <rect width="10" height="6" fill="#006a4e" /><circle cx="4.5" cy="3" r="2" fill="#f42a41" />
    </svg>
  );
}

function CheckoutForm({ course }: { course: CourseDetail }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [bump, setBump] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<CouponQuote | null>(null);
  const [couponError, setCouponError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; owned?: boolean }>();
  const [offerExpanded, setOfferExpanded] = useState(false);

  const errors = {
    name: name.trim() ? undefined : 'Enter your name',
    email: isEmail(email.trim()) ? undefined : 'Enter a valid email. Your course link is sent here.',
    phone: isBdPhone(normalizePhone(phone)) ? undefined : 'Enter an 11-digit mobile number, like 01712345678',
  };
  const valid = !errors.name && !errors.email && !errors.phone;
  const bumpPrice = bump && course.bump ? course.bump.price : 0;
  const discount = coupon?.discount ?? 0;
  const total = Math.max(0, course.price + bumpPrice - discount);

  async function applyCode() {
    if (!code.trim()) return;
    setChecking(true);
    setCouponError(undefined);
    try {
      setCoupon(await api<CouponQuote>('/coupons/check', { body: { slug: course.slug, code: code.trim() } }));
    } catch (reason) {
      setCoupon(null);
      setCouponError(errorMessage(reason));
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched({ name: true, email: true, phone: true });
    if (!valid) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await api<CheckoutResponse>('/checkout', {
        body: {
          slug: course.slug, name: name.trim(), email: email.trim(), phone: normalizePhone(phone),
          coupon: coupon?.code, bump, visitorId: visitorId(), source: visitSource(),
        },
      });
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
      else navigate(`/checkout/${result.orderId}?k=${encodeURIComponent(result.key)}`);
    } catch (reason) {
      setError({ message: errorMessage(reason), owned: reason instanceof ApiError && reason.status === 409 });
      setSubmitting(false);
    }
  }

  const show = (field: keyof typeof errors) => (touched[field] ? errors[field] : undefined);
  const blur = (field: string) => () => setTouched((current) => ({ ...current, [field]: true }));

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <Stack gap={6}>
          <Title order={2} fz={24}>Payment details</Title>
          <Text c="dimmed" fz={15}>Complete your purchase by providing your details.</Text>
        </Stack>

        <Paper p="md" withBorder radius="lg" shadow="xs">
          <Text fw={600} mb="sm">Billing information</Text>
          <div className="field-stack">
            <TextInput aria-label="Name" placeholder="Full name" autoComplete="name" value={name}
              onChange={(e) => setName(e.currentTarget.value)} onBlur={blur('name')} error={show('name')} />
            <TextInput aria-label="Email" placeholder="Email" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.currentTarget.value)} onBlur={blur('email')} error={show('email')} />
            <TextInput aria-label="Phone" placeholder="Phone (01XXXXXXXXX)" type="tel" inputMode="tel" autoComplete="tel-national" value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)} onBlur={blur('phone')} error={show('phone')}
              leftSection={<span className="phone-prefix"><BdFlag /> +880</span>} leftSectionWidth={92} />
          </div>
        </Paper>

        <Paper withBorder radius="lg" shadow="xs">
          <UnstyledButton onClick={() => setCouponOpen((open) => !open)} w="100%" p="md" aria-expanded={couponOpen}>
            <Group justify="space-between">
              <Group gap="sm"><IconDiscount2 size={20} color="#71717a" /><Text fw={600}>Have a coupon?</Text></Group>
              {couponOpen ? <IconMinus size={18} /> : <IconPlus size={18} />}
            </Group>
          </UnstyledButton>
          <Collapse expanded={couponOpen}>
            <Box px="md" pb="md">
              {coupon ? (
                <Group justify="space-between" p="sm" style={{ border: '1px dashed var(--tb-ink)', borderRadius: 10 }}>
                  <Group gap={8}><IconCheck size={18} /><Text fw={600}>{coupon.code}</Text><Text c="dimmed" fz={14}>{coupon.label}</Text></Group>
                  <Button variant="subtle" color="gray" size="compact-sm" leftSection={<IconX size={14} />}
                    onClick={() => { setCoupon(null); setCode(''); }}>Remove</Button>
                </Group>
              ) : (
                <Group gap="xs" align="flex-start" wrap="nowrap">
                  <TextInput flex={1} placeholder="Enter coupon code" value={code} error={couponError} autoCapitalize="characters"
                    onChange={(e) => { setCode(e.currentTarget.value.toUpperCase()); setCouponError(undefined); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCode(); } }} />
                  <Button variant="default" onClick={() => void applyCode()} loading={checking} disabled={!code.trim()}>Apply</Button>
                </Group>
              )}
            </Box>
          </Collapse>
        </Paper>

        {course.bump && (
          <Stack gap="sm">
            <Title order={3} fz={18}>Exclusive offer</Title>
            <Paper className="offer-card" data-checked={bump} p="md" radius="lg" bg={bump ? '#fff' : 'transparent'}>
              <Checkbox checked={bump} onChange={(e) => setBump(e.currentTarget.checked)} color="ink" size="md"
                label={
                  <Group justify="space-between" wrap="nowrap" gap="sm" w="100%">
                    <Text fw={600} lineClamp={1}>{course.bump.title}</Text>
                    <Group gap={6} wrap="nowrap">
                      {course.bump.regularPrice > course.bump.price && <Text c="dimmed" td="line-through" fz={14}>{taka(course.bump.regularPrice)}</Text>}
                      <Text fw={700}>{taka(course.bump.price)}</Text>
                    </Group>
                  </Group>
                }
                styles={{ body: { alignItems: 'center' }, labelWrapper: { flex: 1 } }} />
              <Group align="flex-start" gap="md" mt="sm" wrap="nowrap">
                {course.bump.imageUrl && (
                  <Image src={course.bump.imageUrl} alt="" w={128} h={72} radius="md" fit="cover" style={{ flex: 'none' }} loading="lazy" />
                )}
                <Box>
                  <Text fz={14} c="dimmed" lh={1.5} lineClamp={offerExpanded ? undefined : 4}>{course.bump.subtitle}</Text>
                  {course.bump.subtitle.length > 160 && (
                    <Anchor component="button" type="button" fz={13} fw={600} onClick={() => setOfferExpanded((value) => !value)}>
                      {offerExpanded ? 'See less' : 'See more'}
                    </Anchor>
                  )}
                </Box>
              </Group>
            </Paper>
          </Stack>
        )}

        <div className="receipt">
          <Stack gap="md" p="lg">
            <Text fw={600} fz={18}>Order summary</Text>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text fz={14} c="dimmed" maw="70%">{course.title}</Text>
              <Price price={course.price} comparePrice={null} size="md" />
            </Group>
            {bump && course.bump && (
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fz={14} c="dimmed" maw="70%">{course.bump.title}</Text>
                <Text fw={700}>{taka(course.bump.price)}</Text>
              </Group>
            )}
            {coupon && discount > 0 && (
              <Group justify="space-between"><Text fz={14} c="dimmed">Coupon ({coupon.code})</Text><Text fw={700}>−{taka(discount)}</Text></Group>
            )}
          </Stack>
          <Group justify="space-between" p="lg" className="dashed">
            <Text fw={700}>Amount to be paid:</Text>
            <Text fw={700} fz={20} style={{ letterSpacing: '-0.02em' }}>{taka(total)}</Text>
          </Group>
        </div>

        {error && (
          <Alert color={error.owned ? 'ink' : 'red'} variant="light">
            {error.message}{error.owned && <> <Anchor component={Link} to="/login" fw={600}>Sign in</Anchor></>}
          </Alert>
        )}

        <Button type="submit" size="xl" radius="md" fullWidth loading={submitting} data-disabled={!valid || undefined}
          style={!valid ? { background: '#d4d4d8', color: '#fff' } : undefined}>
          {total === 0 ? 'Get instant access' : `Proceed to pay ${taka(total)}`}
        </Button>
        <Stack gap={10} align="center">
          <img src="/eps/pay-with-eps.webp" width={1200} height={207} alt="Pay with EPS: Visa, Mastercard, American Express, bKash, Nagad, Rocket and more"
            loading="lazy" style={{ width: '100%', maxWidth: 400, height: 'auto' }} />
          <Group gap={6} c="dimmed" fz={12}><IconLock size={14} />Secure payment by EPS · Your course link is emailed instantly</Group>
        </Stack>
      </Stack>
    </form>
  );
}

function CheckoutSkeleton() {
  return (
    <Stack gap="lg">
      <Skeleton h={28} w={200} /><Skeleton h={16} w="80%" />
      <Skeleton h={220} radius="lg" /><Skeleton h={56} radius="lg" /><Skeleton h={160} radius="lg" /><Skeleton h={60} />
    </Stack>
  );
}

/** Mobile: a sticky price + Buy now bar that hides once the checkout form is on screen. */
function BuyBar({ course }: { course: CourseDetail }) {
  const [hidden, setHidden] = useState(false);
  const observed = useRef(false);
  useEffect(() => {
    const target = document.getElementById('checkout');
    if (!target || observed.current) return;
    observed.current = true;
    const observer = new IntersectionObserver(([entry]) => setHidden(Boolean(entry?.isIntersecting)), { threshold: 0.05 });
    observer.observe(target);
    return () => { observer.disconnect(); observed.current = false; };
  }, []);
  return (
    <div className="buy-bar" data-hidden={hidden}>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text fw={700} fz={22} lh={1.1} style={{ letterSpacing: '-0.02em' }}>{course.price ? taka(course.price) : 'Free'}</Text>
          {course.comparePrice && <Text c="dimmed" td="line-through" fz={13}>{taka(course.comparePrice)}</Text>}
        </Stack>
        <Button size="lg" radius="md" px={36}
          onClick={() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' })}>Buy now</Button>
      </Group>
    </div>
  );
}
