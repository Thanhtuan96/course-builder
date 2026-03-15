/**
 * Header.jsx - Course selector dropdown + progress indicator
 */

import { useState, useEffect } from 'react';
import { fetchCourses } from '../api/client.js';
import './Header.css';

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

  function handleCourseChange(e) {
    const slug = e.target.value;
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
      <header className="header">
        <div className="header-loading">Loading courses...</div>
      </header>
    );
  }

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">📚</span>
        <span className="header-title">Professor</span>
      </div>

      <div className="header-course-selector">
        <select
          value={selectedCourse?.slug || ''}
          onChange={handleCourseChange}
          disabled={loading}
          className="course-select"
        >
          <option value="">Select course...</option>
          {courses.map((course) => (
            <option key={course.slug} value={course.slug}>
              {course.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCourse && (
        <div className="header-progress">
          <span className="course-name">{selectedCourse.name}</span>
          {selectedCourse.lastActive && (
            <span className="last-active">
              {formatLastActive(selectedCourse.lastActive)}
            </span>
          )}
        </div>
      )}

      {error && <div className="header-error">{error}</div>}
    </header>
  );
}
