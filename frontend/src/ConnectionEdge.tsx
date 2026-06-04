import { getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';
import type { EdgeProps } from 'reactflow';

export const ConnectionEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}: EdgeProps) => {
  const [edgePath, labelX_calc, labelY_calc] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

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
              transform: `translate(-50%, -50%) translate(${labelX_calc}px,${labelY_calc}px)`,
              background: '#ffffff',
              padding: '0px 6px',
              borderRadius: '6px',
              fontSize: '12px',
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
