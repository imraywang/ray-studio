#!/usr/bin/env python3
"""看一条参考片的风格：抽帧拼成对照图，量出主要颜色、剪辑快慢和画幅，供新建风格文件时参考。

usage: python3 ref_style.py <参考视频> [--out 目录] [--frames 12]
产出 <目录>/ref-sheet.jpg（按时间均匀抽帧）和 ref-palette.png（色卡，按面积从大到小），并打印读数。
只读参考片，不改它。数字是给判断用的线索，最后以看图为准。
"""
import argparse, json, os, re, subprocess, sys

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--out", help="默认在参考片旁边建 <片名>-ref/")
ap.add_argument("--frames", type=int, default=12)
a = ap.parse_args()
video = os.path.abspath(a.video)
out = a.out or os.path.splitext(video)[0] + "-ref"
os.makedirs(out, exist_ok=True)

info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video], capture_output=True, text=True, check=True).stdout)
W, H, dur = info["streams"][0]["width"], info["streams"][0]["height"], float(info["format"]["duration"])

# 对照图：均匀抽帧，避开头尾各 3%
cols = 6 if W < H else 4
rows = -(-a.frames // cols)
step = dur * 0.94 / a.frames
sheet = f"{out}/ref-sheet.jpg"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * 0.03:.2f}", "-i", video, "-vf", f"fps=1/{step:.3f},scale={360 if W < H else 640}:-2,tile={cols}x{rows}", "-frames:v", "1", "-q:v", "3", sheet], check=True)

# 主要颜色：每秒取 2 帧缩到 64 宽，颜色量化到 16 级后数面积，相近的合并
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=2,scale=64:64", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
px = np.frombuffer(raw, np.uint8).reshape(-1, 3)
q = (px // 16).astype(np.int32)
keys, counts = np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2], return_counts=True)
picked = []
for i in np.argsort(-counts):
    mean = px[(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]) == keys[i]].mean(0)
    near = next((p for p in picked if np.abs(p["rgb"] - mean).max() < 28), None)
    if near:
        near["n"] += counts[i]
    elif len(picked) < 8:
        picked.append({"rgb": mean, "n": int(counts[i])})
picked.sort(key=lambda p: -p["n"])


def describe(rgb):
    r, g, b = rgb / 255
    mx, mn = max(r, g, b), min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    return "深" if mx < 0.3 else ("彩色" if sat > 0.35 else ("浅" if mx > 0.8 else "灰"))


sw = 120
card = np.concatenate([np.tile(p["rgb"].astype(np.uint8), (sw, sw, 1)) for p in picked], 1)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sw * len(picked)}x{sw}", "-i", "-", f"{out}/ref-palette.png"], input=card.tobytes(), check=True)

# 剪辑快慢：硬切次数
err = subprocess.run(["ffmpeg", "-i", video, "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
cuts = len(re.findall(r"pts_time:", err))

print(f"画幅 {W}×{H}（{'竖屏' if H > W else '横屏'}），时长 {dur:.1f} 秒")
print(f"硬切 {cuts} 次，平均 {dur / max(cuts, 1):.1f} 秒一个镜头")
print("主要颜色（按面积）：")
total = sum(p["n"] for p in picked)
for p in picked:
    print(f"  #{''.join(f'{int(round(c)):02x}' for c in p['rgb'])}  {p['n'] / total:5.1%}  {describe(p['rgb'])}")
print("面积最大的通常是底色；面积小但彩色的是强调色候选。真人画面多的片子，肤色和背景会混进来，以看图为准。")
print(f"用 Read 看：{sheet}\n色卡：{out}/ref-palette.png")
