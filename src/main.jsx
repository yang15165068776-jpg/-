import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ── Debug: catch module-loading TDZ errors ──
window.addEventListener('error', (e) => {
  if (e.message && (e.message.includes('before initialization') || e.message.includes('not defined'))) {
    alert('🚨 EARLY ERROR:\n' + e.message + '\n\nFile: ' + (e.filename || '?') + '\nLine: ' + (e.lineno || '?') + '\nCol: ' + (e.colno || '?'))
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
