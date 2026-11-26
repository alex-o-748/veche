import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Small "game feel" pieces: animated numbers, floating change markers and
 * the turn/phase banner. All of them stay still for players who ask their
 * system for reduced motion.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that counts smoothly to its new value instead of jumping. */
export const AnimatedNumber = ({ value, format = (n) => String(n), duration = 600, from }) => {
  // `from` makes the number count up from that value when it first appears
  const [shown, setShown] = useState(from ?? value);
  const fromRef = useRef(from ?? value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value || prefersReducedMotion()) {
      fromRef.current = value;
      setShown(value);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const current = from + (value - from) * eased;
      fromRef.current = current;
      setShown(k < 1 ? Math.round(current * 100) / 100 : value);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{format(shown)}</>;
};

/**
 * Floating "+2" / "−1" markers that rise from a value when it changes.
 * `render(delta)` draws a marker's content (e.g. with a coin icon).
 * Changing `epoch` (e.g. when a new game starts) resets silently, without a marker.
 */
export const DeltaChips = ({ value, render, className = '', epoch = 0 }) => {
  const [chips, setChips] = useState([]);
  const prevRef = useRef(value);
  const idRef = useRef(0);
  const timersRef = useRef([]);
  const epochRef = useRef(epoch);

  // Clear pending removals only when the component goes away
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const delta = Math.round((value - prevRef.current) * 100) / 100;
    prevRef.current = value;
    if (epochRef.current !== epoch) {
      epochRef.current = epoch;
      return;
    }
    if (!delta) return;
    const id = ++idRef.current;
    setChips((c) => [...c, { id, delta }]);
    timersRef.current.push(setTimeout(() => setChips((c) => c.filter((chip) => chip.id !== id)), 1800));
  }, [value, epoch]);

  if (!chips.length) return null;
  return (
    <span className={`pointer-events-none absolute ${className}`} aria-hidden="true">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={`delta-chip ${chip.delta > 0 ? 'delta-up' : 'delta-down'}`}
        >
          {render(chip.delta)}
        </span>
      ))}
    </span>
  );
};

/**
 * A ribbon across the screen announcing a new turn or phase.
 * Shown for a moment whenever `turn` or `phase` changes; never blocks clicks.
 */
export const PhaseBanner = ({ turn, phase, hidden }) => {
  const { t } = useTranslation();
  const [banner, setBanner] = useState(null);
  const lastRef = useRef(null);

  useEffect(() => {
    // Events announce themselves with the face-down card, so they get no banner
    if (hidden || phase === 'resources' || phase === 'events') return undefined;
    const key = `${turn}-${phase}`;
    if (lastRef.current === key) return undefined;
    lastRef.current = key;
    setBanner({ key, turn, phase });
    const timer = setTimeout(() => setBanner(null), 1700);
    return () => clearTimeout(timer);
  }, [turn, phase, hidden]);

  if (!banner) return null;
  const title = banner.phase === 'construction'
    ? t('banner.turn', { turn: banner.turn })
    : t(`phases.${banner.phase}`);
  const subtitle = banner.phase === 'construction'
    ? t('phases.construction')
    : banner.phase === 'events' ? t('banner.eventsSub') : t('banner.vecheSub');

  return (
    <div className="fixed inset-x-0 top-[38%] z-40 flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div key={banner.key} className="phase-banner">
        <div className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-[#f3e3b5]">{title}</div>
        <div className="font-display text-sm sm:text-base tracking-[0.2em] text-[#d9bf7a]">{subtitle}</div>
      </div>
    </div>
  );
};

/**
 * Battle report: our strength against the Order's as a tug-of-war bar,
 * the chance of victory, and — once fought — a verdict stamp.
 *
 *  ours, theirs  strengths on each side
 *  chance        chance of victory in percent (from the game's own formula)
 *  outcome       'won' | 'lost' for a fought battle; omit for a forecast
 *  title         heading (e.g. "Battle for Pechory" or "Forecast")
 *  note          optional small print under the bar
 */
export const BattleReport = ({ ours, theirs, chance, outcome, title, note }) => {
  const { t } = useTranslation();
  const [filled, setFilled] = useState(prefersReducedMotion());
  const [stamped, setStamped] = useState(prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const a = requestAnimationFrame(() => setFilled(true));
    const b = outcome ? setTimeout(() => setStamped(true), 1000) : null;
    return () => { cancelAnimationFrame(a); if (b) clearTimeout(b); };
  }, [outcome]);

  const total = Math.max(1, ours + theirs);
  const ourShare = (ours / total) * 100;
  const isForecast = !outcome;

  return (
    <div className={`battle-report ${isForecast ? 'is-forecast' : ''}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="font-display text-sm sm:text-base font-medium text-ink tracking-wide">{title}</span>
        <span className="text-xs sm:text-sm text-ink-light whitespace-nowrap">
          {t('battle.chance')}: <strong className="text-ink lining-nums tabular-nums">{chance}%</strong>
        </span>
      </div>

      <div className="flex justify-between text-[11px] sm:text-xs font-semibold mb-0.5">
        <span className="text-good">{t('battle.ourForces')} · <span className="lining-nums tabular-nums">{ours}</span></span>
        <span className="text-ink">{t('battle.orderForces')} · <span className="lining-nums tabular-nums">{theirs}</span></span>
      </div>
      <div className="battle-bar" role="img" aria-label={`${t('battle.ourForces')} ${ours}, ${t('battle.orderForces')} ${theirs}, ${t('battle.chance')} ${chance}%`}>
        <div className="battle-bar-ours" style={{ width: filled ? `${ourShare}%` : '50%' }} />
        <div className="battle-bar-mid" />
      </div>

      {note && <p className="mt-1 text-[11px] sm:text-xs text-ink-muted">{note}</p>}

      {outcome && (
        <div className="mt-2 flex justify-center">
          <div className={`battle-stamp ${outcome === 'won' ? 'is-won' : 'is-lost'} ${stamped ? 'is-in' : ''}`} aria-live="polite">
            {outcome === 'won' ? t('battle.stampVictory') : t('battle.stampDefeat')}
          </div>
        </div>
      )}
    </div>
  );
};
