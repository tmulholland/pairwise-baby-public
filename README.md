# Pairwise Baby Public

A public baby-shower game built from the original family-only pairwise baby-name app.

## What It Does

- Stores a shared pool of candidate names.
- Uses URL-based players such as `/guest`, `/team-a`, and `/team-b`.
- Tracks separate pairwise-comparison histories and Elo-style rankings for each user.
- Shows each person their own ranking on their personal page.
- Keeps cross-user standings on a separate `/results` page so they do not bias the main comparison flow.

## Tech Stack

- Node.js
- Express
- SQLite via `better-sqlite3`
- Plain HTML, CSS, and JavaScript

## Run Locally

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm start`
3. Open:
   `http://localhost:3000/`

## Routes

- `/start`: asks for the player's name and sends them to their page
- `/guest` or `/:userSlug`: comparison page for one player
- `/results`: rankings across all users
- `/api/state/:userSlug`: app state for one user
- `/api/results`: rankings for all users

## Data Storage

The app stores persistent data in a local SQLite database named `baby-names.db`.

Tables:

- `users`: URL-based user slugs
- `names`: shared name pool
- `ratings`: current Elo-style scores per user and name
- `comparisons`: comparison history per user

## Notes

- Unknown player URLs are created the first time you visit or open them.
- The database file is intentionally ignored by git.
- The app can be exposed publicly with a tunnel such as ngrok.
