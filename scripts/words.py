#!/usr/bin/env python3
"""已有一条录音（自己录的、别的工具配的都行），做成工程要的 voice.wav 和逐字时间 words.json。不花钱。

usage: python3 words.py <工程目录> <音频或视频文件> [--names "这期要念的英文名"]
"""
import argparse, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("audio")
ap.add_argument("--names", default="", help="这期要念的英文名，喂给 whisper")
a = ap.parse_args()
root = os.path.abspath(a.project)
ft = f"{root}/assets/footage"
os.makedirs(ft, exist_ok=True)
wav = f"{ft}/voice.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.audio, "-vn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav], check=True)
prompt = "以下是普通话的句子，使用简体中文。" + (a.names + "。" if a.names else "")
subprocess.run([tools.whisper(), wav, "--model", "mlx-community/whisper-large-v3-turbo", "--language", "zh", "--initial-prompt", prompt, "--condition-on-previous-text", "False", "--word-timestamps", "True", "--output-format", "json", "--output-dir", ft], check=True, stdout=subprocess.DEVNULL)
d = json.load(open(f"{ft}/voice.json"))
words = [{"text": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)} for s in d["segments"] for w in s.get("words", [])]
json.dump(words, open(f"{root}/words.json", "w"), ensure_ascii=False, indent=0)
os.remove(f"{ft}/voice.json")
dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip()
print(f"完成。时长 {dur} 秒，{len(words)} 个字词。逐字时间：{root}/words.json")
print("".join(w["text"] for w in words))
