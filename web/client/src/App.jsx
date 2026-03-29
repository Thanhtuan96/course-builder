/**
 * App.jsx - Main application component with all components wired together
 */

import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.jsx';
import SplitPane from './components/SplitPane.jsx';
import LecturePanel from './components/LecturePanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import MobileTabSwitcher from './components/MobileTabSwitcher.jsx';
import { fetchCourses } from './api/client.js';

/**
 * Main App component - wires all components together
 */
export default function App() {
  // State
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('idle');
  const [activeTab, setActiveTab] = useState('both'); // 'both', 'lecture', or 'chat'
  const [lectureContent, setLectureContent] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setActiveTab('lecture'); // Default to lecture on mobile
      } else {
        setActiveTab('both');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load courses on mount and on refresh-courses event
  useEffect(() => {
    loadCourses(null);
    const handleRefresh = (e) => loadCourses(e.detail?.slug);
    window.addEventListener('refresh-courses', handleRefresh);
    return () => window.removeEventListener('refresh-courses', handleRefresh);
  }, []);

  async function loadCourses(preferSlug = null) {
    try {
      const data = await fetchCourses();
      setCourses(data || []);
      if (!data || data.length === 0) return;

      setSelectedCourse(prev => {
        // If a specific slug is preferred (e.g., just created), select it
        if (preferSlug) {
          const target = data.find(c => c.slug === preferSlug);
          if (target) return target;
        }
        // Re-select current to pick up metadata updates
        if (prev) {
          const refreshed = data.find(c => c.slug === prev.slug);
          return refreshed || prev;
        }
        // Default: first course
        return data[0];
      });
    } catch (err) {
      console.error('Failed to load courses:', err);
    }
  }

  // Handle course selection
  function handleCourseSelect(course) {
    setSelectedCourse(course);
    setCurrentPhase(course ? 'lecture' : 'idle');
  }

  useEffect(() => {
    setCurrentPhase(selectedCourse ? 'lecture' : 'idle');
  }, [selectedCourse]);

  // Handle tab change for mobile
  function handleTabChange(tab) {
    setActiveTab(tab);
  }

  // Handle lecture update (from WebSocket)
  const handleLectureUpdate = useCallback((data) => {
    if (data.courseSlug === selectedCourse?.slug) {
      // Trigger lecture refresh
      window.dispatchEvent(new CustomEvent('refresh-lecture'));
    }
  }, [selectedCourse]);

  // NOTE: WebSocket updates are temporarily disabled until the backend WS endpoint is implemented.
  // Lecture refresh is still triggered via SSE events from chat actions.

  // Mobile tab
  const mobileTab = activeTab === 'both' ? 'lecture' : activeTab;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Header 
        selectedCourse={selectedCourse} 
        onCourseSelect={handleCourseSelect}
      />
      
      {isMobile && (
        <MobileTabSwitcher 
          activeTab={activeTab === 'both' ? 'lecture' : activeTab}
          onTabChange={handleTabChange}
        />
      )}
      
      <SplitPane
        activeTab={activeTab}
        mobileTab={mobileTab}
        lecturePanel={
          <LecturePanel 
            courseSlug={selectedCourse?.slug}
            content={lectureContent}
            onLectureUpdate={setLectureContent}
          />
        }
        chatPanel={
          <ChatPanel
            courseSlug={selectedCourse?.slug}
            currentPhase={currentPhase}
          />
        }
      />
    </div>
  );
}
