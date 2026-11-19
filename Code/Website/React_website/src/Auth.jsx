import React, { useEffect, useState } from 'react';
import { api } from './api';

export const MIN_PASSWORD_LENGTH = 12;

// Random temporary password like "k7Fq-Mx2p-Tz9d-Hw4n" (no look-alike characters such as 0/O or 1/l).
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  const chars = Array.from(bytes, b => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map(i => chars.slice(i, i + 4).join('')).join('-');
}

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">WSU Corpus Analysis</div>
        <h1>{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
        <p className="auth-footnote">
          This site holds student writing covered by FERPA. Access is limited to authorized accounts.
        </p>
      </div>
    </div>
  );
}

function SignInForm({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { user } = await api.login(email, password);
      onSignedIn(user);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Use the account your administrator created for you.">
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} required autoFocus
            onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} required
            onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-help">No account? Ask a site administrator to create one for you.</p>
    </AuthCard>
  );
}

// Shown only while the database has no accounts. Asks for SETUP_TOKEN only if the server has one set.
function SetupForm({ onSignedIn, tokenRequired }) {
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirm: '', setupToken: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (fields.password !== fields.confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      const { user } = await api.setup({
        name: fields.name, email: fields.email, password: fields.password, setupToken: fields.setupToken,
      });
      onSignedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create the first admin account"
      subtitle={tokenRequired
        ? 'No accounts exist yet. Enter the setup token from the Cloudflare project settings (SETUP_TOKEN).'
        : 'No accounts exist yet. This account will be able to create everyone else’s.'}>
      <form className="auth-form" onSubmit={submit}>
        <label>Full name<input value={fields.name} onChange={set('name')} required autoFocus /></label>
        <label>Email<input type="email" autoComplete="username" value={fields.email} onChange={set('email')} required /></label>
        <label>
          Password <span className="auth-hint">at least {MIN_PASSWORD_LENGTH} characters</span>
          <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
            value={fields.password} onChange={set('password')} required />
        </label>
        <label>Confirm password
          <input type="password" autoComplete="new-password" value={fields.confirm} onChange={set('confirm')} required />
        </label>
        {tokenRequired && (
          <label>Setup token
            <input type="password" autoComplete="off" value={fields.setupToken} onChange={set('setupToken')} required />
          </label>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create admin account'}</button>
      </form>
    </AuthCard>
  );
}

export function SignInScreen({ onSignedIn }) {
  const [status, setStatus] = useState(null); // { needsSetup, setupTokenRequired }
  const [error, setError] = useState('');
  useEffect(() => {
    api.authStatus()
      .then(setStatus)
      .catch(err => setError(`Can't reach the server: ${err.message}`));
  }, []);

  if (error) return <AuthCard title="Sign in"><p className="auth-error" role="alert">{error}</p></AuthCard>;
  if (status === null) return <div className="auth-page"><p className="auth-loading">Loading…</p></div>;
  return status.needsSetup
    ? <SetupForm onSignedIn={onSignedIn} tokenRequired={!!status.setupTokenRequired} />
    : <SignInForm onSignedIn={onSignedIn} />;
}

// Used both for the forced change after an admin-issued temporary password and from the sidebar.
export function ChangePasswordForm({ forced = false, onDone, onCancel }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match'); return; }
    if (next.length < MIN_PASSWORD_LENGTH) { setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`); return; }
    setBusy(true);
    try {
      const { user } = await api.changePassword(current, next);
      onDone(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      {/* Not asked after a temporary password: they just signed in with it. */}
      {!forced && (
        <label>Current password
          <input type="password" autoComplete="current-password" value={current} required autoFocus
            onChange={e => setCurrent(e.target.value)} />
        </label>
      )}
      <label>New password <span className="auth-hint">at least {MIN_PASSWORD_LENGTH} characters</span>
        <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={next} required
          autoFocus={forced} onChange={e => setNext(e.target.value)} />
      </label>
      <label>Confirm new password
        <input type="password" autoComplete="new-password" value={confirm} required
          onChange={e => setConfirm(e.target.value)} />
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-actions">
        {onCancel && <button type="button" className="auth-secondary" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </div>
    </form>
  );
}

export function ForcedPasswordChange({ user, onDone, onSignOut }) {
  return (
    <AuthCard title="Choose a new password"
      subtitle={`Welcome, ${user.name}. You signed in with a temporary password. Choose your own to continue.`}>
      <ChangePasswordForm forced onDone={onDone} />
      <button type="button" className="auth-link" onClick={onSignOut}>Sign out</button>
    </AuthCard>
  );
}
