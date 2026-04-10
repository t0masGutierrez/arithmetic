# Arithmetic webapp

Local Flask + React app for a Zetamac-style arithmetic game using `arithmetic.py` as the problem-generation logic.

## Local setup

### Backend

1. Create and activate a virtual environment:
   ```sh
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install Python dependencies:
   ```sh
   pip install -r requirements.txt
   ```
3. Run the Flask app:
   ```sh
   python app.py
   ```

The app serves on `http://127.0.0.1:8000`.

### Frontend

1. Install dependencies:
   ```sh
   cd frontend
   npm install
   ```
2. Start the Vite dev server:
   ```sh
   npm run dev
   ```
3. Build production assets for Flask:
   ```sh
   npm run build
   ```

The production build is written to `../dist`, which Flask serves.

## Notes

- Game settings and problem generation are shared with `arithmetic.py`.
- User accounts, saved results, analytics, and leaderboard data are stored locally in `webapp/data/arithmetic.db`.
- OAuth login routes exist, but Google/GitHub require local environment variables before they work.
