import { Alert, Button, Container, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { LoginForm } from '../components/LoginForm';
import { LogoMark } from '../components/Logo';
import { useSeo } from '../components/Seo';

export function Login() {
  useSeo('Sign in');
  return (
    <Container size={460} py={{ base: 48, sm: 96 }}>
      <Paper p={{ base: 'lg', sm: 'xl' }} withBorder shadow="sm">
        <Stack gap="lg">
          <Stack gap={8} align="center" ta="center">
            <LogoMark size={36} />
            <Title order={1} fz={26}>Open your courses</Title>
          </Stack>
          <LoginForm intro="Enter the email you used to buy a course. We'll send you a one-click sign-in link." />
        </Stack>
      </Paper>
    </Container>
  );
}

/** Landing page for email links. The token is posted by JavaScript so email link scanners can't use it up. */
export function AuthVerify() {
  useSeo('Signing you in');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) { setError('This sign-in link is incomplete. Request a new one below.'); return; }
    api('/auth/verify', { body: { token } })
      .then(() => navigate('/my', { replace: true }))
      .catch((reason) => setError(errorMessage(reason)));
  }, [params, navigate]);

  return (
    <Container size={460} py={{ base: 48, sm: 96 }}>
      <Paper p={{ base: 'lg', sm: 'xl' }} withBorder shadow="sm">
        {error ? (
          <Stack gap="lg">
            <Alert color="red" variant="light" title="Link not valid">{error}</Alert>
            <LoginForm />
          </Stack>
        ) : (
          <Stack align="center" gap="md" py="xl">
            <Loader color="ink" />
            <Text c="dimmed">Signing you in…</Text>
            <Button component={Link} to="/login" variant="subtle" color="gray" size="xs">Having trouble?</Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
