from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import os
import tempfile
import datetime
import subprocess
from pathlib import Path
from typing import AsyncGenerator
import asyncio
from concurrent.futures import ThreadPoolExecutor
import torch

import srt
import yt_dlp
import whisper

# 設定 ffmpeg 路徑
FFMPEG_PATH = r"D:\ffmpeg\ffmpeg-master-latest-win64-gpl\bin"

app = FastAPI()

# 允許前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案（可用於前端 HTML 等）
app.mount("/static", StaticFiles(directory="static"), name="static")

# 建立線程池
executor = ThreadPoolExecutor(max_workers=4)

# 檢查 CUDA 是否可用
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"使用設備: {DEVICE}")
if DEVICE == "cuda":
    print(f"GPU型號: {torch.cuda.get_device_name(0)}")

# 載入 Whisper 模型
try:
    model = whisper.load_model("base").to(DEVICE)
    print("模型載入完成")
except Exception as e:
    raise RuntimeError(f"模型載入失敗: {e}")

# 取得音訊長度（秒）
def get_audio_duration(audio_path: str) -> float:
    result = subprocess.run([
        os.path.join(FFMPEG_PATH, "ffprobe"),
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path
    ], stdout=subprocess.PIPE)
    return float(result.stdout.decode().strip())

# 分割音訊
def split_audio(audio_path, segment_duration=15):  # 縮短片段長度
    output_dir = Path(audio_path).parent / "segments"
    output_dir.mkdir(exist_ok=True)

    total_duration = get_audio_duration(audio_path)
    segments = []

    for start_time in range(0, int(total_duration), segment_duration):
        segment_path = output_dir / f"segment_{start_time}.mp3"
        cmd = [
            os.path.join(FFMPEG_PATH, "ffmpeg"),
            "-i", audio_path,
            "-ss", str(start_time),
            "-t", str(segment_duration),
            "-acodec", "libmp3lame",
            "-q:a", "4",  # 降低音質以加快處理
            "-ar", "16000",  # 降低採樣率
            str(segment_path),
            "-y"
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        segments.append((start_time, str(segment_path)))

    return segments

# 時間格式化函數
def format_time(seconds):
    """將秒數轉換為 SRT 格式的時間字串 (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = seconds % 60
    milliseconds = int((seconds % 1) * 1000)
    seconds = int(seconds)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

# 處理音訊片段
def process_audio_segment(segment_path: str, start_time: float = 0) -> str:
    try:
        print(f"開始處理音訊片段：{segment_path}")
        # 使用 GPU 加速轉錄
        result = model.transcribe(
            segment_path,
            verbose=False,
            task="transcribe",
            language="zh",  # 預設使用中文
            fp16=torch.cuda.is_available()  # 如果有 GPU 就使用 FP16
        )
        
        # 生成 SRT 格式字幕
        srt_id = 1
        srt_content = ""
        
        for segment in result["segments"]:
            # 調整時間，加上片段的起始時間
            start = segment["start"] + start_time
            end = segment["end"] + start_time
            
            # 轉換時間格式
            start_time_str = format_time(start)
            end_time_str = format_time(end)
            
            # 組合 SRT 格式
            srt_content += f"{srt_id}\n"
            srt_content += f"{start_time_str} --> {end_time_str}\n"
            srt_content += f"{segment['text'].strip()}\n\n"
            
            srt_id += 1
            
        print(f"音訊片段處理完成，產生了 {srt_id-1} 個字幕")
        return srt_content
        
    except Exception as e:
        print(f"處理音訊片段時發生錯誤: {e}")
        raise

# API：產生字幕串流
@app.post("/api/generate-subtitle")
async def generate_subtitle(
    file: UploadFile = File(None),
    youtube_url: str = Form(None),
    segment_duration: int = Form(15)  # 預設改為15秒
):
    if not file and not youtube_url:
        raise HTTPException(status_code=400, detail="請上傳音訊檔或提供 YouTube 連結")

    async def generate():
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                audio_path = None

                # 下載 YouTube 音訊
                if youtube_url:
                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'outtmpl': os.path.join(tmpdir, 'audio.%(ext)s'),
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '128',  # 降低音質以加快下載
                        }],
                        'ffmpeg_location': FFMPEG_PATH
                    }
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([youtube_url])
                    for f in os.listdir(tmpdir):
                        if f.endswith(".mp3"):
                            audio_path = os.path.join(tmpdir, f)
                            break

                # 處理上傳音訊
                elif file:
                    audio_path = os.path.join(tmpdir, file.filename)
                    with open(audio_path, "wb") as f_out:
                        f_out.write(await file.read())

                if not audio_path:
                    raise HTTPException(status_code=500, detail="音訊檔案處理失敗")

                # 分段 + 逐段轉錄
                segments = split_audio(audio_path, segment_duration)
                
                # 使用線程池並行處理音訊片段
                loop = asyncio.get_event_loop()
                for start_time, segment_path in segments:
                    # 使用線程池執行處理
                    srt_content = await loop.run_in_executor(
                        executor,
                        process_audio_segment,
                        segment_path,
                        start_time
                    )
                    yield srt_content

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"字幕產生失敗: {str(e)}")

    return StreamingResponse(generate(), media_type="text/plain")