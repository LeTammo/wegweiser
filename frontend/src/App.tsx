import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

import {
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  Zap,
  Clock,
  Navigation,
  FolderOpen,
  MapPin,
  TrendingUp,
  Settings as SettingsIcon,
  X,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { ConnectionNode } from './ConnectionNode';
import { ConnectionEdge } from './ConnectionEdge';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface DBJourney {
  id: string;
  name: string;
  created_at: string;
}

interface DBConnection {
  id: string;
  journey_id: string;
  train_number: string;
  type: string;
  from_station: string;
  to_station: string;
  departure_time: string;
  arrival_time: string;
  delay: number;
}

interface DBEdge {
  fromConnectionId: string;
  toConnectionId: string;
  transferMinutes: number;
  effectiveTransferMinutes: number;
  alternativeCount: number;
  rating: 'Good' | 'Medium' | 'Critical' | 'Impossible';
}

interface Path {
  connections: DBConnection[];
  totalScheduledDurationMinutes: number;
  totalEffectiveDurationMinutes: number;
  averageRobustnessScore: number;
  isBroken: boolean;
  brokenAtConnectionId?: string;
  departureTime: string;
  arrivalTime: string;
  effectiveArrivalTime: string;
}

interface Analysis {
  connections: DBConnection[];
  edges: DBEdge[];
  robustnessScores: Record<string, number>;
  paths: Path[];
  fastestRoute: Path | null;
  safestRoute: Path | null;
  criticalTransfersCount: number;
}

interface AppSettings {
  showExchangeTimes: 'always' | 'highlighted';
  exchangeTimeThresholdGreen: number;
  exchangeTimeThresholdRed: number;
  showTrainNumbers: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  showExchangeTimes: 'highlighted',
  exchangeTimeThresholdGreen: 20,
  exchangeTimeThresholdRed: 9,
  showTrainNumbers: true,
};

const nodeTypes = {
  connectionNode: ConnectionNode,
};

const edgeTypes = {
  connectionEdge: ConnectionEdge,
};

const trainTypes = ['ICE', 'IC', 'EC', 'RE', 'RB', 'S', 'Bus', 'Tram'];

export default function App() {
  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('bring-me-there-settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isCreatingJourney, setIsCreatingJourney] = useState(false);
  const [isConnectionsListOpen, setIsConnectionsListOpen] = useState(false);
  const [isAddConnectionFormOpen, setIsAddConnectionFormOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('bring-me-there-settings', JSON.stringify(settings));
  }, [settings]);

  // Journey state
  const [journeys, setJourneys] = useState<DBJourney[]>([]);
  const [activeJourneyId, setActiveJourneyId] = useState<string>('');
  const [journeyName, setJourneyName] = useState<string>('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  // Station filtering state
  const [stations, setStations] = useState<string[]>([]);
  const [startStation, setStartStation] = useState<string>('');
  const [endStation, setEndStation] = useState<string>('');

  // Selected route highlight
  const [highlightedRouteType, setHighlightedRouteType] = useState<'fastest' | 'safest' | null>(null);

  // Selected node for highlighting neighbors
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Form states
  const [trainNumber, setTrainNumber] = useState('');
  const [type, setType] = useState('ICE');
  const [fromStation, setFromStation] = useState('');
  const [toStation, setToStation] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [editingConnId, setEditingConnId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Flow nodes and edges state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Fetch initial journeys list
  useEffect(() => {
    fetchJourneys();
  }, []);

  // Fetch all journeys
  const fetchJourneys = async () => {
    try {
      const res = await fetch(`${API_URL}/journeys`);
      const data = await res.json();
      setJourneys(data);
      if (data.length > 0 && !activeJourneyId) {
        setActiveJourneyId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch journeys', err);
    }
  };

  // Fetch specific journey details
  const fetchJourneyDetails = useCallback(async (id: string, start?: string, end?: string) => {
    if (!id) return;
    try {
      let url = `${API_URL}/journeys/${id}`;
      const params = new URLSearchParams();
      if (start) params.append('startStation', start);
      if (end) params.append('endStation', end);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
        
        // Extract all stations from connection list
        const uniqueStations = new Set<string>();
        data.analysis.connections.forEach((c: DBConnection) => {
          uniqueStations.add(c.from_station);
          uniqueStations.add(c.to_station);
        });
        const stationList = Array.from(uniqueStations).sort();
        setStations(stationList);

        // Auto select start and end stations if they aren't set
        if (!start && !end && data.analysis.connections.length > 0) {
          // Identify natural sources and sinks
          const origins = new Set(data.analysis.connections.map((c: any) => c.from_station));
          const destinations = new Set(data.analysis.connections.map((c: any) => c.to_station));
          
          const naturalStarts = Array.from(origins).filter(st => !destinations.has(st)) as string[];
          const naturalEnds = Array.from(destinations).filter(st => !origins.has(st)) as string[];

          if (naturalStarts.length > 0) setStartStation(naturalStarts[0]);
          if (naturalEnds.length > 0) setEndStation(naturalEnds[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch journey details', err);
    }
  }, []);

  // Sync details on active journey or station filter change
  useEffect(() => {
    if (activeJourneyId) {
      fetchJourneyDetails(activeJourneyId, startStation, endStation);
    } else {
      setAnalysis(null);
      setStations([]);
      setStartStation('');
      setEndStation('');
    }
  }, [activeJourneyId, startStation, endStation, fetchJourneyDetails]);

  // Convert connection and edges to React Flow representations
  useEffect(() => {
    if (!analysis) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { connections, edges: apiEdges, fastestRoute, safestRoute } = analysis;

    // 1. Identify all unique stations and build incoming lists
    const stationsSet = new Set<string>();
    connections.forEach(c => {
      stationsSet.add(c.from_station.trim().toLowerCase());
      stationsSet.add(c.to_station.trim().toLowerCase());
    });
    const stationsList = Array.from(stationsSet);

    const stationIncoming = new Map<string, string[]>();
    stationsList.forEach(s => stationIncoming.set(s, []));
    connections.forEach(c => {
      const from = c.from_station.trim().toLowerCase();
      const to = c.to_station.trim().toLowerCase();
      if (!stationIncoming.get(to)?.includes(from)) {
        stationIncoming.get(to)?.push(from);
      }
    });

    // 2. Compute station levels (stages) topologically
    const stationLevels: Record<string, number> = {};
    const getStationLevel = (st: string, visited = new Set<string>()): number => {
      if (stationLevels[st] !== undefined) return stationLevels[st];
      const parents = stationIncoming.get(st) || [];
      if (parents.length === 0) {
        stationLevels[st] = 0;
        return 0;
      }
      
      visited.add(st);
      const parentLevels: number[] = [];
      for (const p of parents) {
        if (!visited.has(p)) {
          parentLevels.push(getStationLevel(p, new Set(visited)));
        }
      }
      visited.delete(st);
      
      const maxParentLvl = parentLevels.length > 0 ? Math.max(...parentLevels) : 0;
      stationLevels[st] = 1 + maxParentLvl;
      return stationLevels[st];
    };

    stationsList.forEach(st => getStationLevel(st));

    // 3. Compute spans and sort connections to assign layout order
    const connectionSpans = connections.map(conn => {
      const colFrom = stationLevels[conn.from_station.trim().toLowerCase()] || 0;
      const colTo = stationLevels[conn.to_station.trim().toLowerCase()] || 0;
      const span = Math.max(1, colTo - colFrom);
      return { conn, colFrom, span };
    });

    // Group and sort by departure times to keep vertical sequences chronological
    connectionSpans.sort((a, b) => {
      // Primary sort by column to ensure topological consistency
      if (a.colFrom !== b.colFrom) return a.colFrom - b.colFrom;
      
      // Secondary sort globally by departure time within the same column group
      // This ensures that Barth->Prerow (late) lands below early connections in the same column
      const timeA = new Date(a.conn.departure_time).getTime();
      const timeB = new Date(b.conn.departure_time).getTime();
      if (timeA !== timeB) return timeA - timeB;
      
      const fromComp = a.conn.from_station.localeCompare(b.conn.from_station);
      if (fromComp !== 0) return fromComp;
      return a.conn.to_station.localeCompare(b.conn.to_station);
    });

    // 4. Reserve grid slots to avoid overlaps
    // grid[row][col] = occupied boolean
    const grid: boolean[][] = [];
    const connectionPositions: Record<string, { col: number; row: number; span: number }> = {};

    for (const item of connectionSpans) {
      const { conn, colFrom, span } = item;
      
      let row = 0;
      while (true) {
        while (grid.length <= row) {
          grid.push(new Array(stationsList.length + 5).fill(false));
        }

        // Verify if row is vacant in all spanned columns
        let isFree = true;
        for (let c = colFrom; c < colFrom + span; c++) {
          if (grid[row][c]) {
            isFree = false;
            break;
          }
        }

        if (isFree) {
          // Block the slots
          for (let c = colFrom; c < colFrom + span; c++) {
            grid[row][c] = true;
          }
          connectionPositions[conn.id] = { col: colFrom, row, span };
          break;
        }
        row++;
      }
    }

    // 5. Generate React Flow Nodes
    const neighbors = new Set<string>();
    if (selectedNodeId) {
      neighbors.add(selectedNodeId);
      apiEdges.forEach(e => {
        if (e.fromConnectionId === selectedNodeId) neighbors.add(e.toConnectionId);
        if (e.toConnectionId === selectedNodeId) neighbors.add(e.fromConnectionId);
      });
    }

    const flowNodes: Node[] = connections.map(conn => {
      const pos = connectionPositions[conn.id] || { col: 0, row: 0, span: 1 };
      
      const COL_W_NODES = 320;
      const width = 180 + (pos.span - 1) * COL_W_NODES;

      // Highlight status
      const isHighlightedFastest = highlightedRouteType === 'fastest' && 
        !!fastestRoute?.connections.some(c => c.id === conn.id);
      
      const isHighlightedSafest = highlightedRouteType === 'safest' && 
        !!safestRoute?.connections.some(c => c.id === conn.id);

      const isDimmed = !!selectedNodeId && !neighbors.has(conn.id);

      return {
        id: conn.id,
        type: 'connectionNode',
        position: { x: 30 + pos.col * COL_W_NODES, y: 30 + pos.row * 70 },
        style: { width: `${width}px` },
        data: {
          id: conn.id,
          trainNumber: conn.train_number,
          type: conn.type,
          fromStation: conn.from_station,
          toStation: conn.to_station,
          departureTime: conn.departure_time,
          arrivalTime: conn.arrival_time,
          isHighlightedFastest,
          isHighlightedSafest,
          isDimmed,
          showTrainNumbers: settings.showTrainNumbers,
        },
      };
    });

    // 6. Generate React Flow Edges
    const formatBuffer = (mins: number): string => {
      if (mins < 60) return `${mins} min`;
      const hours = (mins / 60).toFixed(1);
      return `${hours.endsWith('.0') ? hours.slice(0, -2) : hours} h`;
    };

    const flowEdges: Edge[] = apiEdges.map(e => {
      let inFastestPath = false;
      if (highlightedRouteType === 'fastest' && fastestRoute) {
        const conns = fastestRoute.connections;
        for (let i = 0; i < conns.length - 1; i++) {
          if (conns[i].id === e.fromConnectionId && conns[i+1].id === e.toConnectionId) {
            inFastestPath = true;
            break;
          }
        }
      }

      let inSafestPath = false;
      if (highlightedRouteType === 'safest' && safestRoute) {
        const conns = safestRoute.connections;
        for (let i = 0; i < conns.length - 1; i++) {
          if (conns[i].id === e.fromConnectionId && conns[i+1].id === e.toConnectionId) {
            inSafestPath = true;
            break;
          }
        }
      }

      const isEdgeHighlighted = inFastestPath || inSafestPath;
      const isDimmed = !!selectedNodeId && !(e.fromConnectionId === selectedNodeId || e.toConnectionId === selectedNodeId);

      const showLabel = settings.showExchangeTimes === 'always' || (settings.showExchangeTimes === 'highlighted' && !!selectedNodeId && !isDimmed);

      // Style edge according to transfer minutes/status
      let strokeColor = '#94a3b8'; // default gray
      let strokeDash = '';
      let isAnimated = isEdgeHighlighted;

      if (e.rating === 'Impossible') {
        strokeColor = '#f43f5e'; // rose-500
        strokeDash = '5,5';
        isAnimated = false;
      } else if (e.effectiveTransferMinutes <= settings.exchangeTimeThresholdRed) {
        strokeColor = '#f43f5e'; // red-500
        strokeDash = '2,2';
      } else if (e.effectiveTransferMinutes < settings.exchangeTimeThresholdGreen) {
        strokeColor = '#eab308'; // yellow-500
      } else {
        strokeColor = '#10b981'; // emerald-500
      }

      if (isEdgeHighlighted && e.rating !== 'Impossible') {
        strokeColor = highlightedRouteType === 'fastest' || highlightedRouteType === 'safest' ? '#0ea5e9' : '#059669';
      }

      // Calculate label position offset to avoid overlapping
      // Using a simple deterministic offset based on the connection ID to jitter labels
      // This is more robust than looking at neighbors which might be incomplete
      let labelYOffset = 0;
      const idNum = parseInt(e.fromConnectionId.replace(/\D/g, '') || '0') + 
                    parseInt(e.toConnectionId.replace(/\D/g, '') || '0');
      if (idNum % 2 === 0) labelYOffset = -25;
      if (idNum % 3 === 0) labelYOffset = 25;

      // To move the WHOLE label (pill + text), we must calculate labelX/labelY 
      // instead of using CSS transform which only affects the text.
      const fromPos = connectionPositions[e.fromConnectionId];
      const toPos = connectionPositions[e.toConnectionId];
      
      let labelX = undefined;
      let labelY = undefined;

      if (fromPos && toPos) {
        const COL_W_LAYOUT = 320;
        const ROW_H_LAYOUT = 70;
        const x1 = 30 + fromPos.col * COL_W_LAYOUT + (180 + (fromPos.span - 1) * COL_W_LAYOUT); // right side of source
        const x2 = 30 + toPos.col * COL_W_LAYOUT; // left side of target
        const y1 = 30 + fromPos.row * ROW_H_LAYOUT + 22; // center Y of source
        const y2 = 30 + toPos.row * ROW_H_LAYOUT + 22; // center Y of target
        
        labelX = (x1 + x2) / 2;
        labelY = (y1 + y2) / 2 + labelYOffset;
      }

      return {
        id: `e-${e.fromConnectionId}-${e.toConnectionId}`,
        type: 'connectionEdge',
        source: e.fromConnectionId,
        target: e.toConnectionId,
        animated: isAnimated && e.rating !== 'Impossible',
        // Transfer time is the PRIMARY info — large, bold, prominent label
        label: showLabel ? formatBuffer(e.effectiveTransferMinutes) : null,
        labelX,
        labelY,
        style: {
          stroke: strokeColor,
          strokeWidth: isEdgeHighlighted ? 3 : 1.5,
          strokeDasharray: strokeDash,
          opacity: isDimmed ? 0.15 : 1,
          // Use zIndex to help ensure highlighted edges are on top
          zIndex: isEdgeHighlighted ? 10 : 0,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: strokeColor,
        },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [analysis, highlightedRouteType, selectedNodeId, settings]);

  // Create new journey
  const handleCreateJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journeyName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/journeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: journeyName }),
      });
      const data = await res.json();
      if (data.id) {
        setJourneys([data, ...journeys]);
        setActiveJourneyId(data.id);
        setJourneyName('');
        setIsCreatingJourney(false);
      }
    } catch (err) {
      console.error('Failed to create journey', err);
    }
  };

  // Delete journey
  const handleDeleteJourney = async () => {
    if (!activeJourneyId) return;
    if (!window.confirm('Möchtest du diese Reise wirklich löschen?')) return;
    try {
      await fetch(`${API_URL}/journeys/${activeJourneyId}`, { method: 'DELETE' });
      const remaining = journeys.filter(j => j.id !== activeJourneyId);
      setJourneys(remaining);
      setActiveJourneyId(remaining.length > 0 ? remaining[0].id : '');
      setIsSettingsOpen(false);
    } catch (err) {
      console.error('Failed to delete journey', err);
    }
  };

  // Submit Connection form (Add / Edit)
  const handleConnectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!activeJourneyId) return;
    if (!trainNumber || !fromStation || !toStation || !departureTime || !arrivalTime) {
      setFormError('Bitte alle Felder ausfüllen.');
      return;
    }

    // Format times into valid ISO dates (arbitrary date, say today, but with user-specified times)
    // To support clean time comparison, we ensure they are parsed as actual date-times.
    // If user enters HH:MM, we append today's date prefix
    const today = new Date().toISOString().split('T')[0];
    const depIso = departureTime.includes('T') ? departureTime : `${today}T${departureTime}:00`;
    const arrIso = arrivalTime.includes('T') ? arrivalTime : `${today}T${arrivalTime}:00`;

    const payload = {
      trainNumber,
      type,
      fromStation: fromStation.trim(),
      toStation: toStation.trim(),
      departureTime: depIso,
      arrivalTime: arrIso,
    };

    try {
      const url = editingConnId
        ? `${API_URL}/journeys/${activeJourneyId}/connections/${editingConnId}`
        : `${API_URL}/journeys/${activeJourneyId}/connections`;

      const method = editingConnId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Ein Fehler ist aufgetreten.');
        return;
      }

      // Reset form
      setTrainNumber('');
      setFromStation('');
      setToStation('');
      setDepartureTime('');
      setArrivalTime('');
      setEditingConnId(null);

      if (data.analysis) {
        setAnalysis(data.analysis);
        // Refresh stations listing
        const uniqueStations = new Set<string>();
        data.analysis.connections.forEach((c: DBConnection) => {
          uniqueStations.add(c.from_station);
          uniqueStations.add(c.to_station);
        });
        setStations(Array.from(uniqueStations).sort());
      }
    } catch (err) {
      setFormError('Verbindung zum Server fehlgeschlagen.');
      console.error(err);
    }
  };

  // Trigger edit mode for connection
  const startEditConnection = (conn: DBConnection) => {
    setEditingConnId(conn.id);
    setTrainNumber(conn.train_number);
    setType(conn.type);
    setFromStation(conn.from_station);
    setToStation(conn.to_station);
    
    // Extract HH:MM from ISO timestamp for input matching
    const getHHMM = (iso: string) => {
      try {
        const d = new Date(iso);
        return d.toTimeString().split(' ')[0].substring(0, 5);
      } catch {
        return '';
      }
    };
    setDepartureTime(getHHMM(conn.departure_time));
    setArrivalTime(getHHMM(conn.arrival_time));
    setIsAddConnectionFormOpen(true);
  };

  // Delete connection
  const handleDeleteConnection = async (connId: string) => {
    if (!activeJourneyId) return;
    if (!window.confirm('Verbindung wirklich löschen?')) return;
    try {
      const res = await fetch(`${API_URL}/journeys/${activeJourneyId}/connections/${connId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-800 overflow-hidden">
      
      {/* Burger Menu Button (Only visible when sidebar is closed) */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-40 p-2 bg-white text-slate-500 hover:text-violet-600 shadow-md rounded-lg transition"
          title="Sidebar öffnen"
        >
          <Menu size={22} />
        </button>
      )}

      {/* Main Grid Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT COLUMN: Sidebar */}
        <aside className={`
          fixed md:relative z-30 h-full bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out shadow-xl md:shadow-none
          ${isSidebarOpen ? 'translate-x-0 w-full xs:w-[320px] sm:w-[420px]' : '-translate-x-full w-0 md:w-0 overflow-hidden'}
        `}>
          {/* Sidebar Header with Close Button and Brand */}
          <div className="px-5 py-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-tr from-violet-600 to-indigo-600 text-white p-2 rounded-xl shadow-md">
                <TrendingUp size={20} className="transform rotate-45" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">Wegweiser</h1>
                <p className="text-[10px] text-slate-400 font-medium">Plane deine Verbindung</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
            {/* 1. Aktive Reise Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center space-x-1.5">
                  <FolderOpen size={12} />
                  <span>Aktive Reise</span>
                </h3>
                <button
                  onClick={() => setIsCreatingJourney(!isCreatingJourney)}
                  className={`p-1 rounded-md transition ${isCreatingJourney ? 'bg-rose-50 text-rose-500' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'}`}
                  title="Neue Reise erstellen"
                >
                  {isCreatingJourney ? <X size={14} /> : <Plus size={14} />}
                </button>
              </div>

              {isCreatingJourney && (
                <form onSubmit={handleCreateJourney} className="flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Name der Reise..."
                    value={journeyName}
                    onChange={(e) => setJourneyName(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-700"
                  />
                  <button
                    type="submit"
                    className="bg-violet-600 hover:bg-violet-700 text-white p-2 rounded-lg shadow-sm transition"
                  >
                    <Plus size={16} />
                  </button>
                </form>
              )}

              <div className="flex items-center space-x-2">
                <select
                  value={activeJourneyId}
                  onChange={(e) => {
                    setActiveJourneyId(e.target.value);
                    setStartStation('');
                    setEndStation('');
                    setHighlightedRouteType(null);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 flex-1 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
                >
                  {journeys.length === 0 ? (
                    <option value="">Keine Reisen</option>
                  ) : (
                    journeys.map((j) => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))
                  )}
                </select>
                {activeJourneyId && (
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 text-slate-500 hover:text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                    title="Einstellungen"
                  >
                    <SettingsIcon size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* B. Destination Routing Analyzer */}
          {stations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Navigation size={12} />
                <span>Routen-Analyse</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Startbahnhof</label>
                  <select
                    value={startStation}
                    onChange={(e) => setStartStation(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm font-semibold text-slate-700 bg-white cursor-pointer mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="">Start wählen...</option>
                    {stations.map(st => (
                      <option key={`start-${st}`} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Zielbahnhof</label>
                  <select
                    value={endStation}
                    onChange={(e) => setEndStation(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm font-semibold text-slate-700 bg-white cursor-pointer mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="">Ziel wählen...</option>
                    {stations.map(st => (
                      <option key={`end-${st}`} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Path List & Highlights */}
              {analysis && analysis.paths.length > 0 && startStation && endStation && (
                <div className="space-y-2 mt-3">
                  <p className="text-[11px] font-bold text-slate-400">Gefundene Reiserouten:</p>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setHighlightedRouteType(highlightedRouteType === 'fastest' ? null : 'fastest')}
                      className={`flex-1 flex items-center justify-center space-x-1.5 text-xs font-bold py-2 px-3 border rounded-lg transition ${
                        highlightedRouteType === 'fastest'
                          ? 'bg-sky-50 border-sky-300 text-sky-700 font-extrabold shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Zap size={13} />
                      <span>Schnellste</span>
                    </button>
                    
                    <button
                      onClick={() => setHighlightedRouteType(highlightedRouteType === 'safest' ? null : 'safest')}
                      className={`flex-1 flex items-center justify-center space-x-1.5 text-xs font-bold py-2 px-3 border rounded-lg transition ${
                        highlightedRouteType === 'safest'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-extrabold shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Sparkles size={13} />
                      <span>Sicherste</span>
                    </button>
                  </div>

                  {highlightedRouteType && (
                    <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-lg text-xs space-y-1">
                      {highlightedRouteType === 'fastest' && analysis.fastestRoute && (
                        <>
                          <div className="flex justify-between items-center font-bold text-sky-800">
                            <span>Schnellste Route:</span>
                            {analysis.fastestRoute.isBroken ? (
                              <span className="text-rose-500 uppercase text-[9px] animate-pulse font-black">Unterbrochen</span>
                            ) : (
                              <span>{analysis.fastestRoute.totalEffectiveDurationMinutes} Min.</span>
                            )}
                          </div>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            {analysis.fastestRoute.connections.map(c => `${c.type} ${c.train_number}`).join(' → ')}
                          </p>
                        </>
                      )}

                      {highlightedRouteType === 'safest' && analysis.safestRoute && (
                        <>
                          <div className="flex justify-between items-center font-bold text-emerald-800">
                            <span>Sicherste Route:</span>
                            <span>Robustheit: {analysis.safestRoute.averageRobustnessScore}/100</span>
                          </div>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            {analysis.safestRoute.connections.map(c => `${c.type} ${c.train_number}`).join(' → ')}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* C. Connections List */}
          {analysis && analysis.connections.length > 0 && (
            <div className="space-y-3">
              <button 
                onClick={() => setIsConnectionsListOpen(!isConnectionsListOpen)}
                className="w-full text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center justify-between hover:text-slate-600 transition"
              >
                <div className="flex items-center space-x-1.5">
                  <MapPin size={12} />
                  <span>Verbindungen ({analysis.connections.length})</span>
                </div>
                {isConnectionsListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isConnectionsListOpen && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  {analysis.connections.map(c => {
                    const formatTimeStr = (iso: string) => {
                      const date = new Date(iso);
                      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    };
                    return (
                      <div 
                        key={`list-conn-${c.id}`} 
                        className={`flex justify-between items-center border border-slate-200 rounded-lg p-2 text-xs transition-colors ${
                          editingConnId === c.id ? 'bg-violet-50 border-violet-300' : 'bg-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800">
                            {c.type} {c.train_number}
                          </p>
                          <p className="text-slate-500 font-medium truncate">
                            {c.from_station} ({formatTimeStr(c.departure_time)}) → {c.to_station} ({formatTimeStr(c.arrival_time)})
                          </p>
                        </div>
                        <div className="flex space-x-1.5 ml-2">
                          <button
                            onClick={() => startEditConnection(c)}
                            className="px-2 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded font-bold transition"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => handleDeleteConnection(c.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* D. Add / Edit Connection Form */}
          {activeJourneyId && (
            <div className="space-y-4 pt-2">
              <button
                onClick={() => {
                  if (isAddConnectionFormOpen && editingConnId) {
                    setEditingConnId(null);
                    setTrainNumber('');
                    setFromStation('');
                    setToStation('');
                    setDepartureTime('');
                    setArrivalTime('');
                  }
                  setIsAddConnectionFormOpen(!isAddConnectionFormOpen);
                }}
                className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
                  isAddConnectionFormOpen 
                    ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200' 
                    : 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-200'
                }`}
              >
                {isAddConnectionFormOpen ? (
                  <>
                    <X size={16} />
                    <span>Abbrechen</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Verbindung hinzufügen</span>
                  </>
                )}
              </button>

              {isAddConnectionFormOpen && (
                <form onSubmit={handleConnectionSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                  <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                    {editingConnId ? 'Verbindung Bearbeiten' : 'Neue Verbindung Details'}
                  </h3>

                  {formError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold p-3 rounded-lg flex items-start space-x-2">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Zugnummer / ID</label>
                      <input
                        type="text"
                        required
                        placeholder="z.B. 705"
                        value={trainNumber}
                        onChange={(e) => setTrainNumber(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Typ</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold bg-white"
                      >
                        {trainTypes.map(t => (
                          <option key={`type-${t}`} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Startbahnhof</label>
                      <input
                        type="text"
                        required
                        placeholder="z.B. Berlin Hbf"
                        value={fromStation}
                        onChange={(e) => setFromStation(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Zielbahnhof</label>
                      <input
                        type="text"
                        required
                        placeholder="z.B. Rostock Hbf"
                        value={toStation}
                        onChange={(e) => setToStation(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Abfahrt (HH:MM)</label>
                      <input
                        type="time"
                        required
                        value={departureTime}
                        onChange={(e) => setDepartureTime(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Ankunft (HH:MM)</label>
                      <input
                        type="time"
                        required
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-slate-700 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 rounded-lg shadow-sm transition flex items-center justify-center space-x-1.5"
                    >
                      <Plus size={16} />
                      <span>{editingConnId ? 'Aktualisieren' : 'Hinzufügen'}</span>
                    </button>
                    {editingConnId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingConnId(null);
                          setTrainNumber('');
                          setFromStation('');
                          setToStation('');
                          setDepartureTime('');
                          setArrivalTime('');
                          setIsAddConnectionFormOpen(false);
                        }}
                        className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition"
                      >
                        Abbrechen
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </aside>

        {/* CENTER/RIGHT CANVAS: React Flow Diagram */}
        <section className="flex-1 h-full bg-slate-50 relative flex flex-col">
          {activeJourneyId ? (
            analysis && analysis.connections.length === 0 ? (
              <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-8 bg-slate-50/50">
                <div className="bg-white border border-slate-200 shadow-sm p-8 rounded-2xl max-w-md space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                    <Clock size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Keine Verbindungen vorhanden</h3>
                  <p className="text-sm text-slate-500 font-medium">
                    Füge links die ersten Zugverbindungen hinzu. Das System wird Anschlüsse, Umstiegszeiten und Robustheitsscores automatisch berechnen und hier darstellen.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  fitView
                  minZoom={0.2}
                  maxZoom={1.5}
                  elevateEdgesOnSelect={true}
                >
                  <Background color="#cbd5e1" gap={20} size={1.2} />
                  <Controls />
                  {/* <MiniMap nodeStrokeWidth={3} zoomable pannable /> */}

                </ReactFlow>

                {/* Bottom Legend */}
                <div className="absolute bottom-6 left-6 z-10 max-w-sm flex flex-col items-start space-y-2">
                  <button
                    onClick={() => setIsLegendOpen(!isLegendOpen)}
                    className="bg-white/95 border border-slate-200/80 shadow-md p-2 rounded-lg text-slate-500 hover:text-violet-600 transition flex items-center space-x-2 backdrop-blur-sm"
                  >
                    {isLegendOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span className="text-xs font-bold uppercase tracking-wider">{isLegendOpen ? 'Legende verbergen' : 'Legende anzeigen'}</span>
                  </button>

                  {isLegendOpen && (
                    <div className="bg-white/95 border border-slate-200/80 shadow-md p-4 rounded-xl space-y-3 font-semibold backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-200">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Umstiegszeit-Farbcodierung (Pfeile)</p>
                        <div className="flex space-x-4 mt-1.5 text-xs">
                          <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full bg-emerald-500 mr-1.5"></span>Grün (&ge; {settings.exchangeTimeThresholdGreen} min)</span>
                          <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full bg-amber-500 mr-1.5"></span>Gelb ({settings.exchangeTimeThresholdRed + 1}-{settings.exchangeTimeThresholdGreen - 1} min)</span>
                          <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full bg-rose-500 mr-1.5"></span>Rot (&le; {settings.exchangeTimeThresholdRed} min)</span>
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-2 text-xs">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Verbindungs-Typen (Header)</p>
                        <div className="flex flex-wrap gap-2 mt-1.5 max-w-[280px]">
                          <span className="flex items-center text-[10px] bg-zinc-900 text-white px-2 py-0.5 rounded">ICE</span>
                          <span className="flex items-center text-[10px] bg-slate-600 text-white px-2 py-0.5 rounded">IC / EC</span>
                          <span className="flex items-center text-[10px] bg-stone-500 text-white px-2 py-0.5 rounded">RE</span>
                          <span className="flex items-center text-[10px] bg-stone-300 text-stone-800 px-2 py-0.5 rounded">RB</span>
                          <span className="flex items-center text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded">S</span>
                          <span className="flex items-center text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded">Bus</span>
                          <span className="flex items-center text-[10px] bg-red-500 text-white px-2 py-0.5 rounded">Tram</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-8">
              <div className="bg-white border border-slate-200 shadow-sm p-8 rounded-2xl max-w-sm space-y-3">
                <div className="mx-auto w-12 h-12 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                  <FolderOpen size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Reise auswählen</h3>
                <p className="text-sm text-slate-500 font-medium">
                  Wähle oben eine Reise aus oder lege eine neue an, um mit der Routenplanung zu beginnen.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <SettingsIcon size={20} className="text-slate-600" />
                <h2 className="text-lg font-bold text-slate-800">Anzeige-Einstellungen</h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Show Exchange Times */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock size={12} />
                  <span>Umstiegszeiten anzeigen</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSettings({ ...settings, showExchangeTimes: 'always' })}
                    className={`px-3 py-2 text-sm font-semibold rounded-lg border transition ${
                      settings.showExchangeTimes === 'always'
                        ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Immer
                  </button>
                  <button
                    onClick={() => setSettings({ ...settings, showExchangeTimes: 'highlighted' })}
                    className={`px-3 py-2 text-sm font-semibold rounded-lg border transition ${
                      settings.showExchangeTimes === 'highlighted'
                        ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Nur Highlighted
                  </button>
                </div>
              </div>

              {/* Thresholds */}
              <div className="space-y-4 pt-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <TrendingUp size={12} />
                  <span>Umstiegszeiten Farbcodierung</span>
                </label>
                
                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600 flex items-center">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
                        Grün ab (Minuten)
                      </span>
                      <span className="text-sm font-bold text-slate-800">{settings.exchangeTimeThresholdGreen}m</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={settings.exchangeTimeThresholdGreen}
                      onChange={(e) => setSettings({ ...settings, exchangeTimeThresholdGreen: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600 flex items-center">
                        <span className="w-2 h-2 rounded-full bg-rose-500 mr-2"></span>
                        Rot bis (Minuten)
                      </span>
                      <span className="text-sm font-bold text-slate-800">{settings.exchangeTimeThresholdRed}m</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={settings.exchangeTimeThresholdRed}
                      onChange={(e) => setSettings({ ...settings, exchangeTimeThresholdRed: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Show Train Numbers */}
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zugnummern anzeigen</label>
                  <p className="text-[11px] text-slate-500 font-medium">Zeigt Zug-IDs auf den Karten an</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, showTrainNumbers: !settings.showTrainNumbers })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    settings.showTrainNumbers ? 'bg-violet-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.showTrainNumbers ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
              {activeJourneyId && (
                <button
                  onClick={handleDeleteJourney}
                  className="flex items-center space-x-1.5 text-rose-500 hover:text-rose-600 font-bold text-sm transition"
                  title="Aktive Reise löschen"
                >
                  <Trash2 size={16} />
                  <span>Reise löschen</span>
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-lg shadow-sm transition"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
