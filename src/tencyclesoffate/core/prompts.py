import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# 包级 prompts 目录：src/tencyclesoffate/prompts
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def load_prompt(filename: str) -> str:
    """从包级 prompts 目录加载提示词文本文件。"""
    try:
        return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.error(f"Prompt file not found: {filename}")
        return ""
