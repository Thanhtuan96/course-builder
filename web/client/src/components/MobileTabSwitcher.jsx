/**
 * MobileTabSwitcher.jsx - Mobile view toggle
 */

import './MobileTabSwitcher.css';

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
    <div className="mobile-tab-switcher">
      <button
        className={`mobile-tab-button ${activeTab === 'lecture' ? 'active' : ''}`}
        onClick={handleLectureClick}
        aria-pressed={activeTab === 'lecture'}
      >
        <span className="mobile-tab-icon">📖</span>
        <span className="mobile-tab-label">Lecture</span>
      </button>
      <button
        className={`mobile-tab-button ${activeTab === 'chat' ? 'active' : ''}`}
        onClick={handleChatClick}
        aria-pressed={activeTab === 'chat'}
      >
        <span className="mobile-tab-icon">💬</span>
        <span className="mobile-tab-label">Chat</span>
      </button>
    </div>
  );
}
