from typing import Annotated

from fastapi import APIRouter, Depends

from ..services import game_logic
from .deps import get_current_active_user

router = APIRouter(prefix="/api")


@router.post("/game/init")
async def init_game(
    current_user: Annotated[dict, Depends(get_current_active_user)],
):
    """
    Initializes or retrieves the daily game session for the player.
    This does NOT start a trial, it just ensures the session for the day exists.
    """
    game_state = await game_logic.get_or_create_daily_session(current_user)
    return game_state
