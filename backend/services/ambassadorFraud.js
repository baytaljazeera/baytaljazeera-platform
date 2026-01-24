const OpenAI = require('openai');
const db = require('../db');

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function analyzeAmbassadorRequest(requestId) {
  const requestResult = await db.query(`
    SELECT 
      ar.*,
      u.id as user_id, u.name as user_name, u.email as user_email, u.phone,
      u.ambassador_code, u.ambassador_floors, u.referral_count,
      u.created_at as user_joined_at,
      u.total_floors_earned
    FROM ambassador_requests ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.id = $1
  `, [requestId]);
  
  if (requestResult.rows.length === 0) {
    throw new Error('الطلب غير موجود');
  }
  
  const request = requestResult.rows[0];
  
  const referralsResult = await db.query(`
    SELECT 
      r.id, r.created_at,
      referred.id as referred_id, referred.name as referred_name, 
      referred.email as referred_email, referred.phone as referred_phone,
      referred.created_at as referred_joined,
      r.status
    FROM referrals r
    JOIN users referred ON referred.id = r.referred_id
    WHERE r.referrer_id = $1
    ORDER BY r.created_at DESC
    LIMIT 50
  `, [request.user_id]);
  
  const previousRequestsResult = await db.query(`
    SELECT id, status, floors_at_request, created_at, reviewed_at
    FROM ambassador_requests
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [request.user_id]);
  
  const referrals = referralsResult.rows;
  const previousRequests = previousRequestsResult.rows;
  
  const emailPatterns = analyzeEmailPatterns(referrals);
  const signupPatterns = analyzeSignupPatterns(referrals);
  const namePatterns = analyzeNamePatterns(referrals);
  const phonePatterns = analyzePhonePatterns(referrals);
  const crossChannelPatterns = analyzeCrossChannelPatterns(referrals);
  
  const analysisData = {
    ambassador: {
      email_domain: request.user_email?.split('@')[1] || 'unknown',
      account_age_days: Math.floor((Date.now() - new Date(request.user_joined_at).getTime()) / (1000 * 60 * 60 * 24)),
      floors_at_request: request.floors_at_request,
      total_referrals: referrals.length,
      completed_referrals: referrals.filter(r => r.status === 'completed').length,
      previous_requests: previousRequests.length
    },
    patterns: {
      similar_emails_count: emailPatterns.similar,
      same_domain_emails_count: emailPatterns.sameDomain,
      rapid_signups_count: signupPatterns.rapid,
      similar_names_count: namePatterns.similar,
      suspicious_names_count: namePatterns.suspicious,
      duplicate_phones_count: phonePatterns.duplicates,
      similar_phones_count: phonePatterns.similar,
      suspicious_phones_count: phonePatterns.suspicious,
      phone_email_correlation_count: crossChannelPatterns.phoneEmailGroups,
      same_phone_prefix_same_domain: crossChannelPatterns.samePhonePrefixSameDomain,
      suspicious_combinations: crossChannelPatterns.suspiciousCombinations
    },
    referrals_stats: {
      total_count: referrals.length,
      completed_count: referrals.filter(r => r.status === 'completed').length,
      pending_count: referrals.filter(r => r.status === 'pending').length,
      avg_time_between_signups_hours: calculateAvgTimeBetweenSignups(referrals),
      unique_email_domains: [...new Set(referrals.map(r => r.referred_email?.split('@')[1]).filter(Boolean))].length,
      referrals_with_phones: referrals.filter(r => r.referred_phone).length
    }
  };
  
  const prompt = `أنت خبير في كشف الاحتيال. قم بتحليل بيانات طلب مكافأة سفير لاكتشاف علامات التلاعب.

بيانات الطلب:
${JSON.stringify(analysisData, null, 2)}

قم بتحليل البيانات وأعطني:
1. نسبة خطر التلاعب (0-100)
2. قائمة بالعلامات المشبوهة إن وجدت
3. توصية (قبول/مراجعة/رفض)
4. شرح مختصر

أجب بصيغة JSON فقط:
{
  "risk_score": number,
  "risk_level": "low" | "medium" | "high" | "critical",
  "suspicious_flags": ["علامة 1", "علامة 2"],
  "recommendation": "approve" | "review" | "reject",
  "explanation": "شرح مختصر",
  "details": {
    "email_pattern_risk": "low/medium/high",
    "signup_pattern_risk": "low/medium/high",
    "name_pattern_risk": "low/medium/high",
    "phone_pattern_risk": "low/medium/high"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: 'أنت محلل أمني متخصص في كشف الاحتيال. أجب بـ JSON فقط بدون أي نص إضافي.' },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 1000,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    const analysis = JSON.parse(content);
    
    await db.query(`
      UPDATE ambassador_requests 
      SET risk_score = $2, risk_notes = $3, ai_analyzed_at = NOW()
      WHERE id = $1
    `, [requestId, analysis.risk_score, JSON.stringify(analysis)]);
    
    return {
      success: true,
      analysis,
      raw_patterns: analysisData.patterns
    };
  } catch (error) {
    console.error('AI Analysis error:', error);
    return {
      success: false,
      error: error.message,
      fallback_analysis: {
        risk_score: calculateFallbackRiskScore(analysisData.patterns),
        risk_level: 'unknown',
        suspicious_flags: Object.entries(analysisData.patterns)
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k}: ${v}`),
        recommendation: 'review',
        explanation: 'تم استخدام التحليل الآلي البديل بسبب خطأ في AI'
      }
    };
  }
}

function analyzeEmailPatterns(referrals) {
  const emails = referrals.map(r => r.referred_email?.toLowerCase()).filter(Boolean);
  const domains = emails.map(e => e.split('@')[1]);
  
  const domainCount = {};
  domains.forEach(d => { domainCount[d] = (domainCount[d] || 0) + 1; });
  const sameDomain = Object.values(domainCount).filter(c => c > 2).length;
  
  const similar = findSimilarStrings(emails, 0.7).length;
  
  return { similar, sameDomain };
}

function analyzeSignupPatterns(referrals) {
  let rapid = 0;
  const sortedReferrals = [...referrals].sort((a, b) => 
    new Date(a.referred_joined).getTime() - new Date(b.referred_joined).getTime()
  );
  
  for (let i = 1; i < sortedReferrals.length; i++) {
    const diff = new Date(sortedReferrals[i].referred_joined).getTime() - 
                 new Date(sortedReferrals[i-1].referred_joined).getTime();
    if (diff < 5 * 60 * 1000) rapid++;
  }
  
  return { rapid };
}

function analyzeNamePatterns(referrals) {
  const names = referrals.map(r => r.referred_name).filter(Boolean);
  
  const similar = findSimilarStrings(names, 0.6).length;
  
  const suspiciousPatterns = /^(test|user|temp|fake|أ{3,}|ب{3,}|[0-9]{4,})/i;
  const suspicious = names.filter(n => suspiciousPatterns.test(n)).length;
  
  return { similar, suspicious };
}

function analyzePhonePatterns(referrals) {
  // تطبيع أرقام الجوالات - إزالة الأصفار البادئة ورمز الدولة
  const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.replace(/\D/g, ''); // إزالة غير الأرقام
    // إزالة رموز الدول الشائعة
    p = p.replace(/^00/, '');
    p = p.replace(/^966/, ''); // السعودية
    p = p.replace(/^971/, ''); // الإمارات
    p = p.replace(/^965/, ''); // الكويت
    p = p.replace(/^974/, ''); // قطر
    p = p.replace(/^973/, ''); // البحرين
    p = p.replace(/^968/, ''); // عمان
    p = p.replace(/^20/, '');  // مصر
    p = p.replace(/^961/, ''); // لبنان
    p = p.replace(/^90/, '');  // تركيا
    // إزالة الصفر البادئ
    p = p.replace(/^0+/, '');
    return p.length >= 7 ? p : null;
  };
  
  const phones = referrals
    .map(r => normalizePhone(r.referred_phone))
    .filter(Boolean);
  
  if (phones.length === 0) return { duplicates: 0, similar: 0, suspicious: 0 };
  
  // أرقام مكررة بالضبط
  const phoneCount = {};
  phones.forEach(p => { phoneCount[p] = (phoneCount[p] || 0) + 1; });
  const duplicates = Object.values(phoneCount).filter(c => c > 1).length;
  
  // أرقام متشابهة (فرق رقم واحد أو اثنين فقط) - مقارنة فقط للأرقام بنفس الطول
  let similar = 0;
  for (let i = 0; i < phones.length; i++) {
    for (let j = i + 1; j < phones.length; j++) {
      // مقارنة فقط إذا كان الطول متساوياً أو فرق 1
      if (Math.abs(phones[i].length - phones[j].length) <= 1) {
        const diff = hammingDistanceSafe(phones[i], phones[j]);
        if (diff > 0 && diff <= 2) similar++;
      }
    }
  }
  
  // أرقام مشبوهة (تتبع أنماط معينة)
  const suspiciousPatterns = [
    /^(.)\1{6,}/,           // رقم مكرر 7 مرات أو أكثر (1111111)
    /^1234567/,             // تسلسل صاعد
    /^7654321/,             // تسلسل نازل
    /^0{5,}/,               // أصفار كثيرة
    /(.{2,})\1{3,}/         // نمط متكرر (123123123)
  ];
  const suspicious = phones.filter(p => 
    suspiciousPatterns.some(pattern => pattern.test(p))
  ).length;
  
  return { duplicates, similar, suspicious };
}

function analyzeCrossChannelPatterns(referrals) {
  const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.replace(/\D/g, '');
    p = p.replace(/^00/, '');
    p = p.replace(/^(966|971|965|974|973|968|20|961|90)/, '');
    p = p.replace(/^0+/, '');
    return p.length >= 7 ? p : null;
  };
  
  const data = referrals.map(r => ({
    phone: normalizePhone(r.referred_phone),
    phonePrefix: normalizePhone(r.referred_phone)?.substring(0, 4),
    email: r.referred_email?.toLowerCase(),
    emailDomain: r.referred_email?.split('@')[1]?.toLowerCase()
  })).filter(d => d.phone && d.email);
  
  if (data.length < 2) return { phoneEmailGroups: 0, samePhonePrefixSameDomain: 0, suspiciousCombinations: 0 };
  
  const groups = {};
  data.forEach(d => {
    const key = `${d.phonePrefix}_${d.emailDomain}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  
  const phoneEmailGroups = Object.keys(groups).length;
  const samePhonePrefixSameDomain = Object.values(groups).filter(c => c >= 3).length;
  
  let suspiciousCombinations = 0;
  Object.entries(groups).forEach(([key, count]) => {
    if (count >= 2) {
      suspiciousCombinations++;
    }
  });
  
  return { phoneEmailGroups, samePhonePrefixSameDomain, suspiciousCombinations };
}

function hammingDistanceSafe(s1, s2) {
  // للأرقام بأطوال مختلفة قليلاً، نحسب أقل فرق ممكن
  if (s1.length === s2.length) {
    return hammingDistance(s1, s2);
  }
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  let minDiff = Infinity;
  // نجرب محاذاة الرقم الأقصر بأماكن مختلفة
  for (let offset = 0; offset <= longer.length - shorter.length; offset++) {
    let diff = longer.length - shorter.length; // فرق الطول = عدم تطابق مبدئي
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i + offset]) diff++;
    }
    minDiff = Math.min(minDiff, diff);
  }
  return minDiff;
}

function hammingDistance(s1, s2) {
  if (s1.length !== s2.length) {
    const maxLen = Math.max(s1.length, s2.length);
    s1 = s1.padStart(maxLen, '0');
    s2 = s2.padStart(maxLen, '0');
  }
  let distance = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) distance++;
  }
  return distance;
}

function findSimilarStrings(strings, threshold) {
  const similar = [];
  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      if (stringSimilarity(strings[i], strings[j]) > threshold) {
        similar.push([strings[i], strings[j]]);
      }
    }
  }
  return similar;
}

function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i-1] === s2[j-1]) {
        dp[i][j] = dp[i-1][j-1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
  }
  
  return dp[m][n];
}

function calculateFallbackRiskScore(patterns) {
  let score = 0;
  const similarEmails = patterns.similar_emails_count || patterns.similar_emails || 0;
  const sameDomain = patterns.same_domain_emails_count || patterns.same_domain_emails || 0;
  const rapidSignups = patterns.rapid_signups_count || patterns.rapid_signups || 0;
  const similarNames = patterns.similar_names_count || patterns.similar_names || 0;
  const suspiciousNames = patterns.suspicious_names_count || patterns.suspicious_names || 0;
  const duplicatePhones = patterns.duplicate_phones_count || 0;
  const similarPhones = patterns.similar_phones_count || 0;
  const suspiciousPhones = patterns.suspicious_phones_count || 0;
  const samePhonePrefixSameDomain = patterns.same_phone_prefix_same_domain || 0;
  const suspiciousCombinations = patterns.suspicious_combinations || 0;
  
  // أنماط الإيميلات
  if (similarEmails > 2) score += 25;
  if (sameDomain > 3) score += 15;
  
  // أنماط التسجيل
  if (rapidSignups > 2) score += 30;
  
  // أنماط الأسماء
  if (similarNames > 2) score += 20;
  if (suspiciousNames > 0) score += 10 * suspiciousNames;
  
  // أنماط الجوالات (عالية الخطورة)
  if (duplicatePhones > 0) score += 35;  // أرقام مكررة = خطر عالي جداً
  if (similarPhones > 1) score += 25;    // أرقام متشابهة
  if (suspiciousPhones > 0) score += 15; // أرقام مشبوهة
  
  // الأنماط المتقاطعة (خطر عالي جداً)
  if (samePhonePrefixSameDomain > 0) score += 40; // نفس بداية الهاتف + نفس الدومين
  if (suspiciousCombinations > 0) score += 30;    // توليفات مشبوهة
  
  return Math.min(score, 100);
}

function calculateAvgTimeBetweenSignups(referrals) {
  if (referrals.length < 2) return null;
  
  const sortedReferrals = [...referrals]
    .filter(r => r.referred_joined)
    .sort((a, b) => new Date(a.referred_joined).getTime() - new Date(b.referred_joined).getTime());
  
  if (sortedReferrals.length < 2) return null;
  
  let totalDiff = 0;
  for (let i = 1; i < sortedReferrals.length; i++) {
    const diff = new Date(sortedReferrals[i].referred_joined).getTime() - 
                 new Date(sortedReferrals[i-1].referred_joined).getTime();
    totalDiff += diff;
  }
  
  const avgMs = totalDiff / (sortedReferrals.length - 1);
  return Math.round(avgMs / (1000 * 60 * 60) * 10) / 10;
}

module.exports = {
  analyzeAmbassadorRequest
};
