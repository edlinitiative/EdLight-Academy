import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders exam instructions, potentially with markdown formatting.
 * Handles paragraphs, lists, and emphasis better than plain text/newlines.
 */
export default function InstructionRenderer({ text }) {
  if (!text) return null;

  return (
    <div className="instruction-renderer">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          // Override paragraph to handle double newlines properly
          p: ({node, ...props}) => <p className="instruction-renderer__p" {...props} />,
          // Style lists properly
          ul: ({node, ...props}) => <ul className="instruction-renderer__ul" {...props} />,
          ol: ({node, ...props}) => <ol className="instruction-renderer__ol" {...props} />,
          // Keep headings small inside instructions
          h1: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
          h2: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
          h3: ({node, ...props}) => <strong className="instruction-renderer__heading" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
