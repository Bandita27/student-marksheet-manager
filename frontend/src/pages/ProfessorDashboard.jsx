import { useState, useEffect } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'English',
  'Computer Science',
  'Data Structures',
  'Operating Systems',
  'DBMS',
  'Computer Networks',
  'Artificial Intelligence',
]

export default function ProfessorDashboard() {
  const [tab, setTab] = useState('marks')

  // ---- marks state ----
  const [students, setStudents] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [marks, setMarks] = useState([])
  const [selected, setSelected] = useState(null)
  const [editingMarkId, setEditingMarkId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [studentForm, setStudentForm] = useState({ name: '', email: '', password: '' })
  const [markForm, setMarkForm] = useState({ subject: '', marks_obtained: '' })

  // ---- assignment state ----
  const [assignments, setAssignments] = useState([])
  const [assignmentForm, setAssignmentForm] = useState({
    title: '', description: '', subject: '', due_date: '', max_marks: 100,
  })
  const [expandedAssignmentId, setExpandedAssignmentId] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [gradingId, setGradingId] = useState(null)
  const [gradeForm, setGradeForm] = useState({ marks_awarded: '', feedback: '' })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ---------- loaders ----------
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
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load submissions') }
  }

  useEffect(() => {
    loadStudents()
    loadAnalytics()
    loadAssignments()
  }, [])

  function flash(setter, msg) {
    setter(msg)
    setTimeout(() => setter(''), 3000)
  }

  // ---------- mutations: marks ----------
  async function addStudent(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/professor/students', studentForm)
      flash(setSuccess, `Added ${studentForm.name}`)
      setStudentForm({ name: '', email: '', password: '' })
      loadStudents()
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to add student') }
  }

  async function addMark(e) {
    e.preventDefault()
    if (!selected) return
    setError('')
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
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to add mark') }
  }

  async function saveMarkEdit(markId) {
    setError('')
    try {
      await api.put(`/professor/marks/${markId}`, { marks_obtained: parseInt(editValue, 10) })
      flash(setSuccess, 'Mark updated')
      setEditingMarkId(null)
      setEditValue('')
      loadMarks(selected.id)
      loadAnalytics()
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to update mark') }
  }

  function startEdit(mark) {
    setEditingMarkId(mark.id)
    setEditValue(String(mark.marks_obtained))
  }
  function cancelEdit() { setEditingMarkId(null); setEditValue('') }
  function selectStudent(s) { setSelected(s); loadMarks(s.id); setEditingMarkId(null) }

  // ---------- mutations: assignments ----------
  async function createAssignment(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/professor/assignments', {
        ...assignmentForm,
        max_marks: parseInt(assignmentForm.max_marks, 10),
      })
      flash(setSuccess, 'Assignment created')
      setAssignmentForm({ title: '', description: '', subject: '', due_date: '', max_marks: 100 })
      loadAssignments()
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to create assignment') }
  }

  async function deleteAssignment(id) {
    if (!confirm('Delete this assignment? Submissions will also be removed.')) return
    setError('')
    try {
      await api.delete(`/professor/assignments/${id}`)
      flash(setSuccess, 'Assignment deleted')
      if (expandedAssignmentId === id) setExpandedAssignmentId(null)
      loadAssignments()
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to delete') }
  }

  function toggleAssignment(id) {
    if (expandedAssignmentId === id) {
      setExpandedAssignmentId(null)
      setSubmissions([])
    } else {
      setExpandedAssignmentId(id)
      loadSubmissions(id)
    }
  }

  function startGrading(sub) {
    setGradingId(sub.id)
    setGradeForm({
      marks_awarded: sub.marks_awarded != null ? String(sub.marks_awarded) : '',
      feedback: sub.feedback || '',
    })
  }

  async function saveGrade(submissionId) {
    setError('')
    try {
      await api.put(`/professor/submissions/${submissionId}/grade`, {
        marks_awarded: parseInt(gradeForm.marks_awarded, 10),
        feedback: gradeForm.feedback,
      })
      flash(setSuccess, 'Grade saved')
      setGradingId(null)
      loadSubmissions(expandedAssignmentId)
    } catch (err) { flash(setError, err.response?.data?.detail || 'Failed to save grade') }
  }

  // Auth-protected file download (professor route)
  async function downloadSubmission(submissionId, filename) {
    try {
      const res = await api.get(`/submissions/${submissionId}/download`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      flash(setError, 'Failed to download file')
    }
  }

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <>
      <Header title="Professor Console" subtitle="Class Management" />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex gap-2 mb-8 border-b border-stone-200">
          {[
            { key: 'marks', label: 'Marks & Students' },
            { key: 'assignments', label: 'Assignments' },
          ].map((t) => (
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
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            error
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
            {error || success}
          </div>
        )}

        {/* MARKS TAB */}
        {tab === 'marks' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4">My Students</h2>
                <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-80 overflow-y-auto">
                  {students.length === 0 && (
                    <div className="p-4 text-sm text-stone-500">None yet — add one below.</div>
                  )}
                  {students.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectStudent(s)}
                      className={`w-full text-left p-3 hover:bg-stone-50 transition ${
                        selected?.id === s.id ? 'bg-stone-100' : ''
                      }`}
                    >
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-stone-500">{s.email}</div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={addStudent}
                className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold">Add Student</div>
                {['name', 'email', 'password'].map((f) => (
                  <input key={f}
                    type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                    placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                    value={studentForm[f]}
                    onChange={(e) => setStudentForm({ ...studentForm, [f]: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"/>
                ))}
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                  Add Student
                </button>
              </form>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">
                {selected ? `${selected.name}'s Marks` : 'Select a Student'}
              </h2>
              {!selected && (
                <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-500">
                  Click a student on the left to view their marks.
                </div>
              )}
              {selected && (
                <>
                  <div className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
                    {marks.length === 0 ? (
                      <div className="text-sm text-stone-500">No marks recorded yet.</div>
                    ) : (
                      marks.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                          <span className="text-sm">{m.subject}</span>
                          {editingMarkId === m.id ? (
                            <div className="flex items-center gap-2">
                              <input type="number" min="0" max="100" value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-16 px-2 py-1 border border-stone-300 rounded text-sm font-mono"/>
                              <button onClick={() => saveMarkEdit(m.id)}
                                className="text-xs px-2 py-1 bg-stone-900 text-white rounded hover:bg-stone-700">Save</button>
                              <button onClick={cancelEdit} className="text-xs text-stone-500 hover:underline">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm">{m.marks_obtained}/100</span>
                              <button onClick={() => startEdit(m)} className="text-xs text-stone-500 hover:text-stone-900 hover:underline">Edit</button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={addMark} className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
                    <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold">Add Mark</div>
                    <select value={markForm.subject}
                      onChange={(e) => setMarkForm({ ...markForm, subject: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white focus:outline-none focus:border-stone-900">
                      <option value="" disabled>Select subject</option>
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="number" min="0" max="100" placeholder="Marks (0–100)"
                      value={markForm.marks_obtained}
                      onChange={(e) => setMarkForm({ ...markForm, marks_obtained: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"/>
                    <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">Save Mark</button>
                  </form>
                </>
              )}
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">Class Standings</h2>
              {!analytics?.top_scorer ? (
                <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-500">
                  Add students and marks to see standings.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-amber-700 mb-1">Top Scorer</div>
                    <div className="font-semibold">{analytics.top_scorer.name}</div>
                    <div className="text-sm text-stone-600">{analytics.top_scorer.total} marks total</div>
                  </div>
                  <div className="bg-stone-100 border border-stone-200 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-stone-600 mb-1">Lowest Scorer</div>
                    <div className="font-semibold">{analytics.bottom_scorer.name}</div>
                    <div className="text-sm text-stone-600">{analytics.bottom_scorer.total} marks total</div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-lg p-4">
                    <div className="text-xs uppercase tracking-wider text-stone-600 mb-3">Full Leaderboard</div>
                    {analytics.all_students.map((s, i) => (
                      <div key={s.student_id}
                        className="flex justify-between py-1.5 text-sm border-b border-stone-100 last:border-0">
                        <span><span className="text-stone-400 mr-2">{i + 1}.</span>{s.name}</span>
                        <span className="font-mono">{s.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ASSIGNMENTS TAB */}
        {tab === 'assignments' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <section className="lg:col-span-1">
              <h2 className="text-xl font-semibold mb-4">New Assignment</h2>
              <form onSubmit={createAssignment}
                className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
                <input type="text" placeholder="Title" value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"/>
                <textarea placeholder="Description / instructions" value={assignmentForm.description}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900 resize-none"/>
                <select value={assignmentForm.subject}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, subject: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white focus:outline-none focus:border-stone-900">
                  <option value="" disabled>Select subject</option>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <div>
                  <label className="block text-xs text-stone-600 mb-1">Due date</label>
                  <input type="datetime-local" value={assignmentForm.due_date}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, due_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"/>
                </div>
                <div>
                  <label className="block text-xs text-stone-600 mb-1">Max marks</label>
                  <input type="number" min="1" max="1000" value={assignmentForm.max_marks}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, max_marks: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"/>
                </div>
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                  Create Assignment
                </button>
              </form>
            </section>

            <section className="lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Posted Assignments</h2>
              {assignments.length === 0 ? (
                <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-500">
                  No assignments yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a) => {
                    const overdue = new Date(a.due_date) < new Date()
                    const expanded = expandedAssignmentId === a.id
                    return (
                      <div key={a.id} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                        <div className="p-4 flex items-start justify-between gap-4">
                          <button onClick={() => toggleAssignment(a.id)} className="flex-1 text-left">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold">{a.title}</span>
                              <span className="text-xs px-2 py-0.5 bg-stone-100 rounded text-stone-600">{a.subject}</span>
                              {overdue && (
                                <span className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded">Past due</span>
                              )}
                            </div>
                            <div className="text-xs text-stone-500">
                              Due {fmtDate(a.due_date)} · Max {a.max_marks} marks · {a.submission_count ?? 0} submissions
                            </div>
                          </button>
                          <button onClick={() => deleteAssignment(a.id)}
                            className="text-xs text-red-600 hover:underline">Delete</button>
                        </div>

                        {expanded && (
                          <div className="border-t border-stone-200 bg-stone-50 p-4">
                            {a.description && (
                              <p className="text-sm text-stone-700 mb-4 whitespace-pre-wrap">{a.description}</p>
                            )}
                            <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold mb-2">Submissions</div>
                            {submissions.length === 0 ? (
                              <div className="text-sm text-stone-500">No submissions yet.</div>
                            ) : (
                              <div className="space-y-2">
                                {submissions.map((sub) => (
                                  <div key={sub.id} className="bg-white border border-stone-200 rounded p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <div className="font-medium text-sm">{sub.student_name}</div>
                                        <div className="text-xs text-stone-500">Submitted {fmtDate(sub.submitted_at)}</div>
                                      </div>
                                      {sub.marks_awarded != null && gradingId !== sub.id && (
                                        <span className="text-sm font-mono">{sub.marks_awarded}/{a.max_marks}</span>
                                      )}
                                    </div>

                                    <div className="bg-stone-50 border border-stone-200 rounded p-2 mb-2 flex items-center justify-between">
                                      <span className="text-sm truncate">📎 {sub.file_name}</span>
                                      <button
                                        onClick={() => downloadSubmission(sub.id, sub.file_name)}
                                        className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                                      >Download</button>
                                    </div>

                                    {gradingId === sub.id ? (
                                      <div className="space-y-2 pt-2 border-t border-stone-100">
                                        <input type="number" min="0" max={a.max_marks}
                                          placeholder={`Marks (0–${a.max_marks})`}
                                          value={gradeForm.marks_awarded}
                                          onChange={(e) => setGradeForm({ ...gradeForm, marks_awarded: e.target.value })}
                                          className="w-full px-3 py-2 border border-stone-300 rounded text-sm font-mono"/>
                                        <textarea placeholder="Feedback (optional)" value={gradeForm.feedback}
                                          onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-stone-300 rounded text-sm resize-none"/>
                                        <div className="flex gap-2">
                                          <button onClick={() => saveGrade(sub.id)}
                                            className="flex-1 py-1.5 bg-stone-900 text-white rounded text-xs hover:bg-stone-700">Save grade</button>
                                          <button onClick={() => setGradingId(null)}
                                            className="px-3 text-xs text-stone-500 hover:underline">Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                                        {sub.feedback && (
                                          <div className="text-xs text-stone-600 italic">"{sub.feedback}"</div>
                                        )}
                                        <button onClick={() => startGrading(sub)}
                                          className="text-xs text-stone-700 hover:underline ml-auto">
                                          {sub.marks_awarded != null ? 'Edit grade' : 'Grade'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  )
}