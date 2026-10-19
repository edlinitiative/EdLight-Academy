import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { buildSchool, paintLayers } from '../../../../../shared/arena/schoolBuilding';

/**
 * A school's pixel building on the phone — the same drawing as the web's
 * src/components/arena/SchoolBuilding (shared/arena/schoolBuilding generates
 * it from the name). `cell` is one pixel in points.
 *
 * Drawn as one path per paint layer (paintLayers), not one node per rect:
 * a building is ~60 rects but only a handful of native SVG nodes.
 * Decorative unless `title` is given.
 */
function SchoolBuilding({
  name, floors, night = false, cell = 4, title,
}: {
  name: string;
  floors?: number;
  night?: boolean;
  cell?: number;
  title?: string;
}) {
  const { b, layers } = useMemo(() => {
    const built = buildSchool(name, { floors, night });
    return { b: built, layers: paintLayers(built.rects) };
  }, [name, floors, night]);
  return (
    <Svg
      width={b.width * cell}
      height={b.height * cell}
      viewBox={`0 0 ${b.width} ${b.height}`}
      accessible={!!title}
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
    >
      {layers.map((l, i) => <Path key={i} d={l.d} fill={l.c} />)}
    </Svg>
  );
}

export default React.memo(SchoolBuilding);
