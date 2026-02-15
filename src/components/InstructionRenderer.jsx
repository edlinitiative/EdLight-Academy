import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Renders exam instructions / question text with markdown AND LaTeX math.
 * Supports $inline$ and $$display$$ math via remark-math + rehype-katex.
 */
export default function InstructionRenderer({ text }) {
  if (!text) return null;

  return (
    <div className="instruction-renderer">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({node, ...props}) => <p className="instruction-renderer__p" {...props} />,
          ul: ({node, ...props}) => <ul className="instruction-renderer__ul" {...props} />,
          ol: ({node, ...props}) => <ol className="instruction-renderer__ol" {...props} />,
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
