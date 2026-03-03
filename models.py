from sqlalchemy import Column, Integer, Float, String
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel, ConfigDict


class Base(DeclarativeBase):
    pass


class FoodEntry(Base):
    __tablename__ = "food_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, index=True)
    meal = Column(String, default="snack")
    food_name = Column(String)
    brand = Column(String, default="")
    serving_size = Column(Float, default=100)
    serving_unit = Column(String, default="g")
    servings = Column(Float, default=1)
    calories = Column(Float, default=0)
    protein = Column(Float, default=0)
    carbs = Column(Float, default=0)
    fat = Column(Float, default=0)
    fiber = Column(Float, default=0)


class Goals(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True)
    calories = Column(Float, default=2000)
    protein = Column(Float, default=150)
    carbs = Column(Float, default=200)
    fat = Column(Float, default=65)
    fiber = Column(Float, default=25)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FoodEntryCreate(BaseModel):
    date: str
    meal: str = "snack"
    food_name: str
    brand: str = ""
    serving_size: float = 100
    serving_unit: str = "g"
    servings: float = 1
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    fiber: float = 0


class FoodEntryResponse(FoodEntryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class GoalsCreate(BaseModel):
    calories: float = 2000
    protein: float = 150
    carbs: float = 200
    fat: float = 65
    fiber: float = 25


class GoalsResponse(GoalsCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
