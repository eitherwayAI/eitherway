import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold text-gray-800 mb-2 text-center">
          Welcome to React
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Built with Vite + Tailwind CSS
        </p>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCount(count - 1)}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200 shadow-md"
            >
              -
            </button>
            <span className="text-5xl font-bold text-indigo-600 min-w-[80px] text-center">
              {count}
            </span>
            <button
              onClick={() => setCount(count + 1)}
              className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200 shadow-md"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setCount(0)}
            className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-8 rounded-lg transition-colors duration-200"
          >
            Reset
          </button>
        </div>

        <div className="mt-8 p-4 bg-indigo-50 rounded-lg">
          <p className="text-sm text-gray-700 text-center">
            Edit <code className="bg-white px-2 py-1 rounded font-mono text-xs">src/App.jsx</code> to get started
          </p>
        </div>
      </div>
    </div>
  )
}
