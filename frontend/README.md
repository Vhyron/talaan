# Talaan frontend

React + Vite + TypeScript + Tailwind. Fonts are bundled (no CDNs) so the app works offline.

```bash
npm ci                 # clean install from package-lock.json
npm run dev            # http://localhost:5173, proxies /api to the backend
```

The backend defaults to `http://localhost:8000`; override with `API_TARGET=http://localhost:8011 npm run dev`.

API types in `src/api/types.ts` mirror `backend/app/schemas.py`.
