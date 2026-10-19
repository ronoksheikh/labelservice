import { useEffect } from 'react';
import { Center, Loader } from '@mantine/core';
import { Route, Routes } from 'react-router-dom';
import { useApi } from './useApi';
import type { Session } from '../shared/api';
import { Login } from './pages/Login';
import { Layout } from './pages/Layout';
import { Overview } from './pages/Overview';
import { Queue } from './pages/Queue';
import { Links } from './pages/Links';
import { LinkDetail } from './pages/LinkDetail';
import { Share } from './pages/Share';

function Staff() {
  const session = useApi<Session>('/session');
  useEffect(() => {
    const signedOut = () => session.setData((current) => current && { ...current, authenticated: false });
    window.addEventListener('arvono:signed-out', signedOut);
    return () => window.removeEventListener('arvono:signed-out', signedOut);
  }, [session.setData]);

  if (!session.data) return <Center h="100vh"><Loader /></Center>;
  if (!session.data.authenticated) return <Login onSignedIn={session.reload} />;
  return (
    <Layout session={session.data}>
      <Routes>
        <Route index element={<Overview session={session.data} />} />
        <Route path="queue" element={<Queue today={session.data.today} />} />
        <Route path="links" element={<Links />} />
        <Route path="links/:id" element={<LinkDetail today={session.data.today} />} />
        <Route path="*" element={<Overview session={session.data} />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/p/:token" element={<Share />} />
      <Route path="/*" element={<Staff />} />
    </Routes>
  );
}
