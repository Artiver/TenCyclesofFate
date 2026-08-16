from fastapi import APIRouter, HTTPException, status, WebSocket, WebSocketDisconnect

from ..services import game_logic, state_manager
from ..services.websocket_manager import manager as websocket_manager
from .deps import decode_access_token, get_current_user

router = APIRouter(prefix="/api")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handles WebSocket connections for real-time game state updates."""
    token = websocket.cookies.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return
    try:
        payload = decode_access_token(token)
        username: str | None = payload.get("sub")
        if username is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token payload")
            return
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token validation failed")
        return

    await websocket_manager.connect(websocket, username)

    try:
        user_info = await get_current_user(token)
        session = await state_manager.get_session(user_info["username"])
        if session:
            await websocket_manager.send_json_to_player(
                user_info["username"], {"type": "full_state", "data": session}
            )

        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action:
                await game_logic.process_player_action(user_info, action)

    except WebSocketDisconnect:
        websocket_manager.disconnect(username)
