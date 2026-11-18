// Curated history: earlier races whose facts were checked against the cited source. Matching is deterministic tag
// overlap, not a vector search, and a weak match (fewer than MIN_SCORE shared tags) shows nothing: "wet at
// Interlagos" alone is not enough, it also needs a comeback, a charge or a red flag. Every entry is
// from a race before the replay, so history can never spoil the current race.
import type { HistoryMoment, Moment } from './types';

export const MIN_SCORE = 3;

export const HISTORY: HistoryMoment[] = [
  {
    id: 'brazil-2016', race: 'Brazilian Grand Prix', season: 2016, title: 'Verstappen in the Interlagos rain',
    summary: 'In heavy rain at the same circuit, 19-year-old Max Verstappen dropped to 16th after a late pit stop and climbed to 3rd in the last 16 laps.',
    tags: ['wet', 'comeback', 'interlagos', 'red_flag', 'charge'],
    facts: [{ label: 'Started', value: 'P4' }, { label: 'Lowest', value: 'P16 (16 laps to go)' }, { label: 'Finished', value: 'P3' }, { label: 'Conditions', value: 'Rain, two red flags' }],
    source: 'https://en.wikipedia.org/wiki/2016_Brazilian_Grand_Prix',
    why: { en: 'Same track, same rain, same driver making up places fast. Interlagos in the wet rewards drivers who find grip off the usual racing line.', hinglish: 'Wahi track, wahi baarish, wahi driver tezi se places bana raha hai. Geeli Interlagos pe woh jeetta hai jo normal line se hatke grip dhoondh le.' },
  },
  {
    id: 'canada-2011', race: 'Canadian Grand Prix', season: 2011, title: 'Button from last to first',
    summary: 'Jenson Button was last after a lap-37 collision, made five stops and a drive-through, and still won after a two-hour red-flag stoppage for rain.',
    tags: ['wet', 'comeback', 'red_flag', 'charge', 'strategy'],
    facts: [{ label: 'Lowest', value: 'P21 (last), lap 37' }, { label: 'Pit stops', value: '5 + drive-through' }, { label: 'Red flag', value: 'Over 2 hours (rain)' }, { label: 'Finished', value: 'P1' }],
    source: 'https://en.wikipedia.org/wiki/2011_Canadian_Grand_Prix',
    why: { en: 'Rain plus a red flag reshuffles a race: tyre calls during the chaos can matter more than the starting position.', hinglish: 'Baarish + red flag poori race shuffle kar dete hain: chaos mein sahi tyre call starting position se zyada matter karti hai.' },
  },
];

/** Best history match for a moment, or null when the evidence is weak. */
export function matchHistory(m: Pick<Moment, 'tags'>): { entry: HistoryMoment; score: number; shared: string[] } | null {
  let best: { entry: HistoryMoment; score: number; shared: string[] } | null = null;
  for (const entry of HISTORY) {
    const shared = entry.tags.filter((t) => m.tags.includes(t));
    if (shared.length >= MIN_SCORE && (!best || shared.length > best.score)) best = { entry, score: shared.length, shared };
  }
  return best;
}

export const historyById = (id: string) => HISTORY.find((h) => h.id === id) ?? null;
