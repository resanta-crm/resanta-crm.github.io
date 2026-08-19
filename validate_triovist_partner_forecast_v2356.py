#!/usr/bin/env python3
"""Regression checks for Triovist partner forecast/RZ truth v23.5.6."""
from math import ceil

CHEKHOV_RESERVE = 50

def recommend(partner_forecast, partner_rz, available, orders, own, chekhov):
    # Orders are diagnostic only: free/available stock already reflects them.
    if partner_rz is not None:
        rec = max(0, round(partner_rz))
    elif partner_forecast is not None:
        rec = max(0, ceil(partner_forecast - available - 1e-9))
    else:
        rec = 0
    ship_own = min(rec, max(0, int(own)))
    left = rec - ship_own
    chekhov_available = max(0, int(chekhov) - CHEKHOV_RESERVE)
    order_chekhov = min(left, chekhov_available)
    uncovered = max(0, left - order_chekhov)
    return rec, ship_own, order_chekhov, uncovered

# Real 21vek control row from 19 Aug: forecast 49, free 34, orders 10, RZ 14.
assert recommend(49, 14, 34, 10, 100, 100)[0] == 14
# Orders must never be added again: 49 + 10 - 34 would be 25, which is forbidden.
assert recommend(49, 14, 34, 999, 100, 100)[0] == 14
# If exact RZ is absent, fallback is partner forecast minus available stock.
assert recommend(49, None, 34, 10, 100, 100)[0] == 15
# 21vek RZ=0 remains 0 even when CRM control forecast differs.
assert recommend(23, 0, 191, 2, 100, 100)[0] == 0
# Chekhov first 50 units are never available to recommendation.
assert recommend(120, 80, 0, 0, 0, 50) == (80, 0, 0, 80)
assert recommend(120, 80, 0, 0, 0, 70) == (80, 0, 20, 60)
print('Triovist partner forecast v23.5.6 validation: ok')
