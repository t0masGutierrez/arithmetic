import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const DEFAULT_SETTINGS = {
  duration: 120,
  ops: ["+", "-", "*", "/"],
  add_left_min: 2,
  add_left_max: 100,
  add_right_min: 2,
  add_right_max: 100,
  mul_left_min: 2,
  mul_left_max: 12,
  mul_right_min: 2,
  mul_right_max: 100,
};

const DURATION_OPTIONS = [30, 60, 120, 300, 600];
const OP_ORDER = ["+", "-", "*", "/"];
const DEFAULT_SESSION = { authenticated: false, user: null };
const DEFAULT_PROVIDERS = [
  { name: "email", label: "Email", available: true, start_url: null },
  { name: "google", label: "Google", available: false, start_url: "/auth/google/start" },
  { name: "github", label: "GitHub", available: false, start_url: "/auth/github/start" },
];
const EMPTY_LOGIN_FORM = { email: "", password: "", username: "" };
const EMPTY_PROFILE_FORM = {
  username: "",
  bio: "",
  links: [""],
  image_url: "",
};

function sanitizeSettings(settings) {
  return {
    duration: Number(settings.duration),
    ops: [...settings.ops],
    add_left_min: Number(settings.add_left_min),
    add_left_max: Number(settings.add_left_max),
    add_right_min: Number(settings.add_right_min),
    add_right_max: Number(settings.add_right_max),
    mul_left_min: Number(settings.mul_left_min),
    mul_left_max: Number(settings.mul_left_max),
    mul_right_min: Number(settings.mul_right_min),
    mul_right_max: Number(settings.mul_right_max),
  };
}

function profileToForm(profile) {
  if (!profile) {
    return EMPTY_PROFILE_FORM;
  }
  const links = Array.isArray(profile.links)
    ? profile.links.map((link) => String(link || "").trim()).filter(Boolean)
    : [];
  return {
    username: profile.username || "",
    bio: profile.bio || "",
    links,
    image_url: profile.image_url || "",
  };
}

function isDefaultSettings(settings) {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  const normalizedOps = Array.isArray(settings.ops) ? [...settings.ops] : [];
  const expectedOps = [...DEFAULT_SETTINGS.ops];
  if (normalizedOps.length !== expectedOps.length) {
    return false;
  }
  if (normalizedOps.join("|") !== expectedOps.join("|")) {
    return false;
  }
  for (const key of [
    "add_left_min",
    "add_left_max",
    "add_right_min",
    "add_right_max",
    "mul_left_min",
    "mul_left_max",
    "mul_right_min",
    "mul_right_max",
  ]) {
    if (Number(settings[key]) !== Number(DEFAULT_SETTINGS[key])) {
      return false;
    }
  }
  return true;
}

function AuthModal({
  authMode,
  authForm,
  setAuthForm,
  providers,
  authError,
  authBusy,
  onClose,
  onSubmit,
  onSwitchMode,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{authMode === "register" ? "Create account" : "Log in"}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="oauth-grid">
          {providers
            .filter((provider) => provider.name !== "email")
            .map((provider) => (
              <button
                key={provider.name}
                type="button"
                className="oauth-button"
                onClick={() => {
                  if (provider.available && provider.start_url) {
                    window.location.href = provider.start_url;
                  }
                }}
                disabled={!provider.available}
                title={provider.available ? "" : `${provider.label} not configured locally yet`}
              >
                Continue with {provider.label}
              </button>
            ))}
        </div>

        <div className="divider">or use email</div>

        <form className="auth-form" onSubmit={onSubmit}>
          {authMode === "register" ? (
            <label>
              Username
              <input
                type="text"
                value={authForm.username}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, username: event.target.value }))
                }
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>

          {authError ? <p className="error-message form-message">{authError}</p> : null}

          <button type="submit" className="primary-button" disabled={authBusy}>
            {authBusy ? "Please wait..." : authMode === "register" ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="auth-switch-row">
          {authMode === "register" ? "Already have an account?" : "Need an account?"}{" "}
          <button type="button" className="link-button" onClick={onSwitchMode}>
            {authMode === "register" ? "Log in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}

function ProfileEditor({
  profileForm,
  setProfileForm,
  profileError,
  profileMessage,
  profileBusy,
  onImageUpload,
  onAddLink,
  onUpdateLink,
  onSave,
}) {
  return (
    <div className="profile-shell">
      <div className="profile-card">
        <h1>Profile</h1>

        <form className="profile-form" onSubmit={onSave}>
          <div className="profile-image-editor">
            <img src={profileForm.image_url} alt="Profile preview" className="profile-image-preview" />
            <label className="image-upload-button">
              Upload image
              <input type="file" accept="image/*" onChange={onImageUpload} hidden />
            </label>
          </div>

          <label>
            Username
            <input
              type="text"
              value={profileForm.username}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, username: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Bio
            <textarea
              rows="4"
              value={profileForm.bio}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, bio: event.target.value }))
              }
            />
          </label>

          <div className="links-editor">
            {profileForm.links.map((link, index) => (
              <input
                key={`link-${index}`}
                type="url"
                value={link}
                placeholder="https://example.com"
                onChange={(event) => onUpdateLink(index, event.target.value)}
              />
            ))}
            <button type="button" className="plus-button" onClick={onAddLink}>
              +
            </button>
          </div>

          {profileError ? <p className="error-message form-message">{profileError}</p> : null}
          {profileMessage ? <p className="success-message form-message">{profileMessage}</p> : null}

          <button type="submit" className="primary-button" disabled={profileBusy}>
            {profileBusy ? "Saving..." : "Save profile"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PublicProfilePage({ profile }) {
  return (
    <div className="profile-shell">
      <div className="profile-card public-profile-card">
        <div className="public-profile-header">
          <img src={profile.image_url} alt={`${profile.username} avatar`} className="public-profile-avatar" />
          <div>
            <h1>{profile.username}</h1>
          </div>
        </div>
        {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : null}
        {profile.links?.filter(Boolean).length ? (
          <div className="public-profile-links">
            {profile.links.filter(Boolean).map((link) => (
              <p key={link}>
                <a href={link} target="_blank" rel="noreferrer">
                  {link}
                </a>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsPage({ analytics }) {
  return (
    <div className="page-shell">
      <div className="page-card analytics-card">
        <h1>Analytics</h1>
        {analytics.results.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Duration</th>
                  <th>Settings</th>
                  <th>Date</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {analytics.results.map((result) => (
                  <tr key={result.id}>
                    <td>{result.score}</td>
                    <td>{result.duration}s</td>
                    <td>{isDefaultSettings(result.settings) ? "Default" : result.settings_summary}</td>
                    <td>{result.date}</td>
                    <td>{result.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">No saved games yet.</p>
        )}
      </div>
    </div>
  );
}

function LeaderboardPage({ leaderboard, onOpenProfile }) {
  return (
    <div className="page-shell">
      <div className="page-card analytics-card">
        <h1>Leaderboard</h1>
        {leaderboard.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.rank}-${row.username}`}>
                    <td>{row.rank}</td>
                    <td>
                      <button className="leaderboard-user" type="button" onClick={() => onOpenProfile(row.username_slug, "leaderboard")}>
                        <img src={row.image_url} alt={`${row.username} avatar`} className="leaderboard-avatar" />
                        <span>{row.username}</span>
                      </button>
                    </td>
                    <td>{row.pr_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">No leaderboard entries yet.</p>
        )}
      </div>
    </div>
  );
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
  const [problemLog, setProblemLog] = useState([]);
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(EMPTY_LOGIN_FORM);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [publicProfile, setPublicProfile] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({ results: [] });
  const [leaderboard, setLeaderboard] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previousBrowsePhase, setPreviousBrowsePhase] = useState("settings");
  const deadlineRef = useRef(null);
  const inputRef = useRef(null);
  const currentProblemStartRef = useRef(null);
  const answerRef = useRef("");
  const finishedProblemRef = useRef(null);
  const scoreRef = useRef(0);
  const problemLogRef = useRef([]);
  const activeConfigRef = useRef(null);
  const currentUserRef = useRef(null);
  const problemRef = useRef(null);
  const finishingRef = useRef(false);

  const selectedOps = useMemo(() => new Set(settings.ops), [settings.ops]);
  const currentUser = session.user;

  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const [providersResponse, sessionResponse] = await Promise.all([
          fetch("/api/auth/providers"),
          fetch("/api/auth/session"),
        ]);
        const providersData = await providersResponse.json();
        const sessionData = await sessionResponse.json();
        if (providersResponse.ok) {
          setProviders(providersData.providers || DEFAULT_PROVIDERS);
        }
        if (sessionResponse.ok) {
          setSession(sessionData);
          if (sessionData.user) {
            setProfileForm(profileToForm(sessionData.user));
          }
        }
      } catch (_err) {
        // ignore bootstrap issues locally
      }
    };

    loadAuthState();
  }, []);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    problemLogRef.current = problemLog;
  }, [problemLog]);

  useEffect(() => {
    activeConfigRef.current = activeConfig;
  }, [activeConfig]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    problemRef.current = problem;
  }, [problem]);

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
      const secondsRemaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000)
      );
      setTimeLeft(secondsRemaining);
      if (secondsRemaining <= 0) {
        finishGame();
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const pathname =
      phase === "profile"
        ? "/profile"
        : phase === "publicProfile" && publicProfile
          ? `/u/${publicProfile.username_slug}`
          : phase === "analytics"
            ? "/analytics"
            : phase === "leaderboard"
              ? "/leaderboard"
              : "/";
    window.history.replaceState({}, "", pathname);
  }, [phase, publicProfile]);

  const readJson = async (response, fallbackMessage) => {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || fallbackMessage || `request failed: ${response.status}`);
    }
    return data;
  };

  const fetchProblem = async (config) => {
    const response = await fetch("/api/problem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await readJson(response);
    currentProblemStartRef.current = Date.now();
    setProblem(data);
    setAnswer("");
  };

  const finishGame = async () => {
    if (finishingRef.current) {
      return;
    }
    finishingRef.current = true;

    if (document.visibilityState === "hidden") {
      setPhase("finished");
      setTimeLeft(0);
      finishingRef.current = false;
      return;
    }

    setPhase("finished");
    setTimeLeft(0);

    const currentProblem = problemRef.current;
    let finalProblemLog = problemLogRef.current;
    if (
      currentProblem &&
      currentProblemStartRef.current &&
      finishedProblemRef.current !== currentProblem.plain_problem
    ) {
      finishedProblemRef.current = currentProblem.plain_problem;
      const extra = {
        problem: currentProblem.plain_problem,
        answer: currentProblem.solution,
        entry: answerRef.current,
        timeMs: Date.now() - currentProblemStartRef.current,
      };
      finalProblemLog = [...problemLogRef.current, extra];
      problemLogRef.current = finalProblemLog;
      setProblemLog(finalProblemLog);
    }

    const loggedInUser = currentUserRef.current;
    const config = activeConfigRef.current;
    const finalScore = scoreRef.current;

    if (loggedInUser && config) {
      try {
        const saveResponse = await fetch("/api/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: finalScore,
            duration: config.duration,
            settings: config,
            problem_log: finalProblemLog,
          }),
        });
        await readJson(saveResponse, "Could not save result");
        const analyticsResponse = await fetch("/api/analytics");
        const analyticsPayload = await readJson(analyticsResponse, "Could not refresh analytics");
        setAnalyticsData(analyticsPayload);
      } catch (_err) {
        // keep finish flow resilient
      }
    }

    finishingRef.current = false;
  };

  const startGame = async () => {
    finishingRef.current = false;
    const config = sanitizeSettings(settings);
    if (config.ops.length === 0) {
      setError("Enable at least one operation.");
      return;
    }

    try {
      setError("");
      setScore(0);
      setProblem(null);
      setProblemLog([]);
      finishedProblemRef.current = null;
      setActiveConfig(config);
      setPhase("playing");
      deadlineRef.current = Date.now() + config.duration * 1000;
      setTimeLeft(config.duration);
      await fetchProblem(config);
    } catch (err) {
      setPhase("settings");
      setError(err.message || "Could not start game.");
    }
  };

  const restartGame = async (event) => {
    event.preventDefault();
    finishingRef.current = false;
    if (!activeConfig) {
      setPhase("settings");
      return;
    }

    try {
      setError("");
      setScore(0);
      setProblem(null);
      setProblemLog([]);
      finishedProblemRef.current = null;
      setPhase("playing");
      deadlineRef.current = Date.now() + activeConfig.duration * 1000;
      setTimeLeft(activeConfig.duration);
      await fetchProblem(activeConfig);
    } catch (err) {
      setPhase("settings");
      setError(err.message || "Could not restart game.");
    }
  };

  const goToSettings = () => {
    setPhase("settings");
    setPublicProfile(null);
    setProblem(null);
    setAnswer("");
    setTimeLeft(DEFAULT_SETTINGS.duration);
    setError("");
    setMenuOpen(false);
  };

  const handleBack = () => {
    if (phase === "publicProfile" && previousBrowsePhase === "leaderboard") {
      setPhase("leaderboard");
      setPublicProfile(null);
      setMenuOpen(false);
      return;
    }
    goToSettings();
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

  const handleAnswerChange = async (event) => {
    const value = event.target.value;
    setAnswer(value);

    if (phase !== "playing" || !problem) {
      return;
    }
    if (value.trim() !== String(problem.solution)) {
      return;
    }

    const nextProblemLog = [
      ...problemLog,
      {
        problem: problem.plain_problem,
        answer: problem.solution,
        entry: value,
        timeMs: currentProblemStartRef.current ? Date.now() - currentProblemStartRef.current : null,
      },
    ];
    setProblemLog(nextProblemLog);
    setScore((current) => current + 1);

    try {
      await fetchProblem(activeConfig);
    } catch (err) {
      setProblemLog(nextProblemLog);
      await finishGame();
      setError(err.message || "Could not load the next problem.");
    }
  };

  const openAuthModal = (mode) => {
    setAuthMode(mode);
    setAuthError("");
    setAuthForm(EMPTY_LOGIN_FORM);
    setAuthModalOpen(true);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = authMode === "register"
        ? authForm
        : { email: authForm.email, password: authForm.password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      setSession({ authenticated: true, user: data.user });
      setProfileForm(profileToForm(data.user));
      setAuthModalOpen(false);
      setAuthForm(EMPTY_LOGIN_FORM);
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(DEFAULT_SESSION);
    setProfileForm(EMPTY_PROFILE_FORM);
    setMenuOpen(false);
    goToSettings();
  };

  const loadEditableProfile = async () => {
    const response = await fetch("/api/profile");
    const data = await readJson(response, "Could not load profile");
    setSession({ authenticated: true, user: data.profile });
    setProfileForm(profileToForm(data.profile));
    setPhase("profile");
    setMenuOpen(false);
  };

  const loadPublicProfile = async (slug = null, sourcePhase = null) => {
    const targetSlug = slug || currentUser?.username_slug;
    if (!targetSlug) {
      return;
    }
    const origin = sourcePhase || phase;
    const response = await fetch(`/api/profile/${targetSlug}`);
    const data = await readJson(response, "Could not load public profile");
    setPreviousBrowsePhase(origin);
    setPublicProfile(data.profile);
    setPhase("publicProfile");
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profileForm.username,
          bio: profileForm.bio,
          links: profileForm.links,
          image_data_url: profileForm.image_url,
        }),
      });
      const data = await readJson(response, "Could not save profile");
      setSession({ authenticated: true, user: data.profile });
      setProfileForm(profileToForm(data.profile));
      setProfileMessage("Profile saved");
    } catch (err) {
      setProfileError(err.message || "Could not save profile");
    } finally {
      setProfileBusy(false);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfileForm((current) => ({ ...current, image_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const addLinkField = () => {
    setProfileForm((current) => ({ ...current, links: [...current.links, ""] }));
  };

  const updateLinkField = (index, value) => {
    setProfileForm((current) => {
      const trimmed = value.trim();
      const nextLinks = [...current.links];
      if (!trimmed) {
        nextLinks.splice(index, 1);
        return { ...current, links: nextLinks };
      }
      nextLinks[index] = value;
      return { ...current, links: nextLinks };
    });
  };

  const loadAnalytics = async () => {
    if (!currentUser) {
      return;
    }
    const response = await fetch("/api/analytics");
    const data = await readJson(response, "Could not load analytics");
    setAnalyticsData(data);
    setPhase("analytics");
    setMenuOpen(false);
  };

  const loadLeaderboard = async () => {
    const response = await fetch("/api/leaderboard");
    const data = await readJson(response, "Could not load leaderboard");
    setLeaderboard(data.leaderboard || []);
    setPhase("leaderboard");
    setMenuOpen(false);
  };

  const renderTopBar = () => {
    if (phase === "playing") {
      return null;
    }

    const showBack = phase !== "settings" && phase !== "finished";

    return (
      <div className="top-bar">
        <div className="top-bar-left">
          {showBack ? (
            <button type="button" className="top-link-button" onClick={handleBack}>
              Back
            </button>
          ) : null}
        </div>
        <div className="top-bar-right">
          {currentUser ? (
            phase === "profile" ? (
              <div className="profile-menu">
                <button type="button" className="primary-button small-button" onClick={() => loadPublicProfile()}>
                  View
                </button>
                <button type="button" className="link-button top-link-button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            ) : (
              <div className="menu-shell">
                <button
                  type="button"
                  className="profile-chip"
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <img src={currentUser.image_url} alt="Profile" />
                  <span>{currentUser.username}</span>
                  <span className="caret">▾</span>
                </button>
                {menuOpen ? (
                  <div className="dropdown-menu">
                    <button type="button" onClick={loadEditableProfile}>Edit profile</button>
                    <button type="button" onClick={() => loadAnalytics()}>View analytics</button>
                    <button type="button" onClick={loadLeaderboard}>View leaderboard</button>
                    <button type="button" onClick={handleLogout}>Log out</button>
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <div className="auth-actions">
              <button type="button" className="top-link-button" onClick={() => openAuthModal("login")}>
                Log in
              </button>
              <button type="button" className="primary-button small-button" onClick={() => openAuthModal("register")}>
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderTopBar()}

      {phase === "profile" ? (
        <ProfileEditor
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          profileError={profileError}
          profileMessage={profileMessage}
          profileBusy={profileBusy}
          onImageUpload={handleImageUpload}
          onAddLink={addLinkField}
          onUpdateLink={updateLinkField}
          onSave={handleProfileSave}
        />
      ) : phase === "publicProfile" && publicProfile ? (
        <PublicProfilePage profile={publicProfile} />
      ) : phase === "analytics" ? (
        <AnalyticsPage analytics={analyticsData} />
      ) : phase === "leaderboard" ? (
        <LeaderboardPage leaderboard={leaderboard} onOpenProfile={loadPublicProfile} />
      ) : phase === "settings" ? (
        <div id="welcome-wrap">
          <div id="welcome">
            <h1>Settings</h1>

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
                  <a href="/game" onClick={restartGame}>
                    Try again
                  </a>{" "}
                  or{" "}
                  <a
                    href="/"
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
      )}

      {authModalOpen ? (
        <AuthModal
          authMode={authMode}
          authForm={authForm}
          setAuthForm={setAuthForm}
          providers={providers}
          authError={authError}
          authBusy={authBusy}
          onClose={() => setAuthModalOpen(false)}
          onSubmit={handleAuthSubmit}
          onSwitchMode={() => {
            setAuthMode((current) => (current === "login" ? "register" : "login"));
            setAuthError("");
          }}
        />
      ) : null}
    </>
  );
}

export default App;
