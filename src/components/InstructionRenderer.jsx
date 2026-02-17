import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Renders exam instructions / question text with markdown AND LaTeX math.
 * Supports $inline$ and $$display$$ math via remark-math + rehype-katex.
 *
 * Pass `inline` prop to render as a <span> (for use inside sentences).
 */
export default function InstructionRenderer({ text, inline }) {
  if (!text) return null;

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
