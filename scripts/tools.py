"""找外部工具：HyperFrames 和 mlx_whisper。找不到时说清楚怎么装，不抛一串代码错误。"""
import os, shutil, sys

PY_ENV = os.path.expanduser("~/.local/share/ray-studio/py-env")


def hf():
    """HyperFrames 命令。装了全局命令就用它，否则用 npx 临时取。"""
    if os.environ.get("RS_HYPERFRAMES"):
        return [os.environ["RS_HYPERFRAMES"]]
    if shutil.which("hyperframes"):
        return ["hyperframes"]
    if shutil.which("npx"):
        return ["npx", "--yes", "hyperframes"]
    sys.exit("找不到 hyperframes，也没有 npx。先装 Node，再跑 npm i -g hyperframes")


def whisper():
    """mlx_whisper 命令：先找 PATH，再找当前 python 旁边和 ray-studio 自己的环境。"""
    for p in (shutil.which("mlx_whisper"), os.path.join(os.path.dirname(sys.executable), "mlx_whisper"), f"{PY_ENV}/bin/mlx_whisper"):
        if p and os.path.exists(p):
            return p
    sys.exit("找不到 mlx_whisper（转写逐字时间要用，需要 Apple 芯片）。跑 node bin/rs.mjs doctor 看怎么装")
