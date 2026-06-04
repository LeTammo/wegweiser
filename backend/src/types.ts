export interface Connection {
  id: string;
  journey_id: string;
  train_number: string;
  type: string;
  from_station: string;
  to_station: string;
  departure_time: string; // ISO 8601 string
  arrival_time: string;   // ISO 8601 string
  delay: number;          // simulated delay in minutes
}

export interface AutoEdge {
  fromConnectionId: string;
  toConnectionId: string;
  transferMinutes: number;          // scheduled transfer time in minutes
  effectiveTransferMinutes: number; // simulated transfer time in minutes (scheduled - delay)
  alternativeCount: number;
  rating: 'Good' | 'Medium' | 'Critical' | 'Impossible';
}

export interface Path {
  connections: Connection[];
  totalScheduledDurationMinutes: number;
  totalEffectiveDurationMinutes: number;
  averageRobustnessScore: number;
  isBroken: boolean;
  brokenAtConnectionId?: string;
  departureTime: string;
  arrivalTime: string;
  effectiveArrivalTime: string;
}

export interface JourneyAnalysis {
  connections: Connection[];
  edges: AutoEdge[];
  robustnessScores: Record<string, number>; // maps connection ID to score 0-100
  paths: Path[];
  fastestRoute: Path | null;
  safestRoute: Path | null;
  criticalTransfersCount: number;
}
