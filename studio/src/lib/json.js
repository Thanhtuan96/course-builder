/**
 * Pulls the first JSON value out of an LLM response. Models (especially small local ones)
 * often wrap JSON in prose or ```json fences, so we tolerate both.
 */
export function extractJson(text) {
  if (!text) throw new Error('Empty response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);

  for (const c of candidates) {
    const start = c.search(/[[{]/);
    if (start === -1) continue;
    const open = c[start];
    const close = open === '{' ? '}' : ']';
    const end = c.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  throw new Error('Could not find valid JSON in the model response');
}
