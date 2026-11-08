import { useLayoutEffect, useState } from 'react'
import App from './App.jsx'
import PasswordReset from './views/PasswordReset.jsx'
import { createPasswordRecoveryClient, PASSWORD_RESET_PATH } from './utils/supabaseClient.js'

const recoveryClient = window.location.pathname === PASSWORD_RESET_PATH
  ? createPasswordRecoveryClient()
  : null

export default function ThemedApp() {
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // The theme still works when browser storage is unavailable.
    }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')

  return recoveryClient
    ? <PasswordReset auth={recoveryClient.auth} theme={theme} onToggleTheme={toggleTheme} />
    : <App theme={theme} onToggleTheme={toggleTheme} />
}
