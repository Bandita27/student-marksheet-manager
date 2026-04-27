import { useState, useEffect } from 'react'
import api from '../api.js'
import Header from '../components/Header.jsx'

export default function StudentDashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/student/me/marks').then((r) => setData(r.data))
  }, [])

  if (!data) return <div className="p-10">Loading…</div>

  const percentage = data.max_total ? Math.round((data.total / data.max_total) * 100) : 0

  return (
    <>
      <Header title="My Marksheet" subtitle="Student Portal" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white border border-stone-200 rounded-lg p-10 print:border-0 print:shadow-none">
          <div className="text-center border-b border-stone-200 pb-6 mb-8">
            <div className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Academic Marksheet</div>
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
      </main>
    </>
  )
}