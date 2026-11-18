# Demo script (about 4 minutes)

Before you start: run `npm run dev` (or open the deployed URL) on a laptop. Keep a phone on the same network. If no phone is available, select **No phone? Preview here** on the pairing card. Turn the sound on: the TV speaks the commentary.

## Scene 1: the connection (30 s)

1. On the laptop, select **Start the watch party**. The broadcast replay opens, labelled REPLAY · HISTORICAL DATA.
2. Scan the QR code with the phone. The TV changes to "1 phone in sync".
3. On the phone, select **New to F1**, then **Continue**, then **Hinglish**.
4. On the TV, select the **Lap 27** chapter. The phone's lap and leaders change at the same moment. Select **Lights out** to go back.

*Say:* "One server clock drives both screens. The phone never keeps its own time."

## Scene 2: the comeback (60 s)

1. Set the speed to **10×** and press **Play**.
2. On lap 1, a card arrives: **VER ka jump: P17 → P12**. Point at the line above the headline: it says why the card appeared ("Bada moment · aapke liye naya concept · lap 1").
3. Open the position chart. Touch it to see the exact position on each lap.
4. Around lap 10, a second card arrives: **VER: start se P17 → P7**.
5. Tap **Itne places kaise gain kiye?** The chart shows at once, and the AI answer follows.

*Say:* "The chart is drawn from timing data. The AI only explains it."

## Scene 3: the strategic turning point (60 s)

1. Select the **Lap 27** chapter. Keep 10×.
2. The VSC card arrives, then the pit-window card: the leaders stop as the VSC ends.
3. On lap 32, the **red flag** card arrives with a cricket analogy (rain stops the match) and a quick check.
4. Tap **Red flag se strategy kyun badli?** The answer explains the free tyre change in the red flag. The tyre timeline shows OCO, VER and GAS on 32-lap stints, and NOR and RUS with a stop on lap 28.
5. Type **Kaun jeetega?** The answer is "Spoiler nahi milega" and gives only the current state.

*Say:* "The model only gets what is known at this second of the replay. A test proves it."

## Scene 4: the historical connection (45 s)

1. Select the **Lap 42** chapter and play.
2. On lap 43, **VER ne OCO se lead le li**. The card shows **Then vs Now**: Interlagos 2016 in the rain, with its source link.
3. Answer the quick check. Open the book icon at the top: the concept is now *Samajh gaye* (understood).
4. Type **Overtaking kya hota hai?** The answer is the short, expert version now, because the fan has shown they understand it. Overtaking cards also need more importance to appear from now on.

## Scene 5: reliability (45 s)

1. Pause on the TV. The phone shows PAUSED.
2. Seek back to **Lap 31**. The red-flag and lead-change cards disappear from the phone, because they are in the future now.
3. Play through the red flag again. No duplicate card arrives.
4. Close the phone tab, or turn on airplane mode for a few seconds, then reopen. The phone reconnects and shows the same moment as the TV.

*Say:* "Pause, seek, reconnect: the state comes from the server, so the screens cannot drift."

## Backup

- If the AI key is rate-limited, answers still arrive marked "data-only". The charts are the same.
- `npm test` runs the sync and spoiler tests in about 10 seconds. Show it if you are asked how reliability is checked.
