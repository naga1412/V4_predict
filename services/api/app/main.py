from fastapi import FastAPI

app = FastAPI(title="V.4 API", version="0.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
