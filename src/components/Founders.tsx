import { Avatar, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { SITE } from '../../shared/site';

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2);

export function Founders() {
  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md" style={{ alignContent: 'start' }}>
      {SITE.founders.map((name, index) => (
        <Paper key={name} p="lg" withBorder>
          <Group gap="md" wrap="nowrap">
            <Avatar size={52} radius="xl" color="ink" variant={index ? 'light' : 'filled'} fw={700}>{initials(name)}</Avatar>
            <Stack gap={2}>
              <Text fw={700} fz={17}>{name}</Text>
              <Text c="dimmed" fz={14}>Co-founder · Byte #{index + 1}</Text>
            </Stack>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
