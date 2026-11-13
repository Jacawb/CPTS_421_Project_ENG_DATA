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
  uploadFile: (name, content, corpusId = null) => request('/files', { method: 'POST', body: { name, content, corpusId } }),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),

  setFileCorpus: (id, corpusId) => request(`/files/${id}`, { method: 'PATCH', body: { corpusId } }),
  listCorpora: () => request('/corpora'),
  createCorpus: (name) => request('/corpora', { method: 'POST', body: { name } }),
  renameCorpus: (id, name) => request(`/corpora/${id}`, { method: 'PATCH', body: { name } }),
  deleteCorpus: (id) => request(`/corpora/${id}`, { method: 'DELETE' }),
  // fileIds: array of file ids; returns annotations with file_id, group_id, start, end, name, color
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
