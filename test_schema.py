import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DB_URL = "postgresql+asyncpg://postgres:hamoz123@localhost:5432/intelliwheels_db"
engine = create_async_engine(DB_URL, echo=False)

async def test():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public';"))
        tables = [r[0] for r in result]
        print("✅ Tables in IntelliWheels DB:", tables)

asyncio.run(test())
