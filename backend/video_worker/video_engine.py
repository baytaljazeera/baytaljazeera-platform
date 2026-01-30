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
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeAudioClip,
        concatenate_videoclips, CompositeVideoClip
    )
    from moviepy.video.fx import resize, fadein, fadeout
    from moviepy.audio.fx.all import volumex
    import moviepy.audio.fx.all as afx
except ImportError:
    print("Error: moviepy not installed. Run: pip install moviepy")
    sys.exit(1)

ASSETS_DIR = Path(__file__).parent / "assets"
OUTPUT_DIR = Path(tempfile.gettempdir()) / "bayt_videos"
OUTPUT_DIR.mkdir(exist_ok=True)

VIDEO_CONFIG = {
    "tier1_safwa": {
        "name": "باقة الصفوة",
        "zoom_factor": 0.01,
        "voice_model": "alloy",
        "style": "عملي، مباشر، وموجز"
    },
    "tier2_business": {
        "name": "رجال الأعمال",
        "zoom_factor": 0.04,
        "crossfade": 1.0,
        "voice_model": "onyx",
        "style": "فخم، شاعري، وراقي"
    }
}

client = None
if OpenAI and os.environ.get("OPENAI_API_KEY"):
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


class BaytVideoEngine:
    def __init__(self, property_data, image_paths, settings):
        """
        settings: قاموس يأتي من قاعدة البيانات بناءً على الباقة
        مثال: {'tier': 'tier2_business', 'ambience': 'sea'}
        """
        self.data = property_data
        self.images = image_paths
        self.settings = settings
        self.output_filename = f"video_{property_data['id']}.mp4"
        self.tier_config = VIDEO_CONFIG.get(settings.get('tier', 'tier1_safwa'), VIDEO_CONFIG['tier1_safwa'])

    def generate_voiceover(self):
        """Generate AI voiceover using OpenAI TTS."""
        if not client:
            print("Warning: OpenAI not configured, skipping voiceover")
            return None
            
        is_premium = self.settings.get('tier') == 'tier2_business'
        
        prompt = f"""
        أنت مستشار عقاري لمنصة بيت الجزيرة.
        صف العقار: {self.data.get('title', 'عقار مميز')} في {self.data.get('location', 'موقع متميز')}.
        الأسلوب: {self.tier_config['style']}.
        ممنوع الموسيقى، وصف صوتي فقط. (مدة 30 ثانية).
        """
        
        gpt_resp = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[{"role": "user", "content": prompt}]
        )
        script = gpt_resp.choices[0].message.content
        
        voice_model = self.tier_config.get('voice_model', 'alloy')
        res = client.audio.speech.create(model="tts-1", voice=voice_model, input=script)
        
        voice_path = OUTPUT_DIR / "voice.mp3"
        res.stream_to_file(str(voice_path))
        return str(voice_path)

    def mix_audio(self, voice_path):
        """Mix voiceover with ambient sounds (NO MUSIC - nature sounds only)."""
        if not voice_path or not os.path.exists(voice_path):
            return None
            
        voice_clip = AudioFileClip(voice_path)
        
        ambience_type = self.settings.get('ambience', 'none')
        if ambience_type == 'none':
            return voice_clip

        sound_file = ASSETS_DIR / f"{ambience_type}.mp3"
        if sound_file.exists():
            ambience_clip = AudioFileClip(str(sound_file))
            ambience_clip = afx.audio_loop(ambience_clip, duration=voice_clip.duration + 2)
            ambience_clip = ambience_clip.fx(volumex, 0.15)
            return CompositeAudioClip([voice_clip, ambience_clip])
        
        return voice_clip

    def create_video(self):
        """Generate the complete property video."""
        voice_path = self.generate_voiceover()
        final_audio = self.mix_audio(voice_path)
        
        clips = []
        
        if final_audio:
            duration_per_img = final_audio.duration / len(self.images)
        else:
            duration_per_img = 4
        
        zoom_factor = self.tier_config.get('zoom_factor', 0.01)
        has_crossfade = 'crossfade' in self.tier_config
        
        for img in self.images:
            if not os.path.exists(img):
                continue
                
            clip = ImageClip(img).set_duration(duration_per_img)
            clip = clip.resize(height=1080)
            
            if clip.w > 1920:
                clip = clip.crop(x1=clip.w/2-960, y1=0, width=1920, height=1080)
            
            clip = clip.resize(lambda t: 1 + zoom_factor * t)
            
            if has_crossfade:
                clip = clip.crossfadein(self.tier_config['crossfade'])

            clips.append(clip)
        
        if not clips:
            raise ValueError("No valid images found")

        final_video = concatenate_videoclips(clips, method="compose")
        
        if final_audio:
            final_video = final_video.set_audio(final_audio)
        
        output_path = OUTPUT_DIR / self.output_filename
        final_video.write_videofile(str(output_path), fps=24, codec='libx264', audio_codec='aac')
        
        final_video.close()
        
        return str(output_path)


def generate_property_video(images, tier="tier1_safwa", ambience="none", property_data=None):
    """
    Convenience function for generating property videos.
    
    Args:
        images: List of image file paths
        tier: 'tier1_safwa' or 'tier2_business'
        ambience: 'none', 'birds', or 'sea'
        property_data: Dict with property details (id, title, location)
    """
    if property_data is None:
        property_data = {"id": "temp", "title": "عقار مميز", "location": "موقع متميز"}
    
    settings = {"tier": tier, "ambience": ambience}
    engine = BaytVideoEngine(property_data, images, settings)
    return engine.create_video()


def main():
    """CLI interface for video generation."""
    if len(sys.argv) < 2:
        print("Usage: python video_engine.py <config.json>")
        print("Config JSON format:")
        print(json.dumps({
            "images": ["image1.jpg", "image2.jpg"],
            "tier": "tier1_safwa",
            "ambience": "birds",
            "property": {"id": "123", "title": "فيلا فاخرة", "location": "الرياض"}
        }, indent=2, ensure_ascii=False))
        sys.exit(1)
    
    config_file = sys.argv[1]
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    output = generate_property_video(
        images=config.get("images", []),
        tier=config.get("tier", "tier1_safwa"),
        ambience=config.get("ambience", "none"),
        property_data=config.get("property")
    )
    
    print(f"Video generated: {output}")


if __name__ == "__main__":
    main()
