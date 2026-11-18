// Instant card copy for each moment type. Cards show at once from these templates, filled with the moment's computed
// facts; the AI is only called when the viewer taps "Explain more" or asks a question. Two depths, two languages.
import { CONCEPT, depthFor } from './concepts';
import { historyById, matchHistory } from './history';
import type { Card, ConceptId, Lang, Moment, Profile, VizRequest } from './types';

type Text = { headline: string; body: string; expert: string };
type Fill = (f: Moment['facts'], lang: Lang) => Text;
const pick = (lang: Lang, en: string, hi: string) => (lang === 'en' ? en : hi);

const TEMPLATES: Record<Moment['type'], Fill> = {
  position_gain: (f, l) => f.gain && f.from === f.grid && Number(f.gain) >= 10
    ? {
      headline: pick(l, `${f.driver}: P${f.from} → P${f.to} since the start`, `${f.driver}: start se P${f.from} → P${f.to}`),
      body: pick(l, `${f.driver} started ${f.from}th and has gained ${f.gain} places by lap ${f.laps}. In the rain, a driver who trusts the grip can pass cars that are struggling to see and stop.`, `${f.driver} ${f.from}th se start hua tha aur lap ${f.laps} tak ${f.gain} places gain kar chuka hai. Baarish mein jo driver grip pe bharosa kare, woh un cars ko nikaal deta hai jo dekh aur brake karne mein struggle kar rahi hain.`),
      expert: pick(l, `${f.gain} places since the grid by lap ${f.laps}; the gain is on track, not from pit cycles.`, `Lap ${f.laps} tak grid se ${f.gain} places; yeh on-track gain hai, pit cycle se nahi.`),
    }
    : {
      headline: pick(l, `${f.driver} jumps P${f.from} → P${f.to}`, `${f.driver} ka jump: P${f.from} → P${f.to}`),
      body: pick(l, `${f.driver} just gained ${f.gain} places in a few minutes${Number(f.onTrack) > 0 ? `, ${f.onTrack} of them by passing on track` : ''}. Watch how they pick a different line from the cars around them.`, `${f.driver} ne kuch hi minute mein ${f.gain} places gain kiye${Number(f.onTrack) > 0 ? `, jinmein ${f.onTrack} track pe overtake karke` : ''}. Dekho kaise woh baaki cars se alag line le raha hai.`),
      expert: pick(l, `+${f.gain} places in under five minutes (${f.onTrack} on-track passes).`, `5 minute mein +${f.gain} places (${f.onTrack} on-track passes).`),
    },
  pit_stop: (f, l) => f.status === 'vsc' || f.status === 'sc'
    ? {
      headline: pick(l, `${f.count} cars pit under the ${f.status === 'vsc' ? 'VSC' : 'safety car'}`, `${f.status === 'vsc' ? 'VSC' : 'Safety car'} mein ${f.count} cars ne pit kiya`),
      body: pick(l, `${f.leaders ? `${f.leaders} among them. ` : ''}The field is slowed right now, so a pit stop costs far less time than usual. Teams are cashing in: new tyres at a discount.`, `${f.leaders ? `Inmein ${f.leaders} bhi hain. ` : ''}Abhi field slow hai, toh pit stop ka time loss normal se kaafi kam hai. Teams discount pe naye tyre le rahi hain.`),
      expert: pick(l, `Cheap stops under the ${f.status === 'vsc' ? 'VSC' : 'SC'}: ${f.leaders || `${f.count} cars`}. Watch who stays out.`, `${f.status === 'vsc' ? 'VSC' : 'SC'} mein sasta stop: ${f.leaders || `${f.count} cars`}. Dekho kaun bahar rehta hai.`),
    }
    : {
      headline: pick(l, `Pit stop: ${f.driver}${Number(f.count) > 1 ? ` +${Number(f.count) - 1}` : ''}`, `Pit stop: ${f.driver}${Number(f.count) > 1 ? ` +${Number(f.count) - 1}` : ''}`),
      body: pick(l, `${f.driver} came in for fresh tyres. The stop itself takes seconds, but the trip through the pit lane costs about 20 s of racing.`, `${f.driver} fresh tyres ke liye andar aaya. Stop to kuch second ka hai, par pit lane ka chakkar ~20 s ka padta hai.`),
      expert: pick(l, `${f.driver} pits from P${f.top}.`, `${f.driver} P${f.top} se pit.`),
    },
  vsc: (_f, l) => ({
    headline: pick(l, 'Virtual safety car', 'Virtual safety car (VSC)'),
    body: pick(l, 'Race control has slowed everyone to a set pace while marshals clear something on track. Gaps freeze, and pitting now is cheap.', 'Race control ne sabko ek fixed slow pace pe daal diya hai jab tak marshals track saaf karte hain. Gaps freeze, aur abhi pit karna sasta hai.'),
    expert: pick(l, 'VSC: pit loss drops sharply. Expect stops.', 'VSC: pit loss kaafi kam. Stops expect karo.'),
  }),
  safety_car: (_f, l) => ({
    headline: pick(l, 'Safety car deployed', 'Safety car aa gayi'),
    body: pick(l, 'A safety car now leads the pack at reduced speed. The gaps between cars disappear, so a big lead is gone and the race bunches up.', 'Ab safety car sabse aage slow chalegi. Cars ke beech ke gaps khatam, bada lead bhi gaya, sab paas aa jaayenge.'),
    expert: pick(l, 'SC: field bunches; leads are neutralised.', 'SC: field bunch, leads neutral.'),
  }),
  red_flag: (f, l) => ({
    headline: pick(l, `Red flag on lap ${f.lap}`, `Lap ${f.lap} pe red flag`),
    body: pick(l, 'The race is stopped. Cars return to the pit lane and wait. While stopped, the rules let teams change tyres for free, and that changes the strategy picture.', 'Race ruk gayi. Cars pit lane mein wapas aakar wait karengi. Rukne ke dauraan rules free tyre change allow karte hain, aur isse strategy ka poora scene badal jaata hai.'),
    expert: pick(l, 'Red flag: free tyre change for all. Recent stops just lost their value.', 'Red flag: sabko free tyre change. Haal ke stops ki value khatam.'),
  }),
  red_flag_strategy: (f, l) => ({
    headline: pick(l, `Restart order: ${f.order}`, `Restart order: ${f.order}`),
    body: pick(l, `${f.stopped ? `${f.stopped} paid for a pit stop just before the stoppage. ` : ''}${f.stayed ? `${f.stayed} stayed out, and now get new tyres for free in the red flag. ` : ''}${f.leader} restarts at the front.`, `${f.stopped ? `${f.stopped} ne rukne se just pehle pit stop ka time diya. ` : ''}${f.stayed ? `${f.stayed} bahar rahe, aur ab red flag mein free mein naye tyre milenge. ` : ''}${f.leader} sabse aage restart karega.`),
    expert: pick(l, `Stayed out: ${f.stayed}. Stopped: ${f.stopped || 'none'}. The red flag turned the stay-out call into track position.`, `Bahar rahe: ${f.stayed}. Stop kiya: ${f.stopped || 'koi nahi'}. Red flag ne stay-out call ko track position bana diya.`),
  }),
  restart: (_f, l) => ({
    headline: pick(l, 'Race restarts', 'Race restart'),
    body: pick(l, 'The race resumes behind the safety car. When it pulls in, the gaps start from zero again.', 'Race safety car ke peeche restart. Jab woh andar jaayegi, gaps zero se shuru honge.'),
    expert: pick(l, 'Rolling restart behind the SC.', 'SC ke peeche rolling restart.'),
  }),
  lead_change: (f, l) => ({
    headline: pick(l, `${f.driver} takes the lead from ${f.passed}`, `${f.driver} ne ${f.passed} se lead le li`),
    body: pick(l, `${f.driver} started P${f.grid} and is now leading on lap ${f.lap} of ${f.laps}. On a wet track, the leader also has the clearest view: no spray from a car ahead.`, `${f.driver} P${f.grid} se start hua tha aur lap ${f.lap}/${f.laps} pe ab lead kar raha hai. Geeli track pe leader ko sabse saaf view milta hai: aage koi car ka spray nahi.`),
    expert: pick(l, `P${f.grid} → P1 by lap ${f.lap}. Clear air in the wet is worth a lot.`, `Lap ${f.lap} tak P${f.grid} → P1. Wet mein clear air bahut keemti hai.`),
  }),
};

/** The default chart for each moment type, filled with the moment's drivers. */
export function vizFor(m: Moment): VizRequest | null {
  switch (m.type) {
    case 'position_gain': case 'lead_change': return { type: 'positions', drivers: m.drivers.slice(0, 3) };
    case 'pit_stop': return { type: 'tyres', drivers: m.drivers.slice(0, 5) };
    case 'red_flag_strategy': return { type: 'tyres', drivers: m.drivers.slice(0, 5) };
    case 'safety_car': case 'vsc': return { type: 'gaps', drivers: [] };
    default: return null;
  }
}

/** Build the nudge card for a moment, personalised by the viewer's level, language and concept knowledge. */
export function nudgeCard(m: Moment, p: Profile, opts: { reason: string; quiz: ConceptId | null }): Card {
  const text = TEMPLATES[m.type](m.facts, p.lang), depth = depthFor(p, m.concepts);
  const fresh = m.concepts.find((c) => p.concepts[c] === 'new');
  const concept = CONCEPT[fresh ?? m.concepts[0]];
  const hist = m.type === 'lead_change' ? matchHistory(m) : null;
  const analogy = depth === 'beginner' && concept.analogy && fresh ? concept.analogy[p.lang] : null;
  return {
    id: `card-${m.id}`, momentId: m.id, t: m.t, kind: 'nudge', headline: text.headline,
    body: depth === 'expert' ? text.expert : text.body,
    more: hist ? hist.entry.why[p.lang] : depth === 'beginner' && fresh ? concept.beginner[p.lang] : null,
    analogy, why: opts.reason, viz: hist ? { type: 'then_now', drivers: m.drivers.slice(0, 1), historyId: hist.entry.id } : vizFor(m),
    history: hist?.entry.id ?? null, followups: followupsFor(m, p.lang), concepts: m.concepts, source: 'template', quiz: opts.quiz,
  };
}

function followupsFor(m: Moment, l: Lang): string[] {
  const q: Record<Moment['type'], [string, string][]> = {
    position_gain: [['How did they gain so many places?', 'Itne places kaise gain kiye?'], ['Show me how the positions changed', 'Positions kaise badli dikhao']],
    pit_stop: [['Why did that pit stop matter?', 'Yeh pit stop important kyun tha?'], ['What is an undercut?', 'Undercut kya hota hai?']],
    vsc: [['Why is everyone pitting now?', 'Sab abhi pit kyun kar rahe hain?'], ['What is a VSC?', 'VSC kya hai?']],
    safety_car: [['What does the safety car change?', 'Safety car se kya badalta hai?'], ['Show me the gaps', 'Gaps dikhao']],
    red_flag: [['Why did the red flag change the strategy?', 'Red flag se strategy kyun badli?'], ['What happens during a red flag?', 'Red flag mein kya hota hai?']],
    red_flag_strategy: [['Why did the red flag change the strategy?', 'Red flag se strategy kyun badli?'], ['Show me the tyre strategy', 'Tyre strategy dikhao']],
    restart: [['Who has the advantage now?', 'Ab advantage kiska hai?'], ['What just happened?', 'Abhi kya hua?']],
    lead_change: [['Has this happened before?', 'Pehle kabhi aisa hua hai?'], ['How did they gain so many places?', 'Itne places kaise gain kiye?']],
  };
  return q[m.type].map(([en, hi]) => (l === 'en' ? en : hi));
}

export const historyFor = (id: string | null) => (id ? historyById(id) : null);

/** Broadcast commentary: fast, English, written for people who already follow F1 (the gap Khel Saathi fills).
 *  Original lines from the moment's facts; spoken by the TV page. The 2016 line is the kind of reference a new fan
 *  cannot place, which the phone then explains with the Then vs Now card. */
export function commentaryLine(m: Moment): string {
  const f = m.facts;
  switch (m.type) {
    case 'position_gain': return Number(f.gain) >= 10 && f.from === f.grid
      ? `${f.driver} started down in P${f.from}, and he's up to P${f.to} already. What a drive in these conditions!`
      : `${f.driver} is on the move! P${f.from} to P${f.to} in a matter of minutes!`;
    case 'pit_stop': return f.status === 'vsc' || f.status === 'sc'
      ? `They're diving in! ${f.leaders || 'A whole group'} into the pit lane, cheap stops on offer!`
      : `${f.driver} peels off into the pit lane.`;
    case 'vsc': return 'Virtual safety car! Everybody back to the delta.';
    case 'safety_car': return 'And the safety car is out! That bunches the whole field up.';
    case 'red_flag': return 'Red flag! Red flag! The race has been stopped here at Interlagos!';
    case 'red_flag_strategy': return `What a twist. ${f.leader} will restart at the front, and the ones who stayed out are laughing. Free tyres!`;
    case 'restart': return "And we're back under way behind the safety car.";
    case 'lead_change': return Number(f.grid) >= 10
      ? `${f.driver} is through on ${f.passed}, and ${f.driver} leads the São Paulo Grand Prix! Shades of 2016 here, in the rain!`
      : `${f.driver} takes the lead from ${f.passed}!`;
  }
}

/** Short label for the broadcast's event ticker. */
export const headlineOf = (m: Moment, lang: Lang = 'en') => TEMPLATES[m.type](m.facts, lang).headline;
