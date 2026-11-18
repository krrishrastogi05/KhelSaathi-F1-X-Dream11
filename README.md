# Khel Saathi

**The race is on one screen. Understanding is on the other.**

**Live:** [khel-saathi.vercel.app](https://khel-saathi.vercel.app) (app and landing page) · API on Render: `khel-saathi.onrender.com` (free plan: the first request after 15 idle minutes takes about 50 s) · [Demo video](https://khel-saathi.vercel.app/demo/khel-saathi-demo.mp4)

Khel Saathi is a second-screen AI companion for fans who watch a sport for the first time. The TV shows the match. The phone follows the same moment, tells the fan what just happened and why it matters, answers questions with live charts, and learns what the fan already knows.

This proof of concept uses Formula 1: a replay of the **2024 São Paulo Grand Prix** built from real [OpenF1](https://openf1.org) timing data. The race has rain, a virtual safety car, a safety car, a red flag, and Max Verstappen climbing from 17th on the grid. That gives a new fan a lot to learn.

> Unofficial fan prototype. It is not affiliated with Formula 1, FOM or Dream11. The replay is labelled as a replay: a simulated clock plays real historical data.

## What it does

| Feature | What the evaluator sees |
|---|---|
| **Synchronized replay** | The desktop is a full-screen broadcast: the circuit with every car, a lap bug, a slim top-10 tower, one lower third at a time, rain when it rains, and player controls that hide while you watch. Scan the QR code and the phone joins the same clock. Pause, seek or change speed on the TV, and the phone follows. |
| **TV commentary** | Big moments get a spoken English commentary line (a British voice when the browser has one) with a subtitle. It is fast and full of references, like real F1 commentary. That is the problem: the phone explains it. |
| **Event intelligence** | Deterministic detectors find position gains, pit windows, VSC, safety car, red flag, the red-flag strategy swing and lead changes. A nudge gate decides which moments become a card on the phone, so the fan is not spammed. |
| **Context-aware AI** | Ask anything: "Why did the red flag change the strategy?" The chart appears at once. The AI answer follows, grounded in a context packet that holds only what is known at the current replay time. |
| **Four live charts** | Position evolution, tyre strategy timeline, gap to the leader, and Then vs Now. Every number comes from the data, never from the model. Charts follow every seek. |
| **Adaptive learning** | Onboarding asks the fan's level and language (Hinglish or English). Eight F1 concepts move from *new* to *introduced* (explanation seen) to *understood* (a correct quick check). Explanations get shorter and nudges get rarer as the fan learns. |
| **Verified history** | When the evidence is strong, a card compares the moment with a checked historical race (for example, Verstappen in the Interlagos rain in 2016), with a source link. |
| **No spoilers** | The AI, the charts, the cards and the cache only see the race up to the current replay time. "Who wins?" gets a polite no. Tests prove this. |

## Run it

You need Node.js 20 or later.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5197 and select **Start the watch party**. To pair a real phone, connect the phone to the same Wi-Fi and scan the QR code. On localhost the server gives the QR code your LAN address. Without a phone, select **No phone? Preview here** on the pairing card: the companion docks on the right of the TV page. Add `?phone=1` to a TV URL to open it docked.

The AI is optional. Copy `.env.example` to `.env` and add a Cerebras or Groq key (any OpenAI-compatible endpoint works). Without a key, every answer comes from the deterministic fallback, and the card says so.

| Command | What it does |
|---|---|
| `npm run dev` | API on :8797 and Vite on :5197 (Vite sends `/api` to the API) |
| `npm run build` then `npm start` | One service on one port: app, API and SSE stream |
| `npm test` | 35 tests: detectors, race state, nudge gate, no-spoiler guarantee, sync over real HTTP and SSE |
| `npm run typecheck` | TypeScript, strict, frontend and backend |
| `npm run data` | Download the race from OpenF1 again and rebuild `data/race.json` and `data/cars.json` |

The demo script is in [DEMO.md](DEMO.md). A recorded run of it, with voiced commentary, is in [demo/khel-saathi-demo.mp4](demo/khel-saathi-demo.mp4). The architecture is in [TECHNICAL.md](TECHNICAL.md).

**Design.** It is a consumer product, not a dashboard: one thing at a time. The TV keeps the race full-screen with small broadcast graphics. The phone shows one moment as a big card, with earlier moments in a short list; charts open in a sheet only when the fan taps **Show me**.

## Deploy

The repo has a Render blueprint ([render.yaml](render.yaml)). It runs one web service: build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`. Set `LLM_API_KEY` (and `LLM2_API_KEY` for failover) in the dashboard. Set `PUBLIC_URL` to the service URL so the QR code points there.

Any host that runs Node and keeps a connection open for Server-Sent Events works the same way. Use one instance, because session state is in memory (see *Limitations*).

## Engineering decisions

1. **Deterministic for facts, AI for interpretation.** Detectors, race state, charts and history matching are plain functions over the data. The model only explains, adapts depth and language, and picks a chart type. It cannot invent a number, because it never draws one.
2. **One server clock per session.** The clock is stored as `(base t, wall time, playing, speed)`, so the current time is computed, not ticked. It cannot drift, and a server restart resumes the same moment. TV and phones only render it.
3. **SSE, not WebSockets.** Sync is one-way (server to screens). Controls are plain POST requests. SSE reconnects by itself, works through proxies, and needs no library.
4. **State-based sync.** Every connection starts with a full snapshot, so a reconnect is a new connect. Messages carry a sequence number (drop old ones) and a clock version that goes up on every play, pause, seek or speed change (drop ticks from before a seek, resync on a version the client missed). A client watchdog reconnects when the stream goes silent for 5 seconds, which catches dead connections that a proxy keeps open.
5. **Template first, AI on demand.** Nudge cards appear at once from templates filled with computed facts. The model is called only when the fan taps *Explain more* or asks something. This keeps cards instant and the API bill small.
6. **Instant chart, async answer.** A question gets its chart from deterministic intent detection immediately. The AI text follows in about a second, or the fallback after a 9-second timeout.
7. **No-spoiler by construction and by test.** All reads go through `stateAt(t)` and `m.t <= t`. A test cuts the race data at time T and checks that the context packet and every chart are identical with and without the future data. Spoiler questions skip the model. Answers that describe an ending are dropped. The cache key includes the lap and the latest visible moment, so a seek back never reuses a later answer.
8. **Tag matching for history, not a vector store.** Two curated, sourced entries. A match needs three shared tags. A weak match shows nothing.
9. **Nothing heavy.** No database, queue, vector store, auth or framework server. Four runtime dependencies: React, zustand, qrcode and tsx.

## Observed, derived, estimated

| Kind | Examples |
|---|---|
| **Observed** (OpenF1 as given) | Positions, gaps to the leader, laps, pit entries, tyre stints, race-control messages, weather, car location |
| **Derived** (computed here, deterministic) | Track status timeline, position bursts, pit windows, "cheap" stops under VSC or SC, red-flag strategy split, lead changes, wet-track flag, places gained |
| **Estimated** | The track status after the rolling restart (the safety car is taken to peel off at the end of that lap). Car positions between 1 Hz samples (interpolated) |
| **Interpretation** | The AI's explanation text and the cricket analogies. The card always shows its source: template, AI or fallback |

## Limitations

- **Replay, not live.** OpenF1 live data needs a paid plan. The architecture does not change for live: the data pipeline becomes a poller, and the clock follows the feed instead of the replay.
- **One instance.** Sessions live in memory and in a JSON file. For more instances, move sessions to Redis and fan out ticks with Redis pub/sub.
- **One race, eight concepts, two history entries.** That is enough for the demo. The concept pack and the history list are data, so they grow without code changes.
- **No video.** The broadcast is drawn from data. The real product sits beside the fan's own TV or stream. The FanCode stream timestamp would replace the replay clock.
- **Detector scope.** Undercuts and DRS have concept cards, but there are no detectors for them in this wet race, because DRS was disabled and there were no dry pit cycles.

## Beyond F1: the multi-sport vision

Nothing in the companion is F1-specific except two pieces of data:

1. **A sport adapter**: the pipeline that turns a feed into time-stamped rows (`scripts/fetch-race.ts` for OpenF1).
2. **A concept pack**: the eight concepts, quick checks and analogies (`src/shared/concepts.ts`).

The clock, sync, gate, AI harness, no-spoiler rules and charts stay the same. A cricket adapter (ball-by-ball data) would use the same detector pattern for collapses, partnerships and DLS changes. It would teach a new fan through the sport they already know. The same engine could give context to Dream11's AI co-hosts and run beside FanCode streams.
