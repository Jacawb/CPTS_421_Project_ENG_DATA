// Thin wrapper around the Pages Functions API in functions/api/[[path]].ts.
// Every call throws an Error with the server's message when the request fails.

async function request(path, { method = 'GET', body } = {}) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export const api = {
  listFilesWithContent: () => request('/files?content=1'),
  uploadFile: (name, content) => request('/files', { method: 'POST', body: { name, content } }),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),

  // fileIds: array of file ids; returns annotations with file_id, group_id, start, end, name, color
  listAnnotations: (fileIds) => request(`/annotations?files=${fileIds.join(',')}`),
  // annotation: { name, color, start, end, selectedText } (start/end null = whole document)
  addAnnotation: (fileId, annotation) =>
    request(`/files/${fileId}/annotations`, { method: 'POST', body: annotation }),
  deleteAnnotation: (id) => request(`/annotations/${id}`, { method: 'DELETE' }),
  setGroupColor: (groupId, color) => request(`/groups/${groupId}`, { method: 'PATCH', body: { color } }),
};
