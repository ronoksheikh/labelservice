import { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Center, Container, Group, Loader, Modal, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconEye, IconPrinter, IconRepeat } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useApi } from '../useApi';
import { dateTime, plural } from '../format';
import { notifyError, notifySuccess } from '../notify';
import { describeOptions, FormatPicker } from '../components/FormatPicker';
import { OrdersTable } from '../components/OrdersTable';
import { ReleaseModal } from '../components/ReleaseModal';
import type { PrintOptions } from '../labels/download';
import type { SharedPrintRequest } from '../../shared/api';

// The renderer (PDFKit, fonts, barcodes) loads only when a print shop needs it.
const render = async (request: SharedPrintRequest, options: PrintOptions, preview = false) => {
  const { renderOrders } = await import('../labels/download');
  return renderOrders(request.orders, options, { id: request.id, reprint: request.mode === 'reprint', preview });
};

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }}>
      <Group gap="sm" mb="md">
        <ThemeIcon radius="xl" size={28}>{number}</ThemeIcon>
        <Title order={3} size="h4">{title}</Title>
      </Group>
      {children}
    </Paper>
  );
}

export function Share() {
  const { token } = useParams();
  const request = useApi<SharedPrintRequest>(`/share/${token}`);
  const [options, setOptions] = useLocalStorage<PrintOptions>({
    key: 'arvono-print-options', defaultValue: { format: 'a4', cutMarks: true, splitSheets: false }, getInitialValueInEffect: false,
  });
  const [working, setWorking] = useState<'preview' | 'download' | 'confirm'>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [printed, setPrinted] = useState<Set<number>>(new Set());
  const [reporting, setReporting] = useState(false);
  const data = request.data;
  useEffect(() => { if (data) setPrinted(new Set(data.printedIds ?? data.orders.map((order) => order.orderId))); }, [data]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (request.error && !data) {
    return (
      <Center mih="100vh" p="md">
        <Stack align="center" gap="xs">
          <Text className="wordmark" size="40px">ARVONO</Text>
          <Text c="dimmed">{request.error}</Text>
        </Stack>
      </Center>
    );
  }
  if (!data) return <Center mih="100vh"><Loader /></Center>;

  const open = data.status === 'ready' && !data.expired;
  const canConfirm = data.status === 'ready' || data.status === 'confirming';

  const preview = async () => {
    setWorking('preview');
    try { setPreviewUrl(URL.createObjectURL((await render(data, options, true)).blob)); }
    catch (error) { notifyError(error); } finally { setWorking(undefined); }
  };
  const download = async () => {
    setWorking('download');
    try {
      await api(`/share/${token}/download`, { body: { format: describeOptions(options) } });
      const file = await render(data, options);
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file.blob), download: file.filename });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
    } catch (error) { notifyError(error); void request.reload(); } finally { setWorking(undefined); }
  };
  const confirm = () => {
    const missing = data.orders.length - printed.size;
    modals.openConfirmModal({
      title: <Text fw={600}>Confirm {plural(printed.size, 'printed label')}?</Text>,
      centered: true,
      children: (
        <Text size="sm">
          {missing
            ? `${plural(missing, 'label')} not ticked will be returned to ARVONO as not printed.`
            : 'All labels on this link will be marked as printed.'} This can't be undone.
        </Text>
      ),
      labels: { confirm: 'Yes, confirm', cancel: 'Back' },
      onConfirm: async () => {
        setWorking('confirm');
        try {
          request.setData(await api<SharedPrintRequest>(`/share/${token}/printed`, { body: { printedIds: [...printed] } }));
          notifySuccess('Thank you! Printing confirmed.');
        } catch (error) { notifyError(error); void request.reload(); } finally { setWorking(undefined); }
      },
    });
  };
  const release = async (reason: string) => {
    try { request.setData(await api<SharedPrintRequest>(`/share/${token}/release`, { body: { reason } })); notifySuccess('Reported. ARVONO will follow up.'); }
    catch (error) { notifyError(error); throw error; }
  };

  return (
    <Box mih="100vh" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
      <Box bg="#111" c="white" py="lg">
        <Container size="md">
          <Group justify="space-between" align="center">
            <Text className="wordmark" size="34px">ARVONO</Text>
            <Text size="xs" tt="uppercase" fw={600} c="gray.5" style={{ letterSpacing: '0.14em' }}>Print request</Text>
          </Group>
        </Container>
      </Box>
      <Container size="md" py="xl">
        <Stack gap="lg">
          <div>
            <Group gap="sm">
              <Title order={1} size="h2">{plural(data.orders.length, 'label')} to print</Title>
              {data.mode === 'reprint' && <Badge color="grape" leftSection={<IconRepeat size={12} />}>Reprint</Badge>}
            </Group>
            <Text c="dimmed" size="sm">
              Requested {dateTime(data.createdAt)}{data.expiresAt && open ? ` · please print before ${dateTime(data.expiresAt)}` : ''}
            </Text>
            {data.reason && <Text size="sm" mt={6}><b>Reason for reprint:</b> {data.reason}</Text>}
            {data.note && <Text size="sm" mt={4}><b>Note:</b> {data.note}</Text>}
          </div>

          {(data.status === 'printed' || data.status === 'partial') && (
            <Alert color="teal" icon={<IconCircleCheck />} title="Printing confirmed">
              {plural(data.printedIds?.length ?? 0, 'label')} confirmed as printed. Thank you! Need another copy? Ask ARVONO for a reprint link.
            </Alert>
          )}
          {data.status === 'released' && <Alert color="gray" title="This print request was cancelled">No labels need printing from this link.</Alert>}
          {data.status === 'failed' && <Alert color="red" title="These labels are not available">{data.error ?? 'Ask ARVONO for a new link.'}</Alert>}
          {data.expired && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="This link has expired">
              Downloads are closed. If you already printed the labels, confirm them below; otherwise ask ARVONO for a new link.
            </Alert>
          )}
          {data.status === 'confirming' && <Alert color="yellow" title="Confirmation is still processing">Press confirm again to finish it.</Alert>}

          {open && (
            <Step number={1} title="Choose your paper and download">
              <Stack>
                <FormatPicker value={options} onChange={setOptions} />
                <Group>
                  <Button size="md" onClick={download} loading={working === 'download'} disabled={!!working} leftSection={<IconDownload size={18} />}>
                    Download {options.format === 'a4' && options.splitSheets ? 'ZIP' : 'PDF'}
                  </Button>
                  <Button size="md" variant="default" onClick={preview} loading={working === 'preview'} disabled={!!working} leftSection={<IconEye size={18} />}>
                    Preview
                  </Button>
                </Group>
              </Stack>
            </Step>
          )}

          <Step number={open ? 2 : 1} title={canConfirm ? 'After printing, confirm what came out' : 'Labels'}>
            <Stack>
              {canConfirm && (
                <Text size="sm" c="dimmed">Untick any label that did not print correctly. Unticked labels go back to ARVONO's queue.</Text>
              )}
              <Paper withBorder radius="md">
                <OrdersTable orders={data.orders}
                  selected={canConfirm ? printed : undefined} onSelect={canConfirm ? setPrinted : undefined}
                  status={data.printedIds ? (order) => data.printedIds!.includes(order.orderId)
                    ? <Badge size="xs" color="teal" variant="light">printed</Badge>
                    : <Badge size="xs" color="red" variant="light">not printed</Badge> : undefined} />
              </Paper>
              {canConfirm && (
                <Group justify="space-between">
                  <Button variant="subtle" color="red" onClick={() => setReporting(true)} disabled={!!working || data.status !== 'ready'}>
                    Nothing printed? Report a problem
                  </Button>
                  <Button size="md" color="teal" onClick={confirm} loading={working === 'confirm'} disabled={!printed.size || !!working}
                    leftSection={<IconPrinter size={18} />}>
                    Confirm {plural(printed.size, 'label')} printed
                  </Button>
                </Group>
              )}
            </Stack>
          </Step>
        </Stack>
      </Container>

      <Modal opened={!!previewUrl} onClose={() => setPreviewUrl(undefined)} size="xl" title={<Text fw={600}>Preview · {describeOptions(options)}</Text>}>
        {previewUrl && <iframe src={previewUrl} title="Label preview" style={{ width: '100%', height: '75vh', border: 0, borderRadius: 8 }} />}
      </Modal>
      <ReleaseModal opened={reporting} onClose={() => setReporting(false)} onConfirm={release}
        title="Report a printing problem" confirmLabel="Return labels to ARVONO"
        description="The labels go back to ARVONO's queue and this link closes. ARVONO will send a new link when you're ready." />
    </Box>
  );
}
