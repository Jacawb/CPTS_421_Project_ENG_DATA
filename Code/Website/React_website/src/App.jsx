import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from './api';
import './App.css';

const tools = [
  {
    name: 'Keyword in Context',
    route: '/keyword-context',
    description: 'Search terms in documents, highlight matches, and show surrounding context.'
  },
  {
    name: 'Annotate',
    route: '/annotate',
    description: 'Add, edit, and save annotations on text data for review and tagging.'
  },
  {
    name: 'Data Visualization',
    route: '/data-visualization',
    description: 'Render charts or graphs from structured data sources.'
  }
];

function Dashboard() {
  const navigate = useNavigate();
  return (
    <section className="content-grid" aria-label="tools">
      {tools.map((tool) => (
        <article key={tool.name} className="card">
          <h2>{tool.name}</h2>
          <p>{tool.description}</p>
          <button onClick={() => navigate(tool.route)}>Open</button>
        </article>
      ))}
    </section>
  );
}

function ToolPage({ title, subtitle, children }) {
  return (
    <section className="page-content">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div style={{ marginTop: '1rem' }}>{children}</div>
    </section>
  );
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMMON_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'if', 'before', 'after', 'above', 'below', 'up', 'down'
]);

function generateWordFrequency(text) {
  if (!text) return [];
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const frequency = {};
  words.forEach(word => {
    if (word.length > 2 && !COMMON_STOPWORDS.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  return Object.entries(frequency)
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 100);
}

function combineSelectedFiles(uploadedFiles, selectedFileIds) {
  if (!uploadedFiles || uploadedFiles.length === 0) return '';
  const selected = uploadedFiles.filter(f => selectedFileIds.includes(f.id));
  if (selected.length === 0) return '';
  if (selected.length === 1) return selected[0].content;
  return selected.map(f => `--- File: ${f.name} ---\n\n${f.content}`).join('\n\n');
}

// Where each selected file's content starts/ends inside combineSelectedFiles' output,
// so offsets in the combined text can be converted to offsets within one file.
function getFileSpans(uploadedFiles, selectedFileIds) {
  const selected = (uploadedFiles || []).filter(f => selectedFileIds.includes(f.id));
  if (selected.length === 1) {
    return [{ fileId: selected[0].id, start: 0, end: selected[0].content.length }];
  }
  const spans = [];
  let offset = 0;
  selected.forEach((f, i) => {
    if (i > 0) offset += '\n\n'.length;
    offset += `--- File: ${f.name} ---\n\n`.length;
    spans.push({ fileId: f.id, start: offset, end: offset + f.content.length });
    offset += f.content.length;
  });
  return spans;
}

// File picker shared by the tools. onChange receives the new array of selected ids.
// With `single`, clicking a file opens just that one (used by Annotate).
// "All" / "None" apply to the files currently shown by the filter.
function FileSidebar({ uploadedFiles, selectedFileIds, onChange, single = false }) {
  const [filter, setFilter] = useState('');
  const files = uploadedFiles || [];
  const needle = filter.trim().toLowerCase();
  const shown = needle ? files.filter(f => f.name.toLowerCase().includes(needle)) : files;
  const shownIds = shown.map(f => f.id);

  const toggle = (fileId) => onChange(
    selectedFileIds.includes(fileId)
      ? selectedFileIds.filter(id => id !== fileId)
      : [...selectedFileIds, fileId]
  );
  const selectShown = () => onChange([...selectedFileIds, ...shownIds.filter(id => !selectedFileIds.includes(id))]);
  const clearShown = () => onChange(selectedFileIds.filter(id => !shownIds.includes(id)));

  return (
    <aside className="file-list-sidebar">
      <h3>{single ? 'Documents' : 'Files'}</h3>
      {files.length === 0 ? (
        <p className="no-files">No files loaded.</p>
      ) : (
        <>
          <input
            type="search"
            className="file-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter files by name"
          />
          {!single && (
            <div className="file-list-actions">
              <span>{selectedFileIds.length} of {files.length} selected</span>
              <span>
                <button type="button" onClick={selectShown}>All</button>
                <button type="button" onClick={clearShown}>None</button>
              </span>
            </div>
          )}
          <ul className="file-list">
            {shown.map(file => (
              <li key={file.id}>
                {single ? (
                  <button
                    type="button"
                    className={`file-item file-open${selectedFileIds.includes(file.id) ? ' active' : ''}`}
                    aria-pressed={selectedFileIds.includes(file.id)}
                    onClick={() => onChange([file.id])}
                  >
                    <span className="file-name">{file.name}</span>
                  </button>
                ) : (
                  <label className="file-item">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.id)}
                      onChange={() => toggle(file.id)}
                    />
                    <span className="file-name">{file.name}</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="no-files">No files match "{filter}".</p>}
        </>
      )}
    </aside>
  );
}

// KWIC (Keyword in Context) concordance tool, modeled after AntConc's Concordance view.
const KWIC_MAX_CONTEXT = 20;       // upper bound for the "Context words" input
const KWIC_CONTEXT_CHARS = 400;    // characters scanned on each side of a hit (enough for 20 words)
const KWIC_EXPANDED_CHARS = 600;   // characters shown on each side when a row is expanded
const KWIC_MAX_HITS = 50000;       // stop collecting after this many hits
const KWIC_PAGE_SIZE = 500;        // rows rendered at a time

// Survives navigating away from the page and back (but not a reload).
const kwicCache = {};

function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => (key in kwicCache ? kwicCache[key] : initial));
  useEffect(() => { kwicCache[key] = value; }, [key, value]);
  return [value, setValue];
}

// Lowercase and strip surrounding punctuation so "man," and "man" sort together.
function normalizeWord(word) {
  return (word || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function findKwicHits(files, regexp) {
  const hits = [];
  let truncated = false;
  files.forEach((file, fileIndex) => {
    const text = file.content || '';
    regexp.lastIndex = 0;
    let match;
    while ((match = regexp.exec(text)) !== null) {
      if (hits.length >= KWIC_MAX_HITS) { truncated = true; break; }
      const start = match.index;
      const end = start + match[0].length;
      const leftFrom = Math.max(0, start - KWIC_CONTEXT_CHARS);
      const rightTo = Math.min(text.length, end + KWIC_CONTEXT_CHARS);
      const leftWords = text.slice(leftFrom, start).split(/\s+/).filter(Boolean);
      const rightWords = text.slice(end, rightTo).split(/\s+/).filter(Boolean);
      // The window edges may cut a word in half; drop those partial words.
      if (leftFrom > 0 && leftWords.length > KWIC_MAX_CONTEXT) leftWords.shift();
      if (rightTo < text.length && rightWords.length > KWIC_MAX_CONTEXT) rightWords.pop();
      hits.push({
        id: hits.length,
        fileId: file.id,
        fileName: file.name,
        fileIndex,
        start,
        end,
        keyword: match[0],
        leftWords: leftWords.slice(-KWIC_MAX_CONTEXT),
        rightWords: rightWords.slice(0, KWIC_MAX_CONTEXT),
      });
      if (match[0].length === 0) regexp.lastIndex += 1;
    }
  });
  return { hits, truncated };
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function KeywordContextTool({ uploadedFiles }) {
  const [filesRef, setFilesRef] = usePersistentState('filesRef', null);
  const [selectedFileIds, setSelectedFileIds] = usePersistentState('selectedFileIds', []);
  const [query, setQuery] = usePersistentState('query', '');
  const [isRegex, setIsRegex] = usePersistentState('isRegex', false);
  const [caseSensitive, setCaseSensitive] = usePersistentState('caseSensitive', false);
  const [wholeWord, setWholeWord] = usePersistentState('wholeWord', false);
  const [contextInput, setContextInput] = usePersistentState('contextInput', '5');
  const [results, setResults] = usePersistentState('results', []);
  const [message, setMessage] = usePersistentState('message', null); // { kind: 'error' | 'info', text }
  const [sortBy, setSortBy] = usePersistentState('sortBy', 'position');
  const [sortDir, setSortDir] = usePersistentState('sortDir', 'asc');
  const [hasSearched, setHasSearched] = usePersistentState('hasSearched', false);
  const [visibleCount, setVisibleCount] = useState(KWIC_PAGE_SIZE);
  const [expandedId, setExpandedId] = useState(null);

  // Reset only when the loaded files actually change, not on every visit to the page.
  useEffect(() => {
    if (filesRef === uploadedFiles) return;
    setFilesRef(uploadedFiles);
    setSelectedFileIds((uploadedFiles || []).map(f => f.id));
    setResults([]);
    setMessage(null);
    setHasSearched(false);
  }, [uploadedFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const contextWords = Math.max(1, Math.min(KWIC_MAX_CONTEXT, Number(contextInput) || 1));
  const multiFile = new Set(results.map(r => r.fileId)).size > 1 || selectedFileIds.length > 1;

  const clearResults = () => {
    setResults([]);
    setMessage(null);
    setExpandedId(null);
  };

  // After a search has been run, changing the file selection re-runs it.
  const changeFileSelection = (next) => {
    setSelectedFileIds(next);
    if (hasSearched) runSearch(next);
    else clearResults();
  };

  const runSearch = (fileIds = selectedFileIds) => {
    clearResults();
    setVisibleCount(KWIC_PAGE_SIZE);
    if (!query.trim()) return;
    setHasSearched(true);
    const files = (uploadedFiles || []).filter(f => fileIds.includes(f.id));
    if (files.length === 0) { setMessage({ kind: 'error', text: 'No files selected.' }); return; }
    let regexp;
    try {
      let pattern = isRegex ? query : escapeRegExp(query);
      if (wholeWord) pattern = `(?<!\\w)(?:${pattern})(?!\\w)`;
      regexp = new RegExp(pattern, caseSensitive ? 'gm' : 'gim');
    } catch (e) {
      setMessage({ kind: 'error', text: 'Invalid regex: ' + e.message });
      return;
    }
    const { hits, truncated } = findKwicHits(files, regexp);
    setResults(hits);
    if (hits.length === 0) setMessage({ kind: 'info', text: 'No matches found.' });
    else if (truncated) setMessage({ kind: 'info', text: `Showing the first ${KWIC_MAX_HITS.toLocaleString()} hits. Narrow your search to see the rest.` });
  };

  const wordAt = (words, n) =>
    normalizeWord(n > 0 ? words[n - 1] : words[words.length + n]);

  const sortKey = (item) => {
    switch (sortBy) {
      case 'file': return item.fileName.toLowerCase();
      case 'keyword': return item.keyword.toLowerCase();
      case '1L': return wordAt(item.leftWords, -1);
      case '2L': return wordAt(item.leftWords, -2);
      case '1R': return wordAt(item.rightWords, 1);
      case '2R': return wordAt(item.rightWords, 2);
      default: return null;
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    let cmp = ka === null ? 0 : ka.localeCompare(kb);
    // Ties (and "position" sort) fall back to document order.
    if (cmp === 0) cmp = a.fileIndex - b.fileIndex || a.start - b.start;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const sortColumns = ['position', ...(multiFile ? ['file'] : []), '2L', '1L', 'keyword', '1R', '2R'];
  const sortLabel = (col) => ({ position: '#', file: 'File', keyword: 'Keyword' }[col] || col);

  const exportCsv = () => {
    const rows = [['#', 'File', 'Left context', 'Keyword', 'Right context']];
    sortedResults.forEach((item, idx) => {
      rows.push([
        idx + 1,
        item.fileName,
        item.leftWords.slice(-contextWords).join(' '),
        item.keyword,
        item.rightWords.slice(0, contextWords).join(' '),
      ]);
    });
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kwic-${query.replace(/[^\w-]+/g, '_').slice(0, 40) || 'results'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const expandedContext = (item) => {
    const file = (uploadedFiles || []).find(f => f.id === item.fileId);
    const text = file?.content || '';
    const from = Math.max(0, item.start - KWIC_EXPANDED_CHARS);
    const to = Math.min(text.length, item.end + KWIC_EXPANDED_CHARS);
    return {
      before: (from > 0 ? '…' : '') + text.slice(from, item.start),
      keyword: text.slice(item.start, item.end),
      after: text.slice(item.end, to) + (to < text.length ? '…' : ''),
    };
  };

  // Summary: hits per file and distinct matched forms.
  const perFile = {};
  const forms = {};
  results.forEach(r => {
    perFile[r.fileName] = (perFile[r.fileName] || 0) + 1;
    const form = caseSensitive ? r.keyword : r.keyword.toLowerCase();
    forms[form] = (forms[form] || 0) + 1;
  });
  const formList = Object.entries(forms).sort((a, b) => b[1] - a[1]);

  const columnCount = multiFile ? 5 : 4;
  const visibleResults = sortedResults.slice(0, visibleCount);

  return (
    <ToolPage title="Keyword in Context (KWIC)" subtitle="Concordance view — each match is centered with surrounding context. Click sort buttons to reorder, or click a row to see more of the text.">
      <div className="search-panel-with-files">
        <FileSidebar uploadedFiles={uploadedFiles} selectedFileIds={selectedFileIds} onChange={changeFileSelection} />
        <div className="search-panel">
          <div className="search-controls">
            <label>
              Search query
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="word or regex"
              />
            </label>
            <label>
              Context words
              <input
                type="number"
                min={1}
                max={KWIC_MAX_CONTEXT}
                value={contextInput}
                onChange={(e) => setContextInput(e.target.value)}
                onBlur={() => setContextInput(String(contextWords))}
                style={{ width: '4.5rem' }}
              />
            </label>
            <label className="kwic-check">
              <input type="checkbox" checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} />
              Use regex
            </label>
            <label className="kwic-check">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
              Case sensitive
            </label>
            <label className="kwic-check">
              <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
              Whole word
            </label>
            <button className="run-search" onClick={() => runSearch()} type="button">Search</button>
          </div>

          <div className="kwic-results">
            <div className="kwic-header">
              <h3>Concordance — {results.length.toLocaleString()} hit{results.length !== 1 ? 's' : ''}</h3>
              {results.length > 0 && (
                <>
                  <div className="kwic-sort-row">
                    <span>Sort:</span>
                    {sortColumns.map(col => (
                      <button
                        key={col}
                        onClick={() => toggleSort(col)}
                        className={`kwic-sort-btn${sortBy === col ? ' active' : ''}`}
                        type="button"
                      >
                        {sortLabel(col)}
                        {sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    ))}
                  </div>
                  <button className="kwic-sort-btn kwic-export" onClick={exportCsv} type="button">Export CSV</button>
                </>
              )}
            </div>

            {message && <div className={message.kind === 'error' ? 'error' : 'kwic-info'}>{message.text}</div>}

            {results.length > 0 && (
              <details className="kwic-summary">
                <summary>
                  {Object.keys(perFile).length} file{Object.keys(perFile).length !== 1 ? 's' : ''} · {formList.length} distinct form{formList.length !== 1 ? 's' : ''}
                </summary>
                <div className="kwic-summary-body">
                  <div>
                    <h4>Hits per file</h4>
                    <ul>
                      {Object.entries(perFile).map(([name, count]) => (
                        <li key={name}><span>{name}</span><span>{count}</span></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Matched forms</h4>
                    <ul>
                      {formList.slice(0, 50).map(([form, count]) => (
                        <li key={form}><span>{form}</span><span>{count}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            )}

            {results.length > 0 && (
              <div className="kwic-table-wrap">
                <table className="kwic-table">
                  <thead>
                    <tr>
                      <th className="kwic-num">#</th>
                      {multiFile && <th>File</th>}
                      <th className="kwic-left">Left context</th>
                      <th className="kwic-keyword">Keyword</th>
                      <th className="kwic-right">Right context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        <tr
                          className={`kwic-row${expandedId === item.id ? ' expanded' : ''}`}
                          onClick={() => setExpandedId(id => id === item.id ? null : item.id)}
                        >
                          <td className="kwic-num">{idx + 1}</td>
                          {multiFile && <td className="kwic-file" title={item.fileName}>{item.fileName}</td>}
                          <td className="kwic-left"><span>{item.leftWords.slice(-contextWords).join(' ')}</span></td>
                          <td className="kwic-keyword">{item.keyword}</td>
                          <td className="kwic-right">{item.rightWords.slice(0, contextWords).join(' ')}</td>
                        </tr>
                        {expandedId === item.id && (() => {
                          const ctx = expandedContext(item);
                          return (
                            <tr className="kwic-expanded">
                              <td colSpan={columnCount}>
                                <div className="kwic-expanded-meta">{item.fileName} · character {item.start.toLocaleString()}</div>
                                <div className="kwic-expanded-text">
                                  {ctx.before}<mark>{ctx.keyword}</mark>{ctx.after}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sortedResults.length > visibleCount && (
              <button
                className="kwic-sort-btn kwic-more"
                type="button"
                onClick={() => setVisibleCount(c => c + KWIC_PAGE_SIZE)}
              >
                Show more ({(sortedResults.length - visibleCount).toLocaleString()} remaining)
              </button>
            )}
          </div>
        </div>
      </div>
    </ToolPage>
  );
}

const PALETTE = [
  { name: 'Yellow', light: '#fef9c3', medium: '#fde047', dark: '#ca8a04', darkText: '#fff' },
  { name: 'Green',  light: '#dcfce7', medium: '#86efac', dark: '#16a34a', darkText: '#fff' },
  { name: 'Blue',   light: '#dbeafe', medium: '#93c5fd', dark: '#2563eb', darkText: '#fff' },
  { name: 'Pink',   light: '#fce7f3', medium: '#f9a8d4', dark: '#db2777', darkText: '#fff' },
  { name: 'Purple', light: '#ede9fe', medium: '#c4b5fd', dark: '#7c3aed', darkText: '#fff' },
  { name: 'Orange', light: '#ffedd5', medium: '#fdba74', dark: '#ea580c', darkText: '#fff' },
  { name: 'Teal',   light: '#ccfbf1', medium: '#5eead4', dark: '#0d9488', darkText: '#fff' },
  { name: 'Red',    light: '#fee2e2', medium: '#fca5a5', dark: '#dc2626', darkText: '#fff' },
];

const PENDING_STYLE = {
  backgroundColor: '#fde68a',
  border: '2px dashed #b45309',
  color: '#1f2937',
};

// Three states: unselected (light, no border), tagActive (medium + dashed
// border — this highlight belongs to the selected tag, but isn't the
// specific location currently focused), locationActive (dark + dashed
// border — this exact highlight is the one currently selected).
function getMarkStyle(color, state) {
  if (state === 'locationActive') {
    return { backgroundColor: color.dark, color: color.darkText, border: `2px dashed ${color.light}` };
  }
  if (state === 'tagActive') {
    return { backgroundColor: color.medium, color: '#1f2937', border: `2px dashed ${color.dark}` };
  }
  return { backgroundColor: color.light, color: '#1f2937', border: '2px solid transparent' };
}

// Colors are saved in the database by palette name ("Blue").
function paletteColor(name) {
  return PALETTE.find(c => c.name === name) || PALETTE[0];
}

// Converts a saved annotation (offsets within its file) to a range in the combined text.
function toRange(annotation, span) {
  const located = annotation.start !== null;
  return {
    id: annotation.id,
    fileId: annotation.file_id,
    start: located ? span.start + annotation.start : null,
    end: located ? span.start + annotation.end : null,
    selectedText: located ? annotation.selected_text : null,
  };
}

// Groups saved annotations into tags (one per annotation group), in creation order.
function buildTags(annotations, spans) {
  const spanByFile = new Map(spans.map(s => [s.fileId, s]));
  const tagsById = new Map();
  annotations.forEach(a => {
    const span = spanByFile.get(a.file_id);
    if (!span) return;
    if (!tagsById.has(a.group_id)) {
      tagsById.set(a.group_id, { id: a.group_id, note: a.name, color: paletteColor(a.color), ranges: [] });
    }
    tagsById.get(a.group_id).ranges.push(toRange(a, span));
  });
  return [...tagsById.values()];
}

// The document last opened in Annotate, so coming back to the page reopens it.
let lastAnnotatedFileId = null;

function AnnotateTool({ uploadedFiles }) {
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [sourceText, setSourceText] = useState('');
  const [tags, setTags] = useState([]); // [{ id: groupId, note, color, ranges: [{id: annotationId, fileId, start, end, selectedText}] }]
  const [newAnnotation, setNewAnnotation] = useState('');
  const [pendingSelection, setPendingSelection] = useState(null);
  const [activeTagId, setActiveTagId] = useState(null);
  const [activeLocationId, setActiveLocationId] = useState(null);
  const [hoverInfo, setHoverInfo] = useState(null); // { note, x, y }
  const [saving, setSaving] = useState(false);
  const [annotateError, setAnnotateError] = useState('');
  const textRef = useRef(null);
  const docPanelRef = useRef(null);
  const inputRef = useRef(null);

  // One document is open at a time: the last one opened if it still exists, else the newest.
  useEffect(() => {
    const files = uploadedFiles || [];
    const file = files.find(f => f.id === lastAnnotatedFileId) || files[0];
    const ids = file ? [file.id] : [];
    setSelectedFileIds(ids);
    setSourceText(combineSelectedFiles(files, ids));
    setPendingSelection(null);
    setActiveTagId(null);
    setActiveLocationId(null);
  }, [uploadedFiles]);

  // Load the saved annotations for whichever files are selected.
  useEffect(() => {
    setTags([]);
    setAnnotateError('');
    if (selectedFileIds.length === 0) return;
    let cancelled = false;
    api.listAnnotations(selectedFileIds)
      .then(annotations => {
        if (!cancelled) setTags(buildTags(annotations, getFileSpans(uploadedFiles, selectedFileIds)));
      })
      .catch(err => {
        if (!cancelled) setAnnotateError(`Could not load annotations: ${err.message}`);
      });
    return () => { cancelled = true; };
  }, [uploadedFiles, selectedFileIds]);

  useEffect(() => {
    if (pendingSelection) {
      inputRef.current?.focus();
    }
  }, [pendingSelection]);

  // FileSidebar in single mode passes [fileId].
  const openFile = (ids) => {
    if (ids[0] === selectedFileIds[0]) return;
    lastAnnotatedFileId = ids[0];
    setSelectedFileIds(ids);
    setSourceText(combineSelectedFiles(uploadedFiles, ids));
    setPendingSelection(null);
    setActiveTagId(null);
    setActiveLocationId(null);
  };

  const clearActiveSelection = () => {
    setActiveTagId(null);
    setActiveLocationId(null);
  };

  const handleTextMouseUp = (e) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setPendingSelection(null);
      if (e.target === textRef.current || !e.target.closest('mark')) {
        clearActiveSelection();
      }
      return;
    }
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(textRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const selectedText = selection.toString();
    if (selectedText.length > 0) {
      setPendingSelection({ start, end: start + selectedText.length, selectedText });
      clearActiveSelection();
    } else {
      setPendingSelection(null);
    }
  };

  // Saves the pending selection (or, with nothing selected, a whole-document
  // annotation on each selected file) under the tag with this name.
  // Returns the tag's id, or null if nothing was saved.
  const commitRange = async (noteText) => {
    const name = noteText.trim();
    const sameName = tags.find(t => t.note.toLowerCase() === name.toLowerCase());
    const color = sameName ? sameName.color : PALETTE[tags.length % PALETTE.length];
    const spans = getFileSpans(uploadedFiles, selectedFileIds);

    let targets;
    if (pendingSelection) {
      const span = spans.find(s => pendingSelection.start >= s.start && pendingSelection.end <= s.end);
      if (!span) {
        setAnnotateError('Select text inside a single file (not across files or file headings).');
        return null;
      }
      targets = [{
        span,
        start: pendingSelection.start - span.start,
        end: pendingSelection.end - span.start,
        selectedText: pendingSelection.selectedText,
      }];
    } else {
      targets = spans.map(span => ({ span, start: null, end: null, selectedText: '' }));
    }
    if (targets.length === 0) return null;

    setSaving(true);
    setAnnotateError('');
    try {
      const saved = await Promise.all(targets.map(({ span, ...annotation }) =>
        api.addAnnotation(span.fileId, { name, color: color.name, ...annotation })
          .then(result => ({ result, span, annotation }))
      ));
      setTags(prev => {
        let next = prev;
        saved.forEach(({ result, span, annotation }) => {
          const range = toRange({
            id: result.id, file_id: span.fileId, start: annotation.start, end: annotation.end,
            selected_text: annotation.selectedText,
          }, span);
          next = next.some(t => t.id === result.group_id)
            ? next.map(t => t.id === result.group_id ? { ...t, ranges: [...t.ranges, range] } : t)
            : [...next, { id: result.group_id, note: result.name, color: paletteColor(result.color), ranges: [range] }];
        });
        return next;
      });
      setNewAnnotation('');
      setPendingSelection(null);
      window.getSelection()?.removeAllRanges();
      return saved[0].result.group_id;
    } catch (err) {
      setAnnotateError(`Could not save annotation: ${err.message}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addNewOrMatchingTag = () => {
    if (!newAnnotation.trim() || saving) return;
    commitRange(newAnnotation);
  };

  const addToExistingTag = async (tag) => {
    if (saving) return;
    const tagId = await commitRange(tag.note);
    if (tagId !== null) setActiveTagId(tagId);
  };

  const updateTagColor = async (tagId, color) => {
    setAnnotateError('');
    try {
      await api.setGroupColor(tagId, color.name);
      setTags(prev => prev.map(t => t.id === tagId ? { ...t, color } : t));
    } catch (err) {
      setAnnotateError(`Could not change color: ${err.message}`);
    }
  };

  const deleteRange = async (tagId, rangeId) => {
    setAnnotateError('');
    try {
      await api.deleteAnnotation(rangeId);
    } catch (err) {
      setAnnotateError(`Could not remove annotation: ${err.message}`);
      return;
    }
    setTags(prev => prev
      .map(t => t.id === tagId ? { ...t, ranges: t.ranges.filter(r => r.id !== rangeId) } : t)
      .filter(t => t.ranges.length > 0)
    );
    if (activeLocationId === rangeId) setActiveLocationId(null);
  };

  // Removes this tag's annotations from the selected files.
  const deleteTag = async (tag) => {
    const count = tag.ranges.length;
    if (!window.confirm(`Delete the tag "${tag.note}" and its ${count} annotation${count !== 1 ? 's' : ''}?`)) return;
    setAnnotateError('');
    const results = await Promise.allSettled(tag.ranges.map(r => api.deleteAnnotation(r.id)));
    const failedIds = new Set(tag.ranges.filter((r, i) => results[i].status === 'rejected').map(r => r.id));
    setTags(prev => prev
      .map(t => t.id === tag.id ? { ...t, ranges: t.ranges.filter(r => failedIds.has(r.id)) } : t)
      .filter(t => t.ranges.length > 0)
    );
    if (failedIds.size > 0) {
      setAnnotateError(`Could not delete ${failedIds.size} annotation(s) from "${tag.note}".`);
    } else if (activeTagId === tag.id) {
      clearActiveSelection();
    }
  };

  const jumpToLocation = (tagId, rangeId) => {
    setPendingSelection(null);
    setActiveTagId(tagId);
    setActiveLocationId(rangeId);
    // Use a data-attribute query rather than getElementById: a single range
    // can be split across multiple <mark> segments (when something else
    // overlaps it in the middle), so its id isn't guaranteed unique in the DOM.
    const el = textRef.current?.querySelector(`mark[data-range-id="${rangeId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cycleLocation = (direction) => {
    const tag = tags.find(t => t.id === activeTagId);
    if (!tag) return;
    const located = tag.ranges.filter(r => r.start !== null);
    if (located.length === 0) return;
    const currentIndex = located.findIndex(r => r.id === activeLocationId);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + located.length) % located.length;
    jumpToLocation(tag.id, located[nextIndex].id);
  };

  const toggleTagOpen = (tagId) => {
    setPendingSelection(null);
    setActiveTagId(prev => (prev === tagId ? null : tagId));
    setActiveLocationId(null);
  };

  const handleMarkClick = (e, tagId, rangeId) => {
    e.stopPropagation();
    setPendingSelection(null);
    if (activeTagId === tagId && activeLocationId === rangeId) {
      clearActiveSelection();
    } else {
      setActiveTagId(tagId);
      setActiveLocationId(rangeId);
    }
  };

  const handleMarkMouseMove = (e, note) => {
    const container = docPanelRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    setHoverInfo({
      note,
      x: e.clientX - containerRect.left + container.scrollLeft,
      y: e.clientY - containerRect.top + container.scrollTop,
    });
  };

  const handleMarkMouseLeave = () => setHoverInfo(null);

  // Splits the text into non-overlapping segments and, for any segment
  // covered by more than one range, picks exactly one "winner" to display —
  // so overlapping annotations never duplicate the underlying text.
  // Winner priority: in-progress pending selection > the specifically
  // selected location > any location of the selected tag > most recently
  // created range.
  const buildRenderSegments = () => {
    const flatRanges = tags.flatMap(t =>
      t.ranges
        .filter(r => r.start !== null)
        .map(r => ({ ...r, tagId: t.id, note: t.note, color: t.color, isPending: false }))
    );

    if (pendingSelection) {
      flatRanges.push({
        id: 'pending',
        tagId: null,
        start: pendingSelection.start,
        end: pendingSelection.end,
        note: newAnnotation.trim() || 'New annotation…',
        color: null,
        isPending: true,
      });
    }

    if (!flatRanges.length) return [{ text: sourceText, winner: null }];

    const boundarySet = new Set([0, sourceText.length]);
    flatRanges.forEach(r => { boundarySet.add(r.start); boundarySet.add(r.end); });
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    const rawSegments = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const segStart = boundaries[i];
      const segEnd = boundaries[i + 1];
      if (segStart >= segEnd) continue;

      const covering = flatRanges.filter(r => r.start <= segStart && r.end >= segEnd);
      let winner = null;
      if (covering.length) {
        const scored = covering.map(r => {
          let tier;
          if (r.isPending) tier = 3;
          else if (activeLocationId !== null && r.id === activeLocationId) tier = 2;
          else if (activeTagId !== null && r.tagId === activeTagId) tier = 1;
          else tier = 0;
          return { r, tier };
        });
        scored.sort((a, b) => b.tier - a.tier || (b.r.id > a.r.id ? 1 : -1));
        winner = scored[0].r;
      }
      rawSegments.push({ text: sourceText.slice(segStart, segEnd), winner, start: segStart, end: segEnd });
    }

    // Merge adjacent segments that share the same winning range, so a
    // range that isn't interrupted by anything renders as a single <mark>.
    const merged = [];
    rawSegments.forEach(seg => {
      const last = merged[merged.length - 1];
      const segKey = seg.winner ? (seg.winner.isPending ? 'pending' : `${seg.winner.tagId}-${seg.winner.id}`) : null;
      const lastKey = last?.winner ? (last.winner.isPending ? 'pending' : `${last.winner.tagId}-${last.winner.id}`) : null;
      if (last && segKey === lastKey) {
        last.text += seg.text;
        last.end = seg.end;
      } else {
        merged.push({ ...seg });
      }
    });
    return merged;
  };

  const renderAnnotatedText = () => {
    const segments = buildRenderSegments();
    return segments.map((seg, i) => {
      if (!seg.winner) {
        return <span key={`text-${i}`}>{seg.text}</span>;
      }
      if (seg.winner.isPending) {
        return (
          <mark key={`mark-pending-${i}`} className="annotate-highlight pending" style={PENDING_STYLE}>
            {seg.text}
          </mark>
        );
      }
      const r = seg.winner;
      const isActiveTag = activeTagId === r.tagId;
      const isActiveLocation = activeLocationId === r.id;
      const state = isActiveLocation ? 'locationActive' : isActiveTag ? 'tagActive' : 'unselected';
      return (
        <mark
          key={`mark-${r.id}-${i}`}
          data-tag-id={r.tagId}
          data-range-id={r.id}
          onClick={(e) => handleMarkClick(e, r.tagId, r.id)}
          onMouseMove={(e) => handleMarkMouseMove(e, r.note)}
          onMouseLeave={handleMarkMouseLeave}
          className="annotate-highlight"
          style={getMarkStyle(r.color, state)}
        >
          {seg.text}
        </mark>
      );
    });
  };

  return (
    <ToolPage title="Annotate" subtitle="Highlight text then tag it — reuse a tag across multiple sections.">
      <div className="search-panel-with-files">
        <FileSidebar uploadedFiles={uploadedFiles} selectedFileIds={selectedFileIds} onChange={openFile} single />
        <div className="annotate-main">
          <div className="annotate-doc-panel" ref={docPanelRef} style={{ position: 'relative' }}>
            <label>{uploadedFiles?.find(f => f.id === selectedFileIds[0])?.name ?? 'Document text'}</label>
            <div
              ref={textRef}
              onMouseUp={handleTextMouseUp}
              className="annotate-text-display"
            >
              {sourceText
                ? renderAnnotatedText()
                : <span className="no-files">No documents yet. Upload files in Document Manager.</span>
              }
            </div>
            {hoverInfo && (
              <div
                className="annotate-hover-tooltip"
                style={{
                  position: 'absolute',
                  left: hoverInfo.x,
                  top: hoverInfo.y - 12,
                  transform: 'translate(-50%, -100%)',
                  pointerEvents: 'none',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#15253e',
                  color: 'white',
                }}
              >
                {hoverInfo.note}
              </div>
            )}
          </div>

          <div className="annotate-controls">
            <div className={`annotate-selection-status${pendingSelection ? '' : ' empty'}`}>
              {pendingSelection
                ? <>Selected: <strong>"{pendingSelection.selectedText.slice(0, 60)}{pendingSelection.selectedText.length > 60 ? '…' : ''}"</strong></>
                : <span>No text selected — annotation will apply to the whole document.</span>
              }
            </div>

            <div className="annotate-input-row">
              <input
                ref={inputRef}
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNewOrMatchingTag()}
                placeholder="Tag name"
              />
              <button className="run-search" type="button" onClick={addNewOrMatchingTag} disabled={saving}>
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
            {annotateError && <div className="error">{annotateError}</div>}

            {pendingSelection && tags.length > 0 && (
              <div className="annotate-existing-tags">
                <div className="annotate-existing-tags-label">
                  Or add selection to an existing tag:
                </div>
                <div className="annotate-tag-chips">
                  {tags.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="annotate-tag-chip"
                      onClick={() => addToExistingTag(t)}
                      style={{ borderLeft: `4px solid ${t.color.dark}` }}
                    >
                      {t.note} ({t.ranges.length})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="annotate-list-header">
              <h3>Tags ({tags.length})</h3>
              {tags.length === 0 && <p className="annotate-selection-status empty">No annotations yet.</p>}
              <ul className="annotate-list">
                {tags.map((tag) => {
                  const isOpen = activeTagId === tag.id;
                  const locatedRanges = tag.ranges.filter(r => r.start !== null);
                  const generalRanges = tag.ranges.filter(r => r.start === null);
                  return (
                    <li
                      key={tag.id}
                      className={`annotate-list-item${isOpen ? ' active' : ''}`}
                      onClick={() => toggleTagOpen(tag.id)}
                      style={{ borderLeft: `4px solid ${tag.color.dark}` }}
                    >
                      <div className="annotate-item-note">
                        <span
                          className="annotate-color-dot"
                          style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            backgroundColor: tag.color.dark, marginRight: 6,
                          }}
                        />
                        {tag.note}
                        <span className="annotate-tag-count"> — {tag.ranges.length} location{tag.ranges.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        className="annotate-item-delete"
                        onClick={(e) => { e.stopPropagation(); deleteTag(tag); }}
                      >
                        Delete tag
                      </button>

                      {isOpen && (
                        <div className="annotate-tag-locations" onClick={(e) => e.stopPropagation()}>
                          <div className="annotate-color-picker">
                            <span className="annotate-color-picker-label">Color:</span>
                            {PALETTE.map(c => (
                              <button
                                key={c.name}
                                type="button"
                                title={c.name}
                                onClick={() => updateTagColor(tag.id, c)}
                                className={`annotate-color-swatch${tag.color.name === c.name ? ' selected' : ''}`}
                                style={{
                                  backgroundColor: c.dark,
                                  width: 18, height: 18, borderRadius: '50%',
                                  border: tag.color.name === c.name ? '2px solid #1f2937' : '1px solid #d1d5db',
                                  marginRight: 4, cursor: 'pointer',
                                }}
                              />
                            ))}
                          </div>

                          {locatedRanges.length > 0 && (
                            <div className="annotate-find-controls">
                              <button type="button" onClick={() => cycleLocation(-1)}>↑ Prev</button>
                              <span>
                                {locatedRanges.findIndex(r => r.id === activeLocationId) + 1 || '-'} / {locatedRanges.length}
                              </span>
                              <button type="button" onClick={() => cycleLocation(1)}>Next ↓</button>
                            </div>
                          )}
                          <ul>
                            {locatedRanges.map(r => (
                              <li
                                key={r.id}
                                className={`annotate-item-excerpt${activeLocationId === r.id ? ' current' : ''}`}
                                onClick={() => jumpToLocation(tag.id, r.id)}
                              >
                                "{r.selectedText.slice(0, 80)}{r.selectedText.length > 80 ? '…' : ''}"
                                <button
                                  className="annotate-item-delete"
                                  onClick={(e) => { e.stopPropagation(); deleteRange(tag.id, r.id); }}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                            {generalRanges.map(r => (
                              <li key={r.id} className="annotate-item-excerpt general">
                                General annotation
                                <button
                                  className="annotate-item-delete"
                                  onClick={(e) => { e.stopPropagation(); deleteRange(tag.id, r.id); }}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </ToolPage>
  );
}

// SearchTool — base component used by DataVisualizationTool via extraRender
function SearchTool({ title, subtitle, extraRender, uploadedFiles }) {
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (uploadedFiles && uploadedFiles.length > 0) {
      setSelectedFileIds(uploadedFiles.map(f => f.id));
    } else {
      setSelectedFileIds([]);
    }
    setResults([]);
    setError('');
    setHasSearched(false);
  }, [uploadedFiles]);

  const sourceText = combineSelectedFiles(uploadedFiles, selectedFileIds);

  // After a search has been run, changing the file selection re-runs it.
  const changeFileSelection = (next) => {
    setSelectedFileIds(next);
    if (hasSearched) runSearch(next);
  };

  const runSearch = (fileIds = selectedFileIds) => {
    setError('');
    if (!query.trim()) { setResults([]); return; }
    setHasSearched(true);
    const sourceText = combineSelectedFiles(uploadedFiles, fileIds);
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = isRegex ? query : escapeRegExp(query);
      const regexp = new RegExp(pattern, flags);
      const found = [];
      let match;
      while ((match = regexp.exec(sourceText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const contextStart = Math.max(0, start - 40);
        const contextEnd = Math.min(sourceText.length, end + 40);
        const context = sourceText.slice(contextStart, contextEnd);
        found.push({ start, end, matchText: match[0], context, contextStart, contextEnd });
        if (match[0].length === 0) regexp.lastIndex += 1;
      }
      setResults(found);
      if (found.length === 0) setError('No matches found.');
    } catch (e) {
      setResults([]);
      setError('Invalid regex: ' + e.message);
    }
  };

  return (
    <ToolPage title={title} subtitle={subtitle}>
      <div className="search-panel-with-files">
        <FileSidebar uploadedFiles={uploadedFiles} selectedFileIds={selectedFileIds} onChange={changeFileSelection} />
        <div className="search-panel">
          <div className="search-controls">
            <label>
              Search query
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="word or regex" />
            </label>
            <label>
              <input type="checkbox" checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} />
              Use regex
            </label>
            <label>
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
              Case sensitive
            </label>
            <button className="run-search" onClick={() => runSearch()} type="button">Search</button>
          </div>

          <div className="search-results">
            <h3>Results ({results.length})</h3>
            {error && <div className="error">{error}</div>}
            <ul>
              {results.map((item, idx) => {
                const label = item.matchText || '';
                const re = new RegExp(escapeRegExp(label), caseSensitive ? 'g' : 'gi');
                const parts = item.context.split(re);
                const matches = item.context.match(re) || [];
                return (
                  <li key={`${item.start}-${idx}`}>
                    <span className="result-meta">pos {item.start}-{item.end}: "{item.matchText}"</span>
                    <p>
                      {parts.flatMap((part, partIndex) => (
                        partIndex < matches.length
                          ? [<span key={`n-${partIndex}`}>{part}</span>, <strong key={`m-${partIndex}`}>{matches[partIndex]}</strong>]
                          : [<span key={`n-${partIndex}`}>{part}</span>]
                      ))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {extraRender && extraRender({ sourceText, query, isRegex, caseSensitive, results, setResults, setError })}
        </div>
      </div>
    </ToolPage>
  );
}

function DataVisualizationTool({ uploadedFiles }) {
  const [chartType, setChartType] = useState('bar');

  const renderVisualization = (chartType, results, query, sourceText) => {
    if (!results || results.length === 0) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          <p>No results to visualize. Perform a search first.</p>
        </div>
      );
    }

    if (chartType === 'bar') {
      return (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: query || 'Search Term', count: results.length }]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0f66d0" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartType === 'line') {
      const lineData = Array.from({ length: Math.min(results.length, 20) }, (_, i) => ({
        position: i + 1,
        count: i + 1,
      }));
      return (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#e14f56" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartType === 'wordcloud') {
      const wordData = generateWordFrequency(sourceText);
      if (query && query.trim()) {
        const searchTermLower = query.toLowerCase();
        const existingIndex = wordData.findIndex(w => w.text === searchTermLower);
        if (existingIndex >= 0) {
          const [searchTerm] = wordData.splice(existingIndex, 1);
          wordData.unshift(searchTerm);
        } else {
          wordData.unshift({ text: searchTermLower, value: Math.max(...wordData.map(w => w.value)) });
        }
      }
      if (wordData.length === 0) {
        return (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666' }}>
            <p>Not enough unique words to generate a word cloud.</p>
          </div>
        );
      }
      const maxFreq = Math.max(...wordData.map(w => w.value));
      const colors = ['#0f66d0', '#e14f56', '#406b99', '#5d92dd', '#0a4ca3', '#c75a5a', '#2a5fb8', '#d44949', '#8b9fc9', '#6b8cc9'];
      const rotations = [-10, -5, 0, 5, 10];
      return (
        <div className="wordcloud-container">
          {wordData.map((word, idx) => {
            const sizeMultiplier = word.value / maxFreq;
            return (
              <span
                key={idx}
                className="wordcloud-word"
                title={`${word.text}: ${word.value} occurrences`}
                style={{
                  fontSize: `${14 + sizeMultiplier * 36}px`,
                  color: colors[idx % colors.length],
                  fontWeight: 400 + Math.floor(sizeMultiplier * 400),
                  transform: `rotate(${rotations[idx % rotations.length]}deg)`,
                }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      );
    }

    if (chartType === 'table') {
      return (
        <div style={{ overflowX: 'auto', marginTop: '0.8rem' }}>
          <table className="results-table">
            <thead>
              <tr><th>#</th><th>Position</th><th>Match</th><th>Context</th></tr>
            </thead>
            <tbody>
              {results.slice(0, 25).map((result, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{result.start}</td>
                  <td><strong>{result.matchText}</strong></td>
                  <td>{result.context.substring(0, 50)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
            Showing {Math.min(results.length, 25)} of {results.length} results
          </p>
        </div>
      );
    }
  };

  return (
    <SearchTool
      title="Data Visualization"
      subtitle="Search text and render a chart or table based on your results."
      uploadedFiles={uploadedFiles}
      extraRender={({ results, query, sourceText }) => (
        <div>
          <h3>Visualization Options</h3>
          <label>
            Chart type
            <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="wordcloud">Word Cloud</option>
              <option value="table">Results Table</option>
            </select>
          </label>
          <p style={{ marginTop: '0.6rem' }}>Total matches: <strong>{results.length}</strong></p>
          <div style={{ marginTop: '1.2rem', padding: '1rem', border: '1px solid #dbe3f8', borderRadius: '8px', background: '#f5f8ff' }}>
            {renderVisualization(chartType, results, query, sourceText)}
          </div>
        </div>
      )}
    />
  );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result || '');
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsText(file);
  });
}

function formatFileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// D1 stores CURRENT_TIMESTAMP as UTC "YYYY-MM-DD HH:MM:SS".
function formatSavedDate(createdAt) {
  if (!createdAt) return '';
  return new Date(`${createdAt.replace(' ', 'T')}Z`).toLocaleDateString();
}

function DocumentManager({ files, libraryStatus, saveFile, removeFile }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadFiles = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const validFiles = Array.from(selectedFiles).filter(file =>
      file.type.includes('text') || file.name.endsWith('.txt')
    );
    if (validFiles.length === 0) {
      setError('Please select only plain text (.txt) files.');
      return;
    }
    setLoading(true);
    setStatus(`Saving ${validFiles.length} file(s)...`);
    const failures = [];
    for (const file of validFiles) {
      try {
        await saveFile(file.name, await readFileAsText(file));
      } catch (err) {
        failures.push(`${file.name} (${err.message})`);
      }
    }
    const savedCount = validFiles.length - failures.length;
    setStatus(savedCount > 0 ? `Saved ${savedCount} file(s)` : '');
    setError(failures.length > 0 ? `Could not save: ${failures.join('; ')}` : '');
    setLoading(false);
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.name}" and all of its annotations? This cannot be undone.`)) return;
    setError(''); setStatus('');
    try {
      await removeFile(file.id);
      setStatus(`Deleted ${file.name}`);
    } catch (err) {
      setError(`Could not delete ${file.name}: ${err.message}`);
    }
  };

  const loadFromUrl = async (url, name) => {
    setLoading(true);
    setError('');
    setStatus('Loading document from OneDrive...');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);
      const text = await response.text();
      await saveFile(name, text);
      setStatus(`Saved OneDrive file: ${name}`);
    } catch (err) {
      setError(`Unable to load file from OneDrive: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onSelectFile = (event) => {
    setError(''); setStatus('');
    loadFiles(event.target.files);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setError(''); setStatus('');
    loadFiles(event.dataTransfer.files);
  };

  const openOneDrivePicker = () => {
    setError('');
    const initPicker = () => {
      if (!window.OneDrive?.open) { setError('OneDrive picker is not available.'); return; }
      window.OneDrive.open({
        clientId: '<YOUR_ONEDRIVE_APP_CLIENT_ID>',
        action: 'download',
        multiSelect: false,
        advanced: { filter: '.txt', redirectUri: window.location.origin },
        success: (files) => {
          const selected = Array.isArray(files) ? files : files?.value || [];
          if (!selected.length) { setError('No file selected from OneDrive.'); return; }
          const file = selected[0];
          const downloadUrl = file['@microsoft.graph.downloadUrl'] || file.downloadUrl || file.url || file.webUrl;
          if (!downloadUrl) { setError('Unable to get a download URL for the selected file.'); return; }
          loadFromUrl(downloadUrl, file.name || 'OneDrive document');
        },
        cancel: () => setStatus('OneDrive picker closed.'),
        error: (err) => setError(`OneDrive picker error: ${err?.message || JSON.stringify(err)}`),
      });
    };
    if (window.OneDrive) { initPicker(); return; }
    const script = document.createElement('script');
    script.src = 'https://js.live.net/v7.2/OneDrive.js';
    script.onload = initPicker;
    script.onerror = () => setError('Failed to load the OneDrive picker script.');
    document.body.appendChild(script);
  };

  return (
    <ToolPage title="Document Manager" subtitle="Upload documents to save them for the keyword and annotation tools. Saved documents stay after a refresh.">
      <div className="doc-manager-grid">
        <div className="doc-manager-card" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <h3>Local files</h3>
          <p>Upload one or more plain text documents from your computer.</p>
          <input type="file" accept=".txt,text/plain" onChange={onSelectFile} multiple disabled={loading} />
        </div>
        <div className="doc-manager-card">
          <h3>OneDrive</h3>
          <p>Choose a text file from OneDrive for searching and review.</p>
          <button type="button" className="run-search" onClick={openOneDrivePicker} disabled={loading}>
            {loading ? 'Loading...' : 'Select from OneDrive'}
          </button>
        </div>
      </div>
      <div className="doc-manager-status">
        {status && <div className="status-message">{status}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="doc-manager-card doc-manager-saved">
        <h3>Saved documents ({files.length})</h3>
        {libraryStatus.loading && <p>Loading saved documents...</p>}
        {libraryStatus.error && <div className="error">{libraryStatus.error}</div>}
        {!libraryStatus.loading && !libraryStatus.error && files.length === 0 && <p>No documents saved yet.</p>}
        {files.length > 0 && (
          <ul className="saved-file-list">
            {files.map(file => (
              <li key={file.id}>
                <span className="file-name">{file.name}</span>
                <span className="saved-file-meta">{formatFileSize(file.size_bytes)} · {formatSavedDate(file.created_at)}</span>
                <button type="button" className="annotate-item-delete" onClick={() => deleteFile(file)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ToolPage>
  );
}

export default function App() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [libraryStatus, setLibraryStatus] = useState({ loading: true, error: '' });

  // Load every saved document (with its text) once, so all tools can use them.
  useEffect(() => {
    api.listFilesWithContent()
      .then(files => {
        setUploadedFiles(files);
        setLibraryStatus({ loading: false, error: '' });
      })
      .catch(err => setLibraryStatus({ loading: false, error: `Could not load saved documents: ${err.message}` }));
  }, []);

  const saveFile = async (name, content) => {
    const saved = await api.uploadFile(name, content);
    setUploadedFiles(prev => [{ ...saved, content }, ...prev]);
  };

  const removeFile = async (id) => {
    await api.deleteFile(id);
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">WSU Corpus Analysis</div>
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
          <NavLink to="/document-manager" className={({ isActive }) => (isActive ? 'active' : '')}>Document Manager</NavLink>
          <NavLink to="/keyword-context" className={({ isActive }) => (isActive ? 'active' : '')}>Keyword in Context</NavLink>
          <NavLink to="/annotate" className={({ isActive }) => (isActive ? 'active' : '')}>Annotate</NavLink>
          <NavLink to="/data-visualization" className={({ isActive }) => (isActive ? 'active' : '')}>Data Visualization</NavLink>        </nav>
      </aside>
      <main className="main-content">
        <header className="page-header">
          <h1>Project Dashboard</h1>
          <p>Pick a section to continue.</p>
        </header>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/document-manager"
            element={<DocumentManager files={uploadedFiles} libraryStatus={libraryStatus} saveFile={saveFile} removeFile={removeFile} />}
          />
          <Route path="/keyword-context" element={<KeywordContextTool uploadedFiles={uploadedFiles} />} />
          <Route path="/annotate" element={<AnnotateTool uploadedFiles={uploadedFiles} />} />
          <Route path="/data-visualization" element={<DataVisualizationTool uploadedFiles={uploadedFiles} />} />          <Route path="*" element={<h2>Page not found</h2>} />
        </Routes>
      </main>
    </div>
  );
}
