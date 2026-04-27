import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      localStorage.setItem('auth', JSON.stringify(data))
      navigate(`/${data.role}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-3">Marksheet Portal</div>
          <h1 className="text-5xl font-semibold text-stone-900">Sign in</h1>
          <p className="text-stone-500 mt-3">Use your registered credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-600 mb-2 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-stone-900 transition"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-stone-600 mb-2 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-stone-900 transition"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-700 transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}