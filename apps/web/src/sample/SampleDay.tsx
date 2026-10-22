import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../experience/adapter.ts';
import { href } from '../router.ts';
import { sampleMode } from './mode.ts';
import './sample.css';

type SampleLinks = { followup: string; later: string; responsibility: string };

export function SampleDay({ children }: { children: ReactNode }) {
  const bannerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<SampleLinks | null>(null);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!sampleMode || !banner || error) return;
    const root = document.documentElement;
    // The sample label can wrap or grow with text zoom; fixed overlays must
    // start below its actual height, independently of the banner's minimum.
    const measure = () =>
      root.style.setProperty(
        '--sample-banner-height',
        `${banner.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(banner);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--sample-banner-height');
    };
  }, [error]);
  useEffect(() => {
    if (!sampleMode) return;
    void fetch(`${API_BASE_URL}/sample-day`)
      .then((response) => {
        if (!response.ok) throw new Error('No sample fixtures');
        return response.json();
      })
      .then(setLinks)
      .catch(() => setError(true));
  }, []);
  if (!sampleMode) return children;
  if (error)
    return (
      <main className="sample-error">
        <h1>Sample day is unavailable</h1>
        <p>
          Start the isolated fixtures with <code>bun run sample</code>, then reopen the printed
          local address.
        </p>
      </main>
    );
  return (
    <>
      <section ref={bannerRef} className="sample-banner" aria-label="Sample day">
        <span>
          <strong>Sample day</strong>
          <span className="sample-explanation"> · Scripted examples · No real account actions</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="sample-guide"
        >
          {open ? 'Close guide' : 'Sample guide'}
        </button>
      </section>
      {open && (
        <section id="sample-guide" className="sample-guide" aria-label="Sample day guide">
          <h2>A follow-up you can improve, teach, and delegate</h2>
          <p>
            Avery supplied customer call notes. The sample keeps Priya’s unresolved security
            requirement open, prepares a draft, and asks before sending. Nothing here contacts a
            customer or runs a model.
          </p>
          <ol>
            <li>
              <a href={links ? `#/chat/${links.followup}` : '#/'} onClick={() => setOpen(false)}>
                Review the prepared follow-up
              </a>{' '}
              — revise it or inspect the sample approval.
            </li>
            <li>
              <a href={links ? `#/chat/${links.later}` : '#/'} onClick={() => setOpen(false)}>
                See the saved style in a later task
              </a>{' '}
              — the example uses one clear ask and fewer than 120 words.
            </li>
            <li>
              <a href={href('/work?view=recurring')} onClick={() => setOpen(false)}>
                Inspect the scoped responsibility
              </a>{' '}
              — one sample customer thread, a deadline, and a pause control.
            </li>
            <li>
              <a href={href('/settings/memory')} onClick={() => setOpen(false)}>
                Inspect or forget the saved preference
              </a>
              . Preferences, procedures, and routines are separate choices.
            </li>
          </ol>
          <p>
            These deterministic transitions explain the product. A real installation needs a
            supported model and a connected mailbox to monitor fresh replies. Reloading this page
            keeps the fixture session; restarting <code>bun run sample</code> resets it.
          </p>
        </section>
      )}
      <div className="sample-app">{children}</div>
    </>
  );
}
