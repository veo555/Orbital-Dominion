# Quant hiring markets: US, UK, Switzerland — what is actually required

> Status: desk research on 2026-10-21 from web search (secondary sources: law-firm blogs, career guides,
> a Federal Register notice, cantonal pages). **Nothing here is legal or career advice. Every number carries a
> "verify" flag: check the official source (USCIS/Federal Register, gov.uk, SEM/canton) before acting.**
> I do not know your nationality or current work authorisation; section 5 branches on that instead of guessing.

## 1. Role taxonomy (what "quant" means to a screener)

| Role | Core evidence screeners look for | Where this repo already gives evidence |
|---|---|---|
| Quant researcher (QR) | Statistical inference under multiple testing, signal research hygiene, written research, maths depth | `research/manager-diligence` (PSR, MinTRL, Deflated Sharpe, stationary bootstrap, Holm/BH, mutation-tested), `docs/EVALUATE.md` (Wilson CI, Bradley–Terry, Elo vs. seeds) |
| Quant developer (QD) | Production-grade code, tests, determinism, performance, CI, clean APIs | Bit-exact deterministic sim, replay hashing, 40+ gate suite, CI, MCP server with bounds/validation |
| Quant strategist / risk quant | Models + explanation to PMs/clients, model risk, validation, documentation | Diligence memos, `docs/career/*`, honest limitations sections |
| Hedge-fund investment professional (e.g. fund selection) | Manager due diligence, performance statistics, reading track records sceptically, communication | `lucky_manager` experiment: how often skill-less managers look skilled |

## 2. Credentials: what the evidence says (verify per firm)

* **Research seats lean to PhD/MSc in a quantitative field**; developer seats accept strong BSc/MSc; proprietary-trading firms are
  reported to be least degree-gated, systematic hedge funds most PhD-heavy. Sources are career blogs with commercial interest;
  firm-level claims are unverified. One concrete data point: a 2026 entry-level researcher posting at Schonfeld accepts BSc/MSc/PhD
  ([openquant](https://openquant.co/job/2026-entry-level-quant-researcher-schonfeld/3181)).
  Also: [applr](https://applr.ai/en/blog/2026-05-08-how-to-break-into-quant-firms-2026),
  [quantt](https://www.quantt.co.uk/resources/how-to-become-a-quant),
  [salary guide](https://www.quantt.co.uk/resources/quant-researcher-salary-guide).
* **Implication:** without a PhD/MSc in maths/stats/physics/CS, the profile must substitute *verifiable artefacts*: reproducible
  research with known-truth simulations, tests that can fail, and public write-ups. That is the design principle of this repo.
  It does **not** replace the degree for PhD-gated seats; the honest path there is an MSc/PhD or a developer/strategist entry.
* Compensation (secondary, unverified): junior total comp roughly $150k–$320k US, £85k–£180k London (same quantt guide).

## 3. Work authorisation by market (verify all)

### United States
* **H-1B** now uses a **wage-weighted selection** (final rule published 2025-12-29, effective 2026-02-27) —
  [Federal Register](https://www.federalregister.gov/documents/2025/12/29/2025-23853/weighted-selection-process-for-registrants-and-petitioners-seeking-to-file-cap-subject-h-1b).
* A **$100,000 payment** applies to new petitions for beneficiaries abroad (not change of status); reported extended to 2027-09-21, legally
  contested ([CalChamber](https://hrcalifornia.calchamber.com/articles/h-1b-visa-updates-new-selection-rules-usd100k-fee-withstands-legal-challenge),
  [Wharton](https://budgetmodel.wharton.upenn.edu/p/2026-08-03-effects-of-the-new-100000-fee-and-wage-weighted-lottery-on-the-h-1b-visa/)).
  Practical effect: a cold application from abroad for a junior seat is expensive for the employer; candidates already in the US (F-1 OPT/STEM OPT) or with TN/E/O-1 eligibility are favoured.
* Alternatives to research with an attorney: O-1A (extraordinary ability — needs a strong public record), TN (Canada/Mexico), E-3 (Australia), F-1 STEM-OPT after a US degree.

### United Kingdom
* **Skilled Worker**: general threshold reported **£41,700** (from 2025-07-22) or the occupation going rate if higher; reduced floors for PhD holders
  (£37,500; £33,400 for a relevant STEM PhD) and new entrants — sources disagree on the new-entrant rule
  ([ep-advisory](https://ep-advisory.com/blog/uk-skilled-worker-visa-salary-threshold/),
  [iasservices](https://iasservices.org.uk/skilled-worker-visa/)). Employer must hold a sponsor licence (large banks/funds do).
* **Global Talent** (not confirmed by my search): research on gov.uk; typically needs an endorsement — unrealistic without a notable public record.
* Graduate route after a UK degree is a common entry path (verify current duration).

### Switzerland
* Third-country nationals: **2026 ceiling 8,500 (4,500 B + 4,000 L)**, kept unchanged by the Federal Council on 2025-11-19
  ([EIG](https://eiglaw.com/switzerland-maintains-work-permit-quotas-for-2026/),
  [Vischer](https://www.vischer.com/insights/quotas-for-foreigners-in-switzerland-in-2026),
  [Zurich canton](https://www.zh.ch/en/wirtschaft-arbeit/erwerbstaetigkeit-auslaender/kontingente.html)).
  The employer must show no suitable Swiss/EU/EFTA candidate (priority rule) and the person must be highly qualified.
* **EU/EFTA citizens**: free movement, no quota — by far the easiest path. UK citizens are a third-country category post-Brexit (separate small quota).
* Typical qualifying offers reported CHF 85k–150k+ (third-party estimate). Languages: English suffices for many buy-side seats; German is a strong plus in Zurich/Pfäffikon.

## 4. What screeners can verify in 5 minutes (the "profile contract")

1. GitHub: pinned repos with CI badge, tests, a methods README, honest limitations; one quant repo + one systems repo.
2. A written research note with a clear claim, a null model, and uncertainty (see `papers/lucky_manager.md`).
3. Reproducibility: one command regenerates every number in the write-up.
4. Hugging Face: dataset + model cards with *limits* sections (screeners distrust inflated claims).
5. LinkedIn headline consistent with the above; no claims the repos do not support.

## 5. Branching plan (fill in once you know your status)

| Your situation | Best first targets |
|---|---|
| EU/EFTA citizen | Switzerland (Zurich/Zug/Geneva funds, LGT-type allocators), London via Skilled Worker with sponsor; no US route needed first |
| UK citizen/settled | London first; Switzerland needs quota |
| Other / needs sponsorship | UK Skilled Worker sponsor-licence firms; a UK/US MSc as bridge; apply to funds with visa track records |

## 6. Honest gap analysis

* Strengths: statistics rigour, determinism/testing culture, quant-finance-specific toolkit, written explanations.
* Gaps a screener will see: no employer-verified quant experience in the repos, no PhD signal, no live-trading/PnL evidence (and none should be
  fabricated), no human-subject study for the game research.
* Fix by: (a) one deeper research note, (b) one derivatives/risk library with textbook-verified tests (`research/quant-lab`),
  (c) openly contributing to a known quant OSS project, (d) interviews drills (`docs/career/INTERVIEW_PREP.md`).
