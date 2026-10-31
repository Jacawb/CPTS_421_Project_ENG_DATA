import React, { useState } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';

const tools = [
  {
    name: 'Keyword & Context',
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

<<<<<<< Updated upstream
function SearchTool({ title, subtitle, extraRender, uploadedFiles }) {
=======
function createWordCloudLayout(words, width, height) {
  if (!width || !height) return [];

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to measure word cloud text.');

  const maxFrequency = Math.max(...words.map(word => word.value), 1);
  const maxFontSize = Math.min(112, width * 0.15);
  const minFontSize = 12;
  const colors = ['#737900', '#f07800', '#79002b', '#1b5792', '#4b7028', '#c35d28', '#f0cc00', '#394d0c'];
  const placed = [];

  words.forEach((word, index) => {
    const weight = Math.min(900, 700 + Math.round((word.value / maxFrequency) * 200));
    const ratio = Math.pow(word.value / maxFrequency, 0.68);
    let fontSize = minFontSize + ratio * (maxFontSize - minFontSize);
    let position = null;

    for (let attempt = 0; attempt < 12 && !position; attempt += 1) {
      context.font = `${weight} ${fontSize}px Arial, sans-serif`;
      const textWidth = context.measureText(word.text).width;
      const textHeight = fontSize * 1.05;
      const boxWidth = textWidth;
      const boxHeight = textHeight;
      const centerX = width / 2;
      const centerY = height / 2;
      const spacing = 4;
      const maxRadius = Math.ceil(Math.hypot(width, height));

      if (boxWidth <= width - 12 && boxHeight <= height - 12) {
        for (let radius = 0; radius <= maxRadius && !position; radius += spacing) {
          const offsets = [];
          if (radius === 0) {
            offsets.push([0, 0]);
          } else {
            for (let offset = -radius; offset <= radius; offset += spacing) {
              offsets.push([offset, -radius]);
              offsets.push([radius, offset]);
              offsets.push([-offset, radius]);
              offsets.push([-radius, -offset]);
            }
          }

          for (const [offsetX, offsetY] of offsets) {
            const left = centerX + offsetX - boxWidth / 2;
            const top = centerY + offsetY - boxHeight / 2;
            const candidate = { left, top, width: boxWidth, height: boxHeight };
            if (
              left >= 6 &&
              top >= 6 &&
              left + boxWidth <= width - 6 &&
              top + boxHeight <= height - 6 &&
              placed.every(existing =>
                candidate.left + candidate.width + 3 <= existing.left ||
                existing.left + existing.width + 3 <= candidate.left ||
                candidate.top + candidate.height + 3 <= existing.top ||
                existing.top + existing.height + 3 <= candidate.top
              )
            ) {
              position = candidate;
              break;
            }
          }
        }
      }

      if (!position) fontSize = Math.max(minFontSize, fontSize * 0.8);
    }

    if (position) {
      placed.push(position);
      word.layout = {
        ...position,
        fontSize,
        weight,
        color: colors[index % colors.length],
      };
    }
  });

  return words.filter(word => word.layout);
}

function WordCloud({ words }) {
  const containerRef = useRef(null);
  const [layout, setLayout] = useState([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateLayout = () => {
      const { width, height } = container.getBoundingClientRect();
      const cloudWords = words.map(({ text, value }) => ({ text, value }));
      setLayout(createWordCloudLayout(cloudWords, width, height));
    };

    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [words]);

  return (
    <div ref={containerRef} className="wordcloud-container" aria-label="word cloud">
      {layout.map(word => (
        <span
          key={word.text}
          className="wordcloud-word"
          title={`${word.text}: ${word.value} occurrences`}
          style={{
            left: `${word.layout.left + word.layout.width / 2}px`,
            top: `${word.layout.top + word.layout.height / 2}px`,
            fontSize: `${word.layout.fontSize}px`,
            color: word.layout.color,
            fontWeight: word.layout.weight,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}

function combineSelectedFiles(uploadedFiles, selectedFileIds) {
  if (!uploadedFiles || uploadedFiles.length === 0) return '';
  const selected = uploadedFiles.filter(f => selectedFileIds.includes(f.id));
  if (selected.length === 0) return '';
  if (selected.length === 1) return selected[0].content;
  return selected.map(f => `--- File: ${f.name} ---\n\n${f.content}`).join('\n\n');
}

function FileSidebar({ uploadedFiles, selectedFileIds, onToggle }) {
  return (
    <aside className="file-list-sidebar">
      <h3>Files</h3>
      {uploadedFiles && uploadedFiles.length > 0 ? (
        <ul className="file-list">
          {uploadedFiles.map(file => (
            <li key={file.id}>
              <label className="file-item">
                <input
                  type="checkbox"
                  checked={selectedFileIds.includes(file.id)}
                  onChange={() => onToggle(file.id)}
                />
                <span className="file-name">{file.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="no-files">No files loaded.</p>
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
  const [visibleCount, setVisibleCount] = useState(KWIC_PAGE_SIZE);
  const [expandedId, setExpandedId] = useState(null);

  // Reset only when the loaded files actually change, not on every visit to the page.
  useEffect(() => {
    if (filesRef === uploadedFiles) return;
    setFilesRef(uploadedFiles);
    setSelectedFileIds((uploadedFiles || []).map(f => f.id));
    setResults([]);
    setMessage(null);
  }, [uploadedFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const contextWords = Math.max(1, Math.min(KWIC_MAX_CONTEXT, Number(contextInput) || 1));
  const multiFile = new Set(results.map(r => r.fileId)).size > 1 || selectedFileIds.length > 1;

  const clearResults = () => {
    setResults([]);
    setMessage(null);
    setExpandedId(null);
  };

  const toggleFileSelection = (fileId) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
    clearResults();
  };

  const runSearch = () => {
    clearResults();
    setVisibleCount(KWIC_PAGE_SIZE);
    if (!query.trim()) return;
    const files = (uploadedFiles || []).filter(f => selectedFileIds.includes(f.id));
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
        <FileSidebar uploadedFiles={uploadedFiles} selectedFileIds={selectedFileIds} onToggle={toggleFileSelection} />
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
            <button className="run-search" onClick={runSearch} type="button">Search</button>
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

function AnnotateTool({ uploadedFiles }) {
  const [selectedFileIds, setSelectedFileIds] = useState([]);
>>>>>>> Stashed changes
  const [sourceText, setSourceText] = useState('');
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState([]);

  React.useEffect(() => {
    if (uploadedFiles && uploadedFiles.length > 0) {
      const allSelected = uploadedFiles.filter(f => f.selected).map(f => f.id);
      setSelectedFileIds(allSelected);
      updateSourceText(allSelected);
    } else {
      setSourceText('No files loaded. Go to Document Manager to upload documents.');
      setSelectedFileIds([]);
    }
  }, [uploadedFiles]);

  const updateSourceText = (fileIds) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      setSourceText('No files loaded.');
      return;
    }

    const selectedFiles = uploadedFiles.filter(f => fileIds.includes(f.id));
    const combined = selectedFiles.map(f => f.content).join('\n\n--- File: ' + selectedFiles.map((_, i) => uploadedFiles[uploadedFiles.findIndex(f => f.id === selectedFiles[i].id)].name).join(' ---\n\n--- File: ') + ' ---\n\n');
    setSourceText(combined || 'Select files to view content.');
  };

  const toggleFileSelection = (fileId) => {
    const newSelection = selectedFileIds.includes(fileId)
      ? selectedFileIds.filter(id => id !== fileId)
      : [...selectedFileIds, fileId];
    setSelectedFileIds(newSelection);
    updateSourceText(newSelection);
  };

  const runSearch = () => {
    setError('');

    if (!query.trim()) {
      setResults([]);
      return;
    }

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

        found.push({
          start,
          end,
          matchText: match[0],
          context,
          contextStart,
          contextEnd,
        });

        if (match[0].length === 0) {
          regexp.lastIndex += 1;
        }
      }

      setResults(found);
      if (found.length === 0) {
        setError('No matches found.');
      }
    } catch (e) {
      setResults([]);
      setError('Invalid regex: ' + e.message);
    }
  };

  return (
    <ToolPage title={title} subtitle={subtitle}>
      <div className="search-panel-with-files">
        <aside className="file-list-sidebar">
          <h3>Files</h3>
          {uploadedFiles && uploadedFiles.length > 0 ? (
            <ul className="file-list">
              {uploadedFiles.map(file => (
                <li key={file.id}>
                  <label className="file-item">
                    <input 
                      type="checkbox" 
                      checked={selectedFileIds.includes(file.id)}
                      onChange={() => toggleFileSelection(file.id)}
                    />
                    <span className="file-name">{file.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-files">No files loaded.</p>
          )}
        </aside>

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
            <button className="run-search" onClick={runSearch} type="button">Search</button>
          </div>

          <div className="search-grid">
            <div className="document-panel">
              <label>
                Document text
                <textarea
                  value={sourceText}
                  readOnly
                  rows={14}
                />
              </label>
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
          </div>

          {extraRender && extraRender({
            sourceText,
            query,
            isRegex,
            caseSensitive,
            results,
            setSourceText,
            setQuery,
            setIsRegex,
            setCaseSensitive,
            runSearch,
            setResults,
            setError,
          })}
        </div>
      </div>
    </ToolPage>
  );
}

function KeywordContextTool({ uploadedFiles }) {
  return (
    <SearchTool
      title="Keyword & Context"
      subtitle="Lookup terms with literal or regex search and see nearby context."
      uploadedFiles={uploadedFiles}
    />
  );
}
{/* this is the annotation manager section */}
function AnnotateTool({ uploadedFiles }) {
  const [annotations, setAnnotations] = useState([]);
  const [newAnnotation, setNewAnnotation] = useState('');

  const addAnnotation = () => {
    if (!newAnnotation.trim()) return;
    setAnnotations(prev => [...prev, newAnnotation.trim()]);
    setNewAnnotation('');
  };

  return (
    <SearchTool
      title="Annotate"
      subtitle="Search text first, then add annotations linked to your findings."
      uploadedFiles={uploadedFiles}
      extraRender={({ results }) => (
        <div>
          <h3>Annotation Manager</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              value={newAnnotation}
              onChange={(e) => setNewAnnotation(e.target.value)}
              placeholder="Enter new annotation"
              style={{ flexGrow: 1 }}
            />
            <button className="run-search" type="button" onClick={addAnnotation}>Add</button>
          </div>
          <p>Found matches: {results.length}</p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
            {annotations.map((ann, idx) => <li key={idx}>{ann}</li>)}
          </ul>
        </div>
      )}
    />
  );
}

function DataVisualizationTool({ uploadedFiles }) {
  const [chartType, setChartType] = useState('bar');

  const generateChartData = (results, query) => {
    if (!results || results.length === 0) return [];

    const fileMap = {};
    results.forEach(result => {
      if (!fileMap[query]) {
        fileMap[query] = 0;
      }
      fileMap[query] += 1;
    });

    return [
      {
        name: query || 'Search Term',
        value: results.length,
        matches: results.length,
      }
    ];
  };

  const VisualizationRenderer = ({ chartType, results, query, sourceText }) => {
    if (!results || results.length === 0) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          <p>No results to visualize. Perform a search first.</p>
        </div>
      );
    }

    const data = generateChartData(results, query);
    const chartData = [
      {
        name: query || 'Search Term',
        count: results.length,
      }
    ];

    if (chartType === 'bar') {
      return (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
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
<<<<<<< Updated upstream
      const wordData = generateWordFrequency(sourceText);
      
      // Add the search query to the word cloud if it exists
=======
      let wordData = generateWordFrequency(sourceText);
>>>>>>> Stashed changes
      if (query && query.trim()) {
        const searchTermLower = query.toLowerCase();
        const existingIndex = wordData.findIndex(w => w.text === searchTermLower);
        if (existingIndex >= 0) {
          // Move search term to front if it exists
          const [searchTerm] = wordData.splice(existingIndex, 1);
          wordData.unshift(searchTerm);
        } else {
<<<<<<< Updated upstream
          // Add search term if it doesn't exist
          wordData.unshift({ text: searchTermLower, value: Math.max(...wordData.map(w => w.value)) });
=======
          wordData.unshift({ text: searchTermLower, value: Math.max(...wordData.map(w => w.value), 1) });
>>>>>>> Stashed changes
        }
      }

      if (wordData.length === 0) {
        return (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666' }}>
            <p>Not enough unique words to generate a word cloud.</p>
          </div>
        );
      }
<<<<<<< Updated upstream

      const maxFreq = Math.max(...wordData.map(w => w.value));
      const colors = ['#0f66d0', '#e14f56', '#406b99', '#5d92dd', '#0a4ca3', '#c75a5a', '#2a5fb8', '#d44949', '#8b9fc9', '#6b8cc9'];
      const rotations = [-10, -5, 0, 5, 10];

      return (
        <div className="wordcloud-container">
          {wordData.map((word, idx) => {
            const sizeMultiplier = word.value / maxFreq;
            const size = 14 + sizeMultiplier * 36;
            const color = colors[idx % colors.length];
            const rotation = rotations[Math.floor(Math.random() * rotations.length)];
            const weight = 400 + Math.floor(sizeMultiplier * 400);
            const delay = idx * 0.02;

            return (
              <span
                key={idx}
                className="wordcloud-word"
                title={`${word.text}: ${word.value} occurrences`}
                style={{
                  fontSize: `${size}px`,
                  color: color,
                  fontWeight: weight,
                  transform: `rotate(${rotation}deg)`,
                  animation: `fadeInScale 0.5s ease-in-out ${delay}s both`,
                }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      );
=======
      return <WordCloud words={wordData.slice(0, 100)} />;
>>>>>>> Stashed changes
    }

    if (chartType === 'table') {
      return (
        <div style={{ overflowX: 'auto', marginTop: '0.8rem' }}>
          <table className="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Position</th>
                <th>Match</th>
                <th>Context</th>
              </tr>
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

  {/* this is the data visualization section */}
  return ( 
    <SearchTool
      title="Data Visualization"
      subtitle="Search data text and render a chart or table based on your results."
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
            <VisualizationRenderer chartType={chartType} results={results} query={query} sourceText={sourceText} />
          </div>
        </div>
      )}
    />
  );
}

function DocumentManager({ setUploadedFiles }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadFiles = (files) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(file => {
      return file.type.includes('text') || file.name.endsWith('.txt');
    });

    if (validFiles.length === 0) {
      setError('Please select only plain text (.txt) files.');
      return;
    }

    let loadedCount = 0;
    const fileArray = [];

    const onFileLoaded = () => {
      loadedCount += 1;
      if (loadedCount === validFiles.length) {
        setUploadedFiles(fileArray.map((item, idx) => ({
          id: idx,
          name: item.name,
          content: item.content,
          selected: true
        })));
        setStatus(`Loaded ${validFiles.length} file(s)`);
        setError('');
      }
    };

    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        fileArray[index] = {
          name: file.name,
          content: event.target.result || ''
        };
        onFileLoaded();
      };
      reader.onerror = () => {
        setError(`Error reading file: ${file.name}`);
      };
      reader.readAsText(file);
    });
  };

  const loadFromUrl = async (url, name) => {
    setLoading(true);
    setError('');
    setStatus('Loading document from OneDrive...');

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);
      const text = await response.text();
      setUploadedFiles([{
        id: 0,
        name: name,
        content: text,
        selected: true
      }]);
      setStatus(`Loaded OneDrive file: ${name}`);
    } catch (err) {
      setError(`Unable to load file from OneDrive: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onSelectFile = (event) => {
    setError('');
    setStatus('');
    loadFiles(event.target.files);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    loadFiles(event.dataTransfer.files);
  };

  const onDragOver = (event) => {
    event.preventDefault();
  };

  const openOneDrivePicker = () => {
    setError('');

    const initPicker = () => {
      if (!window.OneDrive?.open) {
        setError('OneDrive picker is not available.');
        return;
      }

      const odOptions = {
        clientId: '<YOUR_ONEDRIVE_APP_CLIENT_ID>',
        action: 'download',
        multiSelect: false,
        advanced: {
          filter: '.txt',
          redirectUri: window.location.origin,
        },
        success: (files) => {
          const selected = Array.isArray(files) ? files : files?.value || [];
          if (!selected.length) {
            setError('No file selected from OneDrive.');
            return;
          }

          const file = selected[0];
          const downloadUrl = file['@microsoft.graph.downloadUrl'] || file.downloadUrl || file.url || file.webUrl;
          if (!downloadUrl) {
            setError('Unable to get a download URL for the selected file.');
            return;
          }

          loadFromUrl(downloadUrl, file.name || 'OneDrive document');
        },
        cancel: () => {
          setStatus('OneDrive picker closed.');
        },
        error: (err) => {
          setError(`OneDrive picker error: ${err?.message || JSON.stringify(err)}`);
        },
      };

      window.OneDrive.open(odOptions);
    };

    if (window.OneDrive) {
      initPicker();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.live.net/v7.2/OneDrive.js';
    script.onload = initPicker;
    script.onerror = () => setError('Failed to load the OneDrive picker script.');
    document.body.appendChild(script);
  };

  return (
    <ToolPage title="Document Manager" subtitle="Select a document from local storage or OneDrive to use in the keyword and annotation tools.">
      <div className="doc-manager-grid">
        <div className="doc-manager-card">
          <h3>Local files</h3>
          <p>Upload one or more plain text documents from your computer.</p>
          <input type="file" accept=".txt,text/plain" onChange={onSelectFile} multiple />
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
    </ToolPage>
  );
}

function Courses() {
  return (
    <section className="page-content">
      <h1>Courses</h1>
      <p>This view is reserved for course management details.</p>
    </section>
  );
}

export default function App() {
  const [uploadedFiles, setUploadedFiles] = useState([]);

  return (
    <div className="layout">
      <aside className="sidebar"> {/* this is a comment section */}
        <div className="brand">Antconc website</div>
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
          <NavLink to="/document-manager" className={({ isActive }) => (isActive ? 'active' : '')}>Document Manager</NavLink>
          <NavLink to="/keyword-context" className={({ isActive }) => (isActive ? 'active' : '')}>Keyword & Context</NavLink>
          <NavLink to="/annotate" className={({ isActive }) => (isActive ? 'active' : '')}>Annotate</NavLink>
          <NavLink to="/data-visualization" className={({ isActive }) => (isActive ? 'active' : '')}>Data Visualization</NavLink>
          <NavLink to="/courses" className={({ isActive }) => (isActive ? 'active' : '')}>Courses</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <header className="page-header">
          <h1>Project Dashboard</h1>
          <p>Pick a section to continue.</p>
        </header>

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/document-manager" element={<DocumentManager setUploadedFiles={setUploadedFiles} />} />
          <Route path="/keyword-context" element={<KeywordContextTool uploadedFiles={uploadedFiles} />} />
          <Route path="/annotate" element={<AnnotateTool uploadedFiles={uploadedFiles} />} />
          <Route path="/data-visualization" element={<DataVisualizationTool uploadedFiles={uploadedFiles} />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="*" element={<h2>Page not found</h2>} />
        </Routes>
      </main>
    </div>
  );
}
