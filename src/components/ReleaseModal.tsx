import { useEffect, useState } from 'react';
import { Autocomplete, Button, Group, Modal, Stack, Text } from '@mantine/core';

const RELEASE_REASONS = ['Printer jam', 'Printer out of paper', 'Printer offline', 'Wrong label stock', 'Not needed any more'];

interface Props {
  opened: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
}

export function ReleaseModal({ opened, onClose, onConfirm, title, description, confirmLabel }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (opened) setReason(''); }, [opened]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await onConfirm(reason.trim()); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>} centered>
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm" c="dimmed">{description}</Text>
          <Autocomplete label="What happened?" placeholder="Pick or type a reason" data={RELEASE_REASONS} required
            value={reason} onChange={setReason} maxLength={500} data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Back</Button>
            <Button type="submit" color="red" loading={busy} disabled={reason.trim().length < 3}>{confirmLabel}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
