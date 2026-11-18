import { BrowserRouter, Route, Routes } from 'react-router'

import { Header } from '@/components/header'
import { useTheme } from '@/lib/use-theme'
import { ChatPage } from '@/features/chat/chat-page'
import { MentorsPage } from '@/features/mentors/mentors-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { SquareProvider } from '@/features/squares/square-provider'
import { useSquares } from '@/features/squares/use-squares'
import { SquareSwitcher } from '@/features/squares/square-switcher'
import { WorldPage } from '@/features/world/world-page'
import { NotFoundPage } from './not-found-page'

export function App() {
  return (
    <BrowserRouter>
      <SquareProvider>
        <Shell />
      </SquareProvider>
    </BrowserRouter>
  )
}

function Shell() {
  const { theme, setTheme } = useTheme()
  const { currentId } = useSquares()

  return (
    // h-dvh + overflow-hidden keeps the chat composer pinned to the bottom
    // on mobile, where the browser chrome changes the visible height.
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header theme={theme} onThemeChange={setTheme} squareSwitcher={<SquareSwitcher />} />
      {/* Keyed by square: switching remounts every page, so nothing from the last
          square (its game, socket, chats) carries over. */}
      <div key={currentId} className="flex flex-1 flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<WorldPage />} />
          <Route path="/mentors" element={<MentorsPage />} />
          <Route path="/chat/:mentorId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </div>
  )
}
