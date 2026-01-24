# 🎬 Video Generation Pipeline - Bayt Al Jazeera

## 📊 Complete Pipeline Diagram

```
Frontend (Bayt Al Jazeera)
  └─ رفع صور + بيانات العقار
      │
      ▼
Backend API (/api/listings/:id/regenerate-video)
  ├─ Cloudinary Upload API → تخزين الصور + توليد URLs
  ├─ Gemini AI → توليد Script + ترتيب مشاهد + نصوص Overlay
  └─ DB → يحفظ: image_urls + video_url + status
      │
      ▼
FFmpeg Worker (createSlideshowVideo)
  ├─ تحميل الصور من Cloudinary URLs
  ├─ Scale + Padding (1920x1080)
  ├─ Ken Burns Effect (ground-level movements)
  ├─ Crossfade Transitions
  ├─ ASS Subtitles (نصوص عربية)
  └─ Export MP4 (web-optimized)
      │
      ▼
Cloudinary Upload API
  └─ رفع الفيديو النهائي
      │
      ▼
Frontend
  └─ عرض الفيديو في صفحة العقار
```

---

## 🔧 Technical Implementation

### 1. **Image Processing**
- **Source**: Cloudinary URLs or local `/uploads/` paths
- **Download**: Remote images are downloaded to `/tmp` directory
- **Format**: All images scaled to 1920x1080 with padding (maintain aspect ratio)

### 2. **FFmpeg Commands Used**

#### (A) Basic Slideshow (Current Implementation)
```bash
# Input: Multiple images with loop
-loop 1 -t {slideDuration} -framerate 30 -i {image}

# Scale + Padding + Ken Burns
scale=1920:1080:force_original_aspect_ratio=decrease,
pad=1920:1080:(ow-iw)/2:(oh-ih)/2,
scale=8000:-1,
zoompan=z='{zoom}':x='{x}':y='{y}':d={frames}:s=1920x1080:fps=30

# Crossfade Transitions
xfade=transition={type}:duration=0.8:offset={offset}

# Subtitles
subtitles='{assFile}':fontsdir='{fontsDir}'

# Output
-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -movflags +faststart
```

#### (B) Camera Movements (Ground-Level Only)
- **Gentle Zoom In**: `zoom=min(zoom+0.0005,1.1)`
- **Gentle Zoom Out**: `zoom=if(lte(zoom,1.0),1.1,max(1.0,zoom-0.0005))`
- **Slow Pan Left→Right**: `x=on/(25*{duration})*(iw-iw/zoom)`
- **Slow Pan Right→Left**: `x=(iw-iw/zoom)-(on/(25*{duration})*(iw-iw/zoom))`
- **Static**: `zoom=1.0` (no movement)

#### (C) Transition Types
- `fade` - Standard crossfade
- `fadeblack` - Fade to black
- `fadewhite` - Fade to white
- `distance` - Distance-based fade
- `fadefast` - Fast fade

### 3. **Text Overlays (ASS Subtitles)**
- **Format**: ASS (Advanced SubStation Alpha)
- **Font**: Arial (supports Arabic)
- **Positions**:
  - Top: Logo "بيت الجزيرة" (gold)
  - Center: Headline (white, bold)
  - Center: Subheadline (gold)
  - Bottom: Price/CTA (white, bold, gold outline)

### 4. **Video Settings**
- **Resolution**: 1920x1080 (Full HD)
- **FPS**: 30
- **Codec**: H.264 (libx264)
- **Preset**: `fast` (balance between speed and quality)
- **CRF**: `20` (high quality, good file size)
- **Profile**: `high` (Level 4.0)
- **Web Streaming**: `+faststart` (progressive download)

---

## 📝 Gemini AI Integration

### Promotional Text Generation
```javascript
generateDynamicPromoText(listingData)
  ├─ Try Gemini (gemini-2.0-flash)
  ├─ Fallback to OpenAI (gpt-4o-mini)
  └─ Final fallback to static text
```

**Output Format**:
```json
{
  "headline": "فيلا فاخرة للبيع",
  "subheadline": "في حي النخيل، جدة",
  "priceTag": "1,250,000 ريال",
  "callToAction": "تواصل الآن"
}
```

---

## 🎵 Optional: Background Music

### Current Status
- **Not implemented** (can be added if needed)

### Implementation (if needed):
```bash
# Add music track
-i music.mp3

# Mix audio
-filter_complex "[1:a]volume=0.15[a1]"
-map 0:v -map "[a1]"
-shortest -c:a aac -b:a 192k
```

**Requirements**:
- Music file in `/public/music/` directory
- Volume: 15% (0.15) to not overpower narration
- Format: MP3 or AAC
- Duration: Match video length (use `-shortest`)

---

## 🚀 Performance Optimization

### Current Settings
- **CRF 20**: Good quality/size balance
- **Preset "fast"**: Faster encoding (change to "medium" for better compression)
- **Web Streaming**: `+faststart` enables progressive download

### File Size Estimates
- **20 seconds, 5 images**: ~2-4 MB
- **30 seconds, 10 images**: ~4-8 MB
- **60 seconds, 20 images**: ~8-15 MB

### Encoding Speed
- **Fast preset**: ~10-30 seconds per video
- **Medium preset**: ~30-60 seconds per video
- **Slow preset**: ~60-120 seconds per video

---

## 🔒 Security Features

1. **Path Traversal Protection**: `isPathSafe()` validates all paths
2. **Text Sanitization**: `sanitizeTextForMedia()` prevents injection
3. **File Type Validation**: Only images allowed
4. **Size Limits**: Images max 10MB, videos max 100MB

---

## 📊 Database Schema

```sql
properties
  ├─ video_url (TEXT) - Cloudinary URL
  ├─ video_status (TEXT) - 'pending' | 'ready' | 'failed'
  └─ images (JSONB) - Array of image URLs

listing_media
  ├─ listing_id (UUID)
  ├─ url (TEXT) - Cloudinary URL
  ├─ kind (TEXT) - 'image' | 'video'
  └─ is_cover (BOOLEAN)
```

---

## 🛠️ Configuration

### Environment Variables
```bash
# Cloudinary (required for production)
CLOUDINARY_URL=cloudinary://...
# OR
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Gemini AI (optional, for promo text)
GEMINI_API_KEY=...

# OpenAI (fallback for promo text)
OPENAI_API_KEY=...
```

### FFmpeg Requirements
- **Version**: 4.0+ (for xfade filter)
- **Installation**: `apt-get install ffmpeg` (in Dockerfile)

---

## 📈 Future Improvements

1. **Background Music**: Add optional music track
2. **Multiple Video Qualities**: Generate 1080p, 720p, 480p versions
3. **Thumbnail Generation**: Auto-generate video thumbnail
4. **Progress Tracking**: WebSocket updates for video generation progress
5. **Batch Processing**: Queue system for multiple videos
6. **Video Templates**: Different styles (luxury, modern, classic)

---

## 🐛 Troubleshooting

### Video Not Generating
1. Check FFmpeg installation: `ffmpeg -version`
2. Check image URLs are accessible
3. Check Cloudinary credentials
4. Check disk space in `/tmp` directory

### Poor Quality
- Increase CRF (lower number = better quality): `-crf 18`
- Change preset to `medium` or `slow`: `-preset medium`

### Large File Size
- Increase CRF (higher number = smaller file): `-crf 23`
- Reduce resolution: `scale=1280:720`
- Reduce FPS: `-r 24`

### Arabic Text Not Displaying
- Check ASS file is created: `/public/uploads/temp/captions_*.ass`
- Check fonts directory: `/public/fonts/`
- Check Arabic reshaping: `reshapeArabicText()`

---

## 📚 References

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [FFmpeg xfade Filter](https://ffmpeg.org/ffmpeg-filters.html#xfade)
- [ASS Subtitle Format](https://github.com/libass/libass)
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Gemini API](https://ai.google.dev/docs)

---

**Last Updated**: January 2026
**Version**: 2.0 (Professional Pipeline)
