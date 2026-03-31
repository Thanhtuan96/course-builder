/**
 * Header.jsx - Course selector dropdown + progress indicator
 */

import { useState, useEffect } from 'react';
import { fetchCourses } from '../api/client.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';

/**
 * Header component with course selector and progress indicator
 * @param {Object} props
 * @param {Object|null} props.selectedCourse - Currently selected course
 * @param {Function} props.onCourseSelect - Callback when course is selected
 */
export default function Header({ selectedCourse, onCourseSelect }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCourses();
      setCourses(data || []);
    } catch (err) {
      console.error('Failed to load courses:', err);
      setError('Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }

  function handleCourseChange(value) {
    const slug = value === '__none__' ? '' : value;
    const course = slug ? courses.find((c) => c.slug === slug) : null;
    onCourseSelect?.(course);
  }

  // Format last active timestamp
  function formatLastActive(timestamp) {
    if (!timestamp || timestamp === 'Unknown') return '';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  }

  if (loading) {
    return (
      <header className="flex shrink-0 items-center border-b border-slate-800 bg-slate-900 px-4 py-3 md:px-5">
        <div className="text-sm text-slate-400">Loading courses...</div>
      </header>
    );
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-3 md:px-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">📚</span>
        <span className="text-lg font-semibold">Professor</span>
      </div>

      <div className="w-full md:w-auto">
        <Select
          value={selectedCourse?.slug || '__none__'}
          onValueChange={handleCourseChange}
          disabled={loading}
        >
          <SelectTrigger className="h-9 w-full min-w-[180px] md:w-[220px]">
            <SelectValue placeholder="Select course..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select course...</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.slug} value={course.slug}>
                {course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCourse && (
        <div className="ml-0 flex w-full items-center gap-3 text-sm md:ml-auto md:w-auto">
          <span className="font-medium text-slate-100">{selectedCourse.name}</span>
          {selectedCourse.lastActive && (
            <span className="text-xs text-slate-400">
              {formatLastActive(selectedCourse.lastActive)}
            </span>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}
    </header>
  );
}
