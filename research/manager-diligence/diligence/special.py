"""Small special functions (normal, Student t, chi-square) in pure Python + math, so the package needs only numpy.
Accuracy ~1e-9 for the ranges used here; tested against known values in tests/test_special.py."""
import math

def norm_cdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2.0))

def norm_sf(x):
    return 0.5 * math.erfc(x / math.sqrt(2.0))

def norm_ppf(p):
    """Inverse normal CDF (Acklam's algorithm refined with one Halley step)."""
    if not 0.0 < p < 1.0:
        if p == 0.0: return -math.inf
        if p == 1.0: return math.inf
        raise ValueError("p must be in [0,1]")
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p)); x = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    elif p <= 1 - pl:
        q = p - 0.5; r = q*q; x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
    else:
        q = math.sqrt(-2 * math.log(1 - p)); x = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    e = norm_cdf(x) - p
    u = e * math.sqrt(2 * math.pi) * math.exp(x * x / 2)
    return x - u / (1 + x * u / 2)

def _betacf(a, b, x, itmax=300, eps=3e-14):
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1e-300 if abs(d) < 1e-300 else d
    d = 1.0 / d; h = d
    for m in range(1, itmax + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d; d = 1e-300 if abs(d) < 1e-300 else d
        c = 1.0 + aa / c; c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d; h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d; d = 1e-300 if abs(d) < 1e-300 else d
        c = 1.0 + aa / c; c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d; delta = d * c; h *= delta
        if abs(delta - 1.0) < eps: break
    return h

def betainc(a, b, x):
    """Regularised incomplete beta I_x(a, b)."""
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(lbeta + a * math.log(x) + b * math.log(1 - x))
    if x < (a + 1) / (a + b + 2):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1 - x) / b

def t_sf(t, df):
    """P(T > t) for Student t with df degrees of freedom."""
    x = df / (df + t * t); p = 0.5 * betainc(df / 2.0, 0.5, x)
    return p if t > 0 else 1.0 - p

def t_two_sided_p(t, df):
    return 2.0 * t_sf(abs(t), df)

def gammainc_upper(a, x):
    """Regularised upper incomplete gamma Q(a, x)."""
    if x <= 0: return 1.0
    if x < a + 1:   # series for P
        ap, s, term = a, 1.0 / a, 1.0 / a
        for _ in range(1000):
            ap += 1; term *= x / ap; s += term
            if abs(term) < abs(s) * 1e-15: break
        return 1.0 - s * math.exp(-x + a * math.log(x) - math.lgamma(a))
    b, c, d = x + 1 - a, 1e300, 1.0 / (x + 1 - a); h = d   # continued fraction for Q
    for i in range(1, 1000):
        an = -i * (i - a); b += 2
        d = an * d + b; d = 1e-300 if abs(d) < 1e-300 else d
        c = b + an / c; c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d; delta = d * c; h *= delta
        if abs(delta - 1) < 1e-15: break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h

def chi2_sf(x, df):
    return gammainc_upper(df / 2.0, x / 2.0)
