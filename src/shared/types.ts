// Types shared by the data pipeline, the server and the app. Every time `t` is in milliseconds from the replay origin
// (RaceMeta.originUtc). The race data is real OpenF1 history; the replay clock only decides how much of it is visible.

export type Ms = number;
export type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN';
export type Lang = 'hinglish' | 'en';
export type Level = 'new' | 'basics' | 'expert';

export interface Driver { n: number; code: string; name: string; team: string; colour: string }
export interface PosRow { t: Ms; n: number; pos: number }
/** gap to the leader in seconds; null with lapped > 0 when the car is a lap or more down (OpenF1 sends "+1 LAP") */
export interface GapRow { t: Ms; n: number; gap: number | null; lapped: number }
export interface LapRow { t: Ms; n: number; lap: number }
/** underRedFlag: the car went through the pit lane while the race was stopped (free tyre change, not a racing stop) */
export interface PitRow { t: Ms; n: number; lap: number; laneS: number | null; stopS: number | null; underRedFlag: boolean }
export interface Stint { n: number; stint: number; lapStart: number; lapEnd: number; compound: Compound; ageAtStart: number }
export interface ControlRow { t: Ms; lap: number; category: string; flag: string | null; message: string }
export interface WeatherRow { t: Ms; rain: boolean; air: number; track: number; humidity: number }
export interface OvertakeRow { t: Ms; by: number; on: number; pos: number }
/** curated jump points for the demo; the label never names what happens next */
export interface Chapter { id: string; t: Ms; label: string }

export interface RaceMeta {
  sessionKey: number; title: string; circuit: string; year: number;
  originUtc: string; lightsOut: Ms; duration: Ms; totalLaps: number; source: string;
}

/** circuit outline from one clean lap of car location, scaled into a 1000 x 1000 box (y down) */
export interface TrackShape { path: [number, number][]; width: number; height: number }

export interface RaceData {
  meta: RaceMeta; drivers: Driver[]; positions: PosRow[]; gaps: GapRow[]; laps: LapRow[]; pits: PitRow[];
  stints: Stint[]; control: ControlRow[]; weather: WeatherRow[]; overtakes: OvertakeRow[]; track: TrackShape; chapters: Chapter[];
}

/** car location resampled to one frame per stepMs; cars[n] = [x0, y0, x1, y1, ...] in track space, -1 = no signal */
export interface CarFrames { stepMs: number; frames: number; cars: Record<string, number[]> }

// ---- Live state (what a viewer can know at time t) ----

export type TrackStatus = 'green' | 'yellow' | 'vsc' | 'sc' | 'red' | 'chequered' | 'pre';

export interface CarState {
  n: number; pos: number; gap: number | null; lapped: number; interval: number | null;
  lap: number; compound: Compound; tyreAge: number; pits: number; inPit: boolean; gained: number;
}

export interface RaceState {
  t: Ms; lap: number; totalLaps: number; status: TrackStatus; rain: boolean; air: number | null; trackTemp: number | null;
  cars: CarState[]; lastControl: ControlRow | null;
}

// ---- Moments (deterministic detectors) ----

export type MomentType = 'position_gain' | 'pit_stop' | 'safety_car' | 'vsc' | 'red_flag' | 'red_flag_strategy' | 'lead_change' | 'restart';
export type ConceptId = 'tyres' | 'pit_stop' | 'undercut' | 'overtaking' | 'drs' | 'safety_car' | 'red_flag' | 'strategy';

/** one fact behind a moment, so the UI can say why a card appeared */
export interface Evidence { source: 'position' | 'pit' | 'race_control' | 'stints' | 'weather' | 'overtakes' | 'laps'; t: Ms; text: string; kind: 'observed' | 'derived' }

export interface Moment {
  id: string; t: Ms; type: MomentType; lap: number; importance: number; drivers: number[];
  concepts: ConceptId[]; tags: string[]; evidence: Evidence[];
  /** numbers the copy templates fill in, e.g. { from: 17, to: 11 } */
  facts: Record<string, number | string>;
}

// ---- Visualizations (typed contracts between the AI and React) ----

export type VizType = 'positions' | 'tyres' | 'gaps' | 'then_now';
export interface VizRequest { type: VizType; drivers: number[]; historyId?: string }

export interface PositionsViz { type: 'positions'; upToLap: number; series: { n: number; points: [number, number][] }[]; marks: { lap: number; label: string }[] }
export interface TyresViz { type: 'tyres'; upToLap: number; rows: { n: number; stints: { from: number; to: number; compound: Compound; open: boolean }[]; stops: { lap: number; redFlag: boolean }[] }[]; marks: { lap: number; label: string }[] }
export interface GapsViz { type: 'gaps'; t: Ms; series: { n: number; points: [number, number | null][] }[]; note: string }
export interface ThenNowViz { type: 'then_now'; history: HistoryMoment; now: { label: string; value: string }[]; then: { label: string; value: string }[] }
export type VizData = PositionsViz | TyresViz | GapsViz | ThenNowViz;

export interface HistoryMoment {
  id: string; race: string; season: number; title: string; summary: string; tags: string[];
  facts: { label: string; value: string }[]; source: string; why: Record<string, string>;
}

// ---- Companion (cards and answers) ----

export type KnowState = 'new' | 'introduced' | 'demonstrated';
export interface Profile { level: Level; lang: Lang; concepts: Record<ConceptId, KnowState> }

export interface Card {
  id: string; momentId: string | null; t: Ms; kind: 'nudge' | 'answer';
  headline: string; body: string; more: string | null; analogy: string | null;
  /** one line that tells the viewer why this card appeared */
  why: string; viz: VizRequest | null; history: string | null; followups: string[];
  concepts: ConceptId[]; source: 'template' | 'ai' | 'fallback'; quiz: ConceptId | null;
}

export interface AiAnswer {
  headline: string; body: string; more: string; analogy: string | null;
  viz: VizRequest | null; followups: string[]; concepts: ConceptId[]; uncertain: boolean;
}
