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
    } catch (err) { setError('Failed to load submissions') }
  }

  useEffect(() => {
    loadStudents()
    loadAnalytics()
    loadAssignments()
  }, [])

  function flash(setter, msg) {
    setter(msg); setTimeout(() => setter(''), 3000)
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

  // ---------- Logic: Assignments & Preview ----------
async function handlePreview(submissionId, filename) {
  try {
    setError('');
    setPreviewUrl(null); // Clear old preview
    
    const res = await api.get(`/submissions/${submissionId}/download`, {
      params: { preview: true }, // Tells FastAPI to use "inline"
      responseType: 'blob' 
    });

    // Create the Blob and verify its type
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    
    console.log("Preview URL created:", url); // Check your F12 console for this
    setPreviewUrl(url);
    setPreviewName(filename);
  } catch (err) {
    console.error("Preview Error:", err);
    flash(setError, 'Server error while generating preview.');
  }
}

  async function deleteAssignment(id) {
    if (!window.confirm("Delete this assignment and all its submissions?")) return
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
      flash(setSuccess, 'Grade saved')
      setGradingId(null)
      loadSubmissions(expandedAssignmentId)
    } catch { flash(setError, 'Failed to save grade') }
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
  <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
    <div className="bg-white w-full h-full max-w-5xl rounded-xl overflow-hidden flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <span className="font-bold">{previewName}</span>
        <button 
          onClick={() => { window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} 
          className="px-4 py-2 bg-red-600 text-white rounded shadow-lg"
        >
          Close
        </button>
      </div>
      
      {/* Try <embed> instead of <iframe> - it is more reliable for PDFs */}
      <div className="flex-1 overflow-hidden">
        <embed 
          src={previewUrl} 
          type="application/pdf" 
          width="100%" 
          height="100%" 
        />
      </div>
    </div>
  </div>
)}

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex gap-2 mb-8 border-b">
          {[{ key: 'marks', label: 'Marks & Students' }, { key: 'assignments', label: 'Assignments' }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t.key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-900'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {(error || success) && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'} border`}>
            {error || success}
          </div>
        )}

        {tab === 'marks' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">My Students</h2>
              <div className="bg-white border rounded-lg divide-y max-h-80 overflow-y-auto">
                {students.map((s) => (
                  <button key={s.id} onClick={() => { setSelected(s); loadMarks(s.id); }}
                    className={`w-full text-left p-3 hover:bg-stone-50 transition ${selected?.id === s.id ? 'bg-stone-100' : ''}`}>
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
                           <span className="font-mono text-sm">{m.marks_obtained}</span>
                           <button onClick={() => { setEditingMarkId(m.id); setEditValue(m.marks_obtained) }} className="text-[10px] underline">Edit</button>
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
                        <span>{i+1}. {s.name}</span>
                        <span className="font-mono">{s.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'assignments' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Post Assignment</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const { data } = await api.post('/professor/assignments', { ...assignmentForm, max_marks: parseInt(assignmentForm.max_marks, 10) });
                  setAssignments([data, ...assignments]);
                  flash(setSuccess, 'Posted!');
                } catch { flash(setError, 'Failed'); }
              }} className="bg-white border rounded-lg p-4 space-y-3">
                <input type="text" placeholder="Title" value={assignmentForm.title} onChange={(e) => setAssignmentForm({...assignmentForm, title: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <textarea placeholder="Description" value={assignmentForm.description} onChange={(e) => setAssignmentForm({...assignmentForm, description: e.target.value})} className="w-full p-2 border rounded text-sm" />
                <div className="flex flex-wrap gap-2 py-2">
                    {FILE_TYPE_GROUPS.flatMap(g => g.exts).map(ext => (
                      <button type="button" key={ext} onClick={() => toggleExt(ext)}
                        className={`text-[10px] px-2 py-1 rounded border ${assignmentForm.allowed_extensions.includes(ext) ? 'bg-stone-900 text-white' : 'bg-white'}`}>
                        {ext}
                      </button>
                    ))}
                </div>
                <input type="datetime-local" value={assignmentForm.due_date} onChange={(e) => setAssignmentForm({...assignmentForm, due_date: e.target.value})} className="w-full p-2 border rounded text-sm" required />
                <button className="w-full py-2 bg-stone-900 text-white rounded text-sm">Post</button>
              </form>
            </section>

            <section className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold">History</h2>
              {assignments.map((a) => (
                <div key={a.id} className="bg-white border rounded-lg overflow-hidden">
                  <div className="p-4 flex justify-between items-center">
                    <button onClick={() => { setExpandedAssignmentId(expandedAssignmentId === a.id ? null : a.id); loadSubmissions(a.id); }} className="text-left flex-1">
                      <div className="font-bold">{a.title}</div>
                      <div className="text-xs text-stone-500">{a.subject} • Due {fmtDate(a.due_date)}</div>
                    </button>
                    <button onClick={() => deleteAssignment(a.id)} className="text-red-500 text-xs px-2">Delete</button>
                  </div>
                  {expandedAssignmentId === a.id && (
                    <div className="p-4 bg-stone-50 border-t space-y-3">
                      {submissions.map((sub) => (
                        <div key={sub.id} className="bg-white border p-3 rounded-lg flex items-center justify-between">
                          <span className="text-sm font-bold">{sub.student_name}</span>
                          <div className="flex gap-4">
                            <button onClick={() => handlePreview(sub.id, sub.file_name)} className="text-xs bg-stone-100 px-3 py-1 rounded hover:bg-stone-200">Preview</button>
                            <button onClick={() => setGradingId(sub.id)} className="text-xs underline">Grade</button>
                          </div>
                          {gradingId === sub.id && (
                            <div className="absolute bg-white p-4 border shadow-xl rounded-lg">
                               <input type="number" placeholder="Marks" value={gradeForm.marks_awarded} onChange={(e) => setGradeForm({...gradeForm, marks_awarded: e.target.value})} className="border p-1" />
                               <button onClick={() => saveGrade(sub.id)} className="bg-black text-white px-2 ml-2">Save</button>
                            </div>
                          )}
                        </div>
                      ))}
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