import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Deduplicate consecutive identical lines in text.
 * Handles "Soyez clairs, montrez les étapes…" repeated twice, etc.
 */
function deduplicateLines(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevTrimmed = i > 0 ? lines[i - 1].trim() : null;
    // Skip if this line is identical to the previous non-empty line
    if (trimmed && trimmed === prevTrimmed) continue;
    result.push(lines[i]);
  }
  return result.join('\n');
}

/**
 * Insert line breaks before sub-part markers like a), b), c), 1), 2), etc.
 * so they render on separate lines in Markdown.
 * Only applies when the markers appear mid-line (not already at line start).
 */
function formatSubParts(text) {
  if (!text) return text;
  // Match sub-part patterns: a) b) c) ... or a. b. c. ... or 1) 2) 3) ...
  // Only insert a newline when the marker is preceded by non-whitespace
  // (i.e., it's embedded in a run of text, not already on its own line).
  // Use a lookbehind for a non-newline character before the marker.
  return text.replace(/([^\n])\s+(?=(?:[a-z]|[0-9]{1,2})\)\s)/gi, '$1\n\n');
}

/**
 * Renders exam instructions / question text with markdown AND LaTeX math.
 * Supports $inline$ and $$display$$ math via remark-math + rehype-katex.
 *
 * Pass `inline` prop to render as a <span> (for use inside sentences).
 */
export default function InstructionRenderer({ text, inline }) {
  if (!text) return null;

  // Pre-process the text before rendering
  let processed = text;

  // 1. Deduplicate consecutive identical lines (e.g., repeated instructions)
  processed = deduplicateLines(processed);

  // 2. Format sub-part markers (a), b), c), etc.) onto their own lines
  processed = formatSubParts(processed);

  const Wrapper = inline ? 'span' : 'div';

  return (
    <Wrapper className="instruction-renderer">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // When inline, render <p> as <span> to avoid block-level nesting issues
          p: ({node, ...props}) => inline
            ? <span className="instruction-renderer__p" {...props} />
            : <p className="instruction-renderer__p" {...props} />,
          ul: ({node, ...props}) => <ul className="instruction-renderer__ul" {...props} />,
          ol: ({node, ...props}) => <ol className="instruction-renderer__ol" {...props} />,
          h1: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
          h2: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
          h3: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </Wrapper>
  );
}
