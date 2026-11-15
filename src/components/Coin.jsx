import React from 'react';
import i18n from '../i18n';

/**
 * Coin icon, used wherever the game shows money.
 * Drawn in SVG so it renders the same in every font (the old "○" read as a letter O).
 */
export const CoinIcon = ({ className = '' }) => (
  <svg
    viewBox="0 0 16 16"
    className={`coin ${className}`}
    role="img"
    aria-label={i18n.t('game.coins')}
  >
    <circle cx="8" cy="8" r="7.2" fill="#c9a24a" stroke="#7a5a1c" strokeWidth="1.1" />
    <circle cx="8" cy="8" r="4.9" fill="none" stroke="#8a6a26" strokeWidth="0.8" opacity="0.8" />
    <circle cx="8" cy="8" r="1.4" fill="#8a6a26" />
    <path d="M5 4.4 A5 5 0 0 1 11 4.4" fill="none" stroke="#f3dc98" strokeWidth="0.9" opacity="0.7" />
  </svg>
);

/**
 * Replace each "○" in a (translated) string with the coin icon.
 * Returns the string unchanged when it has no "○", so it is safe to wrap any text.
 */
export const coinify = (text) => {
  if (typeof text !== 'string' || !text.includes('○')) return text;
  return text.split('○').flatMap((part, i) => (i === 0 ? [part] : [<CoinIcon key={i} />, part]));
};

export default CoinIcon;
