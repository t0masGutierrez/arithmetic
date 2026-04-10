import unittest

from arithmetic import ArithmeticConfigError, generate_problem, normalize_config


class FakeRandom:
    def __init__(self, choice_value, randint_values):
        self.choice_value = choice_value
        self.randint_values = list(randint_values)

    def choice(self, values):
        return self.choice_value

    def randint(self, low, high):
        if not self.randint_values:
            raise AssertionError("no randint values left")
        value = self.randint_values.pop(0)
        if not (low <= value <= high):
            raise AssertionError(f"{value} not in [{low}, {high}]")
        return value


class ArithmeticTests(unittest.TestCase):
    def test_addition_problem_uses_ranges(self):
        rng = FakeRandom("+", [12, 34])
        problem = generate_problem({"ops": ["+"]}, rng=rng)
        self.assertEqual(problem.num1, 12)
        self.assertEqual(problem.num2, 34)
        self.assertEqual(problem.solution, 46)
        self.assertEqual(problem.pretty_problem, "12 + 34")

    def test_subtraction_is_addition_in_reverse_like_zetamac(self):
        rng = FakeRandom("-", [7, 9])
        problem = generate_problem({"ops": ["-"]}, rng=rng)
        self.assertEqual(problem.num1, 16)
        self.assertEqual(problem.num2, 7)
        self.assertEqual(problem.solution, 9)
        self.assertEqual(problem.pretty_problem, "16 – 7")

    def test_division_is_multiplication_in_reverse_like_zetamac(self):
        rng = FakeRandom("/", [4, 6])
        problem = generate_problem({"ops": ["/"]}, rng=rng)
        self.assertEqual(problem.num1, 24)
        self.assertEqual(problem.num2, 4)
        self.assertEqual(problem.solution, 6)
        self.assertEqual(problem.pretty_problem, "24 ÷ 4")

    def test_normalize_config_supports_legacy_field_names(self):
        config = normalize_config(
            {
                "ops": ["+"],
                "add_low1": 3,
                "add_high1": 5,
                "add_low2": 7,
                "add_high2": 9,
            }
        )
        self.assertEqual(config["add_left_min"], 3)
        self.assertEqual(config["add_left_max"], 5)
        self.assertEqual(config["add_right_min"], 7)
        self.assertEqual(config["add_right_max"], 9)

    def test_requires_at_least_one_operation(self):
        with self.assertRaises(ArithmeticConfigError):
            normalize_config({"ops": []})


if __name__ == "__main__":
    unittest.main()
