#!/usr/bin/env python3
"""口播素材准备：从横屏原片做出 ray-studio 工程要的全部素材。

usage: python3 prep_koubo.py <工程目录> <原片> --face-x 1820 --aspect portrait|landscape [--from 0] [--end 81.45] [--mic-trim 0.074] [--names "Claude、Codex"] [--no-matte] [--dry-run]

产出：
  assets/footage/face_wide.mp4        横屏原片 1920×1080（--aspect landscape 只出这个，不抠像）
  assets/footage/face_full.mp4        全屏真人 1080×1920，以脸为中心裁 9:16
  assets/footage/face_pop.mp4         探头真人 1080×960，放进下方圆角窗
  assets/footage/face_pop_matte.webm  探头的抠像，头顶越出窗框用。CPU 约 0.25 秒一帧，最慢，放后台
  assets/footage/voice.wav            压掉句间吸气，时间轴不变
  assets/img/end_still_pop.jpg, end_head.png  结尾定格，素材比成片早结束时垫上
  words.json                          mlx_whisper 逐字时间

--face-x 是原片里脸中心的 x 像素。先 --dry-run 看裁切。全部视频 30 fps、每秒一个关键帧，HyperFrames 逐帧 seek 需要。
"""
import argparse, json, os, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tools
ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("src")
ap.add_argument("--face-x", type=float, required=True)
ap.add_argument("--aspect", choices=["portrait", "landscape"], required=True, help="横屏不裁竖版、不抠像")
ap.add_argument("--from", dest="start", type=float, default=0, help="从第几秒开始")
ap.add_argument("--end", type=float, help="用到原片第几秒，默认整条")
ap.add_argument("--mic-trim", type=float, default=0.074, help="全屏真人从底部多裁掉的高度比例，用来裁掉话筒")
ap.add_argument("--names", default="", help="这期要念的英文名，喂给 whisper")
ap.add_argument("--no-matte", action="store_true", help="先不抠像，写完声明文件再单独跑")
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()
root = os.path.abspath(a.project)
ft, im = f"{root}/assets/footage", f"{root}/assets/img"


def run(cmd, cwd=None):
    print("$", " ".join(shlex.quote(c) for c in cmd), flush=True)
    if not a.dry_run:
        subprocess.run(cmd, check=True, cwd=cwd)


probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", a.src], capture_output=True, text=True, check=True).stdout)
W, H = probe["streams"][0]["width"], probe["streams"][0]["height"]
end = a.end or float(probe["format"]["duration"])
dur = end - a.start
even = lambda v: int(v) // 2 * 2
fh = even(H * (1 - a.mic_trim))
fw = even(fh * 9 / 16)
fx = even(min(max(a.face_x - fw / 2, 0), W - fw))
ph = even(H)
pw = even(min(ph * 9 / 8, W))
px = even(min(max(a.face_x - pw / 2, 0), W - pw))
print(f"原片 {W}×{H}，用 {a.start:.2f}–{end:.2f} 秒；全屏裁 {fw}×{fh}+{fx}+0，探头裁 {pw}×{ph}+{px}+0")
if not a.dry_run:
    os.makedirs(ft, exist_ok=True)
    os.makedirs(im, exist_ok=True)
cut = ["-ss", f"{a.start}", "-t", f"{dur}", "-i", a.src]
enc = ["-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p"]
if a.aspect == "landscape":
    a.no_matte = True
    run(["ffmpeg", "-v", "error", "-y", *cut, "-vf", "scale=1920:1080:flags=lanczos,fps=30", *enc, f"{ft}/face_wide.mp4"])
else:
    run(["ffmpeg", "-v", "error", "-y", *cut, "-vf", f"crop={fw}:{fh}:{fx}:0,scale=1080:1920:flags=lanczos,fps=30", *enc, f"{ft}/face_full.mp4"])
    run(["ffmpeg", "-v", "error", "-y", *cut, "-vf", f"crop={pw}:{ph}:{px}:0,scale=1080:960:flags=lanczos,fps=30", *enc, f"{ft}/face_pop.mp4"])
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.2", "-i", f"{ft}/face_pop.mp4", "-frames:v", "1", "-update", "1", "-vf", "crop=960:710:60:250", f"{im}/end_still_pop.jpg"])
wav = f"{ft}/_src.wav"
run(["ffmpeg", "-v", "error", "-y", *cut, "-vn", "-c:a", "pcm_s16le", wav])
run([sys.executable, f"{HERE}/gate_breaths.py", wav, "-o", f"{ft}/voice.wav", "--verify"])
prompt = "以下是普通话的句子，使用简体中文。" + (a.names + "。" if a.names else "")
run([tools.whisper(), wav, "--model", "mlx-community/whisper-large-v3-turbo", "--language", "zh", "--initial-prompt", prompt, "--condition-on-previous-text", "False", "--word-timestamps", "True", "--output-format", "json", "--output-dir", ft])
if not a.no_matte:
    run([*tools.hf(), "remove-background", "assets/footage/face_pop.mp4", "-o", "assets/footage/face_pop_matte.webm", "--device", "cpu", "--quality", "best"], cwd=root)
    # 解码要指定 libvpx-vp9，否则 alpha 通道会丢
    run(["ffmpeg", "-v", "error", "-y", "-c:v", "libvpx-vp9", "-sseof", "-0.3", "-i", f"{ft}/face_pop_matte.webm", "-frames:v", "1", "-update", "1", "-vf", "crop=480:250:300:0", f"{im}/end_head.png"])
if not a.dry_run:
    d = json.load(open(f"{ft}/_src.json"))
    words = [{"text": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)} for s in d["segments"] for w in s.get("words", []) if w["start"] < dur - 0.05]
    json.dump(words, open(f"{root}/words.json", "w"), ensure_ascii=False, indent=0)
    os.remove(wav)
    os.remove(f"{ft}/_src.json")
    real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{ft}/{'face_wide' if a.aspect == 'landscape' else 'face_full'}.mp4"], capture_output=True, text=True).stdout)
    print(f"完成。footageEnd = {real:.2f}，faceX = {a.face_x / W:.4f}；{len(words)} 个字词。whisper 可能在结尾静音里编出重复的字，按最后一句真话截断。")
