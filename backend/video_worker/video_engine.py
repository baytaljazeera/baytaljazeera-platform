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
        CompositeVideoClip, TextClip, concatenate_videoclips
    )
    from moviepy.audio.fx.all import volumex, audio_loop
except ImportError:
    print("Error: moviepy not installed. Run: pip install moviepy")
    sys.exit(1)

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAS_ARABIC_SUPPORT = True
except ImportError:
    HAS_ARABIC_SUPPORT = False

ASSETS_DIR = Path(__file__).parent / "assets"
OUTPUT_DIR = Path(tempfile.gettempdir()) / "bayt_videos"
OUTPUT_DIR.mkdir(exist_ok=True)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY")) if OpenAI and os.environ.get("OPENAI_API_KEY") else None


def format_arabic_for_display(text):
    """Format Arabic text for correct RTL display in MoviePy."""
    if not text or not text.strip():
        return ""
    if HAS_ARABIC_SUPPORT:
        try:
            reshaped = arabic_reshaper.reshape(text.strip())
            return get_display(reshaped)
        except Exception:
            return text.strip()
    return text.strip()


class BaytVideoEngine:
    def __init__(self, property_data, image_paths, settings):
        self.data = property_data
        self.images = image_paths
        self.tier = settings.get('tier', 'tier2_business')
        self.ambience = settings.get('ambience', 'none')
        self.script = settings.get('script')
        self.voice = settings.get('voice', 'onyx')
        self.overlay_phrases = settings.get('overlay_phrases') or []
        self.output_filename = f"video_{property_data.get('id', 'temp')}.mp4"

    def generate_voiceover(self):
        """Generate AI voiceover using OpenAI TTS. Uses pre-generated script if provided."""
        if not client:
            print("[VideoEngine] Warning: OpenAI not configured, skipping voiceover")
            return None

        valid_voices = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
        voice = self.voice if self.voice in valid_voices else 'onyx'

        script = self.script
        if not script or not script.strip():
            prompt = f"""
اكتب نصاً إعلانياً للتعليق الصوتي على فيديو عقاري. المدة المستهدفة: 35-45 ثانية (70-100 كلمة).
العنوان: {self.data.get('title')} | الموقع: {self.data.get('location')} | السعر: {self.data.get('price')} | الوصف: {self.data.get('details')}
المطلوب: نص طويل يكفي 35-45 ثانية. عبارات جاذبة ومشوقة. لغة عربية فصحى واضحة. جمل متدفقة. بدون أرقام هواتف.
أرجع النص فقط بدون علامات اقتباس. اجعله طويلاً.
"""
            try:
                gpt = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}]
                )
                script = gpt.choices[0].message.content
            except Exception as e:
                print(f"[VideoEngine] Script generation failed: {e}")
                script = f"عقار مميز في {self.data.get('location', 'موقع متميز')}. فرصة استثنائية. تواصل الآن."

        # إضافة فواصل للنص لتحسين النطق العربي (التوقف بين الجمل يساعد TTS)
        script_clean = script.strip()
        if script_clean and not script_clean.endswith('.'):
            script_clean = script_clean.rstrip('،.') + '.'
        try:
            res = client.audio.speech.create(
                model="tts-1-hd",
                voice=voice,
                input=script_clean
            )
            
            voice_path = OUTPUT_DIR / f"voice_{self.data.get('id', 'temp')}.mp3"
            res.stream_to_file(str(voice_path))
            print(f"[VideoEngine] ✅ Voiceover generated: {voice_path}")
            return str(voice_path)
            
        except Exception as e:
            print(f"[VideoEngine] ❌ Voice generation error: {e}")
            return None

    def create_text_overlay(self, text, duration, w=1280, h=720):
        """Create TextClip overlay for Arabic text. Position: bottom-center."""
        if not text or not text.strip():
            return None
        try:
            display_text = format_arabic_for_display(text.strip())
            amiri_path = '/usr/share/fonts/truetype/amiri/Amiri-Regular.ttf'
            dejavu_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
            font_path = amiri_path if os.path.exists(amiri_path) else (dejavu_path if os.path.exists(dejavu_path) else None)
            txt_kw = dict(text=display_text, font_size=48, color='white', stroke_color='black', stroke_width=2)
            if font_path:
                txt_kw['font'] = font_path
            txt_clip = TextClip(**txt_kw)
            txt_clip = txt_clip.set_duration(duration)
            txt_clip = txt_clip.set_position(('center', h - 120))
            return txt_clip
        except Exception as e:
            print(f"[VideoEngine] Text overlay skipped ({text[:20]}...): {e}")
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
        
        MIN_VIDEO_DURATION = 40   # حد أدنى 40 ثانية
        MIN_SEC_PER_IMAGE = 6    # كل صورة على الأقل 6 ثوانٍ (كريم)

        if voice_path and os.path.exists(voice_path):
            vc = AudioFileClip(voice_path)
            voice_duration = vc.duration
            audio_clips.append(vc)
            print(f"[VideoEngine] Voice duration: {voice_duration:.1f}s")
        else:
            voice_duration = max(len(self.images) * MIN_SEC_PER_IMAGE, MIN_VIDEO_DURATION)
            print(f"[VideoEngine] No voice, using default duration: {voice_duration}s")

        # مدة الفيديو: الأطول بين الصوت و 35 ثانية، مع ضمان عرض كل الصور
        total_duration = max(voice_duration, MIN_VIDEO_DURATION, len(self.images) * MIN_SEC_PER_IMAGE)
        duration_per_img = total_duration / len(self.images)
        print(f"[VideoEngine] Total duration: {total_duration:.1f}s, {duration_per_img:.1f}s per image")

        if self.ambience != 'none':
            sound_file = ASSETS_DIR / f"{self.ambience}.mp3"
            if sound_file.exists():
                bg = AudioFileClip(str(sound_file))
                bg = audio_loop(bg, duration=total_duration + 5)
                bg = bg.fx(volumex, 0.15)
                audio_clips.append(bg)
                print(f"[VideoEngine] Added ambience: {self.ambience}")

        clips = []
        phrases = self.overlay_phrases if isinstance(self.overlay_phrases, list) else []
        
        for i, img_path in enumerate(self.images):
            clip = None
            txt_clip = None
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
                
                # Add text overlay (كلمات جذابة فوق الصورة)
                if phrases:
                    phrase = phrases[i % len(phrases)]
                    txt_clip = self.create_text_overlay(phrase, duration_per_img)
                    if txt_clip:
                        clip = CompositeVideoClip([clip, txt_clip])
                
                clips.append(clip)
                
            except Exception as e:
                print(f"[VideoEngine] ❌ Skipping image {img_path}: {e}")

        if not clips:
            raise ValueError("No valid images found to create video")

        print(f"[VideoEngine] Concatenating {len(clips)} clips (padding=0 للحفاظ على المدة الكاملة)...")
        # padding=0: بدون تداخل - padding=-1 كان يختصر الفيديو بـ 1 ثانية لكل انتقال
        final_video = concatenate_videoclips(clips, method="compose", padding=0)
        
        actual_duration = final_video.duration
        print(f"[VideoEngine] Actual video duration: {actual_duration:.1f}s (target: {total_duration:.1f}s)")
        
        if actual_duration > total_duration:
            final_video = final_video.subclip(0, total_duration)
        
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


def generate_property_video(images, tier="tier1_safwa", ambience="none", property_data=None, script=None, voice="onyx", overlay_phrases=None):
    """
    Convenience function for generating property videos.
    Forces high quality tier for best results.
    script: pre-generated voiceover text (from Gemini). If None, generates via GPT.
    voice: OpenAI TTS voice (alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer).
    overlay_phrases: list of short phrases to display over images (e.g. ["فرصة لا تعوض", "موقع ذهبي"]).
    """
    if property_data is None:
        property_data = {"id": "temp", "title": "عقار مميز", "location": "موقع متميز"}

    settings = {"tier": "tier2_business", "ambience": ambience, "script": script, "voice": voice, "overlay_phrases": overlay_phrases or []}
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
