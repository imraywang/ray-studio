#!/usr/bin/env python3
"""主题直出的配音：整篇稿子一次读完（逐句生成情绪不对），转写成逐字时间。

usage: python3 voice.py <工程目录> <稿子.txt> --voice <音色名> [--speed 1.0]
产出 assets/footage/voice.wav、words.json。音色表在 ~/.config/ray-studio/voices.json，
目前只接 MiniMax 音色（按字数收费）。念法规则：数字、字母混写先改成读法再送进来。
"""
import argparse, json, os, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("script")
ap.add_argument("--voice", required=True, help="音色表里的名字")
ap.add_argument("--speed", type=float, default=1.0)
ap.add_argument("--redo", action="store_true", help="重新配音。默认已有 voice.wav 就只重新转写，不再花钱")
a = ap.parse_args()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import minimax_api

VOICES = os.path.expanduser("~/.config/ray-studio/voices.json")
if not os.path.exists(VOICES):
    sys.exit(f"没有音色表 {VOICES}，格式见 README 的「配音」")
voices = json.load(open(VOICES))
if a.voice not in voices:
    sys.exit(f"音色表里没有 {a.voice}，现有：{'、'.join(voices) or '空'}")
v = voices[a.voice]
if v.get("provider") != "minimax":
    sys.exit(f"voice.py 目前只接 MiniMax 音色，{a.voice} 是 {v.get('provider')}")
root = os.path.abspath(a.project)
ft = f"{root}/assets/footage"
os.makedirs(ft, exist_ok=True)
text = open(a.script, encoding="utf-8").read().strip()
wav = f"{ft}/voice.wav"
if a.redo or not os.path.exists(wav):
    print(f"{len(text)} 字，音色 {a.voice}", flush=True)
    audio, _ = minimax_api.tts(text, v["voice_id"], model=v.get("model", "speech-2.8-hd"), speed=a.speed)
    raw = f"{ft}/_tts.mp3"
    open(raw, "wb").write(audio)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav], check=True)
    os.remove(raw)
# 提示词放稿子全文或沿用前文，whisper 都容易在后半段陷进幻觉，所以都不用
subprocess.run(["mlx_whisper", wav, "--model", "mlx-community/whisper-large-v3-turbo", "--language", "zh", "--initial-prompt", "以下是普通话的句子，使用简体中文。", "--condition-on-previous-text", "False", "--word-timestamps", "True", "--output-format", "json", "--output-dir", ft], check=True, stdout=subprocess.DEVNULL)
d = json.load(open(f"{ft}/voice.json"))
words = [{"text": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)} for s in d["segments"] for w in s.get("words", [])]
json.dump(words, open(f"{root}/words.json", "w"), ensure_ascii=False, indent=0)
os.remove(f"{ft}/voice.json")
dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip()
print(f"完成。时长 {dur} 秒，{len(words)} 个字词。逐字时间：{root}/words.json")
print("".join(w["text"] for w in words))
