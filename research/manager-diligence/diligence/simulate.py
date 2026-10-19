"""Synthetic manager universes with KNOWN truth (so selection methods can be tested against what is really there). No real fund data is used anywhere."""
import numpy as np

def simulate_managers(n_managers=100, n_months=36, n_skilled=0, skill_sr_annual=0.8, vol_annual=0.08, smooth_fraction=0.0, tdf=None, seed=0):
    """Returns (returns[n_managers, n_months], truth) where truth has 'skilled' (bool), 'smoothed' (bool) and 'true_sr_annual'.
    Skilled managers have a true annual Sharpe of skill_sr_annual, the rest zero. tdf: Student-t degrees of freedom for fat tails (None = normal).
    smooth_fraction: share of managers whose reported returns are a smoothed version (0.6/0.3/0.1 weights on this and the two previous true returns)."""
    rng = np.random.default_rng(seed); vol_m = vol_annual / np.sqrt(12.0)
    skilled = np.zeros(n_managers, bool); skilled[rng.permutation(n_managers)[:n_skilled]] = True
    smoothed = np.zeros(n_managers, bool); smoothed[rng.permutation(n_managers)[:int(round(smooth_fraction * n_managers))]] = True
    mu = np.where(skilled, skill_sr_annual / np.sqrt(12.0) * vol_m, 0.0)
    if tdf is None: z = rng.standard_normal((n_managers, n_months + 2))
    else: z = rng.standard_t(tdf, (n_managers, n_months + 2)) / np.sqrt(tdf / (tdf - 2.0))
    true = mu[:, None] + vol_m * z
    obs = true[:, 2:].copy(); s = smoothed
    if s.any(): obs[s] = 0.6 * true[s, 2:] + 0.3 * true[s, 1:-1] + 0.1 * true[s, :-2]
    return obs, dict(skilled=skilled, smoothed=smoothed, true_sr_annual=np.where(skilled, skill_sr_annual, 0.0))
