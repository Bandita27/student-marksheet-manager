import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import api from '../api.js'
import Header from '../components/Header.jsx'

// ── PDF.js worker ─────────────────────────────────────────────────────────────
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'English', 'Computer Science',
  'Data Structures', 'Operating Systems', 'DBMS', 'Computer Networks',
  'Artificial Intelligence',
]

const AI_SUPPORTED_EXTS = new Set([
  '.pdf', '.txt', '.md', '.py', '.js', '.java', '.cpp', '.c', '.ipynb',
  '.png', '.jpg', '.jpeg',
])

const CODE_EXTS  = /\.(py|js|java|cpp|c|txt|md|ipynb)$/i
const IMAGE_EXTS = /\.(png|jpg|jpeg)$/i
const PDF_EXT    = /\.pdf$/i

const MIME_MAP = {
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.py':   'text/plain',
  '.js':   'text/plain',
  '.java': 'text/plain',
  '.cpp':  'text/plain',
  '.c':    'text/plain',
  '.txt':  'text/plain',
  '.md':   'text/plain',
  '.ipynb':'text/plain',
}

const FILE_TYPE_EXTS = [
  '.pdf', '.doc', '.docx', '.md', '.txt',
  '.png', '.jpg', '.jpeg',
  '.py', '.js', '.java', '.cpp', '.c', '.ipynb',
]

const GRADING_MODES = [
  {
    value: 'strict',
    label: 'Strict',
    desc: 'Penalize every mistake heavily',
    active: 'text-red-700 bg-red-50 border-red-300',
    badge:  'bg-red-50 text-red-700 border-red-200',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    desc: 'Fair — reward correct logic',
    active: 'text-blue-700 bg-blue-50 border-blue-300',
    badge:  'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    value: 'lenient',
    label: 'Lenient',
    desc: 'Reward effort generously',
    active: 'text-green-700 bg-green-50 border-green-300',
    badge:  'bg-green-50 text-green-700 border-green-200',
  },
]

const EMPTY_FORM = {
  title: '', description: '', subject: '', due_date: '', max_marks: 100,
  allowed_extensions: ['.pdf'],
  grading_mode: 'balanced',
  grading_instructions: '',
  rubric: [],
}

function canAiEval(filename) {
  if (!filename) return false
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return AI_SUPPORTED_EXTS.has(ext)
}

function getModeInfo(value) {
  return GRADING_MODES.find(m => m.value === value) || GRADING_MODES[1]
}

// ── PDF Canvas Viewer ─────────────────────────────────────────────────────────
function PDFViewer({ url }) {
  const [numPages, setNumPages] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800); // FIX: sensible default instead of 0

  // Measure container so pages fill the panel width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-stone-200 p-4">
      {/* Ensure we only render the Document if the URL exists */}
      {url ? (
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={(error) => console.error('PDF load error:', error)}
          loading={
            <div className="flex items-center justify-center h-40 text-stone-400 text-sm animate-pulse">
              Loading PDF...
            </div>
          }
        >
          {Array.from({ length: numPages || 0 }, (_, i) => (
            <div key={i} className="mb-4 shadow-md bg-white">
              <Page 
                pageNumber={i + 1} 
                width={containerWidth > 40 ? containerWidth - 40 : 600} 
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
          ))}
        </Document>
      ) : (
        <div className="flex items-center justify-center h-full text-stone-400">
          No document selected.
        </div>
      )}
    </div>
  );
}

// ── Code Viewer ───────────────────────────────────────────────────────────────
function CodeViewer({ url, filename }) {
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (!url) return
    setLoading(true); setErrored(false)
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.text() })
      .then(t => { setCode(t); setLoading(false) })
      .catch(() => { setErrored(true); setLoading(false) })
  }, [url])

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-stone-900">
      <div className="px-4 py-2 bg-stone-800 text-stone-300 text-xs font-mono border-b border-stone-700 shrink-0 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        {filename}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <div className="text-stone-500 text-sm animate-pulse font-mono">Loading...</div>}
        {errored && <div className="text-red-400 text-sm font-mono">Could not load file. Try downloading.</div>}
        {!loading && !errored && (
          <pre className="text-sm font-mono text-stone-100 whitespace-pre-wrap leading-relaxed">
            {code || '(empty file)'}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── Breakdown Table ───────────────────────────────────────────────────────────
function BreakdownTable({ breakdown, suggestedMarks, maxMarks, feedback }) {
  if (!breakdown?.length) return null
  return (
    <div className="rounded-lg overflow-hidden border border-blue-100 text-xs">
      <table className="w-full">
        <thead>
          <tr className="bg-blue-100 text-blue-700 text-left">
            <th className="px-3 py-2">Criteria</th>
            <th className="px-3 py-2 text-center w-16">Marks</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-blue-50">
          {breakdown.map((item, i) => (
            <tr key={i}>
              <td className="px-3 py-2">
                <div className="font-medium text-stone-700">{item.criteria}</div>
                {item.reason && (
                  <div className="text-[10px] text-stone-400 mt-0.5 leading-relaxed">{item.reason}</div>
                )}
              </td>
              <td className="px-3 py-2 text-center font-mono font-bold text-blue-800">
                {item.marks}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 border-t-2 border-blue-200">
            <td className="px-3 py-2 font-bold text-stone-700">
              Total
              {feedback && (
                <div className="font-normal text-[10px] text-stone-500 mt-0.5 italic leading-relaxed">
                  {feedback}
                </div>
              )}
            </td>
            <td className="px-3 py-2 text-center font-mono font-bold text-blue-900 text-sm">
              {suggestedMarks}
              <span className="text-blue-400 text-xs font-normal">/{maxMarks}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProfessorDashboard() {
  const [tab, setTab] = useState('marks')

  // Marks
  const [students, setStudents]           = useState([])
  const [analytics, setAnalytics]         = useState(null)
  const [marks, setMarks]                 = useState([])
  const [selected, setSelected]           = useState(null)
  const [editingMarkId, setEditingMarkId] = useState(null)
  const [editValue, setEditValue]         = useState('')
  const [studentForm, setStudentForm]     = useState({ name: '', email: '', password: '' })
  const [markForm, setMarkForm]           = useState({ subject: '', marks_obtained: '' })

  // Assignments
  const [assignments, setAssignments]                   = useState([])
  const [assignmentForm, setAssignmentForm]             = useState(EMPTY_FORM)
  const [newRubricRow, setNewRubricRow]                 = useState({ criteria: '', max_marks: '' })
  const [expandedAssignmentId, setExpandedAssignmentId] = useState(null)
  const [submissions, setSubmissions]                   = useState([])
  const [gradingId, setGradingId]                       = useState(null)
  const [gradeForm, setGradeForm]                       = useState({ marks_awarded: '', feedback: '' })

  // AI
  const [aiStatus, setAiStatus] = useState({})

  // Preview
  const [previewBlob, setPreviewBlob]             = useState(null)   // raw Blob, used only for download
  const [previewUrl, setPreviewUrl]               = useState(null)   // object URL for viewers
  const [previewName, setPreviewName]             = useState('')
  const [previewSubmission, setPreviewSubmission] = useState(null)
  const [previewAssignment, setPreviewAssignment] = useState(null)
  const [previewGrading, setPreviewGrading]       = useState(false)
  const [previewLoading, setPreviewLoading]       = useState(false)

  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  // ── Loaders ──────────────────────────────────────────────────────────────
  async function loadStudents() {
    try { const { data } = await api.get('/professor/students'); setStudents(data) }
    catch { flash(setError, 'Failed to load students') }
  }
  async function loadAnalytics() {
    try { const { data } = await api.get('/professor/analytics'); setAnalytics(data) }
    catch {}
  }
  async function loadMarks(sid) {
    try { const { data } = await api.get('/professor/marks/student/' + sid); setMarks(data) }
    catch (err) { flash(setError, err.response?.data?.detail || 'Failed to load marks') }
  }
  async function loadAssignments() {
    try { const { data } = await api.get('/professor/assignments'); setAssignments(data) }
    catch { flash(setError, 'Failed to load assignments') }
  }
  async function loadSubmissions(aid) {
    try {
      const { data } = await api.get('/professor/assignments/' + aid + '/submissions')
      setSubmissions(data)
    } catch { flash(setError, 'Failed to load submissions') }
  }

  useEffect(() => { loadStudents(); loadAnalytics(); loadAssignments() }, [])

  function flash(setter, msg) { setter(msg); setTimeout(() => setter(''), 3500) }

  // ── Marks ─────────────────────────────────────────────────────────────────
  async function addStudent(e) {
    e.preventDefault()
    try {
      await api.post('/professor/students', studentForm)
      flash(setSuccess, 'Added ' + studentForm.name)
      setStudentForm({ name: '', email: '', password: '' })
      loadStudents()
    } catch { flash(setError, 'Failed to add student') }
  }

  async function addMark(e) {
    e.preventDefault()
    if (!selected) return
    try {
      await api.post('/professor/marks', {
        student_id: selected.id,
        subject: markForm.subject,
        marks_obtained: parseInt(markForm.marks_obtained, 10),
      })
      flash(setSuccess, 'Mark added')
      setMarkForm({ subject: '', marks_obtained: '' })
      loadMarks(selected.id)
      loadAnalytics()
    } catch { flash(setError, 'Failed to add mark') }
  }

  async function saveMarkEdit(markId) {
    try {
      await api.put('/professor/marks/' + markId, { marks_obtained: parseInt(editValue, 10) })
      flash(setSuccess, 'Mark updated')
      setEditingMarkId(null)
      loadMarks(selected.id)
      loadAnalytics()
    } catch { flash(setError, 'Failed to update mark') }
  }

  // ── Rubric helpers ────────────────────────────────────────────────────────
  function addRubricRow() {
    if (!newRubricRow.criteria.trim() || !newRubricRow.max_marks) return
    setAssignmentForm(f => ({
      ...f,
      rubric: [...f.rubric, {
        criteria: newRubricRow.criteria.trim(),
        max_marks: parseInt(newRubricRow.max_marks, 10),
      }],
    }))
    setNewRubricRow({ criteria: '', max_marks: '' })
  }

  function removeRubricRow(i) {
    setAssignmentForm(f => ({ ...f, rubric: f.rubric.filter((_, idx) => idx !== i) }))
  }

  function rubricTotal() {
    return assignmentForm.rubric.reduce((s, r) => s + (parseInt(r.max_marks, 10) || 0), 0)
  }

  function toggleExt(ext) {
    setAssignmentForm(f => ({
      ...f,
      allowed_extensions: f.allowed_extensions.includes(ext)
        ? f.allowed_extensions.filter(e => e !== ext)
        : [...f.allowed_extensions, ext],
    }))
  }

  // ── Assignments ───────────────────────────────────────────────────────────
  async function postAssignment(e) {
    e.preventDefault()
    if (assignmentForm.rubric.length > 0 && rubricTotal() !== parseInt(assignmentForm.max_marks, 10)) {
      flash(setError, 'Rubric total (' + rubricTotal() + ') must equal Max Marks (' + assignmentForm.max_marks + ')')
      return
    }
    try {
      const { data } = await api.post('/professor/assignments', {
        ...assignmentForm,
        max_marks: parseInt(assignmentForm.max_marks, 10),
      })
      setAssignments([data, ...assignments])
      setAssignmentForm(EMPTY_FORM)
      setNewRubricRow({ criteria: '', max_marks: '' })
      flash(setSuccess, 'Assignment posted!')
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to post assignment')
    }
  }

  async function deleteAssignment(id) {
    if (!window.confirm('Delete this assignment and all submissions?')) return
    try {
      await api.delete('/professor/assignments/' + id)
      setAssignments(assignments.filter(a => a.id !== id))
      flash(setSuccess, 'Deleted')
    } catch { flash(setError, 'Delete failed') }
  }

  // ── Grade ─────────────────────────────────────────────────────────────────
  function startGrading(sub) {
    setGradingId(sub.id)
    setGradeForm({
      marks_awarded: String(sub.marks_awarded ?? sub.ai_suggested_marks ?? ''),
      feedback: sub.feedback ?? sub.ai_feedback ?? '',
    })
  }

  async function saveGrade(submissionId) {
    try {
      await api.put('/professor/submissions/' + submissionId + '/grade', {
        marks_awarded: parseInt(gradeForm.marks_awarded, 10),
        feedback: gradeForm.feedback,
      })
      flash(setSuccess, 'Approved & released to student')
      setGradingId(null)
      loadSubmissions(expandedAssignmentId)
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to save grade') }
  }

  async function saveGradeFromPreview(subId) {
    try {
      await api.put('/professor/submissions/' + subId + '/grade', {
        marks_awarded: parseInt(gradeForm.marks_awarded, 10),
        feedback: gradeForm.feedback,
      })
      flash(setSuccess, 'Approved & released to student')
      setPreviewSubmission(prev => ({
        ...prev,
        marks_awarded: parseInt(gradeForm.marks_awarded, 10),
        feedback: gradeForm.feedback,
        grade_status: 'approved',
      }))
      setPreviewGrading(false)
      loadSubmissions(expandedAssignmentId)
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to save grade') }
  }

  // ── AI Eval ───────────────────────────────────────────────────────────────
  async function runAiEval(subId) {
    setAiStatus(prev => ({ ...prev, [subId]: 'loading' }))
    try {
      const { data } = await api.post('/professor/submissions/' + subId + '/ai-evaluate')
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, ...data } : s))
      if (previewSubmission?.id === subId) {
        setPreviewSubmission(prev => ({ ...prev, ...data }))
        setGradeForm({
          marks_awarded: String(data.ai_suggested_marks ?? ''),
          feedback: data.ai_feedback ?? '',
        })
      }
      setAiStatus(prev => ({ ...prev, [subId]: 'done' }))
      flash(setSuccess, 'AI evaluation complete')
    } catch (err) {
      setAiStatus(prev => ({ ...prev, [subId]: 'error' }))
      flash(setError, err.response?.data?.detail || 'AI evaluation failed')
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  async function handlePreview(sub, assignment) {
    try {
      setPreviewSubmission(sub)
      setPreviewAssignment(assignment)
      setPreviewGrading(!sub.marks_awarded)
      setPreviewUrl(null)
      setPreviewBlob(null)
      setPreviewName('')
      setPreviewLoading(true)
      setGradeForm({
        marks_awarded: String(sub.marks_awarded ?? sub.ai_suggested_marks ?? ''),
        feedback: sub.feedback ?? sub.ai_feedback ?? '',
      })

      const res = await api.get('/submissions/' + sub.id + '/download', {
        responseType: 'blob',
      })

      const filename = sub.file_name
      const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
      const mime = MIME_MAP[ext] || 'application/octet-stream'
      const blob = new Blob([res.data], { type: mime })
      const url  = window.URL.createObjectURL(blob)

      setPreviewBlob(blob)
      setPreviewUrl(url)
      setPreviewName(filename)
      setPreviewLoading(false)
    } catch (err) {
      setPreviewLoading(false)
      flash(setError, 'Failed to load preview: ' + (err.response?.data?.detail || err.message))
    }
  }

  function closePreview() {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewBlob(null)
    setPreviewName('')
    setPreviewSubmission(null)
    setPreviewAssignment(null)
    setPreviewGrading(false)
    setPreviewLoading(false)
  }

  // Manual download — only happens when user explicitly clicks "Download"
  function triggerDownload() {
    if (!previewBlob || !previewName) return
    const a = document.createElement('a')
    a.href = window.URL.createObjectURL(previewBlob)
    a.download = previewName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  // ── AI Button ─────────────────────────────────────────────────────────────
  function AiButton({ subId, hasAi, supported }) {
    const loading = aiStatus[subId] === 'loading'
    if (!supported) return <span className="text-[10px] text-stone-400 italic">Not supported</span>
    return (
      <button
        onClick={() => runAiEval(subId)}
        disabled={loading}
        className={`text-[11px] px-3 py-1.5 rounded border transition flex items-center gap-1.5 ${
          loading
            ? 'bg-blue-50 border-blue-200 text-blue-400 cursor-not-allowed'
            : hasAi
            ? 'bg-white border-stone-300 text-stone-600 hover:border-blue-400 hover:text-blue-600'
            : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {loading ? <><Spinner /> Evaluating...</> : hasAi ? '↻ Re-evaluate' : '✦ Run AI Eval'}
      </button>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <Header title="Professor Console" subtitle="Management" />

      {/* ══ PREVIEW MODAL ══ */}
      {previewSubmission && (previewUrl || previewLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white w-full h-full max-w-7xl rounded-2xl overflow-hidden flex flex-col shadow-2xl">

            {/* Header */}
            <div className="px-5 py-3 border-b bg-stone-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-stone-800">{previewSubmission.student_name}</span>
                <span className="text-stone-300">•</span>
                <span className="text-xs text-stone-500 font-mono">{previewName}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                  previewSubmission.grade_status === 'approved'
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  {previewSubmission.grade_status === 'approved' ? '✓ Approved' : 'Pending'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Download is explicit — no href, uses triggerDownload() */}
                {previewBlob && (
                  <button
                    onClick={triggerDownload}
                    className="px-4 py-1.5 border border-stone-300 rounded-lg text-sm hover:bg-stone-100 transition"
                  >
                    Download
                  </button>
                )}
                <button
                  onClick={closePreview}
                  className="px-4 py-1.5 bg-stone-900 text-white rounded-lg text-sm hover:bg-stone-700 transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT — file viewer */}
              <div className="flex-1 overflow-hidden border-r border-stone-200">
                {previewLoading ? (
                  <div className="w-full h-full flex items-center justify-center bg-stone-100">
                    <div className="text-stone-400 text-sm animate-pulse">Loading file...</div>
                  </div>
                ) : !previewUrl ? (
                  <div className="w-full h-full flex items-center justify-center bg-stone-100">
                    <div className="text-stone-400 text-sm">No file loaded.</div>
                  </div>
                ) : PDF_EXT.test(previewName) ? (
                  // ✅ PDF rendered to canvas — no download triggered
                  <PDFViewer url={previewUrl} />
                ) : CODE_EXTS.test(previewName) ? (
                  <CodeViewer url={previewUrl} filename={previewName} />
                ) : IMAGE_EXTS.test(previewName) ? (
                  <div className="w-full h-full flex items-center justify-center bg-stone-100 p-6">
                    <img
                      src={previewUrl}
                      alt={previewName}
                      className="max-w-full max-h-full object-contain rounded-lg shadow"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 gap-4">
                    <svg className="w-12 h-12 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <div className="text-stone-500 text-sm text-center">
                      <div className="font-medium mb-1">{previewName}</div>
                      <div className="text-xs text-stone-400">This file type cannot be previewed inline.</div>
                    </div>
                    <button
                      onClick={triggerDownload}
                      className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm hover:bg-stone-700 transition"
                    >
                      Download to view
                    </button>
                  </div>
                )}
              </div>

              {/* RIGHT — AI + grade */}
              <div className="w-96 flex flex-col overflow-y-auto bg-stone-50">

                {/* AI section */}
                <div className="p-4 border-b border-stone-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      ✦ AI Evaluation
                    </span>
                    <AiButton
                      subId={previewSubmission.id}
                      hasAi={!!previewSubmission.ai_feedback}
                      supported={canAiEval(previewSubmission.file_name)}
                    />
                  </div>

                  {previewAssignment?.grading_mode && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded border capitalize font-medium ${getModeInfo(previewAssignment.grading_mode).badge}`}>
                        {previewAssignment.grading_mode}
                      </span>
                      {previewAssignment.grading_instructions && (
                        <span className="text-[10px] text-stone-500 italic truncate max-w-52">
                          "{previewAssignment.grading_instructions}"
                        </span>
                      )}
                    </div>
                  )}

                  {previewAssignment?.rubric?.length > 0 && (
                    <div className="text-[10px] text-stone-500 bg-stone-100 rounded px-2 py-1.5">
                      <span className="font-semibold">Rubric: </span>
                      {previewAssignment.rubric.map(r => r.criteria + ' (' + r.max_marks + ')').join(' · ')}
                    </div>
                  )}

                  {aiStatus[previewSubmission.id] === 'loading' && (
                    <div className="text-xs text-blue-600 italic animate-pulse bg-blue-50 p-3 rounded">
                      Sending to Gemini… may take 10–30 seconds.
                    </div>
                  )}

                  {previewSubmission.ai_breakdown?.length > 0 ? (
                    <BreakdownTable
                      breakdown={previewSubmission.ai_breakdown}
                      suggestedMarks={previewSubmission.ai_suggested_marks}
                      maxMarks={previewAssignment?.max_marks}
                      feedback={previewSubmission.ai_feedback}
                    />
                  ) : previewSubmission.ai_feedback ? (
                    <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs">
                      <div className="font-semibold text-blue-800 mb-1">
                        Suggested: {previewSubmission.ai_suggested_marks}/{previewAssignment?.max_marks}
                      </div>
                      <div className="text-stone-700 leading-relaxed">{previewSubmission.ai_feedback}</div>
                    </div>
                  ) : aiStatus[previewSubmission.id] !== 'loading' && (
                    <div className="text-xs text-stone-400 italic text-center py-3">
                      {canAiEval(previewSubmission.file_name)
                        ? 'No evaluation yet. Click "Run AI Eval".'
                        : 'File type not supported for AI evaluation.'}
                    </div>
                  )}

                  {aiStatus[previewSubmission.id] === 'error' && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                      AI evaluation failed. Check API key / quota.
                    </div>
                  )}
                </div>

                {/* Grade section */}
                <div className="p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Grade & Approve
                  </div>

                  {previewSubmission.grade_status === 'approved' && !previewGrading ? (
                    <div className="space-y-2">
                      <div className="bg-green-50 border border-green-200 rounded p-3 text-xs">
                        <div className="font-semibold text-green-800 mb-1">
                          ✓ Approved: {previewSubmission.marks_awarded}/{previewAssignment?.max_marks}
                        </div>
                        {previewSubmission.feedback && (
                          <div className="text-stone-600 italic leading-relaxed">{previewSubmission.feedback}</div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setPreviewGrading(true)
                          setGradeForm({
                            marks_awarded: String(previewSubmission.marks_awarded),
                            feedback: previewSubmission.feedback ?? '',
                          })
                        }}
                        className="w-full py-2 text-xs border border-stone-300 rounded hover:bg-stone-100 transition"
                      >
                        Edit grade
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          placeholder="Marks"
                          min="0"
                          max={previewAssignment?.max_marks}
                          value={gradeForm.marks_awarded}
                          onChange={e => setGradeForm({ ...gradeForm, marks_awarded: e.target.value })}
                          className="flex-1 p-2 border rounded text-sm font-mono"
                        />
                        <span className="text-xs text-stone-400 shrink-0">
                          / {previewAssignment?.max_marks}
                        </span>
                      </div>
                      <textarea
                        placeholder="Feedback for student..."
                        value={gradeForm.feedback}
                        onChange={e => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                        rows={4}
                        className="w-full p-2 border rounded text-sm resize-none"
                      />
                      <button
                        onClick={() => saveGradeFromPreview(previewSubmission.id)}
                        className="w-full py-2 bg-green-700 text-white rounded text-xs hover:bg-green-800 transition font-medium"
                      >
                        ✓ Approve & release to student
                      </button>
                      {previewGrading && (
                        <button
                          onClick={() => setPreviewGrading(false)}
                          className="w-full py-1.5 text-xs text-stone-500 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MAIN ══ */}
      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-stone-200">
          {[
            { key: 'marks', label: 'Marks & Students' },
            { key: 'assignments', label: 'Assignments' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.key
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(error || success) && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
            error
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-green-50 text-green-800 border-green-200'
          }`}>
            {error || success}
          </div>
        )}

        {/* ══ MARKS TAB ══ */}
        {tab === 'marks' && (
          <div className="grid lg:grid-cols-3 gap-8">

            <section className="space-y-6">
              <h2 className="text-xl font-semibold">My Students</h2>
              <div className="bg-white border rounded-lg divide-y max-h-80 overflow-y-auto">
                {students.length === 0 && (
                  <div className="p-6 text-center text-sm text-stone-400">No students yet</div>
                )}
                {students.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelected(s); loadMarks(s.id) }}
                    className={`w-full text-left p-3 hover:bg-stone-50 transition ${selected?.id === s.id ? 'bg-stone-100' : ''}`}
                  >
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-stone-500">{s.email}</div>
                  </button>
                ))}
              </div>
              <form onSubmit={addStudent} className="bg-white border rounded-lg p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Add Student</div>
                <input type="text" placeholder="Full name" value={studentForm.name}
                  onChange={e => setStudentForm({ ...studentForm, name: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />
                <input type="email" placeholder="Email" value={studentForm.email}
                  onChange={e => setStudentForm({ ...studentForm, email: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />
                <input type="password" placeholder="Password" value={studentForm.password}
                  onChange={e => setStudentForm({ ...studentForm, password: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                  Add Student
                </button>
              </form>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">
                {selected ? selected.name + "'s Marks" : 'Select a Student'}
              </h2>
              {selected && (
                <div className="space-y-4">
                  <div className="bg-white border rounded-lg divide-y">
                    {marks.length === 0 && (
                      <div className="p-6 text-center text-sm text-stone-400">No marks yet</div>
                    )}
                    {marks.map(m => (
                      <div key={m.id} className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm">{m.subject}</span>
                        <div className="flex gap-3 items-center">
                          {editingMarkId === m.id ? (
                            <>
                              <input type="number" min="0" max="100" value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="w-16 px-2 py-1 border rounded text-sm font-mono" />
                              <button onClick={() => saveMarkEdit(m.id)}
                                className="text-[10px] bg-stone-900 text-white px-2 py-1 rounded">Save</button>
                              <button onClick={() => setEditingMarkId(null)}
                                className="text-[10px] text-stone-500 hover:underline">Cancel</button>
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-sm font-semibold">{m.marks_obtained}</span>
                              <button
                                onClick={() => { setEditingMarkId(m.id); setEditValue(m.marks_obtained) }}
                                className="text-[10px] text-stone-500 hover:underline">Edit</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={addMark} className="bg-white border rounded-lg p-4 space-y-3">
                    <select value={markForm.subject}
                      onChange={e => setMarkForm({ ...markForm, subject: e.target.value })}
                      className="w-full p-2 border rounded text-sm" required>
                      <option value="">Select subject</option>
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="number" placeholder="Marks (0–100)" min="0" max="100"
                      value={markForm.marks_obtained}
                      onChange={e => setMarkForm({ ...markForm, marks_obtained: e.target.value })}
                      className="w-full p-2 border rounded text-sm" required />
                    <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                      Add Mark
                    </button>
                  </form>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">Class Standings</h2>
              {analytics ? (
                <div className="space-y-4">
                  {analytics.top_scorer && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-amber-700 mb-1">Top Performer</div>
                      <div className="font-bold text-stone-800">{analytics.top_scorer.name}</div>
                      <div className="text-xs text-amber-700 font-mono">{analytics.top_scorer.total} pts</div>
                    </div>
                  )}
                  <div className="bg-white border rounded-lg divide-y overflow-hidden">
                    {analytics.all_students?.map((s, i) => (
                      <div key={s.student_id} className="flex justify-between items-center px-4 py-2.5 text-sm">
                        <span className="text-stone-600">
                          <span className="font-mono text-xs text-stone-400 mr-2">{i + 1}.</span>
                          {s.name}
                        </span>
                        <span className="font-mono font-semibold">{s.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-stone-400 italic">No marks recorded yet.</div>
              )}
            </section>
          </div>
        )}

        {/* ══ ASSIGNMENTS TAB ══ */}
        {tab === 'assignments' && (
          <div className="grid lg:grid-cols-3 gap-8">

            <section>
              <h2 className="text-xl font-semibold mb-4">Post Assignment</h2>
              <form onSubmit={postAssignment} className="bg-white border rounded-lg p-4 space-y-4">

                <input type="text" placeholder="Title" value={assignmentForm.title}
                  onChange={e => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />

                <textarea placeholder="Description / task instructions"
                  value={assignmentForm.description}
                  onChange={e => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                  className="w-full p-2 border rounded text-sm resize-none" rows={2} />

                <select value={assignmentForm.subject}
                  onChange={e => setAssignmentForm({ ...assignmentForm, subject: e.target.value })}
                  className="w-full p-2 border rounded text-sm bg-white" required>
                  <option value="">Select subject</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <input type="datetime-local" value={assignmentForm.due_date}
                  onChange={e => setAssignmentForm({ ...assignmentForm, due_date: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />

                <input type="number" placeholder="Max marks" min="1" max="1000"
                  value={assignmentForm.max_marks}
                  onChange={e => setAssignmentForm({ ...assignmentForm, max_marks: e.target.value })}
                  className="w-full p-2 border rounded text-sm" required />

                {/* File types */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
                    Allowed File Types
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FILE_TYPE_EXTS.map(ext => (
                      <button type="button" key={ext} onClick={() => toggleExt(ext)}
                        className={`text-[10px] px-2 py-1 rounded border transition ${
                          assignmentForm.allowed_extensions.includes(ext)
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                        }`}>
                        {ext}{AI_SUPPORTED_EXTS.has(ext) && <span className="ml-0.5 opacity-50">✦</span>}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-1">✦ = AI-evaluable</div>
                </div>

                {/* AI Settings */}
                <div className="border-t pt-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    ✦ AI Evaluation Settings
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Grading Mode</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {GRADING_MODES.map(m => (
                        <button type="button" key={m.value}
                          onClick={() => setAssignmentForm({ ...assignmentForm, grading_mode: m.value })}
                          className={`p-2 rounded border text-center transition ${
                            assignmentForm.grading_mode === m.value
                              ? m.active + ' border-current'
                              : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                          }`}>
                          <div className="text-xs font-semibold">{m.label}</div>
                          <div className="text-[9px] mt-0.5 leading-tight opacity-70">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
                      Custom Instructions for AI
                    </div>
                    <textarea
                      placeholder={'e.g. "Check if loops are used. Deduct 10 marks if no comments."'}
                      value={assignmentForm.grading_instructions}
                      onChange={e => setAssignmentForm({ ...assignmentForm, grading_instructions: e.target.value })}
                      rows={3} className="w-full p-2 border rounded text-xs resize-none" />
                  </div>

                  {/* Rubric builder */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-wider text-stone-500">
                        Rubric (optional)
                      </div>
                      {assignmentForm.rubric.length > 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          rubricTotal() === parseInt(assignmentForm.max_marks, 10)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {rubricTotal()} / {assignmentForm.max_marks}
                        </span>
                      )}
                    </div>

                    {assignmentForm.rubric.length > 0 && (
                      <div className="mb-2 border rounded overflow-hidden text-xs">
                        {assignmentForm.rubric.map((r, i) => (
                          <div key={i}
                            className="flex items-center justify-between px-3 py-2 border-b last:border-0 bg-white">
                            <span className="text-stone-700">{r.criteria}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-stone-500">{r.max_marks} pts</span>
                              <button type="button" onClick={() => removeRubricRow(i)}
                                className="text-red-400 hover:text-red-600">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <input type="text" placeholder="Criteria name"
                        value={newRubricRow.criteria}
                        onChange={e => setNewRubricRow({ ...newRubricRow, criteria: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRubricRow())}
                        className="flex-1 p-2 border rounded text-xs" />
                      <input type="number" placeholder="Pts" min="1"
                        value={newRubricRow.max_marks}
                        onChange={e => setNewRubricRow({ ...newRubricRow, max_marks: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRubricRow())}
                        className="w-16 p-2 border rounded text-xs font-mono" />
                      <button type="button" onClick={addRubricRow}
                        className="px-3 py-2 bg-stone-100 border rounded text-xs hover:bg-stone-200 transition">
                        + Add
                      </button>
                    </div>
                    {assignmentForm.rubric.length === 0 && (
                      <div className="text-[10px] text-stone-400 mt-1">
                        Leave empty → default: Correctness / Code Quality / Documentation
                      </div>
                    )}
                  </div>
                </div>

                <button className="w-full py-2.5 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition font-medium">
                  Post Assignment
                </button>
              </form>
            </section>

            {/* Assignments list */}
            <section className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold">History</h2>

              {assignments.length === 0 && (
                <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-400">
                  No assignments posted yet.
                </div>
              )}

              {assignments.map(a => (
                <div key={a.id} className="bg-white border rounded-lg overflow-hidden">

                  <div className="p-4 flex justify-between items-start gap-4">
                    <button
                      onClick={() => {
                        const next = expandedAssignmentId === a.id ? null : a.id
                        setExpandedAssignmentId(next)
                        if (next) loadSubmissions(a.id)
                      }}
                      className="text-left flex-1"
                    >
                      <div className="font-bold text-stone-800">{a.title}</div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {a.subject} · Due {fmtDate(a.due_date)} · {a.submission_count ?? 0} submission{a.submission_count !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {a.grading_mode && (
                          <span className={`text-[10px] px-2 py-0.5 rounded border capitalize font-medium ${getModeInfo(a.grading_mode).badge}`}>
                            {a.grading_mode}
                          </span>
                        )}
                        {a.rubric?.length > 0 && (
                          <span className="text-[10px] text-stone-400">
                            Rubric: {a.rubric.map(r => r.criteria).join(' · ')}
                          </span>
                        )}
                        {a.allowed_extensions?.length > 0 && (
                          <span className="text-[10px] text-stone-400 font-mono">
                            {a.allowed_extensions.join(', ')}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteAssignment(a.id)}
                      className="text-red-400 hover:text-red-600 text-xs shrink-0 transition"
                    >
                      Delete
                    </button>
                  </div>

                  {expandedAssignmentId === a.id && (
                    <div className="p-4 bg-stone-50 border-t space-y-3">
                      {submissions.length === 0 && (
                        <div className="text-sm text-stone-400 text-center py-6 italic">No submissions yet.</div>
                      )}

                      {submissions.map(sub => {
                        const approved  = sub.grade_status === 'approved'
                        const isGrading = gradingId === sub.id
                        const aiLoading = aiStatus[sub.id] === 'loading'
                        const hasAi     = !!(sub.ai_feedback || sub.ai_suggested_marks != null)
                        const supported = canAiEval(sub.file_name)

                        return (
                          <div key={sub.id} className="bg-white border rounded-lg overflow-hidden">

                            <div className="flex items-center justify-between p-3 border-b border-stone-100">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{sub.student_name}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                                  approved
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : 'bg-amber-100 text-amber-700 border-amber-200'
                                }`}>
                                  {approved ? '✓ Approved' : 'Pending'}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handlePreview(sub, a)}
                                  className="text-xs bg-stone-100 px-3 py-1.5 rounded hover:bg-stone-200 transition"
                                >
                                  Preview
                                </button>
                                {!isGrading && (
                                  <button
                                    onClick={() => startGrading(sub)}
                                    className="text-xs bg-stone-900 text-white px-3 py-1.5 rounded hover:bg-stone-700 transition"
                                  >
                                    {approved ? 'Edit grade' : 'Review'}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="p-3 space-y-3">
                              <div className="text-xs text-stone-400 font-mono">
                                📎 {sub.file_name} · {fmtDate(sub.submitted_at)}
                              </div>

                              {/* AI section */}
                              <div className="border border-dashed border-stone-200 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                                    ✦ AI Evaluation
                                  </span>
                                  <AiButton subId={sub.id} hasAi={hasAi} supported={supported} />
                                </div>

                                {aiLoading && (
                                  <div className="text-xs text-blue-600 italic animate-pulse">
                                    Evaluating… 10–30 seconds for PDF files.
                                  </div>
                                )}

                                {!aiLoading && sub.ai_breakdown?.length > 0 ? (
                                  <BreakdownTable
                                    breakdown={sub.ai_breakdown}
                                    suggestedMarks={sub.ai_suggested_marks}
                                    maxMarks={a.max_marks}
                                    feedback={sub.ai_feedback}
                                  />
                                ) : !aiLoading && hasAi ? (
                                  <div className="bg-blue-50 rounded p-2.5 text-xs">
                                    {sub.ai_suggested_marks != null && (
                                      <div className="font-semibold text-blue-800 mb-1">
                                        Suggested: {sub.ai_suggested_marks}/{a.max_marks}
                                      </div>
                                    )}
                                    {sub.ai_feedback && (
                                      <div className="text-stone-700 leading-relaxed">{sub.ai_feedback}</div>
                                    )}
                                  </div>
                                ) : !aiLoading && (
                                  <div className="text-xs text-stone-400 italic">
                                    {supported ? 'No evaluation yet.' : 'File type not supported for AI.'}
                                  </div>
                                )}

                                {aiStatus[sub.id] === 'error' && (
                                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                                    AI evaluation failed. Check API key / quota.
                                  </div>
                                )}
                              </div>

                              {approved && !isGrading && (
                                <div className="bg-green-50 border border-green-200 rounded p-2.5 text-xs">
                                  <div className="font-semibold text-green-800 mb-1">
                                    ✓ {sub.marks_awarded}/{a.max_marks}
                                  </div>
                                  {sub.feedback && (
                                    <div className="text-stone-600 leading-relaxed">{sub.feedback}</div>
                                  )}
                                </div>
                              )}

                              {isGrading && (
                                <div className="border-t pt-3 space-y-2">
                                  <div className="text-xs text-stone-500 mb-1">
                                    {hasAi ? 'Pre-filled from AI — edit if needed.' : 'Enter marks and feedback.'}
                                  </div>
                                  <div className="flex gap-2 items-center">
                                    <input type="number" placeholder="Marks"
                                      min="0" max={a.max_marks}
                                      value={gradeForm.marks_awarded}
                                      onChange={e => setGradeForm({ ...gradeForm, marks_awarded: e.target.value })}
                                      className="w-28 p-2 border rounded text-sm font-mono" />
                                    <span className="text-xs text-stone-400">/ {a.max_marks}</span>
                                  </div>
                                  <textarea placeholder="Feedback for student"
                                    value={gradeForm.feedback}
                                    onChange={e => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                                    rows={3} className="w-full p-2 border rounded text-sm resize-none" />
                                  <div className="flex gap-2">
                                    <button onClick={() => saveGrade(sub.id)}
                                      className="flex-1 py-2 bg-green-700 text-white rounded text-xs hover:bg-green-800 transition font-medium">
                                      ✓ Approve & release
                                    </button>
                                    <button onClick={() => setGradingId(null)}
                                      className="px-3 text-xs text-stone-500 hover:underline">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
      </main>
    </>
  )
}