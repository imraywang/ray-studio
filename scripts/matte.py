#!/usr/bin/env python3
"""人身后大字要的抠像：把全屏真人场景那几秒裁出来抠背景。CPU 约 0.25 秒一帧，放后台。

usage: python3 matte.py <工程目录> <场景开始秒> <场景结束秒> [--src assets/footage/face_wide.mp4]
产出 assets/footage/matte-<开始秒>.webm，把这个路径写进场景的 "matte" 字段。
"""
import argparse, os, subprocess

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("start", type=float)
ap.add_argument("end", type=float)
ap.add_argument("--src", default="assets/footage/face_wide.mp4", help="竖屏用 assets/footage/face_full.mp4")
a = ap.parse_args()
root = os.path.abspath(a.project)
seg = f"assets/footage/_seg-{a.start:g}.mp4"
out = f"assets/footage/matte-{a.start:g}.webm"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a.start}", "-t", f"{a.end - a.start}", "-i", a.src, "-an", "-c:v", "libx264", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p", seg], check=True, cwd=root)
subprocess.run(["hyperframes", "remove-background", seg, "-o", out, "--device", "cpu", "--quality", "best"], check=True, cwd=root)
os.remove(f"{root}/{seg}")
print(out)
