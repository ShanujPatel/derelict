import { BOSSES } from './bosses';
import { formatDuration } from './leaderboard';
import { vesselName } from './names';
import { seedQuery, type ResolvedSeed } from './seed';

/** A run's result as a short text card, with a link that replays the same ship. */
export interface ShareInput {
  run: ResolvedSeed;
  extracted: boolean;
  salvage: number;
  kills: number;
  durationMs: number;
  /** Page address without a query, e.g. https://you.github.io/derelict/ */
  base: string;
  rank?: { rank: number; total: number };
}

export function shareText(s: ShareInput): string {
  const where = s.run.boss
    ? `Boss contract: ${BOSSES[s.run.boss].name}`
    : s.run.mode === 'daily'
      ? `Daily Derelict ${s.run.seed.replace('daily-', '')} · ${vesselName(s.run.seed, s.run.ship)}`
      : s.run.mode === 'weekly'
        ? `Weekly Challenge ${s.run.seed.replace('weekly-', '')}`
        : `${vesselName(s.run.seed, s.run.ship)} (seed ${s.run.seed})`;
  const outcome = s.extracted
    ? `Extracted with ${s.salvage} salvage in ${formatDuration(s.durationMs)}`
    : `Lost aboard after ${formatDuration(s.durationMs)} (${s.salvage} salvage gone)`;
  const rank = s.rank ? ` · rank #${s.rank.rank} of ${s.rank.total}` : '';
  return [`DERELICT · ${where}`, `${outcome} · ${s.kills} hostiles down${rank}`, `Can you beat it? ${s.base}${seedQuery(s.run)}`].join('\n');
}
