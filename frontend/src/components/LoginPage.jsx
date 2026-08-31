import { useState } from "react";
import { api } from "../budget/api.js";
import { setToken } from "../currentUser.js";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api.login(email.trim(), password);
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Accesso non riuscito.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="brand-mark">T</div>
          <span className="brand-wordmark">TBR</span>
        </div>
        <h1 className="login-title">Accedi</h1>
        <p className="login-subtitle">Sales &amp; Budget Assistant</p>

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-submit" disabled={loading}>
          {loading ? "Accesso in corso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}
