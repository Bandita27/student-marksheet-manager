import { useState, useEffect } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

export default function ProfessorDashboard() {
  const [students, setStudents] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [marks, setMarks] = useState([])
  const [selected, setSelected] = useState(null)
  const [editingMarkId, setEditingMarkId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const [studentForm, setStudentForm] = useState({ name: '', email: '', password: '' })
  const [markForm, setMarkForm] = useState({ subject: '', marks_obtained: '' })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ---------- loaders ----------
  async function loadStudents() {
    try {
      const { data } = await api.get('/professor/students')
      setStudents(data)
    } catch {
      setError('Failed to load students')
    }
  }

  async function loadAnalytics() {
    try {
      const { data } = await api.get('/professor/analytics')
      setAnalytics(data)
    } catch {
      // analytics is non-critical; ignore
    }
  }

  async function loadMarks(studentId) {
    try {
      const { data } = await api.get(`/professor/marks/student/${studentId}`)
      setMarks(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load marks')
    }
  }

  useEffect(() => {
    loadStudents()
    loadAnalytics()
  }, [])

  function flash(setter, msg) {
    setter(msg)
    setTimeout(() => setter(''), 3000)
  }

  // ---------- mutations ----------
  async function addStudent(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/professor/students', studentForm)
      flash(setSuccess, `Added ${studentForm.name}`)
      setStudentForm({ name: '', email: '', password: '' })
      loadStudents()
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to add student')
    }
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
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to add mark')
    }
  }

  async function saveMarkEdit(markId) {
    setError('')
    try {
      await api.put(`/professor/marks/${markId}`, {
        marks_obtained: parseInt(editValue, 10),
      })
      flash(setSuccess, 'Mark updated')
      setEditingMarkId(null)
      setEditValue('')
      loadMarks(selected.id)
      loadAnalytics()
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to update mark')
    }
  }

  function startEdit(mark) {
    setEditingMarkId(mark.id)
    setEditValue(String(mark.marks_obtained))
  }

  function cancelEdit() {
    setEditingMarkId(null)
    setEditValue('')
  }

  function selectStudent(s) {
    setSelected(s)
    loadMarks(s.id)
    setEditingMarkId(null)
  }

  return (
    <>
      <Header title="Professor Console" subtitle="Class Management" />
      <main className="max-w-6xl mx-auto px-6 py-10">
        {(error || success) && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            error
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
            {error || success}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Column 1: Students list + add form */}
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

            <form
              onSubmit={addStudent}
              className="bg-white border border-stone-200 rounded-lg p-4 space-y-3"
            >
              <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold">
                Add Student
              </div>
              {['name', 'email', 'password'].map((f) => (
                <input
                  key={f}
                  type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                  placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                  value={studentForm[f]}
                  onChange={(e) => setStudentForm({ ...studentForm, [f]: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"
                />
              ))}
              <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                Add Student
              </button>
            </form>
          </section>

          {/* Column 2: Marks for selected student */}
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
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                      >
                        <span className="text-sm">{m.subject}</span>

                        {editingMarkId === m.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-16 px-2 py-1 border border-stone-300 rounded text-sm font-mono"
                            />
                            <button
                              onClick={() => saveMarkEdit(m.id)}
                              className="text-xs px-2 py-1 bg-stone-900 text-white rounded hover:bg-stone-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-stone-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">{m.marks_obtained}/100</span>
                            <button
                              onClick={() => startEdit(m)}
                              className="text-xs text-stone-500 hover:text-stone-900 hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={addMark}
                  className="bg-white border border-stone-200 rounded-lg p-4 space-y-3"
                >
                  <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold">
                    Add Mark
                  </div>
                  <input
                    type="text"
                    placeholder="Subject"
                    value={markForm.subject}
                    onChange={(e) => setMarkForm({ ...markForm, subject: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Marks (0–100)"
                    value={markForm.marks_obtained}
                    onChange={(e) => setMarkForm({ ...markForm, marks_obtained: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-stone-900"
                  />
                  <button className="w-full py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition">
                    Save Mark
                  </button>
                </form>
              </>
            )}
          </section>

          {/* Column 3: Class standings */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Class Standings</h2>

            {!analytics?.top_scorer ? (
              <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-500">
                Add students and marks to see standings.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-amber-700 mb-1">
                    Top Scorer
                  </div>
                  <div className="font-semibold">{analytics.top_scorer.name}</div>
                  <div className="text-sm text-stone-600">
                    {analytics.top_scorer.total} marks total
                  </div>
                </div>

                <div className="bg-stone-100 border border-stone-200 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-stone-600 mb-1">
                    Lowest Scorer
                  </div>
                  <div className="font-semibold">{analytics.bottom_scorer.name}</div>
                  <div className="text-sm text-stone-600">
                    {analytics.bottom_scorer.total} marks total
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-stone-600 mb-3">
                    Full Leaderboard
                  </div>
                  {analytics.all_students.map((s, i) => (
                    <div
                      key={s.student_id}
                      className="flex justify-between py-1.5 text-sm border-b border-stone-100 last:border-0"
                    >
                      <span>
                        <span className="text-stone-400 mr-2">{i + 1}.</span>
                        {s.name}
                      </span>
                      <span className="font-mono">{s.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}