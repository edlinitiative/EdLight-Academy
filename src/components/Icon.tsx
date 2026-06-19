import React from 'react';
import {
  Circle,
  CheckSquare,
  CheckCircle,
  Pencil,
  Calculator,
  PenLine,
  FileText,
  Link,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Curated registry of the Lucide icons referenced by the dynamic
 * <Icon name="..." /> component (the values produced by QUESTION_TYPE_META).
 *
 * Using explicit named imports instead of `import * as LucideIcons` keeps the
 * bundle tree-shakeable: only these icons ship instead of the full ~1,600-icon
 * set (which was adding ~600 KiB to the exam-results/verification route chunk).
 * If you start passing a new `name`, add the matching import + registry entry.
 */
const ICON_REGISTRY: Record<string, LucideIcon> = {
  Circle,
  CheckSquare,
  CheckCircle,
  Pencil,
  Calculator,
  PenLine,
  FileText,
  Link,
  HelpCircle,
};

type Props = {
  name: keyof typeof ICON_REGISTRY | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  color?: string;
  label?: string;
};

/**
 * Inline Lucide icon used to replace decorative emojis throughout the UI.
 * `name` should match a key in ICON_REGISTRY (e.g. "FileText", "Calculator").
 * If the name is unknown we render nothing rather than crashing.
 */
export default function Icon({ name, size = 18, className = '', strokeWidth = 2, color, label }: Props) {
  const Comp = ICON_REGISTRY[name as string];
  if (!Comp) return null;
  return (
    <Comp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={`lucide-inline ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
