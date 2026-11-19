import React, { useEffect, useState } from 'react';
import { api } from './api';
import { generatePassword, MIN_PASSWORD_LENGTH } from './Auth';

const ACTION_LABELS = {
  setup: 'Created the first admin account',
  login: 'Signed in',
  login_failed: 'Failed sign-in',
  login_locked: 'Locked after failed sign-ins',
  logout: 'Signed out',
  password_changed: 'Changed password',
  password_reset: 'Reset password for',
  user_created: 'Created account',
  user_updated: 'Updated account',
  user_deleted: 'Deleted account',
  file_uploaded: 'Uploaded',
  file_deleted: 'Deleted',
};

// D1's CURRENT_TIMESTAMP is UTC without a zone ("2026-11-19 18:04:00").
function formatTime(value) {
  if (!value) return 'Never';
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return isNaN(d) ? value : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Shows a temporary password once so the admin can pass it on (it's never shown again).
function TempPasswordNotice({ notice, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(notice.password); setCopied(true); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="admin-notice" role="status">
      <div>
        <strong>{notice.title}</strong>
        <p>
          Temporary password for <b>{notice.email}</b>:{' '}
          <code className="admin-temp-password">{notice.password}</code>
        </p>
        <p className="admin-muted">
          Share it with them directly (in person or by phone), not by email. They'll be asked to choose
          a new password the first time they sign in. It won't be shown again.
        </p>
      </div>
      <div className="admin-notice-actions">
        <button type="button" className="admin-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className="admin-btn ghost" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }) {
  const blank = { name: '', email: '', role: 'user', password: generatePassword() };
  const [fields, setFields] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const user = await api.createUser(fields);
      onCreated(user, fields.password);
      setFields({ ...blank, password: generatePassword() });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-create" onSubmit={submit}>
      <label>Full name
        <input value={fields.name} onChange={set('name')} placeholder="Dr. Jane Smith" required />
      </label>
      <label>WSU email
        <input type="email" value={fields.email} onChange={set('email')} placeholder="jane.smith@wsu.edu" required />
      </label>
      <label>Role
        <select value={fields.role} onChange={set('role')}>
          <option value="user">User: analysis tools only</option>
          <option value="admin">Admin: also documents and accounts</option>
        </select>
      </label>
      <label>Temporary password
        <span className="admin-password-row">
          <input value={fields.password} onChange={set('password')} minLength={MIN_PASSWORD_LENGTH} required
            autoComplete="off" spellCheck={false} />
          <button type="button" className="admin-btn ghost" onClick={() => setFields(f => ({ ...f, password: generatePassword() }))}>
            New
          </button>
        </span>
      </label>
      {error && <p className="error">{error}</p>}
      <div><button type="submit" className="admin-btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
    </form>
  );
}

export default function AdminPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshAudit = () => api.listAudit(100).then(setAudit).catch(() => {});

  useEffect(() => {
    Promise.all([api.listUsers(), api.listAudit(100)])
      .then(([u, a]) => { setUsers(u); setAudit(a); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const run = async (fn) => {
    setError('');
    try { await fn(); refreshAudit(); } catch (err) { setError(err.message); }
  };

  const replace = (row) => setUsers(prev => prev.map(u => (u.id === row.id ? row : u)));

  const onCreated = (user, password) => {
    setUsers(prev => [...prev, user].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)));
    setNotice({ title: `Account created for ${user.name}`, email: user.email, password });
    refreshAudit();
  };

  const toggleRole = (u) => run(async () => {
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Make ${u.name} ${role === 'admin' ? 'an admin' : 'a regular user'}? They'll be signed out.`)) return;
    replace(await api.updateUser(u.id, { role }));
  });

  const toggleDisabled = (u) => run(async () => {
    if (!u.disabled && !window.confirm(`Disable ${u.name}? They'll be signed out and can't sign in until re-enabled.`)) return;
    replace(await api.updateUser(u.id, { disabled: !u.disabled }));
  });

  const unlock = (u) => run(async () => replace(await api.updateUser(u.id, { unlock: true })));

  const resetPassword = (u) => run(async () => {
    if (!window.confirm(`Reset the password for ${u.name}? They'll be signed out and need the new temporary password.`)) return;
    const password = generatePassword();
    await api.resetPassword(u.id, password);
    replace({ ...u, must_change_password: 1, locked: 0 });
    setNotice({ title: `Password reset for ${u.name}`, email: u.email, password });
  });

  const remove = (u) => run(async () => {
    if (!window.confirm(`Delete the account for ${u.name} (${u.email})? Their annotations are kept. This cannot be undone.`)) return;
    await api.deleteUser(u.id);
    setUsers(prev => prev.filter(x => x.id !== u.id));
  });

  return (
    <section className="admin-page">
      {notice && <TempPasswordNotice notice={notice} onClose={() => setNotice(null)} />}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="doc-manager-card">
        <h3>Create an account</h3>
        <p>Only people you add here can sign in. New accounts start with a temporary password.</p>
        <CreateUserForm onCreated={onCreated} />
      </div>

      <div className="doc-manager-card">
        <h3>Accounts <span className="admin-count">{users.length}</span></h3>
        {loading ? <p className="admin-muted">Loading…</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const self = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className={u.disabled ? 'is-disabled' : ''}>
                      <td>{u.name}{self && <span className="admin-you">you</span>}</td>
                      <td className="admin-email">{u.email}</td>
                      <td><span className={`role-badge ${u.role}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span></td>
                      <td>
                        {u.disabled ? <span className="status-pill off">Disabled</span>
                          : u.locked ? <span className="status-pill warn">Locked</span>
                          : u.must_change_password ? <span className="status-pill pending">Temp password</span>
                          : <span className="status-pill ok">Active</span>}
                      </td>
                      <td className="admin-muted">{formatTime(u.last_login_at)}</td>
                      <td className="admin-actions">
                        {!self && <>
                          {!!u.locked && <button type="button" onClick={() => unlock(u)}>Unlock</button>}
                          <button type="button" onClick={() => toggleRole(u)}>{u.role === 'admin' ? 'Make user' : 'Make admin'}</button>
                          <button type="button" onClick={() => resetPassword(u)}>Reset password</button>
                          <button type="button" onClick={() => toggleDisabled(u)}>{u.disabled ? 'Enable' : 'Disable'}</button>
                          <button type="button" className="danger" onClick={() => remove(u)}>Delete</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="doc-manager-card">
        <h3>Recent activity</h3>
        <p>Sign-ins, account changes and document uploads/deletions, newest first.</p>
        {audit.length === 0 ? <p className="admin-muted">No activity yet.</p> : (
          <ul className="admin-audit">
            {audit.map(a => (
              <li key={a.id} className={a.action.startsWith('login_') ? 'warn' : ''}>
                <span className="admin-audit-time">{formatTime(a.created_at)}</span>
                <span><b>{a.user_name ?? 'Deleted account'}</b> {ACTION_LABELS[a.action] ?? a.action} {a.detail && <span className="admin-muted">{a.detail}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
