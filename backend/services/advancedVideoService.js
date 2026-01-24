const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const OpenAI = require("openai");

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const VIDEO_TEMPLATES = {
  luxury: {
    name: "فاخر",
    nameEn: "Luxury",
    colors: {
      primary: "&H0037AFD4",
      secondary: "&H003C2701",
      accent: "&H004CB70B",
      text: "&H00FFFFFF",
      glow: "&H0037AFD4"
    },
    transitions: ["fade", "dissolve", "circleopen", "radial"],
    kenBurns: "slow",
    musicMood: "elegant",
    fontStyle: "bold"
  },
  modern: {
    name: "عصري",
    nameEn: "Modern",
    colors: {
      primary: "&H00FF6B35",
      secondary: "&H001A1A2E",
      accent: "&H0016213E",
      text: "&H00FFFFFF",
      glow: "&H00FF6B35"
    },
    transitions: ["wipeleft", "wiperight", "slideup", "slidedown"],
    kenBurns: "dynamic",
    musicMood: "upbeat",
    fontStyle: "clean"
  },
  classic: {
    name: "كلاسيكي",
    nameEn: "Classic",
    colors: {
      primary: "&H00C4A35A",
      secondary: "&H00232946",
      accent: "&H00B8C1EC",
      text: "&H00FFFFFE",
      glow: "&H00C4A35A"
    },
    transitions: ["fade", "dissolve", "wipeleft", "wiperight"],
    kenBurns: "gentle",
    musicMood: "warm",
    fontStyle: "elegant"
  },
  minimal: {
    name: "بسيط",
    nameEn: "Minimal",
    colors: {
      primary: "&H00000000",
      secondary: "&H00FFFFFF",
      accent: "&H00808080",
      text: "&H00000000",
      glow: "&H00FFFFFF"
    },
    transitions: ["fade", "dissolve"],
    kenBurns: "subtle",
    musicMood: "calm",
    fontStyle: "light"
  }
};

const KEN_BURNS_PRESETS = {
  slow: [
    { zoom: "min(zoom+0.0008,1.15)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "if(lte(zoom,1.0),1.18,max(1.0,zoom-0.0008))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "min(zoom+0.0006,1.12)", x: "0", y: "0" },
    { zoom: "min(zoom+0.0006,1.12)", x: "iw-iw/zoom", y: "ih-ih/zoom" }
  ],
  dynamic: [
    { zoom: "min(zoom+0.0015,1.25)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "if(lte(zoom,1.0),1.30,max(1.0,zoom-0.0015))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "min(zoom+0.0012,1.20)", x: "0", y: "ih/2-(ih/zoom/2)" },
    { zoom: "min(zoom+0.0012,1.20)", x: "iw-iw/zoom", y: "ih/2-(ih/zoom/2)" },
    { zoom: "min(zoom+0.0010,1.18)", x: "iw/2-(iw/zoom/2)", y: "0" },
    { zoom: "min(zoom+0.0010,1.18)", x: "iw/2-(iw/zoom/2)", y: "ih-ih/zoom" }
  ],
  gentle: [
    { zoom: "min(zoom+0.0005,1.10)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "if(lte(zoom,1.0),1.12,max(1.0,zoom-0.0005))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "min(zoom+0.0004,1.08)", x: "iw/4", y: "ih/4" },
    { zoom: "min(zoom+0.0004,1.08)", x: "iw*3/4-iw/zoom", y: "ih*3/4-ih/zoom" }
  ],
  subtle: [
    { zoom: "min(zoom+0.0003,1.05)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { zoom: "if(lte(zoom,1.0),1.06,max(1.0,zoom-0.0003))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" }
  ]
};

async function generateEnhancedPromoText(listingData, template = "luxury") {
  const templateInfo = VIDEO_TEMPLATES[template] || VIDEO_TEMPLATES.luxury;
  
  const prompt = `أنت خبير تسويق عقاري محترف. اكتب نصاً ترويجياً قوياً ومؤثراً لفيديو عقاري بأسلوب ${templateInfo.name}.

بيانات العقار:
- النوع: ${listingData.type || "عقار"}
- المدينة: ${listingData.city || "غير محدد"}
- الحي: ${listingData.district || "غير محدد"}
- السعر: ${listingData.price ? listingData.price.toLocaleString() : "غير محدد"} ${listingData.currency || "ر.س"}
- المساحة: ${listingData.area || "غير محدد"} م²
- الغرف: ${listingData.bedrooms || "غير محدد"}
- الحمامات: ${listingData.bathrooms || "غير محدد"}
- المميزات: ${Array.isArray(listingData.features) ? listingData.features.join(", ") : "غير محدد"}

المطلوب - اكتب 3 أسطر فقط بالتنسيق التالي:
السطر الأول: عنوان جذاب ومؤثر (5-8 كلمات)
السطر الثاني: وصف مختصر للموقع والمميزات (6-10 كلمات)
السطر الثالث: السعر مع عبارة تحفيزية (مثل: "فقط X ر.س - فرصة استثنائية!")

اجعل النص:
- قوياً ومؤثراً عاطفياً
- يخلق شعور بالإلحاح والحصرية
- يستخدم كلمات قوية مثل: حصري، استثنائي، فاخر، نادر، فرصة ذهبية
- مناسباً لفيديو احترافي`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت كاتب محتوى عقاري محترف. اكتب نصوصاً تسويقية قوية ومؤثرة." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    const text = response.choices[0]?.message?.content || "";
    const lines = text.split("\n").filter(l => l.trim()).slice(0, 3);
    
    return {
      topLine: lines[0] || `عقار ${templateInfo.name} في ${listingData.city || "موقع مميز"}`,
      midLine: lines[1] || `${listingData.district || "حي راقي"} - ${listingData.bedrooms || ""} غرف - ${listingData.area || ""} م²`,
      bottomLine: lines[2] || `${listingData.price ? listingData.price.toLocaleString() : "اتصل للسعر"} ${listingData.currency || "ر.س"}`
    };
  } catch (error) {
    console.error("[AdvancedVideo] AI text generation error:", error.message);
    return {
      topLine: `عقار ${VIDEO_TEMPLATES[template]?.name || "مميز"} للبيع`,
      midLine: `${listingData.city || "موقع استراتيجي"} - ${listingData.district || "حي راقي"}`,
      bottomLine: `${listingData.price ? listingData.price.toLocaleString() : "اتصل للسعر"} ${listingData.currency || "ر.س"}`
    };
  }
}

function buildAdvancedAssFile(promoText, totalDuration, outPath, template = "luxury") {
  const templateConfig = VIDEO_TEMPLATES[template] || VIDEO_TEMPLATES.luxury;
  const colors = templateConfig.colors;
  
  const ArabicReshaper = require("arabic-reshaper");
  const bidiFactory = require("bidi-js");
  const bidi = bidiFactory();

  function reshapeArabic(text) {
    if (!text) return "";
    try {
      const reshaped = ArabicReshaper.convertArabic(text);
      const embeddingLevels = bidi.getEmbeddingLevels(reshaped, "rtl");
      const flips = bidi.getReorderSegments(reshaped, embeddingLevels);
      let chars = reshaped.split('');
      flips.forEach(([start, end]) => {
        const segment = chars.slice(start, end + 1).reverse();
        for (let i = 0; i <= end - start; i++) {
          chars[start + i] = segment[i];
        }
      });
      const mirrored = bidi.getMirroredCharactersMap(reshaped, embeddingLevels);
      mirrored.forEach((replacement, index) => {
        chars[index] = replacement;
      });
      return chars.join('');
    } catch (e) {
      return text;
    }
  }

  function sanitize(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[\\{}]/g, '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  }

  const topLine = reshapeArabic(sanitize(promoText?.topLine || ""));
  const midLine = reshapeArabic(sanitize(promoText?.midLine || ""));
  const bottomLine = reshapeArabic(sanitize(promoText?.bottomLine || ""));
  const logo = reshapeArabic("بيت الجزيرة");
  const logoStar = "✦";

  const W = 1920, H = 1080;
  const cx = W / 2;
  const logoY = H - 120;

  const logoStart = 0.3;
  const t1 = 1.0;
  const t2 = 2.5;
  const t3 = 4.0;
  const endFade = totalDuration - 1.5;

  function toAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  const ass = `[Script Info]
Title: Property Promo - ${template}
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: LogoMain,Cairo,58,${colors.primary},${colors.primary},${colors.secondary},&H80000000,1,0,0,0,100,100,3,0,1,4,8,8,80,80,0,1
Style: LogoStar,Cairo,42,${colors.accent},${colors.primary},&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,8,80,80,0,1
Style: HeadGlow,Cairo,95,${colors.glow},${colors.glow},${colors.secondary},&H00000000,1,0,0,0,100,100,5,0,1,18,0,8,80,80,0,1
Style: HeadMain,Cairo,95,${colors.text},${colors.glow},${colors.secondary},&H80000000,1,0,0,0,100,100,5,0,4,5,10,8,80,80,0,1
Style: MidGlow,Cairo,70,${colors.glow},${colors.glow},${colors.secondary},&H00000000,0,0,0,0,100,100,4,0,1,14,0,5,80,80,0,1
Style: MidMain,Cairo,70,${colors.text},${colors.glow},${colors.secondary},&H80000000,0,0,0,0,100,100,4,0,4,4,6,5,80,80,0,1
Style: PriceGlow,Cairo,105,${colors.primary},${colors.glow},${colors.accent},&H00000000,1,0,0,0,100,100,6,0,1,22,0,2,80,80,0,1
Style: PriceMain,Cairo,105,${colors.text},${colors.glow},${colors.secondary},&H80000000,1,0,0,0,100,100,6,0,4,6,12,2,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,${toAssTime(logoStart)},${toAssTime(totalDuration)},LogoMain,,0,0,0,,{\\pos(${cx},${logoY - 80})\\alpha&HFF&\\blur2\\t(0,500,\\alpha&H00&\\blur0)\\move(${cx},${logoY - 80},${cx},${logoY},0,500)\\t(0,300,\\fscx115\\fscy115\\bord6)\\t(300,600,\\fscx100\\fscy100\\bord4)\\t(600,800,\\fscx103\\fscy103)\\t(800,1000,\\fscx100\\fscy100)}${logo}
Dialogue: 2,${toAssTime(logoStart + 0.3)},${toAssTime(totalDuration)},LogoStar,,0,0,0,,{\\pos(${cx - 280},${logoY})\\alpha&HFF&\\t(0,300,\\alpha&H00&)\\t(0,600,\\frz360)\\t(2000,2600,\\fscx140\\fscy140)\\t(2600,3000,\\fscx100\\fscy100)\\t(4000,4600,\\fscx140\\fscy140)\\t(4600,5000,\\fscx100\\fscy100)}${logoStar}
Dialogue: 2,${toAssTime(logoStart + 0.3)},${toAssTime(totalDuration)},LogoStar,,0,0,0,,{\\pos(${cx + 280},${logoY})\\alpha&HFF&\\t(0,300,\\alpha&H00&)\\t(0,600,\\frz-360)\\t(2000,2600,\\fscx140\\fscy140)\\t(2600,3000,\\fscx100\\fscy100)\\t(4000,4600,\\fscx140\\fscy140)\\t(4600,5000,\\fscx100\\fscy100)}${logoStar}
Dialogue: 0,${toAssTime(t1)},${toAssTime(endFade)},HeadGlow,,0,0,0,,{\\pos(${cx},200)\\alpha&HFF&\\blur20\\move(${cx},50,${cx},200,0,600)\\t(0,400,\\alpha&H50&\\blur25)\\t(400,800,\\blur18)}${topLine}
Dialogue: 1,${toAssTime(t1)},${toAssTime(endFade)},HeadMain,,0,0,0,,{\\pos(${cx},200)\\alpha&HFF&\\move(${cx},50,${cx},200,0,600)\\t(0,300,\\alpha&H00&)\\fscx70\\fscy70\\t(0,400,\\fscx108\\fscy108)\\t(400,700,\\fscx100\\fscy100)\\t(700,900,\\fscx102\\fscy102)\\t(900,1100,\\fscx100\\fscy100)}${topLine}
Dialogue: 0,${toAssTime(t2)},${toAssTime(endFade)},MidGlow,,0,0,0,,{\\pos(${cx},540)\\alpha&HFF&\\blur18\\move(${cx + 400},540,${cx},540,0,600)\\t(0,400,\\alpha&H60&\\blur22)\\t(400,800,\\blur16)}${midLine}
Dialogue: 1,${toAssTime(t2)},${toAssTime(endFade)},MidMain,,0,0,0,,{\\pos(${cx},540)\\alpha&HFF&\\move(${cx + 400},540,${cx},540,0,600)\\t(0,350,\\alpha&H00&)\\fscx85\\fscy85\\t(0,400,\\fscx105\\fscy105)\\t(400,700,\\fscx100\\fscy100)}${midLine}
Dialogue: 0,${toAssTime(t3)},${toAssTime(totalDuration)},PriceGlow,,0,0,0,,{\\pos(${cx},950)\\alpha&HFF&\\blur25\\move(${cx},1100,${cx},950,0,600)\\t(0,400,\\alpha&H40&\\blur30)\\t(400,800,\\blur22)\\t(2000,2400,\\blur28)\\t(2400,2800,\\blur22)\\t(4000,4400,\\blur28)\\t(4400,4800,\\blur22)}${bottomLine}
Dialogue: 1,${toAssTime(t3)},${toAssTime(totalDuration)},PriceMain,,0,0,0,,{\\pos(${cx},950)\\alpha&HFF&\\move(${cx},1100,${cx},950,0,600)\\t(0,350,\\alpha&H00&)\\fscx60\\fscy60\\t(0,400,\\fscx115\\fscy115)\\t(400,700,\\fscx100\\fscy100)\\t(700,900,\\fscx105\\fscy105)\\t(900,1100,\\fscx100\\fscy100)\\t(2000,2200,\\fscx108\\fscy108)\\t(2200,2500,\\fscx100\\fscy100)\\t(4000,4200,\\fscx108\\fscy108)\\t(4200,4500,\\fscx100\\fscy100)}${bottomLine}
`.trim();

  require("fs").writeFileSync(outPath, ass, "utf8");
  console.log(`[AdvancedVideo] Generated ${template} style ASS subtitles`);
  return outPath;
}

async function generateAmbientAudio(outputPath, duration, mood = "elegant") {
  const moodSettings = {
    elegant: { freq: 220, modFreq: 0.5, volume: 0.15 },
    upbeat: { freq: 330, modFreq: 1.2, volume: 0.18 },
    warm: { freq: 196, modFreq: 0.3, volume: 0.12 },
    calm: { freq: 174, modFreq: 0.2, volume: 0.10 }
  };

  const settings = moodSettings[mood] || moodSettings.elegant;

  const args = [
    "-y",
    "-f", "lavfi",
    "-i", `aevalsrc=0.5*sin(${settings.freq}*2*PI*t)*sin(${settings.modFreq}*PI*t)+0.3*sin(${settings.freq*1.5}*2*PI*t)*sin(${settings.modFreq*0.7}*PI*t)+0.2*sin(${settings.freq*2}*2*PI*t)*sin(${settings.modFreq*1.3}*PI*t):d=${duration}:s=44100`,
    "-af", `volume=${settings.volume},afade=t=in:st=0:d=2,afade=t=out:st=${duration-2}:d=2,lowpass=f=2000,highpass=f=80`,
    "-c:a", "aac",
    "-b:a", "128k",
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", d => stderr += d.toString());
    ff.on("close", code => {
      if (code === 0) {
        console.log("[AdvancedVideo] Generated ambient audio:", mood);
        resolve(outputPath);
      } else {
        console.error("[AdvancedVideo] Audio generation failed:", stderr.slice(-500));
        resolve(null);
      }
    });
    ff.on("error", () => resolve(null));
  });
}

function isPathSafe(inputPath, allowedBase) {
  try {
    const resolvedPath = path.resolve(inputPath);
    const resolvedBase = path.resolve(allowedBase);
    return resolvedPath.startsWith(resolvedBase);
  } catch {
    return false;
  }
}

async function createAdvancedSlideshow(imagePaths, outputPath, promoText, options = {}) {
  const {
    duration = 25,
    template = "luxury",
    includeAudio = true
  } = options;

  const templateConfig = VIDEO_TEMPLATES[template] || VIDEO_TEMPLATES.luxury;
  const tempDir = path.join(__dirname, "../public/uploads/temp");
  await fs.mkdir(tempDir, { recursive: true });

  if (!imagePaths || imagePaths.length === 0) {
    throw new Error("لا توجد صور لإنشاء الفيديو");
  }

  const transition = 0.8;
  const numImages = imagePaths.length;
  const slideDuration = Math.max(3.0, (duration + (numImages - 1) * transition) / numImages);
  const totalDuration = (numImages * slideDuration) - ((numImages - 1) * transition);

  const publicDir = path.resolve(__dirname, "../public");
  const os = require('os');
  const tmpDir = os.tmpdir();
  const https = require('https');
  const http = require('http');

  // Helper function to download remote images
  async function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = require('fs').createWriteStream(destPath);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        require('fs').unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  const validPaths = [];
  const downloadedFiles = []; // Track downloaded files for cleanup

  for (const imgPath of imagePaths) {
    if (typeof imgPath !== 'string' || imgPath.length > 1000) {
      console.log(`[AdvancedVideo] ❌ Invalid image path type or too long`);
      continue;
    }

    // 🌐 Handle Cloudinary/remote URLs
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      try {
        const ext = path.extname(new URL(imgPath).pathname) || '.jpg';
        const tempFile = path.join(tmpDir, `remote_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
        console.log(`[AdvancedVideo] 📥 Downloading remote image: ${imgPath.substring(0, 80)}...`);
        await downloadImage(imgPath, tempFile);
        
        // Verify file was downloaded
        try {
          await fs.access(tempFile);
          const stats = await fs.stat(tempFile);
          if (stats.size === 0) {
            console.log(`[AdvancedVideo] ❌ Downloaded file is empty: ${tempFile}`);
            await fs.unlink(tempFile).catch(() => {});
            continue;
          }
          validPaths.push(tempFile);
          downloadedFiles.push(tempFile);
          console.log(`[AdvancedVideo] ✅ Downloaded to: ${tempFile} (${stats.size} bytes)`);
        } catch (verifyErr) {
          console.log(`[AdvancedVideo] ❌ Downloaded file verification failed: ${verifyErr.message}`);
          await fs.unlink(tempFile).catch(() => {});
          continue;
        }
        continue;
      } catch (dlErr) {
        console.error(`[AdvancedVideo] ❌ Failed to download: ${dlErr.message}`, dlErr);
        continue;
      }
    }

    // 🔒 Security: Block path traversal attempts
    if (imgPath.includes('..') || imgPath.includes('\0')) {
      console.log(`[AdvancedVideo] ❌ Blocked path traversal attempt: ${imgPath.substring(0, 50)}`);
      continue;
    }

    let fullPath = imgPath;
    if (imgPath.startsWith('/uploads/')) {
      fullPath = path.join(publicDir, imgPath);
    } else if (!imgPath.startsWith('/')) {
      fullPath = path.join(publicDir, imgPath);
    } else {
      fullPath = path.join(publicDir, imgPath);
    }

    // Allow paths in /tmp/ directory (for downloaded images)
    const isInPublicDir = isPathSafe(fullPath, publicDir);
    const isInTmpDir = fullPath.startsWith('/tmp/') || fullPath.startsWith(tmpDir);
    
    if (!isInPublicDir && !isInTmpDir) {
      console.log(`[AdvancedVideo] ❌ Path outside allowed directory: ${fullPath}`);
      continue;
    }

    try {
      await fs.access(fullPath);
      validPaths.push(fullPath);
      console.log(`[AdvancedVideo] ✅ Found image: ${fullPath}`);
    } catch (e) {
      console.log(`[AdvancedVideo] ❌ Image not found: ${fullPath}`);
    }
  }

  if (validPaths.length === 0) {
    console.error("[AdvancedVideo] ❌ No valid images found after processing:", {
      totalInput: imagePaths.length,
      processed: validPaths.length,
      imagePaths: imagePaths.map(p => typeof p === 'string' ? p.substring(0, 100) : typeof p)
    });
    throw new Error("لم يتم العثور على صور صالحة. يرجى التأكد من رفع الصور بشكل صحيح.");
  }

  console.log(`[AdvancedVideo] ✅ Found ${validPaths.length} valid images out of ${imagePaths.length} input paths`);

  const assPath = path.join(tempDir, `captions_${Date.now()}.ass`);
  const fontsDir = path.join(__dirname, "../public/fonts");
  const audioPath = path.join(tempDir, `audio_${Date.now()}.aac`);

  try {
    buildAdvancedAssFile(promoText, totalDuration, assPath, template);
  } catch (e) {
    console.warn("[AdvancedVideo] Failed to create ASS file:", e.message);
  }

  let hasAudio = false;
  if (includeAudio) {
    const audioResult = await generateAmbientAudio(audioPath, Math.ceil(totalDuration), templateConfig.musicMood);
    hasAudio = audioResult !== null;
  }

  const fps = 30;
  const W = 1920;
  const H = 1080;

  const kenBurnsEffects = KEN_BURNS_PRESETS[templateConfig.kenBurns] || KEN_BURNS_PRESETS.slow;
  const transitionTypes = templateConfig.transitions;

  let args = ["-y"];
  for (const img of validPaths) {
    args.push("-loop", "1", "-t", String(slideDuration), "-framerate", String(fps), "-i", img);
  }

  if (hasAudio) {
    args.push("-i", audioPath);
  }

  const filters = [];

  for (let i = 0; i < validPaths.length; i++) {
    const frames = Math.round(slideDuration * fps);
    const effect = kenBurnsEffects[i % kenBurnsEffects.length];
    filters.push(
      `[${i}:v]scale=8000:-1,zoompan=z='${effect.zoom}':x='${effect.x}':y='${effect.y}':d=${frames}:s=${W}x${H}:fps=${fps},format=yuv420p[v${i}]`
    );
  }

  let lastLabel = "v0";
  let currentOffset = slideDuration - transition;
  for (let i = 1; i < validPaths.length; i++) {
    const outLabel = `vx${i}`;
    const transType = transitionTypes[i % transitionTypes.length];
    filters.push(
      `[${lastLabel}][v${i}]xfade=transition=${transType}:duration=${transition}:offset=${currentOffset.toFixed(2)}[${outLabel}]`
    );
    lastLabel = outLabel;
    currentOffset += (slideDuration - transition);
  }

  const fadeInOut = `[${lastLabel}]fade=t=in:st=0:d=0.8,fade=t=out:st=${(totalDuration - 0.8).toFixed(2)}:d=0.8[vfaded]`;
  filters.push(fadeInOut);
  lastLabel = "vfaded";

  let finalLabel = lastLabel;
  try {
    await fs.access(assPath);
    await fs.access(fontsDir);
    const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontsDir = fontsDir.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(
      `[${lastLabel}]subtitles='${escapedAssPath}':fontsdir='${escapedFontsDir}'[vfinal]`
    );
    finalLabel = "vfinal";
  } catch (e) {
    console.warn("[AdvancedVideo] Subtitles skipped:", e.message);
  }

  args.push("-filter_complex", filters.join(";"));

  args.push(
    "-map", `[${finalLabel}]`
  );

  if (hasAudio) {
    args.push("-map", `${validPaths.length}:a`);
    args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-movflags", "+faststart",
    "-t", String(Math.ceil(totalDuration)),
    outputPath
  );

  return new Promise((resolve, reject) => {
    console.log("[AdvancedVideo] Running FFmpeg with", validPaths.length, "images, template:", template);
    const ff = spawn("ffmpeg", args);

    let stderr = "";
    ff.stderr.on("data", d => {
      stderr += d.toString();
    });

    ff.on("close", async (code) => {
      // Cleanup temporary files
      await fs.unlink(assPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});
      for (const f of downloadedFiles) {
        try { await fs.unlink(f); } catch {}
      }

      if (code === 0) {
        console.log("[AdvancedVideo] FFmpeg completed successfully");
        resolve(true);
      } else {
        console.error("[AdvancedVideo] FFmpeg failed with code", code);
        console.error("[AdvancedVideo] Last stderr:", stderr.slice(-1000));
        reject(new Error("فشل في إنشاء الفيديو"));
      }
    });

    ff.on("error", err => {
      console.error("[AdvancedVideo] FFmpeg spawn error:", err);
      reject(new Error("فشل في تشغيل FFmpeg"));
    });
  });
}

module.exports = {
  VIDEO_TEMPLATES,
  generateEnhancedPromoText,
  createAdvancedSlideshow,
  buildAdvancedAssFile,
  generateAmbientAudio
};
