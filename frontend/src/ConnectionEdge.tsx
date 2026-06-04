import React from 'react';
import { getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';
import type { EdgeProps } from 'reactflow';

export const ConnectionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  labelX,
  labelY,
  data,
}: EdgeProps) => {
  const [edgePath, labelX_calc, labelY_calc] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Use provided labelX/labelY or calculated ones
  const lx = labelX !== undefined ? labelX : labelX_calc;
  const ly = labelY !== undefined ? labelY : labelY_calc;

  const strokeColor = style.stroke || '#94a3b8';
  const isDimmed = style.opacity === 0.15;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${lx}px,${ly}px)`,
              background: '#ffffff',
              padding: '5px 8px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              color: strokeColor,
              border: `1.5px solid ${strokeColor}`,
              pointerEvents: 'all',
              zIndex: 1000,
              opacity: isDimmed ? 0.15 : 0.97,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'opacity 0.3s ease',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
