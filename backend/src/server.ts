import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { analyzeJourney, computeEdges, hasCycle } from './engine';
import { Connection } from './types';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// GET /api/journeys - List all journeys
app.get('/api/journeys', async (req, res) => {
  try {
    const db = await getDb();
    const journeys = await db.all('SELECT * FROM journeys ORDER BY created_at DESC');
    res.json(journeys);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/journeys - Create a new journey
app.post('/api/journeys', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Journey name is required' });
  }

  try {
    const db = await getDb();
    const id = uuidv4();
    await db.run('INSERT INTO journeys (id, name) VALUES (?, ?)', [id, name]);
    res.status(201).json({ id, name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/journeys/:id - Get journey and its analyzed graph
app.get('/api/journeys/:id', async (req, res) => {
  const { id } = req.params;
  const { startStation, endStation } = req.query;

  try {
    const db = await getDb();
    const journey = await db.get('SELECT * FROM journeys WHERE id = ?', [id]);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    const connections = (await db.all('SELECT * FROM connections WHERE journey_id = ?', [id])) as Connection[];
    
    // Analyze the journey
    const analysis = analyzeJourney(
      connections,
      startStation as string | undefined,
      endStation as string | undefined
    );

    res.json({
      journey,
      analysis
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/journeys/:id - Rename journey
app.put('/api/journeys/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Journey name is required' });
  }

  try {
    const db = await getDb();
    const result = await db.run('UPDATE journeys SET name = ? WHERE id = ?', [name, id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Journey not found' });
    }
    res.json({ id, name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/journeys/:id - Delete journey
app.delete('/api/journeys/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM journeys WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Journey not found' });
    }
    res.json({ message: 'Journey deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/journeys/:id/connections - Add connection (includes cycle check)
app.post('/api/journeys/:id/connections', async (req, res) => {
  const { id: journeyId } = req.params;
  const { trainNumber, type, fromStation, toStation, departureTime, arrivalTime } = req.body;

  // Basic validation
  if (!trainNumber || !type || !fromStation || !toStation || !departureTime || !arrivalTime) {
    return res.status(400).json({ error: 'All connection fields are required.' });
  }

  const depDate = new Date(departureTime);
  const arrDate = new Date(arrivalTime);

  if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
    return res.status(400).json({ error: 'Invalid dates provided.' });
  }

  if (arrDate.getTime() <= depDate.getTime()) {
    return res.status(400).json({ error: 'Arrival time must be after departure time.' });
  }

  try {
    const db = await getDb();
    const journey = await db.get('SELECT * FROM journeys WHERE id = ?', [journeyId]);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    const currentConns = (await db.all('SELECT * FROM connections WHERE journey_id = ?', [journeyId])) as Connection[];

    // Build proposed connection object
    const newConn: Connection = {
      id: uuidv4(),
      journey_id: journeyId,
      train_number: trainNumber,
      type,
      from_station: fromStation,
      to_station: toStation,
      departure_time: new Date(departureTime).toISOString(),
      arrival_time: new Date(arrivalTime).toISOString(),
      delay: 0
    };

    const combinedConns = [...currentConns, newConn];
    const computedEdges = computeEdges(combinedConns);

    // Cycle detection
    if (hasCycle(combinedConns, computedEdges)) {
      return res.status(400).json({
        error: 'Adding this connection would create a cycle (infinite loop) in the journey graph. Connections must flow forward in time and space.'
      });
    }

    // Insert connection
    await db.run(
      `INSERT INTO connections (id, journey_id, train_number, type, from_station, to_station, departure_time, arrival_time, delay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newConn.id,
        newConn.journey_id,
        newConn.train_number,
        newConn.type,
        newConn.from_station,
        newConn.to_station,
        newConn.departure_time,
        newConn.arrival_time,
        newConn.delay
      ]
    );

    // Return the full updated analysis
    const updatedConns = [...currentConns, newConn];
    const analysis = analyzeJourney(updatedConns);

    res.status(201).json({ connection: newConn, analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/journeys/:id/connections/:connId - Update connection (includes cycle check)
app.put('/api/journeys/:id/connections/:connId', async (req, res) => {
  const { id: journeyId, connId } = req.params;
  const { trainNumber, type, fromStation, toStation, departureTime, arrivalTime } = req.body;

  if (!trainNumber || !type || !fromStation || !toStation || !departureTime || !arrivalTime) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const depDate = new Date(departureTime);
  const arrDate = new Date(arrivalTime);

  if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
    return res.status(400).json({ error: 'Invalid dates provided.' });
  }

  if (arrDate.getTime() <= depDate.getTime()) {
    return res.status(400).json({ error: 'Arrival time must be after departure time.' });
  }

  try {
    const db = await getDb();
    const currentConns = (await db.all('SELECT * FROM connections WHERE journey_id = ?', [journeyId])) as Connection[];
    
    const existingConn = currentConns.find(c => c.id === connId);
    if (!existingConn) {
      return res.status(404).json({ error: 'Connection not found.' });
    }

    // Build the updated connection
    const updatedConn: Connection = {
      ...existingConn,
      train_number: trainNumber,
      type,
      from_station: fromStation,
      to_station: toStation,
      departure_time: new Date(departureTime).toISOString(),
      arrival_time: new Date(arrivalTime).toISOString()
    };

    const combinedConns = currentConns.map(c => (c.id === connId ? updatedConn : c));
    const computedEdges = computeEdges(combinedConns);

    // Cycle detection
    if (hasCycle(combinedConns, computedEdges)) {
      return res.status(400).json({
        error: 'Updating this connection would create a cycle (infinite loop) in the journey graph. Connections must flow forward in time and space.'
      });
    }

    // Update connection in database
    await db.run(
      `UPDATE connections 
       SET train_number = ?, type = ?, from_station = ?, to_station = ?, departure_time = ?, arrival_time = ?
       WHERE id = ?`,
      [
        updatedConn.train_number,
        updatedConn.type,
        updatedConn.from_station,
        updatedConn.to_station,
        updatedConn.departure_time,
        updatedConn.arrival_time,
        connId
      ]
    );

    const analysis = analyzeJourney(combinedConns);
    res.json({ connection: updatedConn, analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/journeys/:id/connections/:connId - Delete connection
app.delete('/api/journeys/:id/connections/:connId', async (req, res) => {
  const { id: journeyId, connId } = req.params;

  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM connections WHERE id = ? AND journey_id = ?', [connId, journeyId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Connection not found.' });
    }

    const remainingConns = (await db.all('SELECT * FROM connections WHERE journey_id = ?', [journeyId])) as Connection[];
    const analysis = analyzeJourney(remainingConns);

    res.json({ message: 'Connection deleted successfully', analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/journeys/:id/connections/:connId/delay - Simulate delay
app.post('/api/journeys/:id/connections/:connId/delay', async (req, res) => {
  const { id: journeyId, connId } = req.params;
  const { delay } = req.body;

  if (delay === undefined || typeof delay !== 'number' || delay < 0) {
    return res.status(400).json({ error: 'Delay must be a non-negative number of minutes.' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'UPDATE connections SET delay = ? WHERE id = ? AND journey_id = ?',
      [delay, connId, journeyId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Connection not found.' });
    }

    const connections = (await db.all('SELECT * FROM connections WHERE journey_id = ?', [journeyId])) as Connection[];
    const analysis = analyzeJourney(connections);

    res.json({ message: 'Delay updated successfully', analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Wegweiser backend is listening at http://localhost:${PORT}`);
});
