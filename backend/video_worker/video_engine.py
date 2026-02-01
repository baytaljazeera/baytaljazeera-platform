#!/usr/bin/env python3
"""
AI Video Engine for BaytAlJazeera Real Estate Platform
Generates cinematic property videos with Ken Burns effects, smart crop, and AI voiceover.
"""

import os
import sys
import tempfile
from pathlib import Path

# Fix for Pillow 10+ (ANTIALIAS removed)
import PIL.Image
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeAudioClip,
        concatenate_videoclips
    )
    from moviepy.audio.fx.all import volumex, audio_loop
except ImportError:
    print("Error: moviepy not installed. Run: pip install moviepy")
    sys.exit(1)

ASSETS_DIR = Path(__file__).parent / "assets"
OUTPUT_DIR = Path(tempfile.gettempdir()) / "bayt_videos"
OUTPUT_DIR.mkdir(exist_ok=True)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY")) if OpenAI and os.environ.get("OPENAI_API_KEY") else None


class BaytVideoEngine:
    def __init__(self, property_data, image_paths, settings):
        self.data = property_data
        self.images = image_paths
        self.tier = settings.get('tier', 'tier2_business')
        self.ambience = settings.get('ambience', 'none')
        self.output_filename = f"video_{property_data.get('id', 'temp')}.mp4"

    def generate_voiceover(self):
        """Generate AI voiceover using OpenAI TTS."""
        if not client:
            print("[VideoEngine] Warning: OpenAI not configured, skipping voiceover")
            return None
            
        voice = "onyx"
        
        prompt = f"""
        اكتب نصاً إعلانياً قصيراً جداً وجذاباً للعقار التالي:
        العنوان: {self.data.get('title')}
        الموقع: {self.data.get('location')}
        السعر: {self.data.get('price')}
        الوصف: {self.data.get('details')}
        المطلوب: جمل تسويقية قصيرة وراقية. باللهجة السعودية البيضاء الراقية.
        تحذير: لا تذكر أرقام هواتف. ركز على الفخامة والموقع.
        """
        
        try:
            gpt = client.chat.completions.create(
                model="gpt-4o-mini", 
                messages=[{"role": "user", "content": prompt}]
            )
            script = gpt.choices[0].message.content
            
            res = client.audio.speech.create(
                model="tts-1", 
                voice=voice, 
                input=script
            )
            
            voice_path = OUTPUT_DIR / f"voice_{self.data.get('id', 'temp')}.mp3"
            res.stream_to_file(str(voice_path))
            print(f"[VideoEngine] ✅ Voiceover generated: {voice_path}")
            return str(voice_path)
            
        except Exception as e:
            print(f"[VideoEngine] ❌ Voice generation error: {e}")
            return None

    def smart_crop_to_16_9(self, clip):
        """Smart center crop to fill 1280x720 (HD) without black bars."""
        w, h = clip.size
        target_ratio = 16 / 9
        current_ratio = w / h
        
        if current_ratio > target_ratio:
            new_w = int(h * target_ratio)
            x1 = (w - new_w) // 2
            clip = clip.crop(x1=x1, y1=0, width=new_w, height=h)
        else:
            new_h = int(w / target_ratio)
            y1 = (h - new_h) // 2
            clip = clip.crop(x1=0, y1=y1, width=w, height=new_h)
        
        return clip.resize((1280, 720))

    def create_video(self):
        """Generate the complete property video with cinematic quality."""
        print(f"[VideoEngine] 🎬 Starting video generation for {self.data.get('id', 'temp')}...")
        
        voice_path = self.generate_voiceover()
        audio_clips = []
        voice_duration = 0
        
        if voice_path and os.path.exists(voice_path):
            vc = AudioFileClip(voice_path)
            voice_duration = vc.duration
            audio_clips.append(vc)
            print(f"[VideoEngine] Voice duration: {voice_duration:.1f}s")
        else:
            voice_duration = max(len(self.images) * 4, 15)
            print(f"[VideoEngine] No voice, using default duration: {voice_duration}s")

        if self.ambience != 'none':
            sound_file = ASSETS_DIR / f"{self.ambience}.mp3"
            if sound_file.exists():
                bg = AudioFileClip(str(sound_file))
                bg = audio_loop(bg, duration=voice_duration + 3)
                bg = bg.fx(volumex, 0.15)
                audio_clips.append(bg)
                print(f"[VideoEngine] Added ambience: {self.ambience}")

        clips = []
        duration_per_img = (voice_duration / len(self.images)) + 1.5
        
        for i, img_path in enumerate(self.images):
            try:
                if not os.path.exists(img_path):
                    print(f"[VideoEngine] ⚠️ Image not found: {img_path}")
                    continue
                    
                clip = ImageClip(img_path)
                print(f"[VideoEngine] Processing image {i+1}/{len(self.images)}: {clip.size}")
                
                clip = self.smart_crop_to_16_9(clip)
                
                clip = clip.resize(lambda t: 1 + 0.04 * t)
                clip = clip.set_duration(duration_per_img)
                
                clip = clip.crossfadein(1.0)
                
                clips.append(clip)
                
            except Exception as e:
                print(f"[VideoEngine] ❌ Skipping image {img_path}: {e}")
            finally:
                # Free memory after processing each image
                if 'clip' in dir() and hasattr(clip, 'close'):
                    try:
                        clip.close()
                    except:
                        pass

        if not clips:
            raise ValueError("No valid images found to create video")

        print(f"[VideoEngine] Concatenating {len(clips)} clips...")
        
        final_video = concatenate_videoclips(clips, method="compose", padding=-1)
        
        if final_video.duration > voice_duration:
            final_video = final_video.subclip(0, voice_duration)
        
        if audio_clips:
            final_video = final_video.set_audio(CompositeAudioClip(audio_clips))

        output_path = OUTPUT_DIR / self.output_filename
        
        print(f"[VideoEngine] 🎥 Rendering to {output_path}...")
        final_video.write_videofile(
            str(output_path), 
            fps=24, 
            preset='ultrafast', 
            codec='libx264', 
            audio_codec='aac', 
            threads=1,
            logger=None
        )
        
        final_video.close()
        
        if voice_path and os.path.exists(voice_path):
            try:
                os.remove(voice_path)
            except:
                pass
        
        print(f"[VideoEngine] ✅ Video complete: {output_path}")
        return str(output_path)


def generate_property_video(images, tier="tier1_safwa", ambience="none", property_data=None):
    """
    Convenience function for generating property videos.
    Forces high quality tier for best results.
    """
    if property_data is None:
        property_data = {"id": "temp", "title": "عقار مميز", "location": "موقع متميز"}
    
    settings = {"tier": "tier2_business", "ambience": ambience}
    engine = BaytVideoEngine(property_data, images, settings)
    return engine.create_video()


if __name__ == "__main__":
    import json
    
    if len(sys.argv) < 2:
        print("Usage: python video_engine.py <config.json>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    output = generate_property_video(
        images=config.get("images", []),
        tier=config.get("tier", "tier2_business"),
        ambience=config.get("ambience", "none"),
        property_data=config.get("property")
    )
    
    print(f"Video generated: {output}")
