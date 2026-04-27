import { useNavigate } from 'react-router-dom'

export default function Header({ title, subtitle }) {
  const navigate = useNavigate()
  const auth = JSON.parse(localStorage.getItem('auth') || 'null')

  function logout() {
    localStorage.removeItem('auth')
    navigate('/login')
  }

  return (
    <header className="border-b border-stone-200 bg-(--paper) no-print">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-stone-500">{subtitle}</div>
          <h1 className="text-2xl font-semibold mt-1">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{auth?.name}</div>
            <div className="text-xs text-stone-500 capitalize">{auth?.role}</div>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-100 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}