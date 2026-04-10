from __future__ import annotations

from dataclasses import asdict, dataclass
import random
import time
from typing import Any

DEFAULT_CONFIG: dict[str, Any] = {
    "duration": 120,
    "ops": ["+", "-", "*", "/"],
    "add_left_min": 2,
    "add_left_max": 100,
    "add_right_min": 2,
    "add_right_max": 100,
    "mul_left_min": 2,
    "mul_left_max": 12,
    "mul_right_min": 2,
    "mul_right_max": 100,
}

RANGE_FIELDS = (
    "add_left_min",
    "add_left_max",
    "add_right_min",
    "add_right_max",
    "mul_left_min",
    "mul_left_max",
    "mul_right_min",
    "mul_right_max",
)

RANGE_PAIRS = (
    ("add_left_min", "add_left_max"),
    ("add_right_min", "add_right_max"),
    ("mul_left_min", "mul_left_max"),
    ("mul_right_min", "mul_right_max"),
)

CONFIG_ALIASES = {
    "add_low1": "add_left_min",
    "add_high1": "add_left_max",
    "add_low2": "add_right_min",
    "add_high2": "add_right_max",
    "multiply_low1": "mul_left_min",
    "multiply_high1": "mul_left_max",
    "multiply_low2": "mul_right_min",
    "multiply_high2": "mul_right_max",
}

BOOLEAN_OP_FIELDS = {
    "add": "+",
    "sub": "-",
    "mul": "*",
    "div": "/",
}


@dataclass(frozen=True)
class Problem:
    num1: int
    num2: int
    op: str
    solution: int
    pretty_problem: str
    plain_problem: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ArithmeticConfigError(ValueError):
    pass


def _coerce_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ArithmeticConfigError(f"{field_name} must be an integer") from exc


def normalize_config(config: dict[str, Any] | None = None) -> dict[str, Any]:
    incoming = dict(config or {})

    for old_key, new_key in CONFIG_ALIASES.items():
        if old_key in incoming and new_key not in incoming:
            incoming[new_key] = incoming[old_key]

    normalized = dict(DEFAULT_CONFIG)
    normalized.update(incoming)

    if "ops" in incoming:
        raw_ops = incoming.get("ops") or []
    else:
        raw_ops = [
            symbol
            for field_name, symbol in BOOLEAN_OP_FIELDS.items()
            if normalized.get(field_name, symbol in DEFAULT_CONFIG["ops"])
        ]

    normalized["ops"] = [op for op in raw_ops if op in {"+", "-", "*", "/"}]
    if not normalized["ops"]:
        raise ArithmeticConfigError("at least one operation must be enabled")

    normalized["duration"] = _coerce_int(normalized["duration"], "duration")
    if normalized["duration"] <= 0:
        raise ArithmeticConfigError("duration must be positive")

    for field in RANGE_FIELDS:
        normalized[field] = _coerce_int(normalized[field], field)

    for low_key, high_key in RANGE_PAIRS:
        if normalized[low_key] > normalized[high_key]:
            raise ArithmeticConfigError(f"{low_key} cannot be greater than {high_key}")

    if "/" in normalized["ops"] and normalized["mul_left_min"] <= 0 <= normalized["mul_left_max"]:
        if normalized["mul_left_min"] == normalized["mul_left_max"] == 0:
            raise ArithmeticConfigError("division requires a non-zero multiplication left range")

    return normalized


def _pretty_operator(op: str) -> str:
    return {
        "+": "+",
        "-": "–",
        "*": "×",
        "/": "÷",
    }[op]


def _random_nonzero(randint_func, low: int, high: int) -> int:
    if low == high == 0:
        raise ArithmeticConfigError("range cannot be only zero")
    while True:
        value = randint_func(low, high)
        if value != 0:
            return value


def generate_problem(config: dict[str, Any] | None = None, rng: Any | None = None) -> Problem:
    normalized = normalize_config(config)
    rng = rng or random
    op = rng.choice(normalized["ops"])

    if op == "+":
        num1 = rng.randint(normalized["add_left_min"], normalized["add_left_max"])
        num2 = rng.randint(normalized["add_right_min"], normalized["add_right_max"])
        solution = num1 + num2
    elif op == "-":
        first = rng.randint(normalized["add_left_min"], normalized["add_left_max"])
        second = rng.randint(normalized["add_right_min"], normalized["add_right_max"])
        num1 = first + second
        num2 = first
        solution = second
    elif op == "*":
        num1 = rng.randint(normalized["mul_left_min"], normalized["mul_left_max"])
        num2 = rng.randint(normalized["mul_right_min"], normalized["mul_right_max"])
        solution = num1 * num2
    elif op == "/":
        divisor = _random_nonzero(rng.randint, normalized["mul_left_min"], normalized["mul_left_max"])
        quotient = rng.randint(normalized["mul_right_min"], normalized["mul_right_max"])
        num1 = divisor * quotient
        num2 = divisor
        solution = quotient
    else:
        raise ArithmeticConfigError(f"unsupported operation: {op}")

    plain_problem = f"{num1} {op} {num2}"
    pretty_problem = f"{num1} {_pretty_operator(op)} {num2}"
    return Problem(
        num1=num1,
        num2=num2,
        op=op,
        solution=solution,
        plain_problem=plain_problem,
        pretty_problem=pretty_problem,
    )


def play_game(config: dict[str, Any] | None = None) -> int:
    normalized = normalize_config(config)
    deadline = time.time() + normalized["duration"]
    score = 0

    while time.time() < deadline:
        problem = generate_problem(normalized)
        answer = input(f"{problem.plain_problem} = ")
        while answer.strip() != str(problem.solution) and time.time() < deadline:
            answer = input(f"{problem.plain_problem} = ")
        if answer.strip() == str(problem.solution):
            score += 1

    print(f"score: {score}")
    return score


def main() -> None:
    seconds = input("time (s): ").strip()
    duration = int(seconds) if seconds else DEFAULT_CONFIG["duration"]
    play_game({"duration": duration})


if __name__ == "__main__":
    main()
