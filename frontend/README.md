# Finance AI: web app

The React front end for Finance AI. See the [main README](../README.md) for what the project does, screenshots, the architecture and how to run everything.

## Commands

```bash
npm install      # install dependencies
npm run dev      # start the app on http://localhost:5173
npm run build    # production build into dist/
npm run lint     # check the code with ESLint
```

The app calls the API at `http://localhost:5000` by default. To use another address, create a `.env` file in this folder:

```
VITE_API_URL=https://your-api-address
```

## Where things are

- `src/pages/`: one file per screen
- `src/components/`: shared pieces (layout, dashboard widgets, entry helpers)
- `src/utils/`: currency formatting, CSV, voice parsing, what-if maths
- `src/context/`: sign-in state and light/dark theme
- `src/api/axios.js`: the shared API client (adds the login token, sends you to sign in when it expires)