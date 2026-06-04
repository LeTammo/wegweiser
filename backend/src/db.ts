import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const dbPath = path.join(__dirname, '..', 'rail_planner.db');
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign key constraints
  await db.run('PRAGMA foreign_keys = ON;');

  // Initialize tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      journey_id TEXT NOT NULL,
      train_number TEXT NOT NULL,
      type TEXT NOT NULL,
      from_station TEXT NOT NULL,
      to_station TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      delay INTEGER DEFAULT 0,
      FOREIGN KEY(journey_id) REFERENCES journeys(id) ON DELETE CASCADE
    );
  `);

  // Seed with sample data if database is empty
  const journeyCount = await db.get('SELECT COUNT(*) as count FROM journeys');
  if (journeyCount && journeyCount.count === 0) {
    const journeyId = 'sample-journey-prerow';
    await db.run('INSERT INTO journeys (id, name) VALUES (?, ?)', [
      journeyId,
      'Sommerurlaub Prerow (Leipzig → Prerow)'
    ]);

    // Use current date but sample hours
    const today = new Date().toISOString().split('T')[0];
    const makeTime = (hhmm: string) => `${today}T${hhmm}:00.000Z`;

    const sampleConnections = [
      { id: 'c1', train_number: 'ICE 1500', type: 'ICE', from_station: 'Leipzig Hbf', to_station: 'Berlin Hbf', dep: '08:00', arr: '09:15' },
      { id: 'c2', train_number: 'RE 5', type: 'RE', from_station: 'Berlin Hbf', to_station: 'Rostock Hbf', dep: '09:30', arr: '11:30' },
      { id: 'c3', train_number: 'RE 3', type: 'RE', from_station: 'Berlin Hbf', to_station: 'Stralsund Hbf', dep: '09:45', arr: '11:45' },
      { id: 'c4', train_number: 'RB 12', type: 'RB', from_station: 'Rostock Hbf', to_station: 'Darß', dep: '11:55', arr: '12:55' },
      { id: 'c5', train_number: 'RE 9', type: 'RE', from_station: 'Stralsund Hbf', to_station: 'Darß', dep: '12:05', arr: '13:05' },
      { id: 'c6', train_number: 'Bus 210', type: 'Bus', from_station: 'Darß', to_station: 'Prerow', dep: '13:20', arr: '13:50' },
      { id: 'c7', train_number: 'Bus 210', type: 'Bus', from_station: 'Darß', to_station: 'Prerow', dep: '14:00', arr: '14:30' }
    ];

    for (const sc of sampleConnections) {
      await db.run(
        `INSERT INTO connections (id, journey_id, train_number, type, from_station, to_station, departure_time, arrival_time, delay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [sc.id, journeyId, sc.train_number, sc.type, sc.from_station, sc.to_station, makeTime(sc.dep), makeTime(sc.arr)]
      );
    }
  }

  return db;
}
