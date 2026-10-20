import { Alert, Button, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconMailCheck } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { isEmail } from '../../shared/site';
import { api, errorMessage } from '../api';

/** Passwordless sign-in: we email a one-time link. */
export function LoginForm({ intro }: { intro?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isEmail(email.trim())) { setError('Enter the email address you used at checkout.'); return; }
    setState('sending');
    setError(undefined);
    try {
      await api('/auth/request', { body: { email: email.trim() } });
      setState('sent');
    } catch (reason) {
      setError(errorMessage(reason));
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <Stack align="center" ta="center" gap="sm" py="md">
        <ThemeIcon size={56} radius="xl" color="ink" variant="light"><IconMailCheck size={28} /></ThemeIcon>
        <Text fw={700} fz={20}>Check your inbox</Text>
        <Text c="dimmed" fz={15} maw={360}>
          If <b>{email.trim()}</b> has bought a course, a sign-in link is on its way. It works for 30 minutes. Check spam or promotions too.
        </Text>
        <Button variant="subtle" color="gray" onClick={() => setState('idle')}>Use a different email</Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {intro && <Text c="dimmed" fz={15}>{intro}</Text>}
        <TextInput type="email" label="Email address" placeholder="you@example.com" size="md" autoComplete="email" inputMode="email"
          value={email} onChange={(event) => setEmail(event.currentTarget.value)} required autoFocus />
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Button type="submit" size="md" loading={state === 'sending'} fullWidth>Email me a sign-in link</Button>
        <Text c="dimmed" fz={13} ta="center">No password needed. Use the email from your purchase.</Text>
      </Stack>
    </form>
  );
}
