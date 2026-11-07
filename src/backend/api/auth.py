import re
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse

from ..core.config import settings
from ..core.security import create_access_token
from ..schemas.auth import LoginRequest, RegisterRequest
from ..services import game_logic, state_manager, users
from .deps import get_current_active_user

router = APIRouter(prefix="/api")


def _set_auth_cookie(response, username: str, user_id: int):
    """Creates a JWT and sets it as an HttpOnly cookie."""
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_payload = {
        "sub": username,
        "user_id": user_id,
    }
    access_token = create_access_token(
        data=jwt_payload, expires_delta=access_token_expires
    )
    response.set_cookie(
        "token",
        value=access_token,
        httponly=True,
        max_age=int(access_token_expires.total_seconds()),
        samesite="lax",
    )


@router.post("/register")
async def register(request: RegisterRequest):
    """
    Registers a new user, sets the auth cookie, and returns the user info.
    """
    username = request.username.strip()
    password = request.password

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名和密码不能为空",
        )
    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名只能包含字母、数字和下划线",
        )

    # Check if username already exists
    existing = users.get_user_by_username(username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已被注册",
        )

    user = users.create_user(username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="注册失败，请稍后重试",
        )

    response = JSONResponse(content={"username": user["username"], "user_id": user["id"]})
    _set_auth_cookie(response, user["username"], user["id"])
    return response


@router.post("/login")
async def login(request: LoginRequest):
    """
    Authenticates a user and sets the auth cookie.
    """
    username = request.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名只能包含字母、数字和下划线",
        )
    user = users.authenticate_user(username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    response = JSONResponse(content={"username": user["username"], "user_id": user["id"]})
    _set_auth_cookie(response, user["username"], user["id"])
    return response


@router.post("/logout")
async def logout():
    """
    Logs the user out by clearing the authentication cookie.
    """
    response = RedirectResponse(url="/")
    response.delete_cookie("token")
    return response


@router.delete("/account")
async def delete_account(
    current_user: Annotated[dict, Depends(get_current_active_user)],
):
    """
    Permanently deletes the current account and all its data
    (session, save, generated images, redemption codes).
    """
    player_id = current_user["username"]
    user_id = current_user["user_id"]

    # 处理中（AI 正在生成回复）时禁止注销，避免后台任务把数据写回
    session = await state_manager.get_session(player_id)
    if session and session.get("is_processing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="正在处理中，暂无法注销",
        )

    # 取消待执行的图片生成任务
    game_logic.cancel_pending_image_tasks(player_id)

    # 删除文件数据（会话、存档、图片、索引、连接）
    await state_manager.delete_player_data(player_id)

    # 删除数据库记录（用户及兑换码）
    if not users.delete_user(user_id):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="注销失败，请稍后重试",
        )

    response = JSONResponse(content={"deleted": True})
    response.delete_cookie("token")
    return response
