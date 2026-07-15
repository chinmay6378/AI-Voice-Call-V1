# AI Voice Call Agent — Frontend

React dashboard for the AI Voice Call Agent: place outbound calls, run bulk
call campaigns, view live/past call transcripts, manage inbound calls, and
configure all API credentials without touching a `.env` file.

For the overall project (backend + telephony setup), see the
[root README](../README.md).

## Stack

Vite + React + TypeScript, shadcn/ui, Tailwind CSS, TanStack Query.

## Local development

```bash
npm install
npm run dev
```

Opens on `http://localhost:8080` (or the next available port). The dev server
already proxies API requests to `http://localhost:8000` (see `vite.config.ts`),
so no `.env` file is needed for local development as long as the backend is
running on its default port.

## Building

```bash
npm run build
```

Outputs static files to `dist/`. In production (see the root
`docker-compose.yml`), these are served by Nginx, which also proxies API
routes to the backend container — see `nginx.conf`.

If building standalone (outside Docker) for a specific backend address, set
`VITE_API_BASE_URL` before building:
```bash
VITE_API_BASE_URL=http://your-backend-host npm run build
```

## Tests / linting

```bash
npm run test       # vitest
npm run lint       # eslint
```
