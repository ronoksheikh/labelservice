import { useState } from 'react';
import { Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { api } from '../api';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/login', { body: { password } });
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
      setBusy(false);
    }
  };
  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={380} radius="lg">
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={1} className="wordmark" fw={400} size={40}>ARVONO</Title>
              <Text c="dimmed" size="sm" mt={4}>Label printing · staff sign-in</Text>
            </div>
            <PasswordInput label="Dashboard password" value={password} autoFocus required
              onChange={(event) => { setPassword(event.currentTarget.value); setError(undefined); }} error={error} />
            <Button type="submit" loading={busy} fullWidth>Sign in</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
