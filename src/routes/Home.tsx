import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isFirebaseConfigured } from '@/lib/firebaseConfigured';
import { listOwnedBrackets, type OwnedBracketEntry } from '@/lib/localStore';

export function Home() {
  const [owned, setOwned] = useState<{ poolId: string; entry: OwnedBracketEntry }[]>([]);
  useEffect(() => {
    setOwned(listOwnedBrackets());
  }, []);

  const configured = isFirebaseConfigured();

  return (
    <div className="space-y-12">
      <section className="rounded-lg border border-border bg-surface p-8 text-center">
        <h1 className="mb-3 text-3xl font-semibold">Build your World Cup 2026 bracket</h1>
        <p className="mx-auto mb-6 max-w-lg text-muted">
          Create a pool with friends and compete with predictions for all 48 teams. No signup,
          no email — just a pool name, password, and a shareable link.
        </p>
        {configured ? (
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/pool/new"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
            >
              Create a pool
            </Link>
            <Link
              to="/preview"
              className="rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold hover:bg-surface-2/80"
            >
              Preview the bracket
            </Link>
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-3">
            <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm text-warn">
              <p className="font-semibold">Firebase isn't configured yet.</p>
              <p className="mt-1 text-warn/80">
                Pool features need a Firebase project. Copy <code>.env.example</code> to{' '}
                <code>.env.local</code> and fill in the four <code>VITE_FIREBASE_*</code> values
                from your project's Web app settings, then restart the dev server.
              </p>
            </div>
            <Link
              to="/preview"
              className="inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
            >
              Preview the bracket (browser-only)
            </Link>
          </div>
        )}
      </section>

      {owned.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Your brackets</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map(({ poolId, entry }) => (
              <Link
                key={poolId}
                to={`/pool/${poolId}/bracket/${entry.bracketId}?token=${entry.editToken}`}
                className="rounded-md border border-border bg-surface p-4 transition hover:border-accent/50"
              >
                <div className="text-sm font-semibold">{entry.poolName}</div>
                <div className="mt-1 text-xs text-muted">as {entry.nickname}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
