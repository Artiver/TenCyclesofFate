from typing import Annotated

from fastapi import Depends, HTTPException, status, Cookie
from jose import JWTError, jwt

from ..core.config import settings


def decode_access_token(token: str):
    """Decodes the access token and returns the payload."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise credentials_exception


async def get_current_user(token: Annotated[str | None, Cookie()] = None):
    """
    Decodes JWT from cookie and returns user info.
    Raises HTTP 401 if token is missing, invalid, or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str | None = payload.get("sub")
        user_id: int | None = payload.get("user_id")
        if username is None or user_id is None:
            raise credentials_exception

        user = {
            "username": username,
            "user_id": user_id,
        }
    except JWTError:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[dict, Depends(get_current_user)]
):
    # In a real app, you might check if the user is active
    return current_user
