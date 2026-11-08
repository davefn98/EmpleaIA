import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ThemedApp from './ThemedApp.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { NotificationProvider } from './components/common/NotificationContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <NotificationProvider>
        <ThemedApp />
      </NotificationProvider>
    </ErrorBoundary>
  </StrictMode>,
)

