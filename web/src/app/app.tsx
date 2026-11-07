import { BrowserRouter, Route, Routes } from 'react-router'

import { Header } from '@/components/header'
import { useTheme } from '@/lib/use-theme'
import { ChatPage } from '@/features/chat/chat-page'
import { MentorsPage } from '@/features/mentors/mentors-page'
import { WorldPage } from '@/features/world/world-page'
import { NotFoundPage } from './not-found-page'

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
            <Route path="/" element={<WorldPage />} />
            <Route path="/mentors" element={<MentorsPage />} />
            <Route path="/chat/:mentorId" element={<ChatPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
