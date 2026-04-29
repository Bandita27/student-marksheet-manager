import { useState, useEffect, useRef } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

export default function StudentDashboard() {
  const [tab, setTab] = useState('marksheet') // 'marksheet' | 'assignments'

  // ---- marksheet state ----
  const [data, setData] = useState(null)

  // ---- assignments state ----
  const [assignments, setAssignments] = useState([])
  const [filter, setFilter] = useState('pending')
  const [openId, setOpenId] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function flash(setter, msg) {
    setter(msg)
    setTimeout(() => setter(''), 3000)
  }

  // ---- loaders ----
  async function loadMarks() {
    try {
      const { data } = await api.get('/student/me/marks')
      setData(data)
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to load marks')
    }
  }

  async function loadAssignments() {
    try {
      const { data } = await api.get('/student/assignments')
      setAssignments(data)
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to load assignments')
    }
  }

  useEffect(() => {
    loadMarks()
    loadAssignments()
  }, [])

  // ---- assignment actions ----
  async function submitAssignment(assignmentId) {
    if (!selectedFile) {
      flash(setError, 'Please choose a file before submitting.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      await api.post(
        `/student/assignments/${assignmentId}/submit`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      flash(setSuccess, 'Submitted successfully')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setOpenId(null)
      loadAssignments()
    } catch (err) {
      flash(setError, err.response?.data?.detail || 'Failed to submit')
    } finally {
      setUploading(false)
    }
  }

  async function downloadSubmission(submissionId, filename) {
    try {
      const res = await api.get(
        `/student/submissions/${submissionId}/download`,
        { responseType: 'blob' }
      )
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

  // ---- helpers ----
  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    })
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function statusOf(a) {
    if (a.marks_awarded != null) return 'graded'
    if (a.submitted_at) return 'submitted'
    return 'pending'
  }

  function dueState(a) {
    const due = new Date(a.due_date)
    const hoursUntil = (due - new Date()) / (1000 * 60 * 60)
    if (hoursUntil < 0) return 'overdue'
    if (hoursUntil < 24) return 'soon'
    return 'normal'
  }

  const filtered = assignments.filter((a) => statusOf(a) === filter)
  const counts = {
    pending: assignments.filter((a) => statusOf(a) === 'pending').length,
    submitted: assignments.filter((a) => statusOf(a) === 'submitted').length,
    graded: assignments.filter((a) => statusOf(a) === 'graded').length,
  }

  // ---- marksheet computed ----
  const percentage =
    data && data.max_total ? Math.round((data.total / data.max_total) * 100) : 0

  // ---- render ----
  return (
    <>
      <Header title="Student Portal" subtitle="Marksheet & Assignments" />
      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Tabs (hidden when printing) */}
        <div className="flex gap-2 mb-8 border-b border-stone-200 no-print">
          {[
            { key: 'marksheet', label: 'My Marksheet' },
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
              {t.key === 'assignments' && counts.pending > 0 && (
                <span className="ml-2 inline-block px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full font-mono">
                  {counts.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {(error || success) && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm no-print ${
            error
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
            {error || success}
          </div>
        )}

        {/* MARKSHEET TAB */}
        {tab === 'marksheet' && (
          !data ? (
            <div className="p-10">Loading…</div>
          ) : (
            <>
              <div className="bg-white border border-stone-200 rounded-lg p-10 print:border-0 print:shadow-none">
                <div className="text-center border-b border-stone-200 pb-6 mb-8">
                  <div className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">
                    Academic Marksheet
                  </div>
                  <h1 className="text-3xl font-semibold">{data.student.name}</h1>
                  <div className="text-sm text-stone-500 mt-1">{data.student.email}</div>
                </div>

                <table className="w-full mb-8">
                  <thead>
                    <tr className="border-b-2 border-stone-300">
                      <th className="text-left py-3 text-xs uppercase tracking-wider text-stone-600">Subject</th>
                      <th className="text-right py-3 text-xs uppercase tracking-wider text-stone-600">Marks</th>
                      <th className="text-right py-3 text-xs uppercase tracking-wider text-stone-600">Out of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.marks.length === 0 ? (
                      <tr><td colSpan="3" className="text-center py-8 text-stone-500">No marks recorded yet</td></tr>
                    ) : (
                      data.marks.map((m, i) => (
                        <tr key={i} className="border-b border-stone-100">
                          <td className="py-3">{m.subject}</td>
                          <td className="text-right font-mono">{m.marks_obtained}</td>
                          <td className="text-right font-mono text-stone-500">100</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {data.marks.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-stone-300">
                        <td className="py-3 font-semibold">Total</td>
                        <td className="text-right font-mono font-semibold">{data.total}</td>
                        <td className="text-right font-mono text-stone-500">{data.max_total}</td>
                      </tr>
                      <tr>
                        <td className="py-3 font-semibold">Percentage</td>
                        <td colSpan="2" className="text-right font-mono font-semibold">{percentage}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="mt-6 text-center no-print">
                <button
                  onClick={() => window.print()}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition"
                >
                  Print / Save as PDF
                </button>
              </div>
            </>
          )
        )}

        {/* ASSIGNMENTS TAB */}
        {tab === 'assignments' && (
          <section>
            <div className="flex gap-2 mb-4">
              {[
                { key: 'pending', label: 'Pending' },
                { key: 'submitted', label: 'Submitted' },
                { key: 'graded', label: 'Graded' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setOpenId(null); setSelectedFile(null) }}
                  className={`px-3 py-1.5 text-sm rounded-full border transition ${
                    filter === f.key
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'
                  }`}
                >
                  {f.label}
                  <span className={`ml-2 text-xs ${filter === f.key ? 'text-stone-300' : 'text-stone-500'}`}>
                    {counts[f.key]}
                  </span>
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center text-sm text-stone-500">
                {filter === 'pending' && "No pending assignments. You're all caught up."}
                {filter === 'submitted' && 'Nothing awaiting grading.'}
                {filter === 'graded' && 'No graded assignments yet.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((a) => {
                  const status = statusOf(a)
                  const due = dueState(a)
                  const expanded = openId === a.id
                  const borderClr =
                    due === 'overdue' && status === 'pending' ? 'border-red-300' :
                    due === 'soon' && status === 'pending' ? 'border-amber-300' :
                    'border-stone-200'

                  return (
                    <div key={a.id} className={`bg-white border ${borderClr} rounded-lg overflow-hidden`}>
                      <button
                        onClick={() => {
                          setOpenId(expanded ? null : a.id)
                          setSelectedFile(null)
                        }}
                        className="w-full text-left p-4 hover:bg-stone-50 transition"
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold">{a.title}</span>
                          <span className="text-xs px-2 py-0.5 bg-stone-100 rounded text-stone-600">
                            {a.subject}
                          </span>
                          {status === 'pending' && due === 'overdue' && (
                            <span className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded">Overdue</span>
                          )}
                          {status === 'pending' && due === 'soon' && (
                            <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">Due soon</span>
                          )}
                          {status === 'graded' && (
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-mono">
                              {a.marks_awarded}/{a.max_marks}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500">
                          Due {fmtDate(a.due_date)} · Max {a.max_marks} marks
                          {a.professor_name && ` · ${a.professor_name}`}
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-stone-200 bg-stone-50 p-4">
                          {a.description && (
                            <div className="mb-4">
                              <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold mb-1">
                                Instructions
                              </div>
                              <p className="text-sm text-stone-700 whitespace-pre-wrap">{a.description}</p>
                            </div>
                          )}

                          {/* PENDING */}
                          {status === 'pending' && (
                            <div>
                              {due === 'overdue' ? (
                                <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded">
                                  This assignment is past its due date. Submission is closed.
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold mb-2">
                                    Upload your work
                                  </div>
                                  <div className="border-2 border-dashed border-stone-300 rounded-lg p-4 bg-white mb-3">
                                    <input
  ref={fileInputRef}
  type="file"
  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
  accept={
    a.allowed_extensions && a.allowed_extensions.length > 0
      ? a.allowed_extensions.join(',')
      : '.pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.zip,.py,.js,.java,.cpp,.c,.ipynb'
  }
  className="block w-full text-sm text-stone-700
    file:mr-3 file:py-2 file:px-4
    file:rounded file:border-0
    file:text-sm file:font-medium
    file:bg-stone-900 file:text-white
    hover:file:bg-stone-700 cursor-pointer"
/>
                                    {selectedFile && (
                                      <div className="mt-3 text-xs text-stone-600 flex items-center justify-between">
                                        <span className="truncate">
                                          📎 {selectedFile.name} · {fmtSize(selectedFile.size)}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setSelectedFile(null)
                                            if (fileInputRef.current) fileInputRef.current.value = ''
                                          }}
                                          className="text-stone-500 hover:text-stone-900 ml-2"
                                        >✕</button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-stone-500 mb-3">
  Max 10 MB. Accepted:{' '}
  {a.allowed_extensions && a.allowed_extensions.length > 0
    ? a.allowed_extensions.join(', ')
    : 'PDF, DOC, DOCX, images, ZIP, code files'}.
</div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => submitAssignment(a.id)}
                                      disabled={!selectedFile || uploading}
                                      className="px-4 py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {uploading ? 'Uploading…' : 'Submit'}
                                    </button>
                                    <button
                                      onClick={() => { setOpenId(null); setSelectedFile(null) }}
                                      className="px-4 py-2 text-sm text-stone-500 hover:underline"
                                    >Cancel</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* SUBMITTED */}
                          {status === 'submitted' && (
                            <div>
                              <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold mb-2">
                                Your submission · {fmtDate(a.submitted_at)}
                              </div>
                              <div className="bg-white border border-stone-200 p-3 rounded flex items-center justify-between">
                                <span className="text-sm truncate">📎 {a.submission_file_name}</span>
                                <button
                                  onClick={() => downloadSubmission(a.submission_id, a.submission_file_name)}
                                  className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                                >Download</button>
                              </div>
                              <div className="text-xs text-stone-500 mt-2 italic">Awaiting grading.</div>

                              {due !== 'overdue' && (
                                <div className="mt-4 pt-4 border-t border-stone-200">
                                  <div className="text-xs text-stone-600 mb-2">
                                    Need to update? Upload a new file to replace this submission.
                                  </div>
                                  <input
                                    type="file"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    className="block w-full text-xs text-stone-700
                                      file:mr-2 file:py-1 file:px-3 file:rounded file:border-0
                                      file:text-xs file:bg-stone-200 file:text-stone-800
                                      hover:file:bg-stone-300 cursor-pointer mb-2"
                                  />
                                  {selectedFile && (
                                    <button
                                      onClick={() => submitAssignment(a.id)}
                                      disabled={uploading}
                                      className="px-3 py-1.5 bg-stone-900 text-white rounded text-xs hover:bg-stone-700 disabled:opacity-50"
                                    >
                                      {uploading ? 'Uploading…' : `Replace with ${selectedFile.name}`}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* GRADED */}
                          {status === 'graded' && (
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs uppercase tracking-wider text-stone-600 font-semibold mb-2">
                                  Your submission · {fmtDate(a.submitted_at)}
                                </div>
                                <div className="bg-white border border-stone-200 p-3 rounded flex items-center justify-between">
                                  <span className="text-sm truncate">📎 {a.submission_file_name}</span>
                                  <button
                                    onClick={() => downloadSubmission(a.submission_id, a.submission_file_name)}
                                    className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                                  >Download</button>
                                </div>
                              </div>
                              <div className="bg-green-50 border border-green-200 rounded p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs uppercase tracking-wider text-green-700 font-semibold">
                                    Grade
                                  </span>
                                  <span className="font-mono font-semibold text-green-900">
                                    {a.marks_awarded}/{a.max_marks}
                                  </span>
                                </div>
                                {a.feedback && (
                                  <p className="text-sm text-stone-700 mt-2 italic">"{a.feedback}"</p>
                                )}
                              </div>
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
        )}
      </main>
    </>
  )
}