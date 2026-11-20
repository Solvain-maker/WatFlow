# Daily Leak & Waste Watch

An Arabic-first prototype for monitoring simulated water and electricity use in a small Moroccan business.

## Run locally

Open two terminals in the project folder:

```sh
npm run server
```

```sh
npm run dev
```

Vite forwards `/api` requests to the Express server on port 3001. SQLite initializes the demo business, equipment, tariff settings, and seven days of sample consumption on the first server start.

## Demo access

- Email: `demo@dlww.ma`
- Password: `Demo123!`

The current prototype persists equipment, settings, simulation readings, and alert status through the API. Sensor readings and scenarios are simulated; no physical devices are connected.
