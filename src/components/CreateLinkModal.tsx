import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconCopy, IconExternalLink, IconRepeat } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { plural, shareUrl } from '../format';
import { REPRINT_REASONS, type PrintRequest } from '../../shared/api';

interface Props {
  opened: boolean;
  onClose: () => void;
  mode: 'new' | 'reprint';
  orderIds: number[];
  upTo: string;
  onCreated?: (request: PrintRequest) => void;
}

/** Creates a print link: reserves labels in ARVONO (new) or records a reprint with its reason. */
export function CreateLinkModal({ opened, onClose, mode, orderIds, upTo, onCreated }: Props) {
  const navigate = useNavigate();
  // One id per opening, so a retried submit can never reserve labels twice.
  const [id, setId] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PrintRequest>();
  // Snapshot the selection: the caller may clear it once the link exists.
  const [ids, setIds] = useState(orderIds);
  useEffect(() => {
    if (!opened) return;
    setIds(orderIds); setId(crypto.randomUUID()); setNote(''); setReason(''); setError(undefined); setCreated(undefined);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const request = await api<PrintRequest>('/requests', { body: { id, mode, orderIds: ids, upTo, note: note || null, reason: mode === 'reprint' ? reason : null } });
      setCreated(request);
      onCreated?.(request);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'reprint' ? `Reprint ${plural(ids.length, 'label')}` : `Print link for ${plural(ids.length, 'label')}`;
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>} centered size="lg">
      {created ? (
        <Stack>
          {created.status === 'ready' ? (
            <Alert color="teal" icon={<IconCheck />} title="Link ready">
              {mode === 'new'
                ? `${plural(created.orders.length, 'label')} reserved in ARVONO for 24 hours. Send this link to the print shop.`
                : 'Reprint recorded with its reason. Send this link to the print shop.'}
              {mode === 'new' && created.orders.length < created.requestedCount &&
                ` ${created.requestedCount - created.orders.length} label(s) were no longer pending and were left out.`}
            </Alert>
          ) : (
            <Alert color="red" title="Not ready">{created.error ?? 'The labels could not be reserved.'}</Alert>
          )}
          <TextInput readOnly value={shareUrl(created.token)} onFocus={(event) => event.currentTarget.select()}
            rightSectionWidth={90} rightSection={
              <CopyButton value={shareUrl(created.token)}>
                {({ copied, copy }) => (
                  <Button size="compact-sm" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            } />
          <Group justify="flex-end">
            <Button variant="default" component="a" href={shareUrl(created.token)} target="_blank" leftSection={<IconExternalLink size={16} />}>Open</Button>
            <Button onClick={() => { onClose(); navigate(`/links/${created.id}`); }}>View details</Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <Text size="sm" c="dimmed">
              {mode === 'new'
                ? 'The labels are reserved in ARVONO so no one else prints them. The print shop downloads them in the format it needs and confirms what printed.'
                : 'ARVONO only allows staff to reset a printed label, so this reprint is recorded here with your reason. The print shop downloads it from the link.'}
            </Text>
            {mode === 'reprint' && (
              <Autocomplete label="Reason for reprint" placeholder="Pick or type a reason" data={REPRINT_REASONS} required
                value={reason} onChange={setReason} maxLength={500} />
            )}
            <TextInput label="Note for the print shop" description="Optional, e.g. which shop or batch this is"
              value={note} onChange={(event) => setNote(event.currentTarget.value)} maxLength={200} />
            {error && <Alert color="red">{error}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={busy} disabled={mode === 'reprint' && reason.trim().length < 3}
                leftSection={mode === 'reprint' ? <IconRepeat size={16} /> : undefined}>
                {mode === 'reprint' ? 'Create reprint link' : 'Reserve & create link'}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
