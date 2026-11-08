import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
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
# 只对外提供构建产物：src/frontend 是源码目录，直接挂载会暴露 index.html（开发模板）与 src/**。
# 目录不存在时 StaticFiles 会在启动阶段直接报错，提示先执行 `cd src/frontend && pnpm build`。
static_files_dir = Path(__file__).parent.parent / "frontend" / "dist"
generated_images_dir = image_store.get_image_dir()
generated_images_dir.mkdir(parents=True, exist_ok=True)

# --- 404 Exception Handler ---
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """API 路径返回 JSON 404；其余路径仍回落到首页（前端用 hash 路由）。"""
    path = request.url.path
    if path == "/api" or path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "接口不存在"})
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
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.UVICORN_RELOAD
    )
