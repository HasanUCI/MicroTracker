import os
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import httpx

from database import get_db, engine
import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="MacroTracker")

# Use your own key from https://api.data.gov/signup/ for higher rate limits.
# DEMO_KEY allows 40 requests/hour and 2,000/day.
USDA_API_KEY = os.getenv("USDA_API_KEY", "DEMO_KEY")
USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1"

# Standard FDC nutrient IDs
NUTRIENT_IDS = {
    "calories": [1008],        # Energy (kcal)
    "protein":  [1003],        # Protein
    "carbs":    [1005],        # Carbohydrate, by difference
    "fat":      [1004],        # Total lipid (fat)
    "fiber":    [1079],        # Fiber, total dietary
}


def extract_nutrient(nutrients: list, fdc_ids: list[int]) -> float:
    for n in nutrients:
        if n.get("nutrientId") in fdc_ids:
            return round(float(n.get("value") or 0), 1)
    return 0.0


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/search")
async def search_foods(q: str, page_size: int = 20):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{USDA_BASE_URL}/foods/search",
            params={
                "query": q,
                "pageSize": page_size,
                "api_key": USDA_API_KEY,
                "dataType": "Branded,Foundation,SR Legacy",
            },
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Rate limit reached. Try again in an hour or set a free USDA_API_KEY.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Nutrition API unavailable")

    foods = []
    for food in resp.json().get("foods", []):
        nutrients = food.get("foodNutrients", [])
        foods.append({
            "fdcId": food.get("fdcId"),
            "description": food.get("description", ""),
            "brandOwner": food.get("brandOwner") or food.get("brandName") or "",
            "servingSize": food.get("servingSize") or 100,
            "servingSizeUnit": (food.get("servingSizeUnit") or "g").lower(),
            "calories": extract_nutrient(nutrients, NUTRIENT_IDS["calories"]),
            "protein":  extract_nutrient(nutrients, NUTRIENT_IDS["protein"]),
            "carbs":    extract_nutrient(nutrients, NUTRIENT_IDS["carbs"]),
            "fat":      extract_nutrient(nutrients, NUTRIENT_IDS["fat"]),
            "fiber":    extract_nutrient(nutrients, NUTRIENT_IDS["fiber"]),
        })
    return foods


@app.get("/api/barcode/{barcode}")
async def lookup_barcode(barcode: str):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://world.openfoodfacts.org/api/v2/product/{barcode}",
            headers={"User-Agent": "MacroTracker/1.0"},
        )
    if resp.status_code != 200 or resp.json().get("status") != 1:
        raise HTTPException(status_code=404, detail="Product not found in Open Food Facts")

    product = resp.json().get("product", {})
    n = product.get("nutriments", {})
    serving_qty = float(product.get("serving_quantity") or 100)

    def get_nutr(key: str) -> float:
        # Prefer per-serving values; fall back to per-100g
        val = n.get(f"{key}_serving") or n.get(f"{key}_100g") or 0
        return round(float(val), 1)

    return {
        "fdcId": barcode,
        "description": product.get("product_name") or product.get("product_name_en") or "Unknown Product",
        "brandOwner": product.get("brands") or "",
        "servingSize": serving_qty,
        "servingSizeUnit": "g",
        "calories": get_nutr("energy-kcal"),
        "protein":  get_nutr("proteins"),
        "carbs":    get_nutr("carbohydrates"),
        "fat":      get_nutr("fat"),
        "fiber":    get_nutr("fiber"),
    }


@app.get("/api/log/{log_date}", response_model=list[models.FoodEntryResponse])
async def get_log(log_date: str, db: Session = Depends(get_db)):
    return (
        db.query(models.FoodEntry)
        .filter(models.FoodEntry.date == log_date)
        .order_by(models.FoodEntry.id)
        .all()
    )


@app.post("/api/log", response_model=models.FoodEntryResponse)
async def add_to_log(entry: models.FoodEntryCreate, db: Session = Depends(get_db)):
    db_entry = models.FoodEntry(**entry.model_dump())
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@app.delete("/api/log/{entry_id}")
async def delete_from_log(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.FoodEntry).filter(models.FoodEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"ok": True}


@app.get("/api/goals", response_model=models.GoalsResponse)
async def get_goals(db: Session = Depends(get_db)):
    goals = db.query(models.Goals).first()
    if not goals:
        goals = models.Goals()
        db.add(goals)
        db.commit()
        db.refresh(goals)
    return goals


@app.put("/api/goals", response_model=models.GoalsResponse)
async def update_goals(goals_data: models.GoalsCreate, db: Session = Depends(get_db)):
    goals = db.query(models.Goals).first()
    if not goals:
        goals = models.Goals(**goals_data.model_dump())
        db.add(goals)
    else:
        for k, v in goals_data.model_dump().items():
            setattr(goals, k, v)
    db.commit()
    db.refresh(goals)
    return goals


@app.get("/api/history")
async def get_history(db: Session = Depends(get_db)):
    rows = (
        db.query(
            models.FoodEntry.date,
            func.sum(models.FoodEntry.calories).label("calories"),
            func.sum(models.FoodEntry.protein).label("protein"),
            func.sum(models.FoodEntry.carbs).label("carbs"),
            func.sum(models.FoodEntry.fat).label("fat"),
            func.count(models.FoodEntry.id).label("entries"),
        )
        .group_by(models.FoodEntry.date)
        .order_by(models.FoodEntry.date.desc())
        .limit(60)
        .all()
    )
    return [
        {
            "date": r.date,
            "calories": round(float(r.calories or 0)),
            "protein":  round(float(r.protein  or 0), 1),
            "carbs":    round(float(r.carbs    or 0), 1),
            "fat":      round(float(r.fat      or 0), 1),
            "entries":  r.entries,
        }
        for r in rows
    ]


app.mount("/static", StaticFiles(directory="static"), name="static")
