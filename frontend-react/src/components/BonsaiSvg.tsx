type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

// Shadow under pot
const shadow: Rect[] = [{ x: 8, y: 37, w: 24, h: 1 }];

// Pot - wide flat rectangle
const potDark: Rect[] = [
  { x: 10, y: 31, w: 20, h: 5 },
  { x: 12, y: 36, w: 16, h: 1 },
];

const pot: Rect[] = [
  { x: 11, y: 31, w: 18, h: 1 },
  { x: 11, y: 32, w: 18, h: 3 },
  { x: 13, y: 35, w: 14, h: 1 },
];

const potLight: Rect[] = [
  { x: 13, y: 32, w: 1, h: 3 },
  { x: 26, y: 32, w: 1, h: 3 },
];

// Sand strip at pot top
const sand: Rect[] = [{ x: 12, y: 30, w: 16, h: 2 }];

const sandShadow: Rect[] = [
  { x: 14, y: 31, w: 12, h: 1 },
];

// S-curved trunk: base center, curves left mid, then right to top
const barkDark: Rect[] = [
  // Base (thick, center)
  { x: 18, y: 27, w: 4, h: 3 },
  // Lower trunk curving left
  { x: 17, y: 24, w: 4, h: 3 },
  { x: 16, y: 21, w: 3, h: 3 },
  // Mid trunk
  { x: 15, y: 18, w: 3, h: 3 },
  // Upper trunk curving right
  { x: 16, y: 15, w: 3, h: 3 },
  { x: 17, y: 12, w: 3, h: 3 },
  { x: 19, y: 9, w: 2, h: 3 },
  // Left branch (from mid trunk, going left)
  { x: 12, y: 19, w: 4, h: 2 },
  { x: 9, y: 18, w: 4, h: 2 },
  { x: 7, y: 17, w: 3, h: 2 },
  // Right branch (from mid-upper trunk)
  { x: 20, y: 14, w: 4, h: 2 },
  { x: 23, y: 13, w: 3, h: 2 },
  { x: 25, y: 12, w: 3, h: 2 },
];

const bark: Rect[] = [
  { x: 19, y: 27, w: 2, h: 3 },
  { x: 18, y: 24, w: 2, h: 3 },
  { x: 17, y: 21, w: 2, h: 3 },
  { x: 16, y: 18, w: 2, h: 3 },
  { x: 17, y: 15, w: 2, h: 3 },
  { x: 18, y: 12, w: 2, h: 3 },
  { x: 20, y: 10, w: 1, h: 2 },
  // Left branch highlight
  { x: 10, y: 19, w: 2, h: 1 },
  { x: 13, y: 20, w: 2, h: 1 },
  // Right branch highlight
  { x: 21, y: 14, w: 2, h: 1 },
  { x: 24, y: 13, w: 2, h: 1 },
];

const barkLight: Rect[] = [
  { x: 20, y: 28, w: 1, h: 2 },
  { x: 19, y: 25, w: 1, h: 2 },
  { x: 18, y: 22, w: 1, h: 1 },
  { x: 17, y: 19, w: 1, h: 1 },
];

// Top-right canopy (largest) ~y:2-10, x:14-30
const blossomTop: Rect[] = [
  { x: 17, y: 3, w: 10, h: 2 },
  { x: 15, y: 5, w: 14, h: 2 },
  { x: 14, y: 7, w: 15, h: 2 },
  { x: 16, y: 9, w: 12, h: 2 },
  { x: 18, y: 11, w: 6, h: 1 },
  { x: 27, y: 4, w: 3, h: 2 },
  { x: 13, y: 6, w: 3, h: 2 },
];

// Mid-right cluster ~y:11-17, x:23-33
const blossomMidRight: Rect[] = [
  { x: 25, y: 10, w: 7, h: 2 },
  { x: 24, y: 12, w: 9, h: 2 },
  { x: 26, y: 14, w: 7, h: 2 },
  { x: 28, y: 16, w: 4, h: 1 },
];

// Bottom-left cluster ~y:15-21, x:3-13
const blossomBottomLeft: Rect[] = [
  { x: 5, y: 15, w: 6, h: 2 },
  { x: 4, y: 17, w: 8, h: 2 },
  { x: 6, y: 19, w: 5, h: 1 },
  { x: 3, y: 16, w: 3, h: 2 },
];

const blossomBase: Rect[] = [
  ...blossomTop,
  ...blossomMidRight,
  ...blossomBottomLeft,
];

// Light highlights on blossoms
const blossomLight: Rect[] = [
  // Top cluster
  { x: 18, y: 3, w: 4, h: 1 },
  { x: 16, y: 5, w: 3, h: 1 },
  { x: 22, y: 5, w: 3, h: 1 },
  { x: 15, y: 7, w: 2, h: 1 },
  { x: 24, y: 7, w: 3, h: 1 },
  // Mid-right
  { x: 26, y: 10, w: 3, h: 1 },
  { x: 25, y: 12, w: 2, h: 1 },
  { x: 30, y: 13, w: 2, h: 1 },
  // Bottom-left
  { x: 6, y: 15, w: 2, h: 1 },
  { x: 5, y: 17, w: 2, h: 1 },
];

// Shadow detail on blossoms
const blossomShadow: Rect[] = [
  // Top cluster
  { x: 24, y: 4, w: 3, h: 1 },
  { x: 17, y: 6, w: 2, h: 1 },
  { x: 26, y: 8, w: 3, h: 1 },
  { x: 16, y: 9, w: 3, h: 1 },
  // Mid-right
  { x: 28, y: 11, w: 2, h: 1 },
  { x: 26, y: 14, w: 2, h: 1 },
  // Bottom-left
  { x: 4, y: 18, w: 2, h: 1 },
  { x: 8, y: 17, w: 2, h: 1 },
];

const renderRects = (rects: Rect[], fill: string, prefix: string) =>
  rects.map(({ x, y, w, h }, index) => (
    <rect key={`${prefix}-${index}`} x={x} y={y} width={w} height={h} fill={fill} />
  ));

const BonsaiSvg = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="inline-block shrink-0"
    style={{ imageRendering: "pixelated" }}
    shapeRendering="crispEdges"
    role="img"
    aria-label="Pixel art bonsai tree"
  >
    {renderRects(shadow, "hsl(var(--foreground) / 0.12)", "shadow")}
    {renderRects(potDark, "hsl(var(--bonsai-pot-dark))", "pot-dark")}
    {renderRects(pot, "hsl(var(--bonsai-pot))", "pot")}
    {renderRects(potLight, "hsl(var(--bonsai-pot-light))", "pot-light")}
    {renderRects(sand, "hsl(var(--bonsai-sand))", "sand")}
    {renderRects(sandShadow, "hsl(var(--bonsai-sand-shadow))", "sand-shadow")}
    {renderRects(barkDark, "hsl(var(--bonsai-bark-dark))", "bark-dark")}
    {renderRects(bark, "hsl(var(--bonsai-bark))", "bark")}
    {renderRects(barkLight, "hsl(var(--bonsai-bark-light))", "bark-light")}
    {renderRects(blossomShadow, "hsl(var(--bonsai-blossom-shadow))", "blossom-shadow")}
    {renderRects(blossomBase, "hsl(var(--bonsai-blossom))", "blossom-base")}
    {renderRects(blossomLight, "hsl(var(--bonsai-blossom-light))", "blossom-light")}
  </svg>
);

export default BonsaiSvg;
