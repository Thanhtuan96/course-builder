/**
 * MobileTabSwitcher.jsx - Mobile view toggle
 */
import { Button } from './ui/button.jsx';

/**
 * MobileTabSwitcher component - toggle between lecture and chat on mobile
 * @param {Object} props
 * @param {string} props.activeTab - Current active tab: 'lecture' | 'chat'
 * @param {Function} props.onTabChange - Callback when tab changes
 */
export default function MobileTabSwitcher({ activeTab = 'lecture', onTabChange }) {
  function handleLectureClick() {
    onTabChange?.('lecture');
  }

  function handleChatClick() {
    onTabChange?.('chat');
  }

  return (
    <div className="flex shrink-0 border-b border-slate-800 bg-slate-900 md:hidden">
      <Button
        variant="ghost"
        className={`h-11 flex-1 justify-center rounded-none border-b-2 ${
          activeTab === 'lecture'
            ? 'border-indigo-400 text-indigo-300'
            : 'border-transparent text-slate-400'
        }`}
        onClick={handleLectureClick}
        aria-pressed={activeTab === 'lecture'}
      >
        <span>📖</span>
        <span>Lecture</span>
      </Button>
      <Button
        variant="ghost"
        className={`h-11 flex-1 justify-center rounded-none border-b-2 ${
          activeTab === 'chat'
            ? 'border-indigo-400 text-indigo-300'
            : 'border-transparent text-slate-400'
        }`}
        onClick={handleChatClick}
        aria-pressed={activeTab === 'chat'}
      >
        <span>💬</span>
        <span>Chat</span>
      </Button>
    </div>
  );
}
