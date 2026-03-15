/**
 * SplitPane.jsx - 50/50 split layout with divider
 */

import './SplitPane.css';

/**
 * SplitPane component - 50/50 split layout with mobile support
 * @param {Object} props
 * @param {React.ReactNode} props.lecturePanel - Content for lecture panel (left)
 * @param {React.ReactNode} props.chatPanel - Content for chat panel (right)
 * @param {string} [props.activeTab] - 'lecture' | 'chat' - which panel to show on mobile
 * @param {string} [props.mobileTab] - Current mobile tab state (controlled)
 */
export default function SplitPane({ 
  lecturePanel, 
  chatPanel, 
  activeTab = 'both',
  mobileTab = 'lecture'
}) {
  // On mobile, show only the active tab
  const showLecture = activeTab === 'both' || mobileTab === 'lecture';
  const showChat = activeTab === 'both' || mobileTab === 'chat';

  return (
    <div className="split-pane">
      {showLecture && (
        <div className="split-pane-lecture">
          {lecturePanel}
        </div>
      )}
      
      {activeTab === 'both' && <div className="split-pane-divider" />}
      
      {showChat && (
        <div className="split-pane-chat">
          {chatPanel}
        </div>
      )}
    </div>
  );
}
