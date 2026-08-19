import base64
import hashlib
import logging
import re
import time
from pathlib import Path

from ..core.config import settings

logger = logging.getLogger(__name__)

_DATA_IMAGE_RE = re.compile(r"^data:image/(?P<ext>[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)
_EXTENSION_MAP = {
    "jpeg": "jpg",
    "jpg": "jpg",
    "png": "png",
    "webp": "webp",
    "gif": "gif",
}
_ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_last_cleanup_at = 0.0


def get_image_dir() -> Path:
    return Path(settings.GENERATED_IMAGE_DIR)


def get_image_url_prefix() -> str:
    prefix = settings.GENERATED_IMAGE_URL_PREFIX.strip() or "/generated-images"
    if not prefix.startswith("/"):
        prefix = f"/{prefix}"
    return prefix.rstrip("/")


async def init_image_store() -> None:
    get_image_dir().mkdir(parents=True, exist_ok=True)
    await cleanup_old_images(force=True)


async def store_generated_image(image_ref: str, player_id: str | None = None) -> str:
    """
    Persist generated data-URL images and return a browser-loadable URL.

    Existing HTTP(S), absolute, or relative image URLs are returned unchanged so
    older providers can keep returning links without an extra download step.
    """
    if not image_ref or not image_ref.startswith("data:image/"):
        return image_ref

    match = _DATA_IMAGE_RE.match(image_ref)
    if not match:
        logger.warning("Generated image data URL had an unsupported format.")
        return image_ref

    ext = _EXTENSION_MAP.get(match.group("ext").lower())
    if not ext:
        logger.warning("Generated image type is not allowed: %s", match.group("ext"))
        return image_ref

    try:
        image_bytes = base64.b64decode(match.group("data"), validate=True)
    except ValueError:
        logger.warning("Generated image data URL contained invalid base64.")
        return image_ref

    digest = hashlib.sha256(image_bytes).hexdigest()[:24]
    timestamp = int(time.time())
    safe_player = _safe_path_part(player_id or "anonymous")
    filename = f"{timestamp}-{safe_player}-{digest}.{ext}"
    image_dir = get_image_dir()
    image_dir.mkdir(parents=True, exist_ok=True)
    image_path = image_dir / filename

    if not image_path.exists():
        image_path.write_bytes(image_bytes)

    await cleanup_old_images()
    return f"{get_image_url_prefix()}/{filename}"


async def cleanup_old_images(force: bool = False) -> int:
    global _last_cleanup_at

    now = time.time()
    interval = max(1, int(settings.GENERATED_IMAGE_CLEANUP_INTERVAL_SECONDS))
    if not force and now - _last_cleanup_at < interval:
        return 0
    _last_cleanup_at = now

    retention = max(0, int(settings.GENERATED_IMAGE_RETENTION_SECONDS))
    cutoff = now - retention
    image_dir = get_image_dir()
    if not image_dir.exists():
        return 0

    removed = 0
    for path in image_dir.iterdir():
        if not path.is_file() or path.suffix.lower() not in _ALLOWED_SUFFIXES:
            continue
        try:
            stat = path.stat()
            if stat.st_mtime < cutoff:
                path.unlink()
                removed += 1
        except OSError as e:
            logger.warning("Failed to remove old generated image %s: %s", path, e)

    if removed:
        logger.info("Removed %s expired generated images.", removed)
    return removed


def _safe_path_part(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", value)[:40].strip("._-")
    return safe or "anonymous"


def delete_player_images(player_id: str) -> int:
    """
    Deletes generated scene images belonging to a player.
    Filenames follow the pattern '{timestamp}-{safe_player}-{digest}.{ext}'.
    Returns the number of images removed.
    """
    if not player_id:
        return 0
    safe_player = _safe_path_part(player_id)
    prefix = f"-{safe_player}-"
    image_dir = get_image_dir()
    if not image_dir.exists():
        return 0

    removed = 0
    for path in image_dir.iterdir():
        if not path.is_file() or path.suffix.lower() not in _ALLOWED_SUFFIXES:
            continue
        if prefix in path.name:
            try:
                path.unlink()
                removed += 1
            except OSError as e:
                logger.warning("Failed to remove image %s: %s", path, e)

    if removed:
        logger.info("Removed %s generated images for player '%s'.", removed, player_id)
    return removed
