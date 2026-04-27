import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import ProfessorDashboard from './pages/ProfessorDashboard.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'

function getAuth() {
  return JSON.parse(localStorage.getItem('auth') || 'null')
}

function Protected({ role, children }) {
  const auth = getAuth()
  if (!auth) return <Navigate to="/login" replace />
  if (auth.role !== role) return <Navigate to={`/${auth.role}`} replace />
  return children
}

export default function App() {
  const auth = getAuth()
  const home = auth ? `/${auth.role}` : '/login'

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
      <Route path="/professor" element={<Protected role="professor"><ProfessorDashboard /></Protected>} />
      <Route path="/student" element={<Protected role="student"><StudentDashboard /></Protected>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}