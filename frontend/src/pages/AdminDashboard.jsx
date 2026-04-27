import { useState, useEffect } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

export default function AdminDashboard() {
  const [professors, setProfessors] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    try {
      const { data } = await api.get('/admin/professors')
      setProfessors(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('Failed to load professors')
    }
  }

  useEffect(() => { load() }, [])

  async function addProfessor(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    try {
      await api.post('/admin/professors', form)
      setSuccess(`Added ${form.name}`)
      setForm({ name: '', email: '', password: '', department: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add professor')
    }
  }

  async function removeProfessor(id) {
    if (!confirm('Remove this professor?')) return
    try {
      await api.delete(`/admin/professors/${id}`)
      load()
    } catch (err) {
      setError('Failed to remove professor')
    }
  }

  return (
    <>
      <Header title="Admin Console" subtitle="Faculty Management" />
      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-2 gap-10">
        <section>
          <h2 className="text-2xl font-semibold mb-6">Add Professor</h2>
          <form onSubmit={addProfessor} className="space-y-4 bg-white border border-stone-200 rounded-lg p-6">
            {['name', 'email', 'password', 'department'].map((field) => (
              <div key={field}>
                {/* Fixed: Added htmlFor to associate label with input */}
                <label 
                  htmlFor={`field-${field}`} 
                  className="text-xs uppercase tracking-wider text-stone-600 mb-1 block"
                >
                  {field}
                </label>
                <input
                  id={`field-${field}`} // Fixed: Added unique ID
                  name={field}           // Fixed: Added name for autofill
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  required={field !== 'department'}
                  autoComplete={field === 'password' ? 'new-password' : field === 'email' ? 'email' : 'on'}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-stone-900"
                />
              </div>
            ))}
            {error && <div className="text-sm text-red-700">{error}</div>}
            {success && <div className="text-sm text-green-700">{success}</div>}
            <button type="submit" className="w-full py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition">
              Add Professor
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Faculty Roster</h2>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
            {!professors || professors.length === 0 ? (
              <div className="p-8 text-center text-stone-500">No professors yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-600 uppercase text-xs tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Department</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {professors.map((p) => (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-stone-500">{p.email}</div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{p.department || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeProfessor(p.id)}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </>
  )
}