/**
 * SplitPane.jsx - 50/50 split layout with divider
 */

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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row">
      {showLecture && (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden md:w-1/2">
          {lecturePanel}
        </div>
      )}
      
      {activeTab === 'both' && showLecture && showChat && (
        <div className="hidden w-px shrink-0 bg-border md:block" />
      )}
      
      {showChat && (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden md:w-1/2">
          {chatPanel}
        </div>
      )}
    </div>
  );
}
