// The concept pack: the eight F1 ideas a new fan needs first. A sport adapter for another sport ships its own pack
// with the same shape. Each concept has a beginner and an expert line per language, an optional cricket analogy
// (only where it really helps), and one quick check question.
import type { ConceptId, KnowState, Lang, Level, Profile } from './types';

export interface Concept {
  id: ConceptId; title: Record<Lang, string>; beginner: Record<Lang, string>; expert: Record<Lang, string>;
  analogy: Record<Lang, string> | null;
  quiz: { q: Record<Lang, string>; options: Record<Lang, string[]>; answer: number; explain: Record<Lang, string> };
}

export const CONCEPTS: Concept[] = [
  {
    id: 'tyres', title: { en: 'Tyres and compounds', hinglish: 'Tyres aur compounds' },
    beginner: { en: 'Teams pick tyres for the conditions. Slicks are for a dry track; intermediates (green) and full wets (blue) have grooves that clear water. Tyres wear out, so cars get slower as a stint goes on.', hinglish: 'Har condition ke liye alag tyre hota hai. Dry track pe slicks, geeli track pe intermediates (green) ya full wets (blue), jinke grooves paani hatate hain. Tyre ghiste hain, isliye stint lamba hone pe car dheemi hoti jaati hai.' },
    expert: { en: 'Compound choice and tyre age drive pace; on a drying or worsening wet track the crossover between inters and wets decides stops.', hinglish: 'Compound aur tyre age se pace banta hai; wet race mein inters aur wets ka crossover hi stop decide karta hai.' },
    analogy: { en: 'Like a new ball and an old ball: fresh tyres grip and swing the race your way, worn ones lose bite.', hinglish: 'Naya ball vs purana ball: fresh tyre grip deta hai, ghisa hua tyre ki bite chali jaati hai.' },
    quiz: { q: { en: 'The track is wet. Which tyres have grooves to clear the water?', hinglish: 'Track geeli hai. Kaunse tyres mein paani hatane wale grooves hote hain?' }, options: { en: ['Slicks', 'Intermediates and wets', 'Any tyre with more air'], hinglish: ['Slicks', 'Intermediates aur wets', 'Zyada hawa wala koi bhi tyre'] }, answer: 1, explain: { en: 'Intermediates and wets have grooves; slicks are smooth and only work on a dry track.', hinglish: 'Inters aur wets mein grooves hote hain; slicks smooth hote hain, sirf dry track ke liye.' } },
  },
  {
    id: 'pit_stop', title: { en: 'Pit stops', hinglish: 'Pit stop' },
    beginner: { en: 'A pit stop is when a car drives into the pit lane for new tyres. The crew changes all four in about 2 to 3 seconds, but driving through the pit lane costs around 20 seconds in total.', hinglish: 'Pit stop matlab car pit lane mein aakar naye tyre leti hai. Crew 2-3 second mein chaaron tyre badal deti hai, par pit lane se guzarne mein total lagbhag 20 second jaate hain.' },
    expert: { en: 'The cost of a stop is the pit-lane time loss versus racing speed; anything that slows the field shrinks that loss.', hinglish: 'Stop ka cost = pit lane ka time loss vs racing pace; field slow ho toh yeh loss chhota ho jaata hai.' },
    analogy: null,
    quiz: { q: { en: 'Roughly how much race time does a normal pit stop cost in total?', hinglish: 'Normal pit stop mein total kitna race time jaata hai?' }, options: { en: ['About 2 seconds', 'About 20 seconds', 'About 2 minutes'], hinglish: ['Lagbhag 2 second', 'Lagbhag 20 second', 'Lagbhag 2 minute'] }, answer: 1, explain: { en: 'The tyre change is ~2 s, but the slow pit lane makes the full cost ~20 s.', hinglish: 'Tyre change ~2 s ka hai, par slow pit lane ki wajah se total ~20 s.' } },
  },
  {
    id: 'undercut', title: { en: 'Undercut', hinglish: 'Undercut' },
    beginner: { en: 'An undercut is pitting before the car ahead. Your fresh tyres are faster for a few laps, so when they pit later you can come out in front.', hinglish: 'Undercut matlab aage wali car se pehle pit karna. Naye tyres pe tum kuch laps tez ho, toh jab woh baad mein pit kare, tum aage nikal sakte ho.' },
    expert: { en: 'The undercut works when the new-tyre gain over a lap or two beats the gap plus out-lap loss.', hinglish: 'Undercut tab chalta hai jab fresh tyre ka gain, gap aur out-lap loss se zyada ho.' },
    analogy: null,
    quiz: { q: { en: 'What is an undercut?', hinglish: 'Undercut kya hai?' }, options: { en: ['Pitting before the car ahead to pass it with fresher tyres', 'Overtaking on the inside of a corner', 'Skipping a pit stop'], hinglish: ['Aage wali car se pehle pit karke fresh tyres se aage nikalna', 'Corner ke andar se overtake karna', 'Pit stop skip karna'] }, answer: 0, explain: { en: 'You stop first and use the fresh tyres to jump the car ahead.', hinglish: 'Pehle stop karo, fresh tyres se aage wali car ko jump karo.' } },
  },
  {
    id: 'overtaking', title: { en: 'Overtaking', hinglish: 'Overtaking' },
    beginner: { en: 'Positions change on track by passing, or off track when others pit. A driver gaining many places quickly usually has a faster car or better tyres for the conditions.', hinglish: 'Position track pe overtake se badalti hai, ya jab doosre pit karte hain. Jaldi bahut places gain karna matlab car ya tyres conditions ke hisaab se zyada tez hain.' },
    expert: { en: 'Separate on-track passes from pit-cycle gains; in the wet, line choice and visibility matter as much as raw pace.', hinglish: 'On-track passes aur pit-cycle gains alag dekho; wet mein line choice aur visibility bhi utni hi zaroori hai.' },
    analogy: { en: 'Like a batter starting slowly and then scoring off every ball: once the rhythm comes, places fall quickly.', hinglish: 'Jaise batter ek baar set ho jaaye toh har ball pe run aate hain: rhythm aate hi places girte jaate hain.' },
    quiz: { q: { en: 'A driver moves from P5 to P2 while the two cars ahead are in the pits. Is that an on-track overtake?', hinglish: 'Aage ki do cars pit mein hain aur driver P5 se P2 aa gaya. Kya yeh on-track overtake hai?' }, options: { en: ['Yes', 'No, it is a pit-cycle gain'], hinglish: ['Haan', 'Nahi, yeh pit-cycle gain hai'] }, answer: 1, explain: { en: 'Places gained while others pit are not passes on track.', hinglish: 'Doosron ke pit karne se mile places on-track overtake nahi hote.' } },
  },
  {
    id: 'drs', title: { en: 'DRS', hinglish: 'DRS' },
    beginner: { en: 'DRS opens a flap in the rear wing to cut drag on straights, helping a car within one second of the one ahead to pass. It is switched off in the wet.', hinglish: 'DRS rear wing ka flap kholta hai taaki straight pe drag kam ho; aage wali car se 1 second ke andar ho toh overtake mein madad. Geeli track pe yeh band rehta hai.' },
    expert: { en: 'DRS is enabled by race control and disabled in unsafe conditions, which makes wet-race passing harder.', hinglish: 'Race control DRS enable/disable karta hai; wet mein band hone se passing mushkil hoti hai.' },
    analogy: null,
    quiz: { q: { en: 'When is DRS usually turned off?', hinglish: 'DRS aam taur pe kab band hota hai?' }, options: { en: ['On a wet or unsafe track', 'On the last lap', 'Never'], hinglish: ['Geeli ya unsafe track pe', 'Last lap pe', 'Kabhi nahi'] }, answer: 0, explain: { en: 'Race control disables DRS when it is not safe, for example in heavy rain.', hinglish: 'Unsafe ho (jaise tez baarish) toh race control DRS band kar deta hai.' } },
  },
  {
    id: 'safety_car', title: { en: 'Safety car and VSC', hinglish: 'Safety car aur VSC' },
    beginner: { en: 'After a crash, race control slows everyone down. A safety car leads the pack and bunches it up; a virtual safety car (VSC) makes everyone hold a slower pace. Because the field is slow, a pit stop costs much less time.', hinglish: 'Crash ke baad race control sabko slow kar deta hai. Safety car sabse aage chalti hai aur gaps khatam ho jaate hain; VSC mein sab ek slow pace pe chalte hain. Field slow hai, isliye pit stop sasta pad jaata hai.' },
    expert: { en: 'Neutralisations shrink the pit-loss and erase gaps; teams gamble on whether they last long enough to pit.', hinglish: 'Neutralisation pit-loss ghatata hai aur gaps mitata hai; teams gamble karti hain ki kitni der chalega.' },
    analogy: { en: 'Like a drinks break when the batting side was way ahead: the gap on the field shrinks and the plan resets.', hinglish: 'Jaise drinks break: field pe sab reset, bana hua lead chhota pad jaata hai.' },
    quiz: { q: { en: 'Why do teams like to pit under a safety car or VSC?', hinglish: 'Teams safety car ya VSC mein pit kyun karna pasand karti hain?' }, options: { en: ['Tyres are free then', 'The field is slow, so the stop costs less time', 'They must pit by rule'], hinglish: ['Tab tyres free hote hain', 'Field slow hai, toh stop ka time loss kam hai', 'Rule se pit karna zaroori hai'] }, answer: 1, explain: { en: 'Everyone is slow, so the time lost in the pit lane is smaller.', hinglish: 'Sab slow hain, isliye pit lane mein kam time jaata hai.' } },
  },
  {
    id: 'red_flag', title: { en: 'Red flag', hinglish: 'Red flag' },
    beginner: { en: 'A red flag stops the race. Cars return to the pit lane and wait. Under the rules teams can change tyres and fix small damage while stopped, then the race restarts.', hinglish: 'Red flag matlab race ruk gayi. Cars pit lane mein aakar wait karti hain. Rules ke hisaab se rukne ke dauraan tyre badal sakte hain aur chhoti repair kar sakte hain, phir race restart hoti hai.' },
    expert: { en: 'A red flag gives everyone a free tyre change, which cancels the time paid by anyone who pitted just before it.', hinglish: 'Red flag sabko free tyre change deta hai, toh jisne just pehle pit kiya uska paid time waste.' },
    analogy: { en: 'Like rain stopping a match: everyone gets a reset, and a team that had just spent its review has wasted it.', hinglish: 'Jaise baarish se match ruk jaaye: sabko reset milta hai, aur jisne just pehle review use kiya uska review waste.' },
    quiz: { q: { en: 'During a red flag, can teams change tyres?', hinglish: 'Red flag ke dauraan kya teams tyre badal sakti hain?' }, options: { en: ['Yes, for free', 'Only with a penalty', 'No'], hinglish: ['Haan, free mein', 'Sirf penalty ke saath', 'Nahi'] }, answer: 0, explain: { en: 'Tyre changes are allowed while the race is stopped, so the next stop comes free.', hinglish: 'Race rukne pe tyre change allowed hai, toh agla stop free mil jaata hai.' } },
  },
  {
    id: 'strategy', title: { en: 'Race strategy', hinglish: 'Race strategy' },
    beginner: { en: 'Strategy is the plan for when to stop and which tyres to use. One well-timed decision can gain more places than many overtakes.', hinglish: 'Strategy matlab kab pit karna hai aur kaunse tyre lene hain. Ek sahi timing ka decision kai overtakes se zyada places dila sakta hai.' },
    expert: { en: 'Strategy trades track position against tyre performance and the risk of neutralisations.', hinglish: 'Strategy track position vs tyre performance aur neutralisation ke risk ka trade-off hai.' },
    analogy: { en: 'Like choosing when to take the powerplay: the same overs, but timing changes the result.', hinglish: 'Jaise powerplay kab lena hai: overs wahi, timing se result badal jaata hai.' },
    quiz: { q: { en: 'Two cars stopped under the VSC, then a red flag came. Who benefits most?', hinglish: 'Do cars ne VSC mein stop kiya, phir red flag aa gaya. Sabse zyada fayda kisko?' }, options: { en: ['The cars that stopped', 'The cars that stayed out', 'Nobody'], hinglish: ['Jinhone stop kiya', 'Jo bahar rahe', 'Kisi ko nahi'] }, answer: 1, explain: { en: 'Those who stayed out got their tyre change free in the red flag and kept track position.', hinglish: 'Jo bahar rahe unko red flag mein free tyre change mila aur position bhi bachi.' } },
  },
];

export const CONCEPT = Object.fromEntries(CONCEPTS.map((c) => [c.id, c])) as Record<ConceptId, Concept>;
export const CONCEPT_IDS = CONCEPTS.map((c) => c.id);

/** Initial knowledge from the onboarding answer. Nothing starts as "introduced": that needs an explanation seen here. */
export function startingConcepts(level: Level): Record<ConceptId, KnowState> {
  const known: ConceptId[] = level === 'expert' ? CONCEPT_IDS : level === 'basics' ? ['tyres', 'pit_stop', 'overtaking'] : [];
  return Object.fromEntries(CONCEPT_IDS.map((id) => [id, known.includes(id) ? 'demonstrated' : 'new'])) as Record<ConceptId, KnowState>;
}

/** Seeing an explanation moves new -> introduced. Only a correct check moves a concept to demonstrated. */
export function introduce(p: Profile, ids: ConceptId[]): Profile {
  const concepts = { ...p.concepts };
  for (const id of ids) if (concepts[id] === 'new') concepts[id] = 'introduced';
  return { ...p, concepts };
}

export const depthFor = (p: Profile, ids: ConceptId[]): 'beginner' | 'expert' =>
  ids.length && ids.every((id) => p.concepts[id] === 'demonstrated') ? 'expert' : 'beginner';
