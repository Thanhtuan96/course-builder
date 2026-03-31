/**
 * LecturePanel.jsx - Markdown rendering with syntax highlighting
 * Supports tabs: Lecture (LECTURE.md), Syllabus (COURSE.md), Exercises
 */

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { fetchCourseFile, fetchExercises, fetchExercise, saveExercise } from '../api/client.js';
import { Button } from './ui/button.jsx';
import ExerciseEditor from './ExerciseEditor.jsx';

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
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <span className="text-5xl">📖</span>
          <p>Select a course to see the current lecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-2 border-b border-slate-800 bg-slate-900/70 px-3 pt-2 md:px-4">
        <Button
          variant="ghost"
          className={`h-9 rounded-b-none border-b-2 px-3 ${
            activeTab === 'lecture'
              ? 'border-indigo-400 text-indigo-300'
              : 'border-transparent text-slate-400'
          }`}
          onClick={() => setActiveTab('lecture')}
        >
          📝 Lecture
        </Button>
        <Button
          variant="ghost"
          className={`h-9 rounded-b-none border-b-2 px-3 ${
            activeTab === 'syllabus'
              ? 'border-indigo-400 text-indigo-300'
              : 'border-transparent text-slate-400'
          }`}
          onClick={() => setActiveTab('syllabus')}
        >
          📋 Syllabus
        </Button>
        <Button
          variant="ghost"
          className={`h-9 rounded-b-none border-b-2 px-3 ${
            activeTab === 'exercises'
              ? 'border-indigo-400 text-indigo-300'
              : 'border-transparent text-slate-400'
          }`}
          onClick={() => setActiveTab('exercises')}
        >
          💪 Exercises
          {activeExercise && <span className="ml-1 text-[10px] text-emerald-500">●</span>}
        </Button>
      </div>

      {loading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
          <p>Loading...</p>
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
          <p>{error}</p>
          <Button onClick={() => loadFile(activeTab)}>Retry</Button>
        </div>
      ) : activeTab === 'exercises' ? (
        <div className="flex min-h-0 h-full overflow-hidden">
          {exercises.length === 0 ? (
            <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <span className="text-5xl">💪</span>
                <p>No exercises yet.</p>
                <p className="text-sm">
                  Type <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">professor:next</code> in chat to
                  create exercises.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden w-48 shrink-0 border-r border-slate-800 bg-slate-900/40 md:block">
                <div className="p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Exercises
                  </h4>
                  {exercises.map((ex) => (
                    <Button
                      key={ex.filename}
                      variant={selectedExercise === ex.filename ? 'secondary' : 'ghost'}
                      className="mb-1 h-auto w-full justify-start px-2 py-2 text-left text-xs"
                      onClick={() => handleExerciseSelect(ex.filename)}
                    >
                      {ex.filename.replace('.md', '')}
                      {activeExercise === ex.filename && (
                        <span className="ml-1 text-[10px] text-emerald-500">●</span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-3 py-2 md:px-4">
                  <h4 className="text-sm font-medium">{selectedExercise}</h4>
                  <Button
                    size="sm"
                    onClick={handleExerciseSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : '💾 Save'}
                  </Button>
                </div>
                <div className="border-b border-slate-800 bg-slate-900/40 p-2 md:hidden">
                  <select
                    value={selectedExercise || ''}
                    onChange={(e) => handleExerciseSelect(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                  >
                    {exercises.map((ex) => (
                      <option key={ex.filename} value={ex.filename}>
                        {ex.filename.replace('.md', '')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ExerciseEditor
                    value={exerciseContent}
                    onChange={setExerciseContent}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ) : !content ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <span className="text-5xl">✨</span>
            {activeTab === 'lecture' ? (
              <>
                <p>No lecture loaded yet.</p>
                <p className="text-sm">
                  Type <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">professor:next</code> in chat to
                  start your first section.
                </p>
              </>
            ) : (
              <>
                <p>No syllabus found.</p>
                <p className="text-sm">
                  Type <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">professor:new-topic</code> in chat
                  to create a course.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="max-w-none text-sm leading-7 text-slate-200 [&_a]:text-indigo-300 [&_a:hover]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-medium [&_hr]:my-6 [&_hr]:border-slate-700 [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_li]:my-1 [&_ol]:my-3 [&_ol]:pl-6 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-slate-700 [&_pre]:bg-slate-900 [&_pre]:p-4 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-700 [&_td]:p-2 [&_th]:border [&_th]:border-slate-700 [&_th]:bg-slate-800 [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:pl-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={CODE_COMPONENTS}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
