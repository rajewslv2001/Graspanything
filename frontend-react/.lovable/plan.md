

## Rebuild Bonsai SVG to Match Reference Image

### Analysis of Reference Image

The reference bonsai has a very specific structure that differs from the current SVG:

**Trunk**: S-curved shape - starts at base center, curves slightly left in the middle, then curves right toward the top. It's thicker at the base (3-4px wide) and tapers to 1-2px at the top. Dark brown, almost black.

**Three distinct blossom clusters**:
1. **Top-right (largest)**: Wide canopy at the top, extending right. This is the main crown.
2. **Mid-right**: A medium cluster branching right from the middle of the trunk.
3. **Bottom-left**: A small cluster on a branch extending left, near the lower trunk area.

**Pot**: Wide, flat, rectangular. Dark navy blue with lighter blue highlights. Has visible sand/gravel at the top (beige). Two small vertical light-blue accent lines on the front face.

### Plan

**Single file change: `src/components/BonsaiSvg.tsx`**

Completely rewrite all the `Rect[]` arrays to match the reference image's structure on the 40x40 grid:

1. **Trunk** - Redraw as an S-curve: thick base at ~y:28 center, curving left through y:20-24, then right up to y:8-10. Use 3 shades (dark, mid, light highlight).

2. **Blossom clusters** - Three separate groups matching reference:
   - Top cluster: ~y:2-10, biased right (x:16-30)
   - Mid-right cluster: ~y:12-18, extending right from trunk (x:22-32)
   - Bottom-left cluster: ~y:18-24, small, extending left (x:4-14)

3. **Pot** - Wider and flatter than current, matching the reference's proportions. Keep the same color tokens.

4. **Sand** - Thin strip at pot top with shadow detail.

No changes to colors/tokens in `index.css` - the existing palette already matches the reference (pink blossoms, brown bark, blue pot).

