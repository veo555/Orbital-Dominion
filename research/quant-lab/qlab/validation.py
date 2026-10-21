"""Backtest-overfitting diagnostics: Probability of Backtest Overfitting via CSCV (Bailey, Borwein, Lopez de Prado,
Zhu 2017) and purged K-fold splits with embargo (Lopez de Prado 2018)."""
import itertools
import numpy as np

def pbo_cscv(M, n_slices=8, rank_fn=None):
    """M: T x N matrix of returns (N strategy variants). Split rows into n_slices blocks; for every choice of
    n_slices/2 blocks as in-sample, pick the best in-sample variant and record the logit of its out-of-sample
    relative rank. PBO = share of splits with logit <= 0 (the IS winner is at/below the OOS median)."""
    M = np.asarray(M, float); T, N = M.shape
    blocks = np.array_split(np.arange(T), n_slices)
    score = rank_fn or (lambda X: X.mean(axis=0) / (X.std(axis=0, ddof=1) + 1e-12))
    logits = []
    for ins in itertools.combinations(range(n_slices), n_slices // 2):
        oos = [b for b in range(n_slices) if b not in ins]
        I = np.concatenate([blocks[b] for b in ins]); O = np.concatenate([blocks[b] for b in oos])
        best = int(np.argmax(score(M[I])))
        so = score(M[O]); rank = (so < so[best]).sum() + 1  # 1..N
        w = rank / (N + 1.0)
        logits.append(np.log(w / (1 - w)))
    logits = np.array(logits)
    return float((logits <= 0).mean()), logits

def purged_kfold(n, k=5, embargo=0, label_horizon=0):
    """Yield (train_idx, test_idx). Train drops samples within `label_horizon` before each test fold (their labels
    overlap the test period) and `embargo` samples after it."""
    folds = np.array_split(np.arange(n), k)
    for te in folds:
        lo, hi = te[0], te[-1]
        mask = np.ones(n, bool)
        mask[max(0, lo - label_horizon):min(n, hi + 1 + embargo)] = False
        yield np.where(mask)[0], te
