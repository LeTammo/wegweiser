# Wegweiser (Bring Me There)

A tool to plan and visualize complex train/bus journeys with a focus on transfer reliability.  
It helps you visualize connection chains in a grid-like layout, identify critical transfers.

## Features

- **Visual Journey Mapping**: View your trip as a graph where nodes are train/bus segments and edges represent transfers.
- **Topological Layout**: Automatically organizes connections by time and location to prevent overlaps and show the logical flow of the trip.
- **Robustness Analysis**: Calculates "Good", "Medium", or "Critical" ratings for transfers based on buffer times.
- **Route Optimization**: Identifies and highlights the "Fastest" and "Safest" routes.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

## Installation

To install all dependencies for both frontend and backend, run the following command from the root directory:

```bash
npm run install:all
```

## Running the Application

### Development

To run both the backend and frontend concurrently in development mode:

```bash
npm run dev
```

- **Frontend**: Accessible at [http://localhost:5173](http://localhost:5173) (Vite)
- **Backend API**: Runs on [http://localhost:3001](http://localhost:3001)

### Production

1. Build the frontend
   ```bash
   cd frontend
   npm run build
   ```
2. Serve the `dist` folder via a reverse proxy like Nginx.
3. Build and start the backend:
   ```bash
   cd backend
   npm run build
   npm start
   ```

Alternatively, if you want to fast host it without a reverse proxy:

Build and start the backend:
```bash
cd backend
npm run build
npm start
```
Build the frontend and run the preview server:
```bash
cd frontend
npm run build
npm run preview
```

## Tech Stack

- **Frontend**: React, React Flow (for graph visualization), Tailwind CSS, Lucide React (icons), Vite.
- **Backend**: Node.js, Express, SQLite (local database), TypeScript.
- **State Management**: React Hooks and LocalStorage for persistent settings.

> This project was created with the help of AI (Gemini 3.5 Flash, Claude Sonnet 4.6 and the JetBrains Junie AI Agent)