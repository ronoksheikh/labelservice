import { Center, Loader } from '@mantine/core';
import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ABOUT, PRIVACY, REFUNDS, TERMS } from '../shared/content';
import { PublicLayout } from './components/SiteChrome';
import { trackPageview } from './track';
import { Home } from './pages/Home';
import { CoursePage } from './pages/CoursePage';
import { StaticPageView } from './pages/StaticPageView';
import { NotFound } from './pages/NotFound';

// Pages most visitors never open load on demand.
const CheckoutStatus = lazy(() => import('./pages/CheckoutStatus').then((m) => ({ default: m.CheckoutStatus })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const AuthVerify = lazy(() => import('./pages/Login').then((m) => ({ default: m.AuthVerify })));
const MyCourses = lazy(() => import('./pages/student/MyCourses').then((m) => ({ default: m.MyCourses })));
const Classroom = lazy(() => import('./pages/student/Classroom').then((m) => ({ default: m.Classroom })));
const AdminApp = lazy(() => import('./pages/admin/AdminApp').then((m) => ({ default: m.AdminApp })));

function PageLoader() {
  return <Center h="60dvh"><Loader color="ink" type="dots" /></Center>;
}

/** Scroll to the top (or to #hash) on navigation, and count the page view. */
function useNavigationEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    trackPageview(pathname);
    if (hash) {
      // Wait a frame so the target section exists.
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
}

export function App() {
  useNavigationEffects();
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          {[ABOUT, PRIVACY, TERMS, REFUNDS].map((page) => (
            <Route key={page.path} path={page.path} element={<StaticPageView page={page} />} />
          ))}
          <Route path="login" element={<Login />} />
          <Route path="auth" element={<AuthVerify />} />
          <Route path="my" element={<MyCourses />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="courses/:slug" element={<CoursePage />} />
        <Route path="checkout/:id" element={<CheckoutStatus />} />
        <Route path="learn/:slug/:lessonId?" element={<Classroom />} />
        <Route path="admin/*" element={<AdminApp />} />
      </Routes>
    </Suspense>
  );
}
