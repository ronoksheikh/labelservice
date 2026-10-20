import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import { theme } from './theme';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="light">
      <Notifications position="top-center" />
      <ModalsProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
