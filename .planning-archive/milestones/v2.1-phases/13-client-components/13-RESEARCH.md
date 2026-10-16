# Phase 13: Client Components - Research

**Researched:** 2026-03-12
**Domain:** React client with split-pane layout, markdown rendering, streaming chat
**Confidence:** HIGH

## Summary

Phase 13 implements the React frontend for the Course Learning Plugin's web UI. Key components include: split-pane layout (40/60), markdown rendering with react-markdown and syntax highlighting via react-syntax-highlighter (Prism), streaming chat via Server-Sent Events (SSE), WebSocket for real-time lecture updates, and DOMPurify for XSS prevention. The project uses Vite as the build tool with React.

**Primary recommendation:** Use Vite + React with react-markdown v10, react-syntax-highlighter with Prism, native EventSource for SSE, native WebSocket with exponential backoff reconnection, and DOMPurify for markdown sanitization.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fixed 40/60 split (lecture left ~40%, chat right ~60%)
- Lecture panel minimum width 300px, chat panel flexible
- Visual divider between panels (non-draggable, subtle gray line)
- Mobile (< 768px): Tab switcher to toggle between lecture and chat views
- Dark mode theme (light mode not in scope for v2.0)
- Blue accent color for buttons and highlights
- System fonts (no web font downloads)
- Comfortable spacing (good for long learning sessions)
- react-markdown library for rendering lecture content
- Prism for syntax highlighting in code blocks
- Full GitHub Flavored Markdown support (tables, strikethrough, task lists)
- Command pills located above chat input field (like Slack)
- Horizontal row layout, wraps if needed
- Clicking a pill inserts the command text into chat input
- Course selector dropdown in top-left of header
- Shows course name + last active timestamp as progress indicator

### Claude's Discretion
- Exact color hex values for dark theme
- Loading skeleton designs
- Error state handling
- WebSocket reconnection logic

### Deferred Ideas (OUT OF SCOPE)
- Light mode support — future enhancement
- Mobile-responsive full layout — tab switcher is basic
- User preference persistence (dark/light, font size)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WEB-09 | React client displays split-pane layout (lecture panel left, chat panel right) | Use CSS flexbox with fixed 40/60 ratio |
| WEB-10 | LecturePanel renders LECTURE.md with markdown (marked) and syntax highlighting | react-markdown v10 + react-syntax-highlighter (Prism) |
| WEB-11 | LecturePanel auto-refreshes when WebSocket receives lecture-updated event | Native WebSocket with event listener for 'lecture-update' |
| WEB-12 | ChatPanel streams Claude responses character-by-character via SSE | Native EventSource API for /api/chat endpoint |
| WEB-13 | ChatPanel displays context-aware command pills that change based on learning phase | State-based pill rendering tied to course phase |
| WEB-14 | Command pills: idle phase shows `professor:new-topic`, lecture shows `professor:hint/review/quiz`, exercise shows `professor:hint/stuck/review`, review shows `professor:done/hint` | Conditional rendering based on COURSE.md phase |
| WEB-15 | Course selector dropdown in top bar to switch between courses | Dropdown component with /api/courses endpoint |
| WEB-16 | Progress indicator shows current course name and last active timestamp | Header displays course name + timestamp |
| WEB-22 | All markdown rendered in browser is sanitized with DOMPurify to prevent XSS | DOMPurify sanitize on markdown content |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Industry standard, used by millions |
| Vite | 7.x | Build tool | Fast HMR, optimized production builds |
| react-markdown | 10.x | Markdown rendering | Secure by default, extensible via plugins |
| remark-gfm | 4.x | GitHub Flavored Markdown | Tables, strikethrough, task lists support |
| react-syntax-highlighter | 16.x | Syntax highlighting | Works with react-markdown via components prop |
| DOMPurify | 3.x | XSS sanitization | Industry standard for HTML sanitization |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ws | 8.x | WebSocket server | Server-side (Phase 14) |
| express | 4.x | HTTP server | Already exists (Phase 9) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-markdown | marked + custom renderer | More work, less secure by default |
| react-syntax-highlighter (Prism) | highlight.js | Prism better for JSX, lighter |
| DOMPurify | sanitize-html | DOMPurify is DOM-only, faster for browser |

**Installation:**
```bash
npm install react@19 react-dom@19
npm install -D vite @vitejs/plugin-react
npm install react-markdown remark-gfm react-syntax-highlighter dompurify
```

---

## Architecture Patterns

### Recommended Project Structure
```
client/
├── index.html              # Entry point
├── vite.config.js         # Vite configuration
├── package.json
├── src/
│   ├── main.jsx           # React entry
│   ├── App.jsx            # Main app component
│   ├── index.css          # Global styles (dark theme)
│   ├── components/
│   │   ├── Header.jsx     # Course selector + progress
│   │   ├── SplitPane.jsx  # 40/60 split layout
│   │   ├── LecturePanel.jsx   # Markdown display
│   │   ├── ChatPanel.jsx      # Streaming chat
│   │   ├── CommandPills.jsx   # Context-aware pills
│   │   └── MobileTabSwitcher.jsx # Mobile view toggle
│   ├── hooks/
│   │   ├── useWebSocket.js    # WebSocket with reconnection
│   │   └── useSSE.js          # SSE streaming
│   ├── utils/
│   │   └── markdown.js    # DOMPurify wrapper
│   └── api/
│       └── client.js      # API fetch helpers
```

### Pattern 1: Split-Pane Layout (40/60)
**What:** Fixed ratio split with minimum width constraints
**When to use:** When you need stable panel proportions
**Example:**
```css
/* Source: CSS flexbox */
.split-pane {
  display: flex;
  height: 100vh;
}

.lecture-panel {
  width: 40%;
  min-width: 300px;
  border-right: 1px solid #333;
}

.chat-panel {
  flex: 1;
  min-width: 0;
}
```

### Pattern 2: Markdown with Syntax Highlighting
**What:** Using react-markdown with custom code component
**When to use:** Rendering course lecture content
**Example:**
```jsx
// Source: react-markdown documentation
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';

<Markdown
  remarkPlugins={[remarkGfm]}
  components={{
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          {...props}
          children={String(children).replace(/\n$/, '')}
          language={match[1]}
          style={dark}
          PreTag="div"
        />
      ) : (
        <code {...props} className={className}>
          {children}
        </code>
      );
    }
  }}
>
  {content}
</Markdown>
```

### Pattern 3: SSE Streaming
**What:** Using EventSource for server-sent events
**When to use:** Streaming Claude responses character-by-character
**Example:**
```javascript
// Source: MDN EventSource documentation
const eventSource = new EventSource('/api/chat?message=' + encodeURIComponent(message));

eventSource.onmessage = (event) => {
  // Append each chunk to response
  setResponse(prev => prev + event.data);
};

eventSource.onerror = (err) => {
  console.error('SSE error:', err);
  eventSource.close();
};
```

### Pattern 4: WebSocket with Reconnection
**What:** Persistent connection with automatic reconnection
**When to use:** Real-time lecture updates
**Example:**
```javascript
// Source: WebSocket API with exponential backoff
function createWebSocket(url) {
  let ws;
  let reconnectAttempts = 0;
  const maxAttempts = 10;
  
  function connect() {
    ws = new WebSocket(url);
    
    ws.onclose = () => {
      if (reconnectAttempts < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        setTimeout(connect, delay);
        reconnectAttempts++;
      }
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'lecture-update') {
        onLectureUpdate();
      }
    };
  }
  
  connect();
  return ws;
}
```

### Pattern 5: Command Pills Based on Phase
**What:** Context-aware UI that changes based on learning phase
**When to Use:** Displaying relevant actions based on current course state
**Example:**
```javascript
// Source: Phase requirements
const COMMANDS_BY_PHASE = {
  idle: ['professor:new-topic'],
  lecture: ['professor:hint', 'professor:review', 'professor:quiz'],
  exercise: ['professor:hint', 'professor:stuck', 'professor:review'],
  review: ['professor:done', 'professor:hint'],
};

function CommandPills({ phase }) {
  return (
    <div className="command-pills">
      {COMMANDS_BY_PHASE[phase].map(cmd => (
        <button key={cmd} onClick={() => insertCommand(cmd)}>
          {cmd}
        </button>
      ))}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Using dangerouslySetInnerHTML with unsanitized content:** Always sanitize markdown with DOMPurify first
- **Not handling SSE/WebSocket connection loss:** Always implement reconnection logic
- **Hardcoding colors instead of using CSS variables:** Makes theme changes harder
- **Not using memo for expensive renders:** Markdown rendering can be costly

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Custom parser | react-markdown | Secure by default, GFM support, extensible |
| Syntax highlighting | Prism from scratch | react-syntax-highlighter | Ready React component, multiple themes |
| XSS sanitization | Regex-based sanitizer | DOMPurify | Industry standard, actively maintained |
| SSE handling | Custom EventSource wrapper | Native EventSource | Browser-native, well-supported |
| WebSocket reconnection | Manual retry logic | Exponential backoff pattern | Prevents server overload |

**Key insight:** react-markdown is already secure by default (no dangerouslySetInnerHTML), but since user content comes from external markdown files, DOMPurify adds defense-in-depth.

---

## Common Pitfalls

### Pitfall 1: SSE Connection Limits
**What goes wrong:** Browser limits SSE connections to ~6 per domain
**Why it happens:** Browser per-domain connection limit (especially in HTTP/1.1)
**How to avoid:** Use HTTP/2 on server, or multiplex over single connection
**Warning signs:** "EventSource failed" errors, connections not establishing

### Pitfall 2: WebSocket Reconnection Storms
**What goes wrong:** Multiple rapid reconnection attempts overwhelm server
**Why it happens:** No backoff between retry attempts
**How to avoid:** Implement exponential backoff (delay * 2^n, max 30s)
**Warning signs:** Server sees connection flood after network blip

### Pitfall 3: Markdown XSS via Code Blocks
**What goes wrong:** Malicious markdown with embedded scripts in code blocks
**Why it happens:** Trusting markdown content without sanitization
**How to avoid:** Use DOMPurify even with react-markdown (defense in depth)
**Warning signs:** Unexpected script execution in lecture view

### Pitfall 4: Memory Leaks in SSE/WebSocket
**What goes wrong:** Connections not closed on component unmount
**Why it happens:** Missing cleanup in useEffect
**How to avoid:** Always close connections in cleanup function
**Warning signs:** Multiple connections accumulate, performance degrades

---

## Code Examples

Verified patterns from official sources:

### Markdown with GFM and Syntax Highlighting
```jsx
// Source: react-markdown npm page + react-syntax-highlighter docs
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function LecturePanel({ content }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({node, inline, className, children, ...props}) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter
              {...props}
              PreTag="div"
              children={String(children).replace(/\n$/, '')}
              language={match[1]}
              style={dark}
            />
          ) : (
            <code {...props} className={className}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </Markdown>
  );
}
```

### SSE Streaming Hook
```javascript
// Source: MDN EventSource documentation
import { useState, useEffect, useRef } from 'react';

function useSSE(url, message) {
  const [data, setData] = useState('');
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!message) return;
    
    const encodedMessage = encodeURIComponent(message);
    eventSourceRef.current = new EventSource(`${url}?message=${encodedMessage}`);
    
    eventSourceRef.current.onmessage = (event) => {
      setData(prev => prev + event.data);
    };
    
    eventSourceRef.current.onerror = (err) => {
      setError(err);
      eventSourceRef.current?.close();
    };

    return () => {
      eventSourceRef.current?.close();
    };
  }, [url, message]);

  return { data, error };
}
```

### DOMPurify Sanitization
```javascript
// Source: DOMPurify npm page
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(dirty, {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 
                 'code', 'pre', 'blockquote', 'table', 'tr', 'td', 'th'],
  ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'title']
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| marked library | react-markdown | 2020+ | Secure VDOM rendering, plugin ecosystem |
| highlight.js | react-syntax-highlighter (Prism) | 2020+ | Better JSX support, lighter bundle |
| Custom sanitizers | DOMPurify | 2014+ | Industry standard XSS prevention |
| Polling | SSE | 2006+ | Real-time with less overhead |
| Long polling | WebSocket | 2011+ | True bidirectional real-time |

**Deprecated/outdated:**
- `marked` + `highlight.js`: Replaced by unified ecosystem (remark/rehype)
- `dangerouslySetInnerHTML`: Avoid unless absolutely necessary
- Polling for real-time: Use SSE or WebSocket instead

---

## Open Questions

1. **CSS-in-JS vs CSS Modules**
   - What we know: Project has minimal styling needs (dark theme, system fonts)
   - What's unclear: Whether to use CSS modules, styled-components, or plain CSS
   - Recommendation: Plain CSS with CSS variables for theming (simplest, matches project conventions)

2. **Exact dark theme colors**
   - What we know: Blue accent, dark background, comfortable spacing
   - What's unclear: Exact hex values for backgrounds, text, borders
   - Recommendation: Use Claude's discretion to pick #1a1a2e background, #16213e panel, #0f3460 accent

3. **Loading skeleton designs**
   - What we know: Need to show loading state while content fetches
   - What's unclear: Specific skeleton animation patterns
   - Recommendation: Simple pulse animation with same dimensions as content

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | client/vitest.config.js |
| Quick run command | `npm run test` in client/ |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEB-09 | Split-pane layout renders | unit | `vitest run LecturePanel` | ❌ Wave 0 |
| WEB-10 | Markdown renders with syntax highlighting | unit | `vitest run markdown` | ❌ Wave 0 |
| WEB-11 | WebSocket triggers refresh | integration | `vitest run WebSocket` | ❌ Wave 0 |
| WEB-12 | SSE streams response | integration | `vitest run SSE` | ❌ Wave 0 |
| WEB-13 | Command pills show based on phase | unit | `vitest run CommandPills` | ❌ Wave 0 |
| WEB-14 | Correct commands per phase | unit | `vitest run commands` | ❌ Wave 0 |
| WEB-15 | Course selector fetches courses | integration | `vitest run selector` | ❌ Wave 0 |
| WEB-16 | Progress indicator displays | unit | `vitest run Header` | ❌ Wave 0 |
| WEB-22 | Markdown is sanitized | unit | `vitest run sanitization` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test` (unit tests only)
- **Per wave merge:** `npm run test:coverage` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `client/vitest.config.js` — test configuration
- [ ] `client/tests/LecturePanel.test.jsx` — covers WEB-09, WEB-10
- [ ] `client/tests/ChatPanel.test.jsx` — covers WEB-12, WEB-13
- [ ] `client/tests/CommandPills.test.jsx` — covers WEB-13, WEB-14
- [ ] `client/tests/Header.test.jsx` — covers WEB-15, WEB-16
- [ ] `client/tests/SplitPane.test.jsx` — covers WEB-09
- [ ] `client/tests/hooks/useWebSocket.test.js` — covers WEB-11
- [ ] `client/tests/sanitization.test.js` — covers WEB-22
- [ ] Framework install: `npm install` in client/ — if none detected

---

## Sources

### Primary (HIGH confidence)
- react-markdown npm page - v10 documentation, components API, security features
- DOMPurify npm page - v3.3 documentation, sanitize API, XSS prevention
- react-syntax-highlighter npm page - v16 documentation, Prism integration
- MDN EventSource documentation - SSE client-side usage
- Vite getting started guide - project scaffolding

### Secondary (MEDIUM confidence)
- Prism.js website - syntax highlighting with Prism
- react-markdown GitHub - example with remark-gfm

### Tertiary (LOW confidence)
- Various React patterns - general React best practices

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified with current versions on npm
- Architecture: HIGH - Patterns based on official documentation
- Pitfalls: MEDIUM - Known browser limitations (SSE connection limits)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (30 days for stable stack)
