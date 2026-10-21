"""quant-lab: small, numpy-only reference implementations of core quantitative-finance building blocks,
each tested against textbook values and each test mutation-checked (see tests/run_tests.py --mutants)."""
from . import special, derivatives, risk, garch, portfolio, validation
__version__ = "0.1.0"
