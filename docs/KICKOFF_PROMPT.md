# Kickoff prompt for the coding environment

> **Update 6 Oct 2026 (3.1):** parts of the work plan below are already done, **in Chromium emulation only** — step 2 (touch UX, responsive HUD, lifecycle; not save/resume), part of step 3
> (adaptive quality, battery tier) and step 4's accessibility/haptics items, plus web release plumbing and optional web payments. Still open and still the first thing to do on real hardware: **step 1
> (the S0 device spike)**, save/resume, the tutorial and the store work. Start from `README.md` §0 and `docs/BACKLOG.md` ("Status after 3.1"). The rule "no real-money features" is superseded for the
> web builds by `docs/MONETIZATION.md` (in-game currency is still never sold).

Open the extracted folder as the repository root in your coding environment (Claude Code, Cursor, VS Code + an agent,
etc.), make the first commit, and paste the prompt below. It is written so an agent that has never seen the project can
start productively and will not make the mistakes already made once.

---

```text
You are taking over "Orbital Dominion v3", a canvas-based RTS shipped today as ONE standalone HTML file, and your job
is to take it to Google Play and the Apple App Store with a measurable quality bar (not "perfect").

READ FIRST, in this order: CLAUDE.md, README.md, docs/STORE_RELEASE_ROADMAP.md, docs/ARCHITECTURE.md,
docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md, docs/BACKLOG.md, docs/QA_CHECKLIST.md.

STEP 0 — verify the baseline before changing anything:
  python3 build.py && bash tests/run_all.sh
  Both gates must pass (sim smoke ~1 min, browser smoke ~40 s; needs `pip install playwright` + a Chromium).
  Then confirm dist/orbital_dominion_v4.html is byte-identical to a fresh build (git diff should be empty).

RULES
  * Keep zero network requests and zero console errors (the browser gate asserts it).
  * Simulation modules (00,10,20,25,26,27,30,40) stay free of DOM/canvas/audio and headless-testable.
  * Never use Math.random in sim code (use G.rng / S.rng) — new code only; migrating old calls is BACKLOG B-20.
  * Balance changes need >=24 paired seeds (tools/ab.sh); never trust a single match.
  * The Overseer is a rule-based system. Do not describe it as a language model in any user-facing text.
  * No real-money / token / wagering features. All currency is virtual.
  * Commit small, run tests/run_all.sh before each commit, keep BACKLOG.md statuses current.

WORK PLAN (do in this order; stop and report at each gate)
  1. Spike S0 (BACKLOG P-01, M-10): wrap with Capacitor (read its current support-policy page for Xcode / Android Studio /
     minSdk first), run on >=3 real devices, record frame time p50/p95, memory, start-up, battery, audio behaviour in
     docs/DEVICE_RESULTS.md. Report the numbers and recommend Option A (keep Canvas 2D) or D (WebGL renderer).
  2. Mobile UX (M-01..M-09): Pointer Events layer, gesture scheme, on-screen controls, responsive HUD (replace the TOPBAR/
     BOTTOM constants), touch-friendly panels, lifecycle + resume. Keep the desktop path working and the data-act contracts.
  3. Performance and stability (P-02..P-08, B-20, B-22, B-24).
  4. Tutorial and polish (F-01, F-03, F-05).
  5. Store work (S-01..S-07) with the QA checklist.
  At every step update docs, add or extend tests, and tell me what you did NOT verify.

DELIVERABLE FOR THE FIRST SESSION: step 0 results, the S0 plan (or results if devices are available), and a concrete
touch-gesture spec for M-02 as docs/TOUCH_SPEC.md for my review before you implement it.
```

---

## Notes for the human

* The first things only you can do: create the developer accounts (BACKLOG S-01), pick the real app name and bundle ID
  after a trademark/store-name search (S-02), and get 3 real test devices in your hands.
* Ask the agent to quote numbers (frame times, memory, pass/fail counts) rather than adjectives.
* If you use a different wrapper or engine than Capacitor, keep `src/js/00…40` as the headless simulation core —
  it is the most valuable and most thoroughly tested part.
