import { useState, useEffect } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'English', 'Computer Science',
  'Data Structures', 'Operating Systems', 'DBMS', 'Computer Networks', 'Artificial Intelligence',
]

const FILE_TYPE_GROUPS = [
  { label: 'Documents', exts: ['.pdf', '.doc', '.docx', '.md', '.txt'] },
  { label: 'Images',    exts: ['.png', '.jpg', '.jpeg'] },
  { label: 'Code',      exts: ['.py', '.js', '.java', '.cpp', '.c', '.ipynb'] },
]

// File types Gemini can actually evaluate
const AI_SUPPORTED_EXTS = new Set([
  '.pdf', '.txt', '.md', '.py', '.js', '.java', '.cpp', '.c', '.ipynb',
  '.png', '.jpg', '.jpeg',
])

function canAiEval(filename) {
  if (!filename) return false
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return AI_SUPPORTED_EXTS.has(ext)
}

export default function ProfessorDashboard() {
  const [tab, setTab] = useState('marks')

  // ---- Marks & Students State ----
  const [students, setStudents] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [marks, setMarks] = useState([])
  const [selected, setSelected] = useState(null)
  const [editingMarkId, setEditingMarkId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [studentForm, setStudentForm] = useState({ name: '', email: '', password: '' })
  const [markForm, setMarkForm] = useState({ subject: '', marks_obtained: '' })

  // ---- Assignment State ----
  const [assignments, setAssignments] = useState([])
  const [assignmentForm, setAssignmentForm] = useState({
    title: '', description: '', subject: '', due_date: '', max_marks: 100,
    allowed_extensions: ['.pdf'],
  })
  const [expandedAssignmentId, setExpandedAssignmentId] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [gradingId, setGradingId] = useState(null)
  const [gradeForm, setGradeForm] = useState({ marks_awarded: '', feedback: '' })

  // ---- AI Evaluation State ----
  // Map of submissionId -> 'loading' | 'done' | 'error'
  const [aiStatus, setAiStatus] = useState({})

  // ---- Preview State ----
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewName, setPreviewName] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ---------- Loaders ----------
  async function loadStudents() {
    try {
      const { data } = await api.get('/professor/students')
      setStudents(data)
    } catch { setError('Failed to load students') }
  }

  async function loadAnalytics() {
    try {
      const { data } = await api.get('/professor/analytics')
      setAnalytics(data)
    } catch {}
  }

  async function loadMarks(studentId) {
    try {
      const { data } = await api.get(`/professor/marks/student/${studentId}`)
      setMarks(data)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load marks') }
  }

  async function loadAssignments() {
    try {
      const { data } = await api.get('/professor/assignments')
      setAssignments(data)
    } catch { setError('Failed to load assignments') }
  }

  async function loadSubmissions(assignmentId) {
    try {
      const { data } = await api.get(`/professor/assignments/${assignmentId}/submissions`)
      setSubmissions(data)
    } catch { setError('Failed to load submissions') }
  }

  useEffect(() => {
    loadStudents()
    loadAnalytics()
    loadAssignments()
  }, [])

  function flash(setter, msg) {
    setter(msg); setTimeout(() => setter(''), 3500)
  }

  // ---------- Logic: Marks ----------
  async function addStudent(e) {
    e.preventDefault()
    try {
      await api.post('/professor/students', studentForm)
      flash(setSuccess, `Added ${studentForm.name}`)
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
      await api.put(`/professor/marks/${markId}`, { marks_obtained: parseInt(editValue, 10) })
      flash(setSuccess, 'Mark updated')
      setEditingMarkId(null)
      loadMarks(selected.id)
      loadAnalytics()
    } catch { flash(setError, 'Failed to update mark') }
  }

  // ---------- Logic: AI Evaluation ----------
  async function runAiEval(submissionId) {
    setAiStatus(prev => ({ ...prev, [submissionId]: 'loading' }))
    setError('')
    try {
      const { data } = await api.post(`/professor/submissions/${submissionId}/ai-evaluate`)
      // Update the local submissions list with fresh AI data
      setSubmissions(prev =>
        prev.map(s => s.id === submissionId
          ? { ...s, ai_suggested_marks: data.ai_suggested_marks, ai_feedback: data.ai_feedback }
          : s
        )
      )
      setAiStatus(prev => ({ ...prev, [submissionId]: 'done' }))
      flash(setSuccess, 'AI evaluation complete')
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI evaluation failed'
      setAiStatus(prev => ({ ...prev, [submissionId]: 'error' }))
      flash(setError, msg)
    }
  }

  // ---------- Logic: Preview & Grade ----------
  async function handlePreview(submissionId, filename) {
    try {
      setError('')
      setPreviewUrl(null)
      const res = await api.get(`/submissions/${submissionId}/download`, {
        params: { preview: true },
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewName(filename)
    } catch (err) {
      console.error('Preview Error:', err)
      flash(setError, 'Server error while generating preview.')
    }
  }

  async function deleteAssignment(id) {
    if (!window.confirm('Delete this assignment and all its submissions?')) return
    try {
      await api.delete(`/professor/assignments/${id}`)
      setAssignments(assignments.filter(a => a.id !== id))
      flash(setSuccess, 'Deleted')
    } catch { flash(setError, 'Delete failed') }
  }

  async function saveGrade(submissionId) {
    try {
      await api.put(`/professor/submissions/${submissionId}/grade`, {
        marks_awarded: parseInt(gradeForm.marks_awarded, 10),
        feedback: gradeForm.feedback,
      })
      flash(setSuccess, 'Approved & released to student')
      setGradingId(null)
      loadSubmissions(expandedAssignmentId)
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to save grade') }
  }

  function startGrading(sub) {
    setGradingId(sub.id)
    setGradeForm({
      marks_awarded: String(sub.marks_awarded ?? sub.ai_suggested_marks ?? ''),
      feedback: sub.feedback ?? sub.ai_feedback ?? '',
    })
  }

  function toggleExt(ext) {
    setAssignmentForm((f) => ({
      ...f,
      allowed_extensions: f.allowed_extensions.includes(ext)
        ? f.allowed_extensions.filter((e) => e !== ext)
        : [...f.allowed_extensions, ext],
    }))
  }

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <>
      <Header title="Professor Console" subtitle="Management" />

      {/* PREVIEW MODAL */}
      {previewUrl && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white w-full h-full max-w-6xl rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center bg-stone-50">
              <span className="font-bold">Viewing: {previewName}</span>
              <button
                onClick={() => { window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
                className="px-6 py-2 bg-stone-900 text-white rounded-lg text-sm"
              >Close</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <embed src={previewUrl} type="application/pdf" width="100%" height="100%" />
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Tab bar */}
        <div className="flex gap-2 mb-8 border-b">
          {[{ key: 'marks', label: 'Marks & Students' }, { key: 'assignments', label: 'Assignments' }].map((t) => (
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
            error ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'
          }`}>
            {error || success}
          </div>
        )}

        {/* ===================== MARKS TAB ===================== */}
        {tab === 'marks' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">My Students</h2>
              <div className="bg-white border rounded-lg divide-y max-h-80 overflow-y-auto">
                {students.map((s) => (
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
                <input type="text" placeholder="Name" value={studentForm.name} onChange={(e) => setStudentForm({...studentForm, name: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <input type="email" placeholder="Email" value={studentForm.email} onChange={(e) => setStudentForm({...studentForm, email: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <input type="password" placeholder="Password" value={studentForm.password} onChange={(e) => setStudentForm({...studentForm, password: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm">Add Student</button>
              </form>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">{selected ? `${selected.name}'s Marks` : 'Select a Student'}</h2>
              {selected && (
                <div className="space-y-4">
                  <div className="bg-white border rounded-lg p-4 divide-y">
                    {marks.map((m) => (
                      <div key={m.id} className="flex justify-between items-center py-2">
                        <span className="text-sm">{m.subject}</span>
                        <div className="flex gap-3 items-center">
                          {editingMarkId === m.id ? (
                            <>
                              <input type="number" min="0" max="100" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-16 px-2 py-1 border rounded text-sm font-mono" />
                              <button onClick={() => saveMarkEdit(m.id)} className="text-[10px] bg-stone-900 text-white px-2 py-1 rounded">Save</button>
                              <button onClick={() => setEditingMarkId(null)} className="text-[10px] underline">X</button>
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-sm">{m.marks_obtained}</span>
                              <button onClick={() => { setEditingMarkId(m.id); setEditValue(m.marks_obtained) }} className="text-[10px] underline">Edit</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={addMark} className="bg-white border rounded-lg p-4 space-y-3">
                    <select value={markForm.subject} onChange={(e) => setMarkForm({...markForm, subject: e.target.value})} className="w-full p-2 border rounded text-sm" required>
                      <option value="">Subject</option>
                      {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="number" placeholder="Marks" value={markForm.marks_obtained} onChange={(e) => setMarkForm({...markForm, marks_obtained: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                    <button className="w-full py-2 bg-stone-900 text-white rounded text-sm">Save</button>
                  </form>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">Class Standings</h2>
              {analytics && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                    <div className="text-[10px] uppercase font-bold text-amber-700">Top Performer</div>
                    <div className="font-bold">{analytics.top_scorer?.name || 'N/A'}</div>
                  </div>
                  <div className="bg-white border rounded-lg p-4">
                    {analytics.all_students?.map((s, i) => (
                      <div key={s.student_id} className="flex justify-between text-xs py-1.5 border-b last:border-0">
                        <span>{i + 1}. {s.name}</span>
                        <span className="font-mono">{s.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ===================== ASSIGNMENTS TAB ===================== */}
        {tab === 'assignments' && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Post Assignment form */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Post Assignment</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    const { data } = await api.post('/professor/assignments', {
                      ...assignmentForm,
                      max_marks: parseInt(assignmentForm.max_marks, 10),
                    })
                    setAssignments([data, ...assignments])
                    flash(setSuccess, 'Posted!')
                  } catch { flash(setError, 'Failed to post assignment') }
                }}
                className="bg-white border rounded-lg p-4 space-y-3"
              >
                <input type="text" placeholder="Title" value={assignmentForm.title} onChange={(e) => setAssignmentForm({...assignmentForm, title: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <textarea placeholder="Description" value={assignmentForm.description} onChange={(e) => setAssignmentForm({...assignmentForm, description: e.target.value})} className="w-full p-2 border rounded text-sm" />
                <select value={assignmentForm.subject} onChange={(e) => setAssignmentForm({...assignmentForm, subject: e.target.value})} className="w-full p-2 border rounded text-sm bg-white" required>
                  <option value="">Select subject</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Allowed file types</div>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPE_GROUPS.flatMap(g => g.exts).map(ext => (
                      <button
                        type="button"
                        key={ext}
                        onClick={() => toggleExt(ext)}
                        className={`text-[10px] px-2 py-1 rounded border transition ${
                          assignmentForm.allowed_extensions.includes(ext)
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                        }`}
                      >
                        {ext}
                        {AI_SUPPORTED_EXTS.has(ext) && (
                          <span className="ml-1 text-[9px] opacity-60">✦AI</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-1">✦AI = supported for AI auto-grading</div>
                </div>
                <input type="datetime-local" value={assignmentForm.due_date} onChange={(e) => setAssignmentForm({...assignmentForm, due_date: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <input type="number" placeholder="Max marks" min="1" max="1000" value={assignmentForm.max_marks} onChange={(e) => setAssignmentForm({...assignmentForm, max_marks: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm">Post</button>
              </form>
            </section>

            {/* Assignments list */}
            <section className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold">History</h2>
              {assignments.map((a) => (
                <div key={a.id} className="bg-white border rounded-lg overflow-hidden">
                  <div className="p-4 flex justify-between items-center">
                    <button
                      onClick={() => {
                        const next = expandedAssignmentId === a.id ? null : a.id
                        setExpandedAssignmentId(next)
                        if (next) loadSubmissions(a.id)
                      }}
                      className="text-left flex-1"
                    >
                      <div className="font-bold">{a.title}</div>
                      <div className="text-xs text-stone-500">
                        {a.subject} · Due {fmtDate(a.due_date)} · {a.submission_count ?? 0} submission{a.submission_count !== 1 ? 's' : ''}
                      </div>
                      {a.allowed_extensions?.length > 0 && (
                        <div className="text-xs text-stone-400 mt-0.5">
                          Accepts: {a.allowed_extensions.join(', ')}
                        </div>
                      )}
                    </button>
                    <button onClick={() => deleteAssignment(a.id)} className="text-red-500 text-xs px-2 hover:text-red-700">Delete</button>
                  </div>

                  {expandedAssignmentId === a.id && (
                    <div className="p-4 bg-stone-50 border-t space-y-3">
                      {submissions.length === 0 && (
                        <div className="text-sm text-stone-500 text-center py-4">No submissions yet.</div>
                      )}

                      {submissions.map((sub) => {
                        const approved = sub.grade_status === 'approved'
                        const isGrading = gradingId === sub.id
                        const status = aiStatus[sub.id]
                        const aiLoading = status === 'loading'
                        const hasAiResult = !!(sub.ai_feedback || sub.ai_suggested_marks != null)
                        const supportedForAi = canAiEval(sub.file_name)

                        return (
                          <div key={sub.id} className="bg-white border rounded-lg overflow-hidden">
                            {/* Header row */}
                            <div className="flex items-center justify-between p-3 border-b border-stone-100">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{sub.student_name}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  approved
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {approved ? '✓ Approved' : 'Pending review'}
                                </span>
                              </div>
                              <div className="flex gap-2 items-center">
                                <button
                                  onClick={() => handlePreview(sub.id, sub.file_name)}
                                  className="text-xs bg-stone-100 px-3 py-1.5 rounded hover:bg-stone-200 transition"
                                >
                                  Preview
                                </button>
                                {!isGrading && (
                                  <button
                                    onClick={() => startGrading(sub)}
                                    className="text-xs bg-stone-900 text-white px-3 py-1.5 rounded hover:bg-stone-700 transition"
                                  >
                                    {approved ? 'Edit grade' : 'Review & approve'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Body */}
                            <div className="p-3 space-y-3">
                              {/* File info */}
                              <div className="flex items-center gap-2 text-xs text-stone-500">
                                <span>📎 {sub.file_name}</span>
                                <span>·</span>
                                <span>Submitted {fmtDate(sub.submitted_at)}</span>
                              </div>

                              {/* AI Evaluation Section */}
                              <div className="border border-dashed border-stone-200 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                                      ✦ AI Evaluation
                                    </span>
                                    {hasAiResult && !aiLoading && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                                        {sub.ai_suggested_marks != null ? `Suggests ${sub.ai_suggested_marks}/${a.max_marks}` : 'Feedback available'}
                                      </span>
                                    )}
                                    {!supportedForAi && (
                                      <span className="text-[10px] text-stone-400 italic">
                                        (file type not supported)
                                      </span>
                                    )}
                                  </div>

                                  {/* AI Evaluate button */}
                                  {supportedForAi && (
                                    <button
                                      onClick={() => runAiEval(sub.id)}
                                      disabled={aiLoading}
                                      className={`text-[11px] px-3 py-1.5 rounded border transition flex items-center gap-1.5 ${
                                        aiLoading
                                          ? 'bg-blue-50 border-blue-200 text-blue-400 cursor-not-allowed'
                                          : hasAiResult
                                          ? 'bg-white border-stone-300 text-stone-600 hover:border-blue-400 hover:text-blue-600'
                                          : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                    >
                                      {aiLoading ? (
                                        <>
                                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                          </svg>
                                          Evaluating…
                                        </>
                                      ) : hasAiResult ? (
                                        '↻ Re-evaluate'
                                      ) : (
                                        '✦ Run AI Eval'
                                      )}
                                    </button>
                                  )}
                                </div>

                                {/* AI result display */}
                                {aiLoading && (
                                  <div className="text-xs text-blue-600 italic animate-pulse">
                                    Sending to Gemini… this may take 10–30 seconds for PDF files.
                                  </div>
                                )}

                                {!aiLoading && hasAiResult && (
                                  <div className="bg-blue-50 rounded p-2.5 text-xs">
                                    {sub.ai_suggested_marks != null && (
                                      <div className="font-semibold text-blue-800 mb-1">
                                        Suggested marks: <span className="font-mono">{sub.ai_suggested_marks} / {a.max_marks}</span>
                                      </div>
                                    )}
                                    {sub.ai_feedback && (
                                      <div className="text-stone-700 whitespace-pre-wrap leading-relaxed">
                                        {sub.ai_feedback}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {!aiLoading && !hasAiResult && supportedForAi && (
                                  <div className="text-xs text-stone-400 italic">
                                    No AI evaluation yet. Click "Run AI Eval" to get a suggested grade.
                                  </div>
                                )}

                                {status === 'error' && (
                                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                                    AI evaluation failed. Check your GEMINI_API_KEY or try again.
                                  </div>
                                )}
                              </div>

                              {/* Approved grade banner */}
                              {approved && !isGrading && (
                                <div className="bg-green-50 border border-green-200 rounded p-2.5 text-xs">
                                  <div className="font-semibold text-green-800 mb-1">
                                    ✓ Approved: <span className="font-mono">{sub.marks_awarded} / {a.max_marks}</span>
                                  </div>
                                  {sub.feedback && (
                                    <div className="text-stone-700 whitespace-pre-wrap">{sub.feedback}</div>
                                  )}
                                </div>
                              )}

                              {/* Grading form */}
                              {isGrading && (
                                <div className="border-t pt-3 space-y-2">
                                  <div className="text-xs text-stone-500 mb-1">
                                    {hasAiResult
                                      ? 'Pre-filled from AI suggestion — edit if needed, then approve.'
                                      : 'Enter marks and feedback, then approve.'}
                                  </div>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="number"
                                      placeholder={`Marks (0–${a.max_marks})`}
                                      min="0"
                                      max={a.max_marks}
                                      value={gradeForm.marks_awarded}
                                      onChange={(e) => setGradeForm({ ...gradeForm, marks_awarded: e.target.value })}
                                      className="w-36 p-2 border rounded text-sm font-mono"
                                    />
                                    <span className="text-xs text-stone-400">/ {a.max_marks}</span>
                                  </div>
                                  <textarea
                                    placeholder="Feedback for student"
                                    value={gradeForm.feedback}
                                    onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                                    rows={3}
                                    className="w-full p-2 border rounded text-sm resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => saveGrade(sub.id)}
                                      className="flex-1 py-2 bg-green-700 text-white rounded text-xs hover:bg-green-800 transition"
                                    >
                                      ✓ Approve & release to student
                                    </button>
                                    <button
                                      onClick={() => setGradingId(null)}
                                      className="px-4 text-xs text-stone-500 hover:underline"
                                    >
                                      Cancel
                                    </button>
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