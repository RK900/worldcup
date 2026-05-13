import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Home } from '@/routes/Home';
import { Preview } from '@/routes/Preview';

// Pool routes lazy-load Firebase. Initial bundle keeps just the offline
// preview + home; visitors who never touch a pool don't pay for the
// Firebase SDK (~120kb gz).
const PoolNew = lazy(() =>
  import('@/routes/PoolNew').then((m) => ({ default: m.PoolNew })),
);
const PoolJoin = lazy(() =>
  import('@/routes/PoolJoin').then((m) => ({ default: m.PoolJoin })),
);
const PoolView = lazy(() =>
  import('@/routes/PoolView').then((m) => ({ default: m.PoolView })),
);
const BracketEdit = lazy(() =>
  import('@/routes/BracketEdit').then((m) => ({ default: m.BracketEdit })),
);
const Admin = lazy(() =>
  import('@/routes/Admin').then((m) => ({ default: m.Admin })),
);
const Scoring = lazy(() =>
  import('@/routes/Scoring').then((m) => ({ default: m.Scoring })),
);

function RouteFallback() {
  return <div className="text-muted">Loading…</div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/preview" element={<Preview />} />
        <Route
          path="/pool/new"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PoolNew />
            </Suspense>
          }
        />
        <Route
          path="/pool/:id"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PoolView />
            </Suspense>
          }
        />
        <Route
          path="/pool/:id/join"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PoolJoin />
            </Suspense>
          }
        />
        <Route
          path="/pool/:id/bracket/:bracketId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BracketEdit />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="/scoring"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Scoring />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
