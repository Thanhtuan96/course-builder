/**
 * LecturePanel.jsx - Markdown rendering with syntax highlighting
 * Supports tabs: Lecture (LECTURE.md), Syllabus (COURSE.md), Exercises
 */

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MDEditor from '@uiw/react-md-editor';
import { fetchCourseFile, fetchExercises, fetchExercise, saveExercise } from '../api/client.js';
import './LecturePanel.css';

const CODE_COMPONENTS = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

/**
 * LecturePanel component - displays markdown lecture content
 * @param {Object} props
 * @param {string|null} props.courseSlug - Current course slug
 * @param {string} [props.content] - Optional pre-loaded content
 * @param {Function} [props.onLectureUpdate] - Callback when lecture updates
 */
export default function LecturePanel({ courseSlug, content: initialContent, onLectureUpdate }) {
  const [activeTab, setActiveTab] = useState('lecture'); // 'lecture' | 'syllabus' | 'exercises'
  const [lectureContent, setLectureContent] = useState(initialContent || '');
  const [syllabusContent, setSyllabusContent] = useState('');
  const [exercises, setExercises] = useState([]);
  const [activeExercise, setActiveExercise] = useState(null);
  const [exerciseContent, setExerciseContent] = useState('');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const content = activeTab === 'lecture' ? lectureContent : 
                  activeTab === 'syllabus' ? syllabusContent : '';

  const loadFile = useCallback(async (tab) => {
    if (!courseSlug) return;

    const file = tab === 'lecture' ? 'LECTURE.md' : 'COURSE.md';
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCourseFile(courseSlug, file);
      const text = data?.content || '';
      if (tab === 'lecture') {
        setLectureContent(text);
      } else {
        setSyllabusContent(text);
      }
    } catch (err) {
      console.error(`Failed to load ${file}:`, err);
      setError(`Failed to load ${tab}`);
    } finally {
      setLoading(false);
    }
  }, [courseSlug]);

  // Load exercises
  const loadExercises = useCallback(async () => {
    if (!courseSlug) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchExercises(courseSlug);
      setExercises(data.exercises || []);
      setActiveExercise(data.activeExercise);
      
      // Auto-select active exercise or first one
      const toSelect = data.activeExercise || (data.exercises?.[0]?.filename);
      if (toSelect) {
        setSelectedExercise(toSelect);
        const exerciseData = await fetchExercise(courseSlug, toSelect);
        setExerciseContent(exerciseData.content);
      }
    } catch (err) {
      console.error('Failed to load exercises:', err);
      setError('Failed to load exercises');
    } finally {
      setLoading(false);
    }
  }, [courseSlug]);

  // Handle exercise selection
  const handleExerciseSelect = async (filename) => {
    if (!courseSlug) return;
    
    setSelectedExercise(filename);
    try {
      const data = await fetchExercise(courseSlug, filename);
      setExerciseContent(data.content);
    } catch (err) {
      console.error('Failed to load exercise:', err);
    }
  };

  // Handle exercise save
  const handleExerciseSave = async () => {
    if (!courseSlug || !selectedExercise) return;
    
    setSaving(true);
    try {
      await saveExercise(courseSlug, selectedExercise, exerciseContent);
      alert('Exercise saved!');
    } catch (err) {
      console.error('Failed to save exercise:', err);
      alert('Failed to save exercise');
    } finally {
      setSaving(false);
    }
  };

  // Load both files on course change
  useEffect(() => {
    if (!courseSlug) {
      setLectureContent('');
      setSyllabusContent('');
      setExercises([]);
      setSelectedExercise(null);
      setExerciseContent('');
      return;
    }
    loadFile('lecture');
    loadFile('syllabus');
    if (activeTab === 'exercises') {
      loadExercises();
    }
  }, [courseSlug, loadFile, activeTab, loadExercises]);

  // Load exercises when switching to exercises tab
  useEffect(() => {
    if (activeTab === 'exercises' && courseSlug && exercises.length === 0) {
      loadExercises();
    }
  }, [activeTab, courseSlug, exercises.length, loadExercises]);

  // Refresh via custom events (fired when server saves course files)
  useEffect(() => {
    const handleLecture = () => loadFile('lecture');
    const handleSyllabus = () => loadFile('syllabus');
    window.addEventListener('refresh-lecture', handleLecture);
    window.addEventListener('refresh-syllabus', handleSyllabus);
    return () => {
      window.removeEventListener('refresh-lecture', handleLecture);
      window.removeEventListener('refresh-syllabus', handleSyllabus);
    };
  }, [loadFile]);

  // Notify parent of lecture content changes
  useEffect(() => {
    if (onLectureUpdate) {
      onLectureUpdate(lectureContent);
    }
  }, [lectureContent, onLectureUpdate]);

  if (!courseSlug) {
    return (
      <div className="lecture-panel-empty">
        <div className="lecture-panel-empty-content">
          <span className="lecture-panel-icon">📖</span>
          <p>Select a course to see the current lecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lecture-panel-wrapper">
      <div className="lecture-panel-tabs">
        <button
          className={`lecture-tab-btn${activeTab === 'lecture' ? ' active' : ''}`}
          onClick={() => setActiveTab('lecture')}
        >
          📝 Lecture
        </button>
        <button
          className={`lecture-tab-btn${activeTab === 'syllabus' ? ' active' : ''}`}
          onClick={() => setActiveTab('syllabus')}
        >
          📋 Syllabus
        </button>
        <button
          className={`lecture-tab-btn${activeTab === 'exercises' ? ' active' : ''}`}
          onClick={() => setActiveTab('exercises')}
        >
          💪 Exercises
          {activeExercise && <span className="active-badge">●</span>}
        </button>
      </div>

      {loading ? (
        <div className="lecture-panel-loading">
          <div className="lecture-panel-loading-spinner" />
          <p>Loading...</p>
        </div>
      ) : error ? (
        <div className="lecture-panel-error">
          <p>{error}</p>
          <button onClick={() => loadFile(activeTab)}>Retry</button>
        </div>
      ) : activeTab === 'exercises' ? (
        <div className="exercises-panel">
          {exercises.length === 0 ? (
            <div className="lecture-panel-empty">
              <div className="lecture-panel-empty-content">
                <span className="lecture-panel-icon">💪</span>
                <p>No exercises yet.</p>
                <p className="lecture-panel-hint">
                  Type <code>professor:next</code> in chat to create exercises.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="exercises-sidebar">
                <div className="exercises-list">
                  <h4>Exercises</h4>
                  {exercises.map((ex) => (
                    <button
                      key={ex.filename}
                      className={`exercise-item${selectedExercise === ex.filename ? ' active' : ''}${activeExercise === ex.filename ? ' current' : ''}`}
                      onClick={() => handleExerciseSelect(ex.filename)}
                    >
                      {ex.filename.replace('.md', '')}
                      {activeExercise === ex.filename && <span className="active-indicator">●</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="exercise-content">
                <div className="exercise-header">
                  <h4>{selectedExercise}</h4>
                  <button 
                    className="save-btn" 
                    onClick={handleExerciseSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : '💾 Save'}
                  </button>
                </div>
                <div className="exercise-editor-wrapper" data-color-mode="dark">
                  <MDEditor
                    value={exerciseContent}
                    onChange={setExerciseContent}
                    preview="live"
                    height="100%"
                    style={{ backgroundColor: '#0f1117' }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ) : !content ? (
        <div className="lecture-panel-empty">
          <div className="lecture-panel-empty-content">
            <span className="lecture-panel-icon">✨</span>
            {activeTab === 'lecture' ? (
              <>
                <p>No lecture loaded yet.</p>
                <p className="lecture-panel-hint">
                  Type <code>professor:next</code> in chat to start your first section.
                </p>
              </>
            ) : (
              <>
                <p>No syllabus found.</p>
                <p className="lecture-panel-hint">
                  Type <code>professor:new-topic</code> in chat to create a course.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="lecture-panel">
          <div className="lecture-panel-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={CODE_COMPONENTS}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
