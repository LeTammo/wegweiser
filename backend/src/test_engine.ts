import { Connection } from './types';
import { computeEdges, hasCycle, analyzeJourney } from './engine';

console.log('--- Testing Wegweiser Routing Engine ---');

const baseTime = new Date('2026-06-04T08:00:00Z');

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

// Connections data mimicking the example:
// Leipzig -> Berlin
// Berlin -> Rostock OR Berlin -> Stralsund
// Rostock -> Darß, Stralsund -> Darß
// Darß -> Prerow (Bus)
const connections: Connection[] = [
  {
    id: 'conn1',
    journey_id: 'j1',
    train_number: 'ICE 500',
    type: 'ICE',
    from_station: 'Leipzig Hbf',
    to_station: 'Berlin Hbf',
    departure_time: addMinutes(baseTime, 0),    // 08:00
    arrival_time: addMinutes(baseTime, 75),     // 09:15
    delay: 0
  },
  {
    id: 'conn2',
    journey_id: 'j1',
    train_number: 'RE 5',
    type: 'RE',
    from_station: 'Berlin Hbf',
    to_station: 'Rostock Hbf',
    departure_time: addMinutes(baseTime, 90),   // 09:30 (Puffer: 15 min)
    arrival_time: addMinutes(baseTime, 210),    // 11:30
    delay: 0
  },
  {
    id: 'conn3',
    journey_id: 'j1',
    train_number: 'RE 3',
    type: 'RE',
    from_station: 'Berlin Hbf',
    to_station: 'Stralsund Hbf',
    departure_time: addMinutes(baseTime, 100),  // 09:40 (Puffer: 25 min)
    arrival_time: addMinutes(baseTime, 220),    // 11:40
    delay: 0
  },
  {
    id: 'conn4',
    journey_id: 'j1',
    train_number: 'RB 12',
    type: 'RB',
    from_station: 'Rostock Hbf',
    to_station: 'Darß',
    departure_time: addMinutes(baseTime, 220),  // 11:40 (Puffer: 10 min)
    arrival_time: addMinutes(baseTime, 280),    // 12:40
    delay: 0
  },
  {
    id: 'conn5',
    journey_id: 'j1',
    train_number: 'Bus 210',
    type: 'Bus',
    from_station: 'Darß',
    to_station: 'Prerow',
    departure_time: addMinutes(baseTime, 300),  // 13:00 (Puffer: 20 min)
    arrival_time: addMinutes(baseTime, 330),    // 13:30
    delay: 0
  }
];

// Test 1: Edge Generation
console.log('\nTest 1: Edge Generation');
const edges = computeEdges(connections);
console.log(`Generated ${edges.length} edges.`);
edges.forEach(e => {
  console.log(`- Edge: ${e.fromConnectionId} -> ${e.toConnectionId} (Puffer: ${e.transferMinutes} mins, Rating: ${e.rating})`);
});

// Test 2: Cycle Detection
console.log('\nTest 2: Cycle Detection');
const isCyclic = hasCycle(connections, edges);
console.log(`Is cyclic? ${isCyclic} (Expected: false)`);

// Create a cyclic dependency with zero-duration connections
const cyclicConn1: Connection = {
  id: 'conn_cycle1',
  journey_id: 'j1',
  train_number: 'ICE 888',
  type: 'ICE',
  from_station: 'Berlin Hbf',
  to_station: 'Leipzig Hbf',
  departure_time: addMinutes(baseTime, 80),
  arrival_time: addMinutes(baseTime, 80), // 0-minute duration
  delay: 0
};
const cyclicConn2: Connection = {
  id: 'conn_cycle2',
  journey_id: 'j1',
  train_number: 'ICE 999',
  type: 'ICE',
  from_station: 'Leipzig Hbf',
  to_station: 'Berlin Hbf',
  departure_time: addMinutes(baseTime, 80),
  arrival_time: addMinutes(baseTime, 80), // 0-minute duration
  delay: 0
};

const cyclicList = [cyclicConn1, cyclicConn2];
const cyclicEdges = computeEdges(cyclicList);
const detectCycle = hasCycle(cyclicList, cyclicEdges);
console.log(`Created cycle (Berlin Hbf -> Leipzig Hbf -> Berlin Hbf). Detect cycle? ${detectCycle} (Expected: true)`);

// Test 3: Path Finding and Analysis
console.log('\nTest 3: Path Analysis (Leipzig Hbf -> Prerow)');
const analysis = analyzeJourney(connections, 'Leipzig Hbf', 'Prerow');
console.log(`Total paths found: ${analysis.paths.length}`);
analysis.paths.forEach((p, idx) => {
  const route = p.connections.map(c => `${c.type} ${c.train_number} (${c.from_station} -> ${c.to_station})`).join(' => ');
  console.log(`Path ${idx + 1}: ${route}`);
  console.log(`  Duration: ${p.totalScheduledDurationMinutes} mins`);
  console.log(`  Average Robustness: ${p.averageRobustnessScore}/100`);
});

console.log(`\nFastest Route: ${analysis.fastestRoute?.connections.map(c => c.train_number).join(' -> ')}`);
console.log(`Safest Route: ${analysis.safestRoute?.connections.map(c => c.train_number).join(' -> ')}`);

// Test 4: Delay simulation
console.log('\nTest 4: Simulating 20 minutes delay on ICE 500 (Leipzig -> Berlin)');
connections[0].delay = 20; // Actual arrival becomes 09:15 + 20 = 09:35. RE 5 departs 09:30 (buffer -5 mins, impossible).
const simulatedAnalysis = analyzeJourney(connections, 'Leipzig Hbf', 'Prerow');
console.log(`Paths status after delay:`);
simulatedAnalysis.paths.forEach((p, idx) => {
  console.log(`Path ${idx + 1} broken? ${p.isBroken} (Broken at connection ID: ${p.brokenAtConnectionId})`);
});
console.log(`Unbroken paths: ${simulatedAnalysis.paths.filter(p => !p.isBroken).length}`);
console.log('--- Testing Complete ---');
