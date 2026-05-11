import React from 'react';

// Minimal dependency-free sparkline. Takes an array of numbers and renders
// an inline SVG polyline scaled to fit the given width/height.
//   - `values`: array of numbers (most recent at the end)
//   - `width`/`height`: pixel dimensions of the SVG
//   - `stroke`: stroke color (default: muted grey)
//   - `fill`: optional area fill below the line
//   - `min`/`max`: optional explicit Y range; otherwise auto-fit
const Sparkline = ({
  values,
  width = 240,
  height = 60,
  stroke = '#787878',
  fill = 'rgba(120,120,120,0.08)',
  min: minOverride,
  max: maxOverride
}) => {
  if (!values || values.length === 0) {
    return <svg width={width} height={height} />;
  }
  // If there's just one value, render a flat line in the middle
  if (values.length === 1) {
    const y = height / 2;
    return (
      <svg width={width} height={height}>
        <line x1={0} x2={width} y1={y} y2={y} stroke={stroke} strokeWidth={1.5} />
      </svg>
    );
  }

  const min = typeof minOverride === 'number' ? minOverride : Math.min(...values);
  const max = typeof maxOverride === 'number' ? maxOverride : Math.max(...values);
  // Avoid a divide-by-zero when all samples are identical
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  // 4px top/bottom padding so the line doesn't kiss the edges
  const pad = 4;
  const usableH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Polygon (filled area) wraps to bottom-right then bottom-left to close the path
  const area = `${points.join(' ')} ${width},${height} 0,${height}`;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {fill && <polygon points={area} fill={fill} />}
      <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
};

export default Sparkline;
