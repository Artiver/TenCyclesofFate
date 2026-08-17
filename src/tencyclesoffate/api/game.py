from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from ..services import game_logic, state_manager
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


@router.post("/game/save")
async def save_game(
    current_user: Annotated[dict, Depends(get_current_active_user)],
):
    """
    Saves the current session to the player's single save slot.
    Saving again overwrites the existing save.
    """
    player_id = current_user["username"]
    session = await state_manager.get_session(player_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前没有可存档的会话",
        )
    if session.get("is_processing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="正在处理中，暂无法存档",
        )
    return await state_manager.save_game_snapshot(player_id, session)


@router.get("/game/save")
async def get_save(
    current_user: Annotated[dict, Depends(get_current_active_user)],
):
    """Returns whether the player has a save and its metadata."""
    player_id = current_user["username"]
    return await state_manager.get_save_info(player_id)


@router.post("/game/load")
async def load_game(
    current_user: Annotated[dict, Depends(get_current_active_user)],
):
    """
    Restores the current session from the player's save, overwriting current progress.
    """
    player_id = current_user["username"]
    session = await state_manager.get_session(player_id)
    if session and session.get("is_processing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="正在处理中，暂无法读档",
        )
    restored = await state_manager.load_game_snapshot(player_id)
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂无存档",
        )
    return restored
