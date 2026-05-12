import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ensureSignedIn, isFirebaseConfigured } from '@/lib/firebase';
import { getBracket, updateBracketPicks, verifyBracketToken } from '@/lib/bracketApi';
import { getPool } from '@/lib/poolApi';
import { formatDeadline, isPastDeadline } from '@/lib/deadline';
import { subscribeResults } from '@/lib/resultsApi';
import { MAX_SCORE, maxAttainable, scoreBracket } from '@/lib/scoring';
import { useBracketStore } from '@/store/bracketStore';
import { BracketEditor } from '@/components/bracket/BracketEditor';
import { BracketViewer } from '@/components/bracket/BracketViewer';
import { FinalizeBar } from '@/components/bracket/FinalizeBar';
import type { Bracket, BracketPicks, Pool, ResultsDoc } from '@/lib/types';

const SAVE_DEBOUNCE_MS = 1000;

export function BracketEdit() {
  const { id: poolId, bracketId } = useParams<{ id: string; bracketId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [pool, setPool] = useState<Pool | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [results, setResults] = useState<ResultsDoc | null>(null);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const picks = useBracketStore((s) => s.picks);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return subscribeResults(setResults);
  }, []);

  useEffect(() => {
    if (!poolId || !bracketId) return;
    if (!isFirebaseConfigured()) {
      setError('Firebase is not configured.');
      setLoading(false);
      return;
    }
    initialLoadDone.current = false;
    (async () => {
      try {
        await ensureSignedIn();
        const [p, b] = await Promise.all([getPool(poolId), getBracket(poolId, bracketId)]);
        if (!p || !b) {
          setError('Pool or bracket not found.');
          setLoading(false);
          return;
        }
        setPool(p);
        setBracket(b);
        const tokenValid = token ? await verifyBracketToken(b, token) : false;
        const canEdit = tokenValid && !isPastDeadline();
        setEditable(canEdit);
        if (canEdit) {
          // Hydrate the store from Firestore only if we don't already have this bracket loaded.
          const storeBracketId = useBracketStore.getState().bracketId;
          if (storeBracketId !== bracketId) {
            useBracketStore.setState({
              picks: b.picks,
              poolId,
              bracketId,
              editToken: token,
            });
          }
        }
        initialLoadDone.current = true;
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
  }, [poolId, bracketId, token]);

  // Debounced auto-save when picks change in editable mode.
  useEffect(() => {
    if (!editable || !bracket || !initialLoadDone.current) return;
    setSaveStatus('saving');
    const t = setTimeout(() => {
      updateBracketPicks({ bracket, picks })
        .then(() => setSaveStatus('saved'))
        .catch((err) => {
          console.error('Failed to save bracket', err);
          setSaveStatus('error');
        });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [picks, editable, bracket]);

  // Picks to score against — the live in-progress picks if editing, the
  // saved bracket picks if read-only.
  const livePicks: BracketPicks | null = editable ? picks : bracket?.picks ?? null;
  const score = useMemo(() => {
    if (!livePicks) return null;
    if (!results) return { current: 0, max: MAX_SCORE };
    return {
      current: scoreBracket(livePicks, results.picks).total,
      max: maxAttainable(livePicks, results.picks),
    };
  }, [livePicks, results]);

  if (loading) return <div className="text-muted">Loading bracket…</div>;
  if (error)
    return <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>;
  if (!pool || !bracket || !poolId) return null;

  if (!editable) {
    const submittedDate = bracket.finalizedAt
      ? new Date(bracket.finalizedAt).toLocaleString()
      : null;
    const locked = isPastDeadline();
    return (
      <BracketViewer
        picks={bracket.picks}
        header={
          <header className="space-y-2">
            <PoolChip poolId={pool.id} poolName={pool.name} />
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-2xl font-semibold">{bracket.nickname}&rsquo;s bracket</h1>
              {score && <ScoreBadge current={score.current} max={score.max} />}
            </div>
            <p className="text-sm text-muted">
              {submittedDate ? (
                <span className="text-accent">submitted {submittedDate}</span>
              ) : (
                'not submitted'
              )}
            </p>
            {locked && (
              <p className="text-xs text-muted">
                Bracket locked at {formatDeadline()} (1h before the first WC 2026 game).
              </p>
            )}
          </header>
        }
      />
    );
  }

  const editLinkUrl = token
    ? `${window.location.origin}${import.meta.env.BASE_URL}pool/${poolId}/bracket/${bracketId}?token=${token}`
    : null;

  return (
    <>
      <BracketEditor
        header={
          <header className="space-y-3">
            <PoolChip poolId={pool.id} poolName={pool.name} />
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-xl font-semibold">{bracket.nickname}&rsquo;s bracket</h1>
              <div className="flex items-center gap-3">
                {score && <ScoreBadge current={score.current} max={score.max} />}
                <SaveIndicator status={saveStatus} />
              </div>
            </div>
            {editLinkUrl && <CopyEditLink url={editLinkUrl} />}
          </header>
        }
      />
      <FinalizeBar />
    </>
  );
}

function CopyEditLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore (clipboard may be unavailable)
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
      <span className="flex-1">
        <strong>Bookmark this edit link.</strong> Without it, you won&rsquo;t be able to edit your bracket from another device.
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded border border-warn/40 bg-warn/10 px-2.5 py-1 font-medium hover:bg-warn/20"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  const text =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed';
  const colorClass =
    status === 'error' ? 'text-danger' : status === 'saved' ? 'text-accent' : 'text-muted';
  return <span className={`text-xs ${colorClass}`}>{text}</span>;
}

function ScoreBadge({ current, max }: { current: number; max: number }) {
  return (
    <div
      className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5"
      title={`${current} earned, max attainable ${max}. Max drops as your picks are eliminated.`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Score</span>
      <span className="font-mono text-base font-semibold text-text">{current}</span>
      <span className="font-mono text-xs text-muted">/ {max}</span>
    </div>
  );
}

function PoolChip({ poolId, poolName }: { poolId: string; poolName: string }) {
  return (
    <Link
      to={`/pool/${poolId}`}
      className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-accent/70">
        Pool
      </span>
      <span>{poolName}</span>
      <span aria-hidden className="text-accent/60">&rarr;</span>
    </Link>
  );
}

