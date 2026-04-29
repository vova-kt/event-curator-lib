/**
 * Canonical event identity. See docs/storage.md → events table.
 */

import { createHash } from 'node:crypto';

/**
 * Compute a stable, content-derived id for an event.
 * Tolerant to small whitespace/case differences in title and venue.
 *
 * @param {{ title: string, startsAt: string, venue: { name: string, city: string } }} e
 * @returns {string}
 */
export function eventId(e) {
  const parts = [
    normalize(e.title),
    e.startsAt.slice(0, 16),         // minute-precision
    normalize(e.venue.name),
    normalize(e.venue.city),
  ];
  const h = createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
  return `evt_${h}`;
}

/**
 * @param {string} s
 */
export function normalize(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
