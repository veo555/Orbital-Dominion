# Profile setup checklist (GitHub does not let anyone but you change these)

1. **Bio:** github.com -> your avatar -> Your profile -> Edit profile -> Bio (160 characters max). Suggested:
   `Quant researcher · stochastics, statistics, multi-agent systems · building Orbital Dominion, an open RTS testbed for game AI`
   Optional: Location, Website, Pronouns. Leave empty anything you want private.
2. **Split manager-diligence into its own repo** (so it can be pinned). In a clone of Orbital-Dominion:
   ```
   git subtree split -P research/manager-diligence -b manager-diligence-only
   # create an EMPTY public repo github.com/veo555/manager-diligence (no README), then:
   git push https://github.com/veo555/manager-diligence.git manager-diligence-only:main
   ```
   Add the description `Selection-bias-aware statistics for hedge fund manager track records (PSR, deflated Sharpe, bootstrap, Newey-West, BH)` and topics `quantitative-finance hedge-funds sharpe-ratio multiple-testing backtesting due-diligence python numpy`.
3. **Pin two repos:** profile -> Customize your pins -> tick only `manager-diligence` and `Orbital-Dominion` -> Save.
4. **Profile README:** create a new PUBLIC repository named exactly `veo555` (same as your username), tick "Add a README file", paste `PROFILE_README.md` (without the HTML comment), commit.
5. **Optional clean-up:** Settings -> your forked repos you do not use: archive them, or make them private (Settings -> Danger Zone -> Change visibility). Archiving keeps them but marks them inactive.
6. **Check:** open your profile in a private window and read it as a stranger would.
