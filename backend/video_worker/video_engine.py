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


# أصوات ذكورية فقط (تم استبعاد nova, shimmer)
ALLOWED_VOICES = {"onyx", "echo", "alloy"}

# قاموس تحسين النطق العربي - تكرار الحرف بدل الشدة + تشكيل واضح
ARABIC_PRONUNCIATION_MAP = {
    # عقارات - الشدة تتحول لحرف مكرر
    "فيلا": "فِيلْلَا",
    "فيلّا": "فِيلْلَا",
    "شقة": "شَقْقَة",
    "شقّة": "شَقْقَة",
    "شاليه": "شَالِيه",
    "دوبلكس": "دُوبْلِكْس",
    "بنتهاوس": "بِنْتْهَاوْس",
    "استوديو": "اِسْتُودْيُو",
    "روف": "رُوف",
    "ملحق": "مُلْحَق",
    "عمارة": "عِمَارَة",
    "عمّارة": "عِمَارَة",
    # مواقع
    "الرياض": "الرِّيَاض",
    "جدة": "جِدَّة",
    "جدّة": "جِدْدَة",
    "مكة": "مَكَّة",
    "مكّة": "مَكْكَة",
    "المدينة": "الْمَدِينَة",
    "الدمام": "الدَّمَّام",
    "الدمّام": "الدَّمْمَام",
    "دبي": "دُبَي",
    "أبوظبي": "أَبُو ظَبِي",
    "الكويت": "الْكُوَيْت",
    "الدوحة": "الدَّوْحَة",
    "المنامة": "الْمَنَامَة",
    "مسقط": "مَسْقَط",
    # صفات
    "فاخرة": "فَاخِرَة",
    "فخمة": "فَخْمَة",
    "راقية": "رَاقِيَة",
    "مميزة": "مُمَيْيِزَة",
    "مميّزة": "مُمَيْيِزَة",
    "حصرية": "حَصْرِيَّة",
    "حصريّة": "حَصْرِيْيَة",
    "استثمارية": "اِسْتِثْمَارِيَّة",
    "استثماريّة": "اِسْتِثْمَارِيْيَة",
    "عصرية": "عَصْرِيَّة",
    "عصريّة": "عَصْرِيْيَة",
    "كلاسيكية": "كْلَاسِيكِيَّة",
    "كلاسيكيّة": "كْلَاسِيكِيْيَة",
    # أرقام ووحدات
    "متر": "مِتْر",
    "ريال": "رِيَال",
    "درهم": "دِرْهَم",
    "دينار": "دِينَار",
    "مليون": "مِلْيُون",
    "ألف": "أَلْف",
    # كلمات شائعة
    "غرفة": "غُرْفَة",
    "غرف": "غُرَف",
    "حمام": "حَمَّام",
    "حمّام": "حَمْمَام",
    "صالة": "صَالَة",
    "مطبخ": "مَطْبَخ",
    "حديقة": "حَدِيقَة",
    "مسبح": "مَسْبَح",
    "موقف": "مَوْقِف",
    "كراج": "كَرَاج",
    "جراج": "جَرَاج",
    "إطلالة": "إِطْلَالَة",
    "بحرية": "بَحْرِيَّة",
    "بحريّة": "بَحْرِيْيَة",
}

def enhance_arabic_pronunciation(text):
    """تحسين النطق العربي - استبدال الكلمات الصعبة بنسخ مشكّلة وتكرار الحروف بدل الشدة."""
    result = text
    for word, replacement in ARABIC_PRONUNCIATION_MAP.items():
        result = result.replace(word, replacement)
    return result

class BaytVideoEngine:
    def __init__(self, property_data, image_paths, settings):
        self.data = property_data
        self.images = image_paths
        self.tier = settings.get('tier', 'tier2_business')
        self.ambience = settings.get('ambience', 'none')
        self.voice = (settings.get('voice') or 'onyx').lower()
        if self.voice not in ALLOWED_VOICES:
            self.voice = 'onyx'
        self.output_filename = f"video_{property_data.get('id', 'temp')}.mp4"

    def _strip_script_prefix(self, raw):
        """استخراج النص العربي فقط من رد الـ GPT."""
        script = raw.strip()
        for prefix in ("النص المشكل:", "النص:", "النص المُشكّل:", "1)", "١)", "2)", "٢)", "المطلوب:", "—", "–", "'''", "```"):
            if script.startswith(prefix):
                script = script[len(prefix):].strip()
        if not script:
            script = raw.strip()
        return script

    def generate_voiceover(self):
        """Generate AI voiceover using OpenAI TTS (male voices only). نطق عربي أوضح."""
        if not client:
            print("[VideoEngine] Warning: OpenAI not configured, skipping voiceover")
            return None

        voice = self.voice
        title = self.data.get('title') or ''
        location = self.data.get('location') or ''
        price = self.data.get('price') or ''
        details = (self.data.get('details') or '')[:500]

        # 1) نَصّ مُحَسَّن لِلقِرَاءَةِ الْآلِيَّةِ: تشكيل كامل، تكرار الحرف بدل الشدة
        prompt_script = f"""أنت تكتب نصاً إعلانياً للعقار ليقرأه قارئ آلي (TTS) عربي. الهدف نطق سليم وواضح.

البيانات:
- العنوان: {title}
- الموقع: {location}
- السعر: {price}
- الوصف: {details}

الشروط الصارمة:
1) أَرْجِع ٣ إلى ٤ جمل فقط. كل جملة قصيرة (٥–٨ كلمات).
2) لغة عربية فصحى بسيطة، كلمات واضحة.
3) شكّل كل كلمة بالكامل مع هذه القواعد المهمة:
   - بدلاً من الشدّة (ّ) اكتب الحرف مرتين. مثال: فيلّا ← فِيلْلَا، شقّة ← شَقْقَة
   - ضع حركة على كل حرف: فتحة َ ضمة ُ كسرة ِ سكون ْ
4) لا أرقام هواتف. لا رموز. ركّز على الفخامة والموقع.

أرجع النص المشكّل فقط، بدون عناوين أو ترقيم."""
        try:
            gpt = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt_script}]
            )
            raw = gpt.choices[0].message.content or ""
            script = self._strip_script_prefix(raw)

            # 2) اختياري: لو النص طويل جداً أو بدون تشكيل كافٍ، نطلب تشكيلاً إضافياً (مرة واحدة)
            if len(script) > 20 and not any(c in script for c in 'َُِّْ'):
                diac_prompt = f"""شكّل النص التالي بالكامل (حركات العربية: ضمة فتحة كسرة شدة سكون) على كل كلمة. أَرْجِع النص نفسه فقط مع التشكيل، بدون أي تعليق.

النص:
{script}"""
                try:
                    diac_resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": diac_prompt}]
                    )
                    diac_text = (diac_resp.choices[0].message.content or "").strip()
                    script = self._strip_script_prefix(diac_text) or script
                except Exception:
                    pass

            # تقصير النص إذا زاد عن حد معقول لتفادي تقطيع الصوت
            if len(script) > 600:
                script = script[:600].rsplit('.', 1)[0] + '.' if '.' in script[:600] else script[:600]

            # تحسين النطق: استبدال الكلمات الصعبة بنسخ مشكّلة
            script = enhance_arabic_pronunciation(script)
            print(f"[VideoEngine] 📝 Enhanced script: {script[:100]}...")

            # tts-1-hd لجودة أوضح
            res = client.audio.speech.create(
                model="tts-1-hd",
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
        
        # حساب مدة الفيديو المطلوبة بناءً على عدد الصور (3 ثواني لكل صورة)
        min_video_duration = len(self.images) * 3.0
        MAX_VIDEO_DURATION = 60.0
        
        if voice_path and os.path.exists(voice_path):
            vc = AudioFileClip(voice_path)
            voice_duration = vc.duration
            if voice_duration > MAX_VIDEO_DURATION:
                vc = vc.subclip(0, MAX_VIDEO_DURATION)
                voice_duration = MAX_VIDEO_DURATION
            audio_clips.append(vc)
            print(f"[VideoEngine] Voice duration: {voice_duration:.1f}s")
        
        # استخدام المدة الأطول: إما الصوت أو الصور (3 ثواني لكل صورة)
        target_duration = min(max(voice_duration, min_video_duration), MAX_VIDEO_DURATION)
        print(f"[VideoEngine] Target video duration: {target_duration:.1f}s (voice: {voice_duration:.1f}s, images need: {min_video_duration:.1f}s)")

        if self.ambience != 'none':
            sound_file = ASSETS_DIR / f"{self.ambience}.mp3"
            if sound_file.exists():
                bg = AudioFileClip(str(sound_file))
                bg = audio_loop(bg, duration=target_duration + 3)
                bg = bg.fx(volumex, 0.15)
                audio_clips.append(bg)
                print(f"[VideoEngine] Added ambience: {self.ambience}")

        clips = []
        # توزيع الوقت على كل الصور بالتساوي
        duration_per_img = target_duration / len(self.images)
        print(f"[VideoEngine] Duration per image: {duration_per_img:.1f}s ({len(self.images)} images)")
        
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
        
        # قص الفيديو فقط إذا تجاوز 60 ثانية (لتجنب مشاكل الذاكرة)
        MAX_VIDEO_DURATION = 60.0
        if final_video.duration > MAX_VIDEO_DURATION:
            final_video = final_video.subclip(0, MAX_VIDEO_DURATION)
            print(f"[VideoEngine] Video capped to {MAX_VIDEO_DURATION}s")
        
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


def generate_property_video(images, tier="tier1_safwa", ambience="none", property_data=None, voice="onyx"):
    """
    Convenience function for generating property videos.
    Forces high quality tier for best results.
    voice: male only — onyx, echo, alloy.
    """
    if property_data is None:
        property_data = {"id": "temp", "title": "عقار مميز", "location": "موقع متميز"}

    voice = (voice or "onyx").lower()
    if voice not in ALLOWED_VOICES:
        voice = "onyx"

    settings = {"tier": "tier2_business", "ambience": ambience, "voice": voice}
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
        property_data=config.get("property"),
        voice=config.get("voice", "onyx")
    )
    
    print(f"Video generated: {output}")
