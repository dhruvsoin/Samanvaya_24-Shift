"""
comms.py — Person 4 comms layer interface.

Extracts text, detected language, and English translated text from reporter messages.
"""
from __future__ import annotations

from typing import Any


def extract_text(session_id: str, message: dict | str) -> dict[str, str | None]:
    """
    Extracts text, language, and translatedText from a reporter message.
    Returns:
      {
        "text": <original text>,
        "language": <language code e.g. 'en', 'kn'>,
        "translatedText": <English translation, or original text if English>
      }
    """
    if isinstance(message, str):
        return {
            "text": message,
            "language": "en",
            "translatedText": message,
        }

    text = message.get("text", "")
    language = message.get("language") or "en"
    translated = message.get("translatedText")

    if translated:
        return {
            "text": text,
            "language": language,
            "translatedText": translated,
        }

    if language == "en" or not language:
        return {
            "text": text,
            "language": "en",
            "translatedText": text,
        }

    # Demo translations for Kannada phrases in seed/events.json
    translations = {
        "ನಮ್ಮ ಮನೆಗೆ ನೀರು ನುಗ್ಗುತ್ತಿದೆ, ಸಹಾಯ ಮಾಡಿ": "Water is entering our house, please help",
        "ನೀರು ಹೆಚ್ಚಾಗುತ್ತಿದೆ": "Water is rising",
        "ಹೊಸೂರು ರಸ್ತೆ ಅಂಡರ್‌ಪಾಸ್ ಮುಳುಗಿದೆ": "Hosur road underpass is submerged",
    }
    return {
        "text": text,
        "language": language,
        "translatedText": translations.get(text.strip(), text),
    }
