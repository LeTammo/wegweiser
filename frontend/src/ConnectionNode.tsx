import React from 'react';
import { Handle, Position } from 'reactflow';

interface ConnectionNodeData {
  id: string;
  trainNumber: string;
  type: string;
  fromStation: string;
  toStation: string;
  departureTime: string;
  arrivalTime: string;
  isHighlightedFastest: boolean;
  isHighlightedSafest: boolean;
  isDimmed: boolean;
  showTrainNumbers: boolean;
}

const formatTime = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
};

const getTrainBadgeClass = (type: string): string => {
  switch (type.toUpperCase()) {
    case 'ICE':            return 'bg-zinc-900 text-white';
    case 'IC': case 'EC':  return 'bg-slate-600 text-white';
    case 'RE':             return 'bg-stone-500 text-white';
    case 'RB':             return 'bg-stone-300 text-stone-800';
    case 'S':              return 'bg-emerald-600 text-white';
    case 'BUS':            return 'bg-violet-600 text-white';
    case 'TRAM':           return 'bg-red-500 text-white';
    default:               return 'bg-blue-600 text-white';
  }
};

export const ConnectionNode: React.FC<{ data: ConnectionNodeData }> = ({ data }) => {
  const {
    trainNumber, type,
    fromStation, toStation,
    departureTime, arrivalTime,
    isHighlightedFastest, isHighlightedSafest,
    isDimmed, showTrainNumbers,
  } = data;

  const ringClass =
    isHighlightedFastest || isHighlightedSafest ? 'ring-2 ring-sky-400 border-sky-400' : 'border-slate-400';

  return (
    <div
      className={`w-full bg-white border rounded-lg flex flex-col items-center px-3 py-1.5 shadow-md transition-all duration-300 ${ringClass}`}
      style={{ opacity: isDimmed ? 0.15 : 1 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 6, height: 6, background: '#94a3b8', border: '2px solid #fff' }}
      />
      <div className="w-full flex justify-between">
        {/* Departure */}
        <span className="text-[9px] text-slate-400 font-semibold leading-none">{fromStation}</span>
        {/* Arrival */}
        <span className="text-[9px] text-slate-400 font-semibold leading-none">{toStation}</span>
      </div>

      <div className="w-full flex justify-between">
        {/* Departure */}
        <span className="text-[13px] font-black text-slate-800 leading-tight tabular-nums">{formatTime(departureTime)}</span>
        {/* Train Badge */}
        <div className={`h-[15px] px-1 py-[2px] rounded text-[10px] leading-none font-black uppercase tracking-wide whitespace-nowrap ${getTrainBadgeClass(type)}`}>
          {type} {showTrainNumbers ? trainNumber : ''}
        </div>
        {/* Arrival */}
        <span className="text-[13px] font-black text-slate-800 leading-tight tabular-nums">{formatTime(arrivalTime)}</span>
      </div>


      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 6, height: 6, background: '#94a3b8', border: '2px solid #fff' }}
      />
    </div>
  );
};
