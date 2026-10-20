import { createTheme, type MantineColorsTuple } from '@mantine/core';

const sans = "'Instrument Sans', 'Anek Bangla', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Neutral black-and-white scale; the only colour on the site is the flame in the logo.
const ink: MantineColorsTuple = ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#18181b', '#09090b'];

export const theme = createTheme({
  colors: { ink },
  primaryColor: 'ink',
  primaryShade: 9,
  black: '#09090b',
  defaultRadius: 'md',
  fontFamily: sans,
  headings: {
    fontFamily: sans,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: 'clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem)', lineHeight: '1.12' },
      h2: { fontSize: 'clamp(1.4rem, 1.1rem + 1.2vw, 2rem)', lineHeight: '1.2' },
      h3: { fontSize: '1.2rem', lineHeight: '1.3' },
    },
  },
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { radius: 'md' } },
    Card: { defaultProps: { radius: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Skeleton: { defaultProps: { radius: 'md' } },
  },
});
