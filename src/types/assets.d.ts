// Ambient module declarations for non-code assets imported by the bundler
// (webpack). These are side-effect / URL imports that TypeScript cannot resolve
// on its own; declaring them here silences TS2882 without affecting runtime.

// Stylesheets (side-effect imports, e.g. `import './Foo.css'`)
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';

// Stylesheets imported for their URL (rare, but safe to type as string)
declare module '*.css?url' {
  const url: string;
  export default url;
}

// Images and fonts imported as URLs
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.avif' {
  const src: string;
  export default src;
}
declare module '*.ico' {
  const src: string;
  export default src;
}
declare module '*.bmp' {
  const src: string;
  export default src;
}
declare module '*.woff' {
  const src: string;
  export default src;
}
declare module '*.woff2' {
  const src: string;
  export default src;
}
declare module '*.ttf' {
  const src: string;
  export default src;
}
declare module '*.eot' {
  const src: string;
  export default src;
}
declare module '*.otf' {
  const src: string;
  export default src;
}

// SVG: importable both as a URL (default) and, with some loaders, as a React
// component. Declaring both keeps either usage type-safe.
declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}
