import { Connection, AutoEdge, Path, JourneyAnalysis } from './types';

// Helper to compute minutes difference between two ISO dates
export function getMinutesDiff(fromTime: string, toTime: string): number {
  return Math.round((new Date(toTime).getTime() - new Date(fromTime).getTime()) / 60000);
}

// Compute edges dynamically based on connection times and stations
export function computeEdges(
  connections: Connection[],
  minTransferTimeMinutes: number = 5
): AutoEdge[] {
  const edges: AutoEdge[] = [];

  for (const cA of connections) {
    for (const cB of connections) {
      if (cA.id === cB.id) continue;

      // 1. Station Match: Destination of A matches Origin of B
      if (cA.to_station.trim().toLowerCase() === cB.from_station.trim().toLowerCase()) {
        const transferMinutes = getMinutesDiff(cA.arrival_time, cB.departure_time);

        // Under scheduled times, it's a valid edge if B departs after A arrives
        if (transferMinutes >= 0) {
          // Calculate effective transfer minutes with simulated delay on A
          const effectiveTransferMinutes = transferMinutes - cA.delay;

          // Find alternative connections departing later from transfer station to the same destination
          const alternatives = connections.filter(conn =>
            conn.id !== cB.id &&
            conn.from_station.trim().toLowerCase() === cB.from_station.trim().toLowerCase() &&
            conn.to_station.trim().toLowerCase() === cB.to_station.trim().toLowerCase() &&
            new Date(conn.departure_time).getTime() > new Date(cB.departure_time).getTime()
          );

          // Classify transfer rating under current simulation
          let rating: 'Good' | 'Medium' | 'Critical' | 'Impossible';
          if (effectiveTransferMinutes < 0) {
            rating = 'Impossible';
          } else if (effectiveTransferMinutes <= 7) {
            rating = 'Critical';
          } else if (effectiveTransferMinutes <= 14) {
            rating = 'Medium';
          } else {
            rating = 'Good';
          }

          edges.push({
            fromConnectionId: cA.id,
            toConnectionId: cB.id,
            transferMinutes,
            effectiveTransferMinutes,
            alternativeCount: alternatives.length,
            rating
          });
        }
      }
    }
  }

  return edges;
}

// DFS cycle detection
export function hasCycle(
  connections: Connection[],
  edges: { fromConnectionId: string; toConnectionId: string }[]
): boolean {
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    adj.set(conn.id, []);
  }
  for (const edge of edges) {
    adj.get(edge.fromConnectionId)?.push(edge.toConnectionId);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) return true;
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const conn of connections) {
    if (dfs(conn.id)) return true;
  }
  return false;
}

// Calculate robustness score (0-100) for a single connection node
export function calculateRobustnessScore(
  conn: Connection,
  connections: Connection[],
  edges: AutoEdge[]
): number {
  const outgoingEdges = edges.filter(e => e.fromConnectionId === conn.id);

  // If there are no outgoing connections, this is a final destination node
  if (outgoingEdges.length === 0) {
    return 100;
  }

  let totalScore = 0;

  for (const edge of outgoingEdges) {
    const nextConn = connections.find(c => c.id === edge.toConnectionId);
    if (!nextConn) continue;

    // 1. Buffer Score
    const buffer = edge.transferMinutes;
    let bufferScore = 0;
    if (buffer < 5) {
      bufferScore = buffer * 10; // Max 40 points
    } else if (buffer < 15) {
      bufferScore = 50 + (buffer - 5) * 3; // 50 to 77 points
    } else {
      bufferScore = Math.min(100, 80 + (buffer - 15) * 1); // 80 to 100 points
    }

    // 2. Alternatives Score
    const alternatives = connections.filter(c =>
      c.id !== nextConn.id &&
      c.from_station.trim().toLowerCase() === nextConn.from_station.trim().toLowerCase() &&
      c.to_station.trim().toLowerCase() === nextConn.to_station.trim().toLowerCase() &&
      new Date(c.departure_time).getTime() > new Date(nextConn.departure_time).getTime()
    ).sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime());

    let altScore = 0;
    if (alternatives.length > 0) {
      // Points for alternative count (max 50)
      const countPoints = Math.min(50, alternatives.length * 25);

      // Points for wait time to the first alternative (max 50)
      const firstAlt = alternatives[0];
      const waitTime = getMinutesDiff(conn.arrival_time, firstAlt.departure_time);
      let waitPoints = 0;
      if (waitTime <= 30) {
        waitPoints = 50;
      } else if (waitTime <= 120) {
        waitPoints = 50 - (waitTime - 30) * 0.5; // Decreases to 5 points at 120 mins
      } else {
        waitPoints = 5;
      }

      altScore = countPoints + waitPoints;
    }

    // Combine buffer and alternatives
    let edgeScore = 0;
    if (alternatives.length === 0) {
      edgeScore = bufferScore * 0.8; // Cap at 80 since there are no alternatives
    } else {
      edgeScore = bufferScore * 0.6 + altScore * 0.4;
    }

    totalScore += edgeScore;
  }

  return Math.round(totalScore / outgoingEdges.length);
}

// Find all paths from startStation to endStation
export function findPaths(
  connections: Connection[],
  edges: AutoEdge[],
  robustnessScores: Record<string, number>,
  startStation: string,
  endStation: string,
  minTransferTimeMinutes: number = 5
): Path[] {
  const paths: Path[] = [];
  const startConns = connections.filter(
    c => c.from_station.trim().toLowerCase() === startStation.trim().toLowerCase()
  );

  const adj = new Map<string, AutoEdge[]>();
  for (const conn of connections) {
    adj.set(conn.id, []);
  }
  for (const edge of edges) {
    adj.get(edge.fromConnectionId)?.push(edge);
  }

  const connMap = new Map<string, Connection>();
  for (const conn of connections) {
    connMap.set(conn.id, conn);
  }

  function dfs(currId: string, currentPath: Connection[], currentEdges: AutoEdge[]) {
    const currConn = connMap.get(currId)!;

    if (currConn.to_station.trim().toLowerCase() === endStation.trim().toLowerCase()) {
      paths.push(buildPath(currentPath, currentEdges, robustnessScores, minTransferTimeMinutes));
      return;
    }

    const nextEdges = adj.get(currId) || [];
    for (const edge of nextEdges) {
      const nextId = edge.toConnectionId;
      const nextConn = connMap.get(nextId)!;

      // Prevent cyclic recursion
      if (!currentPath.some(c => c.id === nextId)) {
        dfs(nextId, [...currentPath, nextConn], [...currentEdges, edge]);
      }
    }
  }

  for (const startConn of startConns) {
    dfs(startConn.id, [startConn], []);
  }

  return paths;
}

// Helper to construct Path details
function buildPath(
  pathConns: Connection[],
  pathEdges: AutoEdge[],
  robustnessScores: Record<string, number>,
  minTransferTime: number
): Path {
  const firstConn = pathConns[0];
  const lastConn = pathConns[pathConns.length - 1];

  const departureTime = firstConn.departure_time;
  const arrivalTime = lastConn.arrival_time;

  // Total scheduled duration
  const totalScheduledDurationMinutes = getMinutesDiff(departureTime, arrivalTime);

  // Check if simulation breaks the path
  let isBroken = false;
  let brokenAtConnectionId: string | undefined;

  for (const edge of pathEdges) {
    if (edge.effectiveTransferMinutes < minTransferTime) {
      isBroken = true;
      brokenAtConnectionId = edge.fromConnectionId;
      break;
    }
  }

  // Calculate effective arrival time
  // If the path is broken, the effective arrival time doesn't make sense (we don't arrive)
  // Otherwise, it is scheduled arrival + delay of the last connection
  const lastConnDelay = lastConn.delay;
  const effectiveArrivalTime = new Date(
    new Date(arrivalTime).getTime() + lastConnDelay * 60000
  ).toISOString();

  const totalEffectiveDurationMinutes = isBroken
    ? -1
    : getMinutesDiff(departureTime, effectiveArrivalTime);

  // Average robustness of connections in the path
  const scores = pathConns.map(c => robustnessScores[c.id] || 0);
  const averageRobustnessScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    connections: pathConns,
    totalScheduledDurationMinutes,
    totalEffectiveDurationMinutes,
    averageRobustnessScore,
    isBroken,
    brokenAtConnectionId,
    departureTime,
    arrivalTime,
    effectiveArrivalTime
  };
}

// Run comprehensive journey analysis
export function analyzeJourney(
  connections: Connection[],
  startStation?: string,
  endStation?: string,
  minTransferTimeMinutes: number = 5
): JourneyAnalysis {
  // 1. Compute Edges
  const edges = computeEdges(connections, minTransferTimeMinutes);

  // 2. Compute Robustness Score for each node
  const robustnessScores: Record<string, number> = {};
  for (const conn of connections) {
    robustnessScores[conn.id] = calculateRobustnessScore(conn, connections, edges);
  }

  // 3. Identify start and end stations if not provided
  let finalStartStation = startStation || '';
  let finalEndStation = endStation || '';

  if (!finalStartStation || !finalEndStation) {
    const origins = new Set<string>();
    const destinations = new Set<string>();

    for (const c of connections) {
      origins.add(c.from_station.trim().toLowerCase());
      destinations.add(c.to_station.trim().toLowerCase());
    }

    // Start stations = stations that are origins but never destinations
    const startStations = Array.from(origins).filter(st => !destinations.has(st));
    // End stations = stations that are destinations but never origins
    const endStations = Array.from(destinations).filter(st => !origins.has(st));

    // Fallbacks if no sources/sinks
    if (!finalStartStation && startStations.length > 0) {
      const originalConn = connections.find(
        c => c.from_station.trim().toLowerCase() === startStations[0]
      );
      finalStartStation = originalConn ? originalConn.from_station : '';
    }
    if (!finalEndStation && endStations.length > 0) {
      const originalConn = connections.find(
        c => c.to_station.trim().toLowerCase() === endStations[0]
      );
      finalEndStation = originalConn ? originalConn.to_station : '';
    }
  }

  // 4. Find Paths
  let paths: Path[] = [];
  if (finalStartStation && finalEndStation) {
    paths = findPaths(
      connections,
      edges,
      robustnessScores,
      finalStartStation,
      finalEndStation,
      minTransferTimeMinutes
    );
  }

  // 5. Find Fastest Route (among unbroken paths first, then scheduled if all broken)
  const unbrokenPaths = paths.filter(p => !p.isBroken);
  let fastestRoute: Path | null = null;
  if (unbrokenPaths.length > 0) {
    fastestRoute = [...unbrokenPaths].sort(
      (a, b) => a.totalEffectiveDurationMinutes - b.totalEffectiveDurationMinutes
    )[0];
  } else if (paths.length > 0) {
    fastestRoute = [...paths].sort(
      (a, b) => a.totalScheduledDurationMinutes - b.totalScheduledDurationMinutes
    )[0];
  }

  // 6. Find Safest Route (highest robustness score among unbroken paths, then overall)
  let safestRoute: Path | null = null;
  if (unbrokenPaths.length > 0) {
    safestRoute = [...unbrokenPaths].sort(
      (a, b) => b.averageRobustnessScore - a.averageRobustnessScore
    )[0];
  } else if (paths.length > 0) {
    safestRoute = [...paths].sort(
      (a, b) => b.averageRobustnessScore - a.averageRobustnessScore
    )[0];
  }

  // 7. Critical transfers count (buffer < 5 minutes)
  const criticalTransfersCount = edges.filter(
    e => e.rating === 'Critical' || e.rating === 'Impossible'
  ).length;

  return {
    connections,
    edges,
    robustnessScores,
    paths,
    fastestRoute,
    safestRoute,
    criticalTransfersCount
  };
}
