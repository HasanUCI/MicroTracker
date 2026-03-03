# MacroTracker

A food-tracking web app that logs what you eat and shows real-time macro information.

## Features

- **Search foods** from the USDA FoodData Central database (600k+ items)
- **Barcode scanner** — point your camera at any packaged product
- **Daily macro rings** — calories, protein, carbs, fat, fiber vs your goals
- **Meal grouping** — breakfast, lunch, dinner, snacks
- **Date navigation** — browse and log any past day
- **History** — last 60 days at a glance
- **Custom goals** — set your own daily targets

## Quick Start

```bash
# 1. Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the app
uvicorn main:app --reload

# 4. Open in your browser
open http://localhost:8000
```

## Optional: Higher USDA API Rate Limits

The app uses USDA's free `DEMO_KEY` by default (40 requests/hour).
For unlimited searches, get a free API key at https://api.data.gov/signup/ and set:

```bash
export USDA_API_KEY=your_key_here
uvicorn main:app --reload
```

## Data

All your food logs and goals are stored in `macros.db` (SQLite) — no cloud, no accounts.

## Project Structure

```
MacroTracker/
├── main.py          # FastAPI app + all API routes
├── models.py        # SQLAlchemy models + Pydantic schemas
├── database.py      # SQLite connection
├── requirements.txt
└── static/
    ├── index.html   # Single-page app shell
    ├── style.css    # All styles
    └── app.js       # All frontend logic
```
# MicroTracker
