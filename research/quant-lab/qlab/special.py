import math
import numpy as np

_erf = np.vectorize(math.erf, otypes=[float])

def norm_cdf(x):
    x = np.asarray(x, dtype=float)
    return 0.5 * (1.0 + _erf(x / math.sqrt(2.0)))

def norm_pdf(x):
    x = np.asarray(x, dtype=float)
    return np.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def chi2_sf_df1(x):
    """P(chi2_1 > x) = erfc(sqrt(x/2))."""
    return math.erfc(math.sqrt(max(x, 0.0) / 2.0))
