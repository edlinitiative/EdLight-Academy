import React, { useMemo } from 'react';
import { buildSchool } from '../../utils/schoolBuilding';

/**
 * A school's pixel building (see utils/schoolBuilding). `cell` is the size of
 * one pixel in CSS px; the SVG keeps crisp edges at any scale.
 */
export default function SchoolBuilding({
  name, floors, night = false, cell = 6, className = '', title,
}: {
  name: string;
  floors?: number;
  night?: boolean;
  cell?: number;
  className?: string;
  /** Accessible name; omit for a decorative building next to a visible label. */
  title?: string;
}) {
  const b = useMemo(() => buildSchool(name, { floors, night }), [name, floors, night]);
  return (
    <svg
      className={`school-building ${className}`}
      viewBox={`0 0 ${b.width} ${b.height}`}
      width={b.width * cell}
      height={b.height * cell}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {b.rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
      ))}
    </svg>
  );
}
