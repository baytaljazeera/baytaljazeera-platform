#!/usr/bin/env python3
"""
AI Video Engine for BaytAlJazeera Real Estate Platform
Generates property videos with Ken Burns effects and ambient nature sounds.
STRICT: NO MUSIC - Only Voiceover + Ambient Nature Sounds (Birds/Sea)
"""

import os
import sys
import json
import tempfile
from pathlib import Path

try:
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeAudioClip,
        concatenate_videoclips, CompositeVideoClip
    )
    from moviepy.video.fx import resize, fadein, fadeout
except ImportError:
    print("Error: moviepy not installed. Run: pip install moviepy")
    sys.exit(1)

ASSETS_DIR = Path(__file__).parent / "assets"
OUTPUT_DIR = Path(tempfile.gettempdir()) / "bayt_videos"
OUTPUT_DIR.mkdir(exist_ok=True)

VIDEO_CONFIG = {
    "tier1_safwa": {
        "name": "باقة الصفوة",
        "zoom_start": 1.0,
        "zoom_end": 1.05,
        "duration_per_image": 4,
        "transition": "fade",
        "transition_duration": 0.5
    },
    "tier2_business": {
        "name": "رجال الأعمال",
        "zoom_start": 1.0,
        "zoom_end": 1.1,
        "duration_per_image": 5,
        "transition": "crossfade",
        "transition_duration": 1.0,
        "parallax": True
    }
}

AMBIENCE_CONFIG = {
    "none": None,
    "birds": {
        "file": "birds.mp3",
        "volume": 0.1
    },
    "sea": {
        "file": "sea.mp3",
        "volume": 0.1
    }
}


def apply_ken_burns(clip, zoom_start, zoom_end, parallax=False):
    """Apply Ken Burns (zoom + pan) effect to an image clip."""
    duration = clip.duration
    
    def zoom_effect(get_frame, t):
        progress = t / duration
        current_zoom = zoom_start + (zoom_end - zoom_start) * progress
        frame = get_frame(t)
        
        h, w = frame.shape[:2]
        new_h, new_w = int(h * current_zoom), int(w * current_zoom)
        
        from PIL import Image
        import numpy as np
        
        img = Image.fromarray(frame)
        img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        x_offset = (new_w - w) // 2
        y_offset = (new_h - h) // 2
        
        if parallax:
            x_offset += int((progress - 0.5) * w * 0.05)
            y_offset += int((progress - 0.5) * h * 0.02)
        
        x_offset = max(0, min(x_offset, new_w - w))
        y_offset = max(0, min(y_offset, new_h - h))
        
        cropped = img_resized.crop((x_offset, y_offset, x_offset + w, y_offset + h))
        return np.array(cropped)
    
    return clip.fl(zoom_effect)


def create_video_clip(image_path, config):
    """Create a video clip from an image with Ken Burns effect."""
    clip = ImageClip(str(image_path), duration=config["duration_per_image"])
    
    clip = apply_ken_burns(
        clip,
        config["zoom_start"],
        config["zoom_end"],
        parallax=config.get("parallax", False)
    )
    
    if config["transition"] == "fade":
        clip = fadein(clip, config["transition_duration"])
        clip = fadeout(clip, config["transition_duration"])
    
    return clip


def mix_audio(voiceover_path, ambience_type, video_duration):
    """Mix voiceover with ambient sounds (NO MUSIC - nature sounds only)."""
    audio_clips = []
    
    if voiceover_path and os.path.exists(voiceover_path):
        voiceover = AudioFileClip(voiceover_path)
        audio_clips.append(voiceover)
    
    ambience_config = AMBIENCE_CONFIG.get(ambience_type)
    if ambience_config:
        ambience_file = ASSETS_DIR / ambience_config["file"]
        if ambience_file.exists():
            ambience = AudioFileClip(str(ambience_file))
            
            if ambience.duration < video_duration:
                loops_needed = int(video_duration / ambience.duration) + 1
                from moviepy.editor import concatenate_audioclips
                ambience = concatenate_audioclips([ambience] * loops_needed)
            
            ambience = ambience.subclip(0, video_duration)
            ambience = ambience.volumex(ambience_config["volume"])
            audio_clips.append(ambience)
    
    if audio_clips:
        return CompositeAudioClip(audio_clips)
    return None


def generate_property_video(
    images: list,
    tier: str = "tier1_safwa",
    ambience: str = "none",
    voiceover_path: str = None,
    output_path: str = None,
    fps: int = 24,
    resolution: tuple = (1920, 1080)
):
    """
    Generate a property video with Ken Burns effects.
    
    Args:
        images: List of image file paths
        tier: 'tier1_safwa' (simple zoom) or 'tier2_business' (cinematic parallax)
        ambience: 'none', 'birds', or 'sea'
        voiceover_path: Path to voiceover audio file
        output_path: Output video file path
        fps: Frames per second
        resolution: Video resolution (width, height)
    
    Returns:
        Path to generated video file
    """
    if not images:
        raise ValueError("At least one image is required")
    
    config = VIDEO_CONFIG.get(tier, VIDEO_CONFIG["tier1_safwa"])
    
    clips = []
    for img_path in images:
        if os.path.exists(img_path):
            clip = create_video_clip(img_path, config)
            clip = clip.resize(newsize=resolution)
            clips.append(clip)
    
    if not clips:
        raise ValueError("No valid images found")
    
    if config["transition"] == "crossfade" and len(clips) > 1:
        final_video = clips[0]
        for i in range(1, len(clips)):
            final_video = CompositeVideoClip([
                final_video,
                clips[i].set_start(final_video.duration - config["transition_duration"])
            ])
    else:
        final_video = concatenate_videoclips(clips, method="compose")
    
    audio = mix_audio(voiceover_path, ambience, final_video.duration)
    if audio:
        final_video = final_video.set_audio(audio)
    
    if output_path is None:
        output_path = OUTPUT_DIR / f"property_video_{os.getpid()}.mp4"
    
    final_video.write_videofile(
        str(output_path),
        fps=fps,
        codec="libx264",
        audio_codec="aac",
        preset="medium",
        threads=4
    )
    
    final_video.close()
    
    return str(output_path)


def main():
    """CLI interface for video generation."""
    if len(sys.argv) < 2:
        print("Usage: python video_engine.py <config.json>")
        print("Config JSON format:")
        print(json.dumps({
            "images": ["image1.jpg", "image2.jpg"],
            "tier": "tier1_safwa",
            "ambience": "birds",
            "voiceover": "voiceover.mp3",
            "output": "output.mp4"
        }, indent=2))
        sys.exit(1)
    
    config_file = sys.argv[1]
    with open(config_file, 'r') as f:
        config = json.load(f)
    
    output = generate_property_video(
        images=config.get("images", []),
        tier=config.get("tier", "tier1_safwa"),
        ambience=config.get("ambience", "none"),
        voiceover_path=config.get("voiceover"),
        output_path=config.get("output")
    )
    
    print(f"Video generated: {output}")


if __name__ == "__main__":
    main()
