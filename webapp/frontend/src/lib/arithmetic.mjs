export const DEFAULT_SETTINGS = {
  duration: 120,
  ops: ['+', '-', '*', '/'],
  add_left_min: 2,
  add_left_max: 100,
  add_right_min: 2,
  add_right_max: 100,
  mul_left_min: 2,
  mul_left_max: 12,
  mul_right_min: 2,
  mul_right_max: 100,
};

const OP_ORDER = ['+', '-', '*', '/'];

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function sanitizeSettings(settings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  };

  const ops = Array.isArray(merged.ops)
    ? merged.ops.filter((op) => OP_ORDER.includes(op))
    : [...DEFAULT_SETTINGS.ops];

  return {
    duration: toNumber(merged.duration, DEFAULT_SETTINGS.duration),
    ops,
    add_left_min: toNumber(merged.add_left_min, DEFAULT_SETTINGS.add_left_min),
    add_left_max: toNumber(merged.add_left_max, DEFAULT_SETTINGS.add_left_max),
    add_right_min: toNumber(merged.add_right_min, DEFAULT_SETTINGS.add_right_min),
    add_right_max: toNumber(merged.add_right_max, DEFAULT_SETTINGS.add_right_max),
    mul_left_min: toNumber(merged.mul_left_min, DEFAULT_SETTINGS.mul_left_min),
    mul_left_max: toNumber(merged.mul_left_max, DEFAULT_SETTINGS.mul_left_max),
    mul_right_min: toNumber(merged.mul_right_min, DEFAULT_SETTINGS.mul_right_min),
    mul_right_max: toNumber(merged.mul_right_max, DEFAULT_SETTINGS.mul_right_max),
  };
}

export function isDefaultSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  const normalized = sanitizeSettings(settings);
  if (normalized.ops.join('|') !== DEFAULT_SETTINGS.ops.join('|')) {
    return false;
  }

  for (const key of [
    'add_left_min',
    'add_left_max',
    'add_right_min',
    'add_right_max',
    'mul_left_min',
    'mul_left_max',
    'mul_right_min',
    'mul_right_max',
  ]) {
    if (normalized[key] !== DEFAULT_SETTINGS[key]) {
      return false;
    }
  }

  return true;
}

function prettyOperator(op) {
  return {
    '+': '+',
    '-': '–',
    '*': '×',
    '/': '÷',
  }[op];
}

function randomNonZero(rng, low, high) {
  if (low === 0 && high === 0) {
    throw new Error('division requires a non-zero divisor range');
  }

  while (true) {
    const value = rng.randint(low, high);
    if (value !== 0) {
      return value;
    }
  }
}

export function generateProblem(settings, rng = null) {
  const config = sanitizeSettings(settings);
  if (!config.ops.length) {
    throw new Error('at least one operation must be enabled');
  }

  const source = rng || {
    choice(values) {
      return values[Math.floor(Math.random() * values.length)];
    },
    randint(low, high) {
      return Math.floor(Math.random() * (high - low + 1)) + low;
    },
  };

  const op = source.choice(config.ops);
  let num1;
  let num2;
  let solution;

  if (op === '+') {
    num1 = source.randint(config.add_left_min, config.add_left_max);
    num2 = source.randint(config.add_right_min, config.add_right_max);
    solution = num1 + num2;
  } else if (op === '-') {
    const first = source.randint(config.add_left_min, config.add_left_max);
    const second = source.randint(config.add_right_min, config.add_right_max);
    num1 = first + second;
    num2 = first;
    solution = second;
  } else if (op === '*') {
    num1 = source.randint(config.mul_left_min, config.mul_left_max);
    num2 = source.randint(config.mul_right_min, config.mul_right_max);
    solution = num1 * num2;
  } else if (op === '/') {
    const divisor = randomNonZero(source, config.mul_left_min, config.mul_left_max);
    const quotient = source.randint(config.mul_right_min, config.mul_right_max);
    num1 = divisor * quotient;
    num2 = divisor;
    solution = quotient;
  } else {
    throw new Error(`unsupported operation: ${op}`);
  }

  return {
    num1,
    num2,
    op,
    solution,
    plain_problem: `${num1} ${op} ${num2}`,
    pretty_problem: `${num1} ${prettyOperator(op)} ${num2}`,
  };
}
