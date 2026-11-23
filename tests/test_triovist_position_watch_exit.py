"""Offline contract tests for the 21vek competitor position watch result.

Extract the pure decision function from the real worker without importing
requests or creating any Supabase/21vek connections.
"""

import ast
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "triovist_21vek_competitor_positions.py"


def load_completion_exit_code():
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"), filename=str(SCRIPT))
    candidates = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "completion_exit_code"
    ]
    if len(candidates) != 1:
        raise AssertionError("Expected exactly one completion_exit_code function")
    module = ast.fix_missing_locations(ast.Module(body=candidates, type_ignores=[]))
    namespace = {}
    exec(compile(module, str(SCRIPT), "exec"), namespace)
    return namespace["completion_exit_code"]


class PositionWatchResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exit_code = staticmethod(load_completion_exit_code())

    def test_complete_remains_successful(self):
        self.assertEqual(self.exit_code("complete"), 0)

    def test_partial_is_visible_as_failure_in_actions(self):
        self.assertEqual(self.exit_code("partial"), 1)

    def test_failed_is_distinct_nonzero(self):
        self.assertEqual(self.exit_code("failed"), 2)

    def test_unknown_status_must_not_pass(self):
        self.assertNotEqual(self.exit_code("unexpected"), 0)


if __name__ == "__main__":
    unittest.main()
