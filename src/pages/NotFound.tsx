import { Button, Container, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useSeo } from '../components/Seo';

export function NotFound({ title = 'Page not found', message = "The page you're looking for doesn't exist or has moved." }: { title?: string; message?: string }) {
  useSeo(title);
  return (
    <Container size="sm" py={120}>
      <Stack align="center" ta="center" gap="md">
        <Text fz={72} fw={700} lh={1} style={{ letterSpacing: '-0.05em' }} c="gray.3">404</Text>
        <Title order={1} fz={28}>{title}</Title>
        <Text c="dimmed">{message}</Text>
        <Button component={Link} to="/" size="md" mt="sm">See all courses</Button>
      </Stack>
    </Container>
  );
}
