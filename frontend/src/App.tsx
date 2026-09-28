import { BrowserRouter, Route, Routes } from 'react-router'

import { Header } from './components/Header'
import { useTheme } from './hooks/useTheme'
import { ChatPage } from './pages/ChatPage'
import { MentorsPage } from './pages/MentorsPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  const { theme, setTheme } = useTheme()

  return (
    <BrowserRouter>
      {/* h-dvh + overflow-hidden keeps the chat composer pinned to the bottom
          on mobile, where the browser chrome changes the visible height. */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <Header theme={theme} onThemeChange={setTheme} />
        <div className="flex flex-1 flex-col overflow-y-auto">
          <Routes>
            <Route path="/" element={<MentorsPage />} />
            <Route path="/chat/:mentorId" element={<ChatPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
