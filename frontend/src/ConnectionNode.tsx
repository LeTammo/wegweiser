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
    case 'IC': case 'EC': return 'bg-slate-600 text-white';
    case 'RE':             return 'bg-stone-500 text-white';
    case 'RB':             return 'bg-stone-300 text-stone-800';
    case 'S-BAHN':         return 'bg-emerald-600 text-white';
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
  } = data;

  const ringClass =
    isHighlightedFastest && isHighlightedSafest
      ? 'ring-2 ring-teal-400 border-teal-400'
      : isHighlightedFastest
      ? 'ring-2 ring-sky-400 border-sky-400'
      : isHighlightedSafest
      ? 'ring-2 ring-emerald-400 border-emerald-400'
      : 'border-slate-200';

  return (
    <div
      className={`w-full h-[44px] bg-white border rounded-lg flex items-center px-2 gap-2 transition-all duration-200 shadow-sm ${ringClass}`}
    >
      <Handle type="target" position={Position.Left} style={{ width: 6, height: 6, background: '#94a3b8', border: '2px solid #fff' }} />

      {/* Departure */}
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-[9px] text-slate-400 font-semibold leading-none truncate w-full">{fromStation}</span>
        <span className="text-[13px] font-black text-slate-800 leading-tight tabular-nums">{formatTime(departureTime)}</span>
      </div>

      {/* Train Badge — centred, shrinks if needed */}
      <div className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide whitespace-nowrap ${getTrainBadgeClass(type)}`}>
        {type} {trainNumber}
      </div>

      {/* Arrival */}
      <div className="flex flex-col items-end min-w-0 flex-1">
        <span className="text-[9px] text-slate-400 font-semibold leading-none truncate w-full text-right">{toStation}</span>
        <span className="text-[13px] font-black text-slate-800 leading-tight tabular-nums">{formatTime(arrivalTime)}</span>
      </div>

      <Handle type="source" position={Position.Right} style={{ width: 6, height: 6, background: '#94a3b8', border: '2px solid #fff' }} />
    </div>
  );
};
