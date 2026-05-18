import os
import wave
import numpy as np
import subprocess
import whisper
import imageio_ffmpeg

# Use our safe, local version of FFmpeg
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

def format_timestamp(seconds):
    """Converts raw seconds into the strict HH:MM:SS,mmm format required for SRT files."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millisec = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisec:03d}"

def get_safe_audio_array(media_path):
    """Safely converts audio to 16kHz and loads it as a raw math array to bypass WinError 2."""
    temp_wav = media_path.rsplit(".", 1)[0] + "_temp_whisper.wav"
    
    # 1. Convert to strict 16kHz mono WAV
    command = [
        ffmpeg_exe, "-y", "-i", media_path, 
        "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", temp_wav
    ]
    
    try:
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        # 2. Read the WAV file into a NumPy array
        with wave.open(temp_wav, 'rb') as wf:
            raw_data = wf.readframes(wf.getnframes())
            samples = np.frombuffer(raw_data, dtype=np.int16)
            audio_array = samples.astype(np.float32) / 32768.0
            
        return audio_array, temp_wav
    except Exception as e:
        print(f"Error preparing audio array: {e}")
        return None, None

def generate_youtube_subtitles(media_path):
    print("\n[1/4] Loading AI Transcription Model...")
    try:
        model = whisper.load_model("base")
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    print("[2/4] Safely bypassing Windows limits to decode audio...")
    audio_array, temp_wav = get_safe_audio_array(media_path)
    
    if audio_array is None:
        return

    print("[3/4] Transcribing audio and mapping exact timestamps (This may take a minute)...")
    try:
        # We feed Whisper the raw array directly, bypassing its internal file loader!
        result = model.transcribe(audio_array, fp16=False)
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        if os.path.exists(temp_wav):
            os.remove(temp_wav)
        return

    # Determine where to save the file
    dir_name = os.path.dirname(media_path)
    file_name, _ = os.path.splitext(os.path.basename(media_path))
    srt_output_path = os.path.join(dir_name, f"{file_name}_subtitles.srt")

    print("[4/4] Compiling and saving YouTube-compatible .SRT file...")
    try:
        with open(srt_output_path, "w", encoding="utf-8") as srt_file:
            for i, segment in enumerate(result["segments"], start=1):
                start_time = format_timestamp(segment["start"])
                end_time = format_timestamp(segment["end"])
                text = segment["text"].strip()

                # Write standard SRT format
                srt_file.write(f"{i}\n")
                srt_file.write(f"{start_time} --> {end_time}\n")
                srt_file.write(f"{text}\n\n")

        print(f"\nSUCCESS! Your subtitles are perfectly synced and ready for YouTube.")
        print(f"-> Saved to: {srt_output_path}")
        
    except Exception as e:
        print(f"Error saving subtitle file: {e}")
    finally:
        # Clean up the background temporary file
        if os.path.exists(temp_wav):
            os.remove(temp_wav)

if __name__ == "__main__":
    print("--- AUTOMATIC YOUTUBE SUBTITLE GENERATOR ---")
    user_path = input("Enter the full path to your audio or video file: ").strip().strip("'\"")
    
    if os.path.exists(user_path):
        generate_youtube_subtitles(user_path)
    else:
        print("Error: The specified file does not exist. Please check the path and try again.")