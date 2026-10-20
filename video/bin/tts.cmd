@echo off
rem Cloud TTS one-liner: tts say "text" out.wav [--engine gemini] [--voice Kore]
python "%~dp0..\gtts.py" %*
