// Thin wrapper around the Pages Functions API in functions/api/[[path]].ts.
// Every call throws an Error with the server's message when the request fails.
// The session lives in an HttpOnly cookie, so nothing about it is stored in JavaScript.

// App registers a handler so a 401 anywhere (session expired, account disabled)
// sends the user back to the sign-in screen.
let onSessionLost = () => {};
export function setSessionLostHandler(fn) { onSessionLost = fn; }

async function request(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (data?.code === 'UNAUTHENTICATED' || data?.code === 'PASSWORD_CHANGE_REQUIRED') onSessionLost(data.code);
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

export const api = {
  // ---------- auth ----------
  authStatus: () => request('/auth/status'),                       // { needsSetup }
  me: () => request('/auth/me'),                                   // { user } or throws 401
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  setup: (fields) => request('/auth/setup', { method: 'POST', body: fields }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),

  // ---------- accounts (admin only) ----------
  listUsers: () => request('/users'),
  createUser: (fields) => request('/users', { method: 'POST', body: fields }),     // { email, name, role, password }
  updateUser: (id, fields) => request(`/users/${id}`, { method: 'PATCH', body: fields }), // { name?, role?, disabled?, unlock? }
  resetPassword: (id, password) => request(`/users/${id}/password`, { method: 'POST', body: { password } }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  listAudit: (limit = 100) => request(`/audit?limit=${limit}`),

  // ---------- documents ----------
  listFilesWithContent: () => request('/files?content=1'),
  uploadFile: (name, content, corpusId = null) => request('/files', { method: 'POST', body: { name, content, corpusId } }),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),
  bulkMoveFiles: (ids, corpusId) => request('/files/bulk', { method: 'POST', body: { action: 'move', ids, corpusId } }),
  bulkDeleteFiles: (ids) => request('/files/bulk', { method: 'POST', body: { action: 'delete', ids } }),
  setFileCorpus: (id, corpusId) => request(`/files/${id}`, { method: 'PATCH', body: { corpusId } }),
  listCorpora: () => request('/corpora'),
  createCorpus: (name) => request('/corpora', { method: 'POST', body: { name } }),
  renameCorpus: (id, name) => request(`/corpora/${id}`, { method: 'PATCH', body: { name } }),
  deleteCorpus: (id) => request(`/corpora/${id}`, { method: 'DELETE' }),
  // fileIds: array of file ids; returns annotations with file_id, group_id, start, end, name, color, created_by_name
  listAnnotations: (fileIds) => request(`/annotations?files=${fileIds.join(',')}`),
  // annotation: { name, color, start, end, selectedText } (start/end null = whole document)
  addAnnotation: (fileId, annotation) =>
    request(`/files/${fileId}/annotations`, { method: 'POST', body: annotation }),
  deleteAnnotation: (id) => request(`/annotations/${id}`, { method: 'DELETE' }),
  setGroupColor: (groupId, color) => request(`/groups/${groupId}`, { method: 'PATCH', body: { color } }),
  // every group with tag_count (annotations across all files), whether or not the open file uses it
  listGroups: () => request('/groups'),
  // removes the group and every annotation in it, across all files
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
};
