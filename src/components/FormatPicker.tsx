import { Checkbox, Group, Radio, Select, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import type { PrintOptions } from '../labels/download';

export const THERMAL_SIZES = [
  { value: '4x6', label: '4 × 6 in' }, { value: '3x3', label: '3 × 3 in' },
  { value: '100x150mm', label: '100 × 150 mm' }, { value: '100x100mm', label: '100 × 100 mm' },
  { value: '100x75mm', label: '100 × 75 mm' }, { value: '80x100mm', label: '80 × 100 mm' },
  { value: '62x100mm', label: '62 × 100 mm' }, { value: '58x100mm', label: '58 × 100 mm' },
];
const LABEL_SIZES = [
  { value: '3x3', label: '3 × 3 in' }, { value: '4x3', label: '4 × 3 in' },
  { value: '4x4', label: '4 × 4 in' }, { value: '4x6', label: '4 × 6 in' },
];
const FORMATS: { value: PrintOptions['format']; title: string; description: string }[] = [
  { value: 'a4', title: 'A4 sheets', description: 'Six 3 × 3 in labels per page, with cut marks. Any office printer.' },
  { value: 'individual', title: 'Label pages', description: 'Full-colour premium label, one per PDF page.' },
  { value: 'thermal', title: 'Thermal roll', description: 'Black on white for label printers (203/300 dpi).' },
];

export function describeOptions(options: PrintOptions) {
  if (options.format === 'a4') return `A4 sheets${options.splitSheets ? ' (ZIP)' : ''}`;
  if (options.format === 'thermal') return `Thermal ${THERMAL_SIZES.find((size) => size.value === options.preset)?.label ?? ''} @ ${options.dpi ?? 203} dpi`;
  return `Label pages ${options.size ? `${options.size.width} × ${options.size.height} in` : '3 × 3 in'}`;
}

export function FormatPicker({ value, onChange }: { value: PrintOptions; onChange: (value: PrintOptions) => void }) {
  const sizeValue = value.size ? `${value.size.width}x${value.size.height}` : '3x3';
  return (
    <Stack gap="md">
      <Radio.Group value={value.format} onChange={(format) => onChange({ ...value, format: format as PrintOptions['format'] })}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {FORMATS.map((format) => (
            <UnstyledButton key={format.value} onClick={() => onChange({ ...value, format: format.value })}
              p="md" style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: `1px solid ${value.format === format.value ? 'var(--selected-border)' : 'var(--mantine-color-default-border)'}`,
                background: value.format === format.value ? 'var(--selected-bg)' : undefined,
              }}>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Radio value={format.value} tabIndex={-1} style={{ pointerEvents: 'none' }} aria-label={format.title} />
                <div>
                  <Text fw={600} size="sm">{format.title}</Text>
                  <Text size="xs" c="dimmed">{format.description}</Text>
                </div>
              </Group>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </Radio.Group>
      {value.format === 'a4' && (
        <Group>
          <Checkbox label="Cut marks" checked={value.cutMarks !== false} onChange={(event) => onChange({ ...value, cutMarks: event.currentTarget.checked })} />
          <Checkbox label="One file per sheet (ZIP)" checked={!!value.splitSheets} onChange={(event) => onChange({ ...value, splitSheets: event.currentTarget.checked })} />
        </Group>
      )}
      {value.format === 'individual' && (
        <Select label="Label size" data={LABEL_SIZES} value={sizeValue} allowDeselect={false} maw={220}
          onChange={(size) => {
            const [width, height] = (size ?? '3x3').split('x').map(Number);
            onChange({ ...value, size: { width: width!, height: height!, unit: 'in' } });
          }} />
      )}
      {value.format === 'thermal' && (
        <Group grow maw={460}>
          <Select label="Paper size" data={THERMAL_SIZES} value={value.preset ?? '4x6'} allowDeselect={false}
            onChange={(preset) => onChange({ ...value, preset: preset ?? '4x6' })} />
          <Select label="Printer resolution" data={[{ value: '203', label: '203 dpi' }, { value: '300', label: '300 dpi' }]}
            value={String(value.dpi ?? 203)} allowDeselect={false}
            onChange={(dpi) => onChange({ ...value, dpi: dpi === '300' ? 300 : 203 })} />
        </Group>
      )}
      <Text size="xs" c="dimmed">
        {value.format === 'a4'
          ? 'Print on A4 at Actual size / 100%, portrait, no fit-to-page. The 1-inch ruler on each sheet should measure 25.4 mm.'
          : 'Print at Actual size / 100%, one PDF page per label. Set the printer paper size to the label size.'}
      </Text>
    </Stack>
  );
}
