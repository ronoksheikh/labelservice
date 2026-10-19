import { createTheme } from '@mantine/core';

const sans = "'Instrument Sans', 'Anek Bangla', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const theme = createTheme({
  primaryColor: 'dark',
  defaultRadius: 'md',
  fontFamily: sans,
  headings: { fontFamily: sans, fontWeight: '600' },
  cursorType: 'pointer',
});
