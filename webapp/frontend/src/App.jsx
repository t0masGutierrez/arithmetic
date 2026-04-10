import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  DEFAULT_SETTINGS,
  generateProblem,
  sanitizeSettings,
} from "./lib/arithmetic.mjs";

const DURATION_OPTIONS = [30, 60, 120, 300, 600];
const OP_ORDER = ["+", "-", "*", "/"];

function validateConfig(config) {
  if (!config.ops.length) {
    throw new Error("Enable at least one operation.");
  }

  const ranges = [
    ["addition left", config.add_left_min, config.add_left_max],
    ["addition right", config.add_right_min, config.add_right_max],
    ["multiplication left", config.mul_left_min, config.mul_left_max],
    ["multiplication right", config.mul_right_min, config.mul_right_max],
  ];

  for (const [label, low, high] of ranges) {
    if (low > high) {
      throw new Error(`${label} minimum cannot be greater than maximum.`);
    }
  }

  if (config.duration <= 0) {
    throw new Error("Duration must be positive.");
  }
}

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState("settings");
  const [activeConfig, setActiveConfig] = useState(null);
  const [problem, setProblem] = useState(null);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.duration);
  const [error, setError] = useState("");

  const deadlineRef = useRef(null);
  const inputRef = useRef(null);
  const scoreRef = useRef(0);
  const activeConfigRef = useRef(null);
  const finishingRef = useRef(false);

  const selectedOps = useMemo(() => new Set(settings.ops), [settings.ops]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    activeConfigRef.current = activeConfig;
  }, [activeConfig]);

  useEffect(() => {
    if (phase !== "playing") {
      return undefined;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });

    const tick = () => {
      if (!deadlineRef.current) {
        return;
      }
      const secondsRemaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeLeft(secondsRemaining);
      if (secondsRemaining <= 0) {
        finishGame();
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const fetchProblem = (config) => {
    const nextProblem = generateProblem(config);
    setProblem(nextProblem);
    setAnswer("");
  };

  const finishGame = () => {
    if (finishingRef.current) {
      return;
    }

    finishingRef.current = true;
    setPhase("finished");
    setTimeLeft(0);
    finishingRef.current = false;
  };

  const startGame = () => {
    finishingRef.current = false;

    try {
      const config = sanitizeSettings(settings);
      validateConfig(config);
      setError("");
      setScore(0);
      setProblem(null);
      setActiveConfig(config);
      setPhase("playing");
      deadlineRef.current = Date.now() + config.duration * 1000;
      setTimeLeft(config.duration);
      fetchProblem(config);
    } catch (err) {
      setPhase("settings");
      setError(err.message || "Could not start game.");
    }
  };

  const restartGame = (event) => {
    event.preventDefault();
    if (!activeConfigRef.current) {
      setPhase("settings");
      return;
    }

    finishingRef.current = false;
    setError("");
    setScore(0);
    setProblem(null);
    setPhase("playing");
    deadlineRef.current = Date.now() + activeConfigRef.current.duration * 1000;
    setTimeLeft(activeConfigRef.current.duration);
    fetchProblem(activeConfigRef.current);
  };

  const goToSettings = () => {
    setPhase("settings");
    setProblem(null);
    setAnswer("");
    setTimeLeft(DEFAULT_SETTINGS.duration);
    setError("");
  };

  const updateNumericSetting = (name, value) => {
    setSettings((current) => ({
      ...current,
      [name]: value === "" ? "" : Number(value),
    }));
  };

  const toggleOperation = (op) => {
    setSettings((current) => ({
      ...current,
      ops: current.ops.includes(op)
        ? current.ops.filter((entry) => entry !== op)
        : [...current.ops, op].sort((a, b) => OP_ORDER.indexOf(a) - OP_ORDER.indexOf(b)),
    }));
  };

  const handleAnswerChange = (event) => {
    const value = event.target.value;
    setAnswer(value);

    if (phase !== "playing" || !problem) {
      return;
    }

    if (value.trim() !== String(problem.solution)) {
      return;
    }

    setScore((current) => current + 1);

    try {
      fetchProblem(activeConfigRef.current);
    } catch (err) {
      finishGame();
      setError(err.message || "Could not load the next problem.");
    }
  };

  return phase === "settings" ? (
    <div id="welcome-wrap">
      <div id="welcome">
        <h1>Arithmetic Game</h1>

        <dl>
          <dt>
            <label>
              <input
                type="checkbox"
                checked={selectedOps.has("+")}
                onChange={() => toggleOperation("+")}
              />{" "}
              Addition
            </label>
          </dt>
          <dd>
            Range: (
            <input
              type="text"
              value={settings.add_left_min}
              onChange={(event) => updateNumericSetting("add_left_min", event.target.value)}
            />
            to
            <input
              type="text"
              value={settings.add_left_max}
              onChange={(event) => updateNumericSetting("add_left_max", event.target.value)}
            />
            ) + (
            <input
              type="text"
              value={settings.add_right_min}
              onChange={(event) => updateNumericSetting("add_right_min", event.target.value)}
            />
            to
            <input
              type="text"
              value={settings.add_right_max}
              onChange={(event) => updateNumericSetting("add_right_max", event.target.value)}
            />
            )
          </dd>

          <dt>
            <label>
              <input
                type="checkbox"
                checked={selectedOps.has("-")}
                onChange={() => toggleOperation("-")}
              />{" "}
              Subtraction
            </label>
          </dt>
          <dd>Addition problems in reverse</dd>

          <dt>
            <label>
              <input
                type="checkbox"
                checked={selectedOps.has("*")}
                onChange={() => toggleOperation("*")}
              />{" "}
              Multiplication
            </label>
          </dt>
          <dd>
            Range: (
            <input
              type="text"
              value={settings.mul_left_min}
              onChange={(event) => updateNumericSetting("mul_left_min", event.target.value)}
            />
            to
            <input
              type="text"
              value={settings.mul_left_max}
              onChange={(event) => updateNumericSetting("mul_left_max", event.target.value)}
            />
            ) × (
            <input
              type="text"
              value={settings.mul_right_min}
              onChange={(event) => updateNumericSetting("mul_right_min", event.target.value)}
            />
            to
            <input
              type="text"
              value={settings.mul_right_max}
              onChange={(event) => updateNumericSetting("mul_right_max", event.target.value)}
            />
            )
          </dd>

          <dt>
            <label>
              <input
                type="checkbox"
                checked={selectedOps.has("/")}
                onChange={() => toggleOperation("/")}
              />{" "}
              Division
            </label>
          </dt>
          <dd>Multiplication problems in reverse</dd>
        </dl>

        <p className="duration-row">
          Duration{" "}
          <select
            value={settings.duration}
            onChange={(event) => updateNumericSetting("duration", event.target.value)}
          >
            {DURATION_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
          <button type="button" onClick={startGame}>
            Start
          </button>
        </p>

        {error ? <p className="error-message">{error}</p> : null}
      </div>
    </div>
  ) : (
    <div id="game">
      <span className="left">Seconds remaining: {timeLeft}</span>
      <span className="correct">Score: {score}</span>
      <div className={`banner${phase === "finished" ? " wide" : ""}`}>
        {phase === "finished" ? (
          <div className="end">
            <p className="correct">Score: {score}</p>
            <p>
              <a href="#" onClick={restartGame}>
                Try again
              </a>{" "}
              or{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  goToSettings();
                }}
              >
                Change settings
              </a>
            </p>
            {error ? <p className="error-message">{error}</p> : null}
          </div>
        ) : (
          <div className="start">
            <span className="problem">{problem?.pretty_problem || ""}</span>
            <span className="equals"> = </span>
            <input
              ref={inputRef}
              className="answer"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={answer}
              onChange={handleAnswerChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
