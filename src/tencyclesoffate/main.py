import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .api import auth as auth_api
from .api import game as game_api
from .api import ws as ws_api
from .core import db
from .core.config import settings
from .services import image_store, state_manager

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Application startup...")
    db.init_db()
    await state_manager.init_storage()
    await image_store.init_image_store()
    state_manager.start_auto_save_task()
    yield
    logging.info("Application shutdown...")
    await state_manager.shutdown_storage()

# --- FastAPI App Instance ---
app = FastAPI(lifespan=lifespan, title="浮生十梦")

# --- Include API Routers ---
app.include_router(auth_api.router)
app.include_router(game_api.router)
app.include_router(ws_api.router)

# --- Static Files ---
static_files_dir = Path(__file__).parent.parent / "frontend"
generated_images_dir = image_store.get_image_dir()
generated_images_dir.mkdir(parents=True, exist_ok=True)

# --- 404 Exception Handler ---
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Redirect all 404 errors to the root page."""
    return RedirectResponse(url="/")

app.mount(
    image_store.get_image_url_prefix(),
    StaticFiles(directory=generated_images_dir),
    name="generated-images",
)
app.mount("/", StaticFiles(directory=static_files_dir, html=True), name="static")

# --- Uvicorn Runner ---
def main():
    import uvicorn
    uvicorn.run(
        "tencyclesoffate.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.UVICORN_RELOAD
    )
