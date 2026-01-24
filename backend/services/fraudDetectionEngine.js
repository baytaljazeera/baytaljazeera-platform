const db = require('../db');

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    const OpenAI = require('openai');
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

const RULES = {
  SAME_IP: { weight: 30, name: 'نفس عنوان IP', nameEn: 'same_ip' },
  SIMILAR_EMAIL: { weight: 25, name: 'إيميلات متشابهة', nameEn: 'similar_email' },
  SIMILAR_NAME: { weight: 20, name: 'أسماء متشابهة', nameEn: 'similar_name' },
  RAPID_SIGNUP: { weight: 35, name: 'تسجيلات سريعة متتالية', nameEn: 'rapid_signup' },
  SEQUENTIAL_PATTERN: { weight: 40, name: 'نمط تسلسلي', nameEn: 'sequential_pattern' },
  NO_ACTIVITY: { weight: 15, name: 'لا نشاط بعد التسجيل', nameEn: 'no_activity' },
  SAME_DEVICE: { weight: 25, name: 'نفس الجهاز', nameEn: 'same_device' }
};

function getRiskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getRecommendation(riskLevel) {
  switch (riskLevel) {
    case 'critical': return 'flag_immediately';
    case 'high': return 'review_required';
    case 'medium': return 'monitor';
    default: return 'none';
  }
}

function levenshteinDistance(a, b) {
  if (!a || !b) return 100;
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 0;
  
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function emailBaseSimilarity(email1, email2) {
  if (!email1 || !email2) return 0;
  const base1 = email1.split('@')[0].replace(/[0-9._-]/g, '');
  const base2 = email2.split('@')[0].replace(/[0-9._-]/g, '');
  if (base1 === base2) return 100;
  const distance = levenshteinDistance(base1, base2);
  const maxLen = Math.max(base1.length, base2.length);
  return Math.max(0, 100 - (distance / maxLen * 100));
}

function hasSequentialPattern(items) {
  if (items.length < 5) return false;
  
  const emails = items.map(i => i.email?.split('@')[0] || '').filter(e => e);
  const numberedEmails = emails.filter(e => /\d+$/.test(e));
  
  if (numberedEmails.length >= 3) {
    const numbers = numberedEmails.map(e => parseInt(e.match(/\d+$/)?.[0] || '0'));
    numbers.sort((a, b) => a - b);
    
    let sequential = 0;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] - numbers[i-1] <= 2) sequential++;
    }
    if (sequential >= 2) return true;
  }
  
  return false;
}

async function analyzeAmbassadorReferrals(ambassadorId, options = {}) {
  const { buildingNumber, limit = 100 } = options;
  
  let query = `
    SELECT 
      r.id, r.referrer_id, r.referred_id, r.status, r.created_at,
      NULL::TEXT as ip_address, NULL::TEXT as user_agent, NULL::TEXT as device_fingerprint,
      u.email, u.name, u.created_at as user_created_at
    FROM referrals r
    JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id = $1
    ORDER BY r.created_at DESC
  `;
  
  const params = [ambassadorId]; // UUID string, not integer
  
  if (buildingNumber) {
    const offset = (buildingNumber - 1) * 20;
    query += ` LIMIT 20 OFFSET $2`;
    params.push(offset);
  } else if (limit) {
    query += ` LIMIT $2`;
    params.push(limit);
  }
  
  const result = await db.query(query, params);
  const referrals = result.rows;
  
  if (referrals.length === 0) {
    return { referrals: [], analysis: null };
  }
  
  const analysis = {
    total: referrals.length,
    riskScores: [],
    summary: {
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0
    },
    patterns: {
      ipGroups: {},
      emailSimilarities: [],
      rapidSignups: [],
      sequentialPattern: false
    }
  };
  
  const ipGroups = {};
  referrals.forEach(r => {
    if (r.ip_address) {
      if (!ipGroups[r.ip_address]) ipGroups[r.ip_address] = [];
      ipGroups[r.ip_address].push(r);
    }
  });
  analysis.patterns.ipGroups = ipGroups;
  
  for (let i = 0; i < referrals.length; i++) {
    const ref = referrals[i];
    let score = 0;
    const triggeredRules = [];
    
    if (ref.ip_address && ipGroups[ref.ip_address]?.length > 1) {
      const sameIpCount = ipGroups[ref.ip_address].length;
      const ipScore = Math.min(RULES.SAME_IP.weight * (sameIpCount - 1), 60);
      score += ipScore;
      triggeredRules.push({
        rule: RULES.SAME_IP.nameEn,
        name: RULES.SAME_IP.name,
        score: ipScore,
        details: `${sameIpCount} إحالات من نفس IP`
      });
    }
    
    for (let j = 0; j < referrals.length; j++) {
      if (i !== j) {
        const similarity = emailBaseSimilarity(ref.email, referrals[j].email);
        if (similarity > 70) {
          score += RULES.SIMILAR_EMAIL.weight;
          triggeredRules.push({
            rule: RULES.SIMILAR_EMAIL.nameEn,
            name: RULES.SIMILAR_EMAIL.name,
            score: RULES.SIMILAR_EMAIL.weight,
            details: `تشابه ${Math.round(similarity)}% مع ${referrals[j].email}`
          });
          break;
        }
      }
    }
    
    for (let j = 0; j < referrals.length; j++) {
      if (i !== j) {
        const distance = levenshteinDistance(ref.name, referrals[j].name);
        if (distance <= 3 && ref.name && referrals[j].name) {
          score += RULES.SIMILAR_NAME.weight;
          triggeredRules.push({
            rule: RULES.SIMILAR_NAME.nameEn,
            name: RULES.SIMILAR_NAME.name,
            score: RULES.SIMILAR_NAME.weight,
            details: `تشابه مع "${referrals[j].name}"`
          });
          break;
        }
      }
    }
    
    if (i > 0) {
      const prevTime = new Date(referrals[i-1].created_at).getTime();
      const currTime = new Date(ref.created_at).getTime();
      const diffMinutes = Math.abs(prevTime - currTime) / 60000;
      
      if (diffMinutes < 5) {
        score += RULES.RAPID_SIGNUP.weight;
        triggeredRules.push({
          rule: RULES.RAPID_SIGNUP.nameEn,
          name: RULES.RAPID_SIGNUP.name,
          score: RULES.RAPID_SIGNUP.weight,
          details: `فقط ${Math.round(diffMinutes)} دقائق بين الإحالات`
        });
      }
    }
    
    const riskLevel = getRiskLevel(Math.min(score, 100));
    const recommendation = getRecommendation(riskLevel);
    
    analysis.riskScores.push({
      referralId: ref.id,
      referredId: ref.referred_id,
      email: ref.email,
      name: ref.name,
      score: Math.min(score, 100),
      riskLevel,
      triggeredRules,
      recommendation
    });
    
    switch (riskLevel) {
      case 'critical': analysis.summary.criticalCount++; break;
      case 'high': analysis.summary.highCount++; break;
      case 'medium': analysis.summary.mediumCount++; break;
      default: analysis.summary.lowCount++;
    }
  }
  
  analysis.patterns.sequentialPattern = hasSequentialPattern(referrals);
  if (analysis.patterns.sequentialPattern) {
    analysis.riskScores.forEach(r => {
      r.score = Math.min(r.score + RULES.SEQUENTIAL_PATTERN.weight, 100);
      r.triggeredRules.push({
        rule: RULES.SEQUENTIAL_PATTERN.nameEn,
        name: RULES.SEQUENTIAL_PATTERN.name,
        score: RULES.SEQUENTIAL_PATTERN.weight,
        details: 'نمط إيميلات تسلسلي مكتشف'
      });
      r.riskLevel = getRiskLevel(r.score);
      r.recommendation = getRecommendation(r.riskLevel);
    });
  }
  
  return { referrals, analysis };
}

async function getAIExplanation(analysis, ambassadorName) {
  if (!analysis || analysis.summary.criticalCount + analysis.summary.highCount === 0) {
    return null;
  }
  
  const openai = getOpenAI();
  if (!openai) {
    console.log('OpenAI not configured, skipping AI explanation');
    return null;
  }
  
  const suspiciousItems = analysis.riskScores
    .filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high')
    .slice(0, 10);
  
  const prompt = `
أنت خبير في كشف الاحتيال في برامج الإحالة. حلل البيانات التالية وقدم تقريراً مختصراً:

السفير: ${ambassadorName}
إجمالي الإحالات: ${analysis.total}
خطر حرج: ${analysis.summary.criticalCount}
خطر عالي: ${analysis.summary.highCount}
خطر متوسط: ${analysis.summary.mediumCount}

الإحالات المشبوهة:
${suspiciousItems.map(s => `- ${s.email}: نقاط ${s.score}، الأسباب: ${s.triggeredRules.map(r => r.name).join('، ')}`).join('\n')}

${analysis.patterns.sequentialPattern ? 'تحذير: تم اكتشاف نمط إيميلات تسلسلي (مثل user1, user2, user3)' : ''}

قدم:
1. ملخص الوضع (جملتين)
2. احتمالية التلاعب (نسبة مئوية)
3. التوصية (جملة واحدة)

أجب بالعربية فقط.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

async function runFullScan(ambassadorId, options = {}) {
  const { triggeredBy, buildingNumber, saveResults = true } = options;
  
  const ambassadorResult = await db.query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [ambassadorId]
  );
  
  if (ambassadorResult.rows.length === 0) {
    throw new Error('السفير غير موجود');
  }
  
  const ambassador = ambassadorResult.rows[0];
  
  let scanId = null;
  if (saveResults) {
    const scanResult = await db.query(`
      INSERT INTO ai_fraud_scans (ambassador_id, building_number, scan_type, status, triggered_by)
      VALUES ($1, $2, $3, 'processing', $4)
      RETURNING id
    `, [ambassadorId, buildingNumber || null, triggeredBy ? 'manual' : 'auto', triggeredBy || null]);
    scanId = scanResult.rows[0].id;
  }
  
  try {
    const { referrals, analysis } = await analyzeAmbassadorReferrals(ambassadorId, { buildingNumber });
    
    if (!analysis) {
      if (saveResults && scanId) {
        await db.query(`
          UPDATE ai_fraud_scans SET status = 'completed', completed_at = NOW(),
          summary = 'لا توجد إحالات للفحص'
          WHERE id = $1
        `, [scanId]);
      }
      return { success: true, message: 'لا توجد إحالات', analysis: null };
    }
    
    let aiExplanation = null;
    if (analysis.summary.criticalCount > 0 || analysis.summary.highCount > 2) {
      aiExplanation = await getAIExplanation(analysis, ambassador.name);
    }
    
    if (saveResults) {
      for (const risk of analysis.riskScores) {
        await db.query(`
          INSERT INTO referral_risk_scores 
          (referral_id, ambassador_id, risk_score, risk_level, triggered_rules, recommended_action, assessed_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (referral_id) DO UPDATE SET
            risk_score = EXCLUDED.risk_score,
            risk_level = EXCLUDED.risk_level,
            triggered_rules = EXCLUDED.triggered_rules,
            recommended_action = EXCLUDED.recommended_action,
            assessed_at = NOW()
        `, [
          risk.referralId,
          ambassadorId,
          risk.score,
          risk.riskLevel,
          JSON.stringify(risk.triggeredRules),
          risk.recommendation,
          triggeredBy ? 'admin' : 'system'
        ]);
      }
      
      if (scanId) {
        await db.query(`
          UPDATE ai_fraud_scans SET 
            status = 'completed',
            completed_at = NOW(),
            total_referrals = $2,
            flagged_count = $3,
            high_risk_count = $4,
            medium_risk_count = $5,
            low_risk_count = $6,
            summary = $7,
            ai_report = $8
          WHERE id = $1
        `, [
          scanId,
          analysis.total,
          analysis.summary.criticalCount,
          analysis.summary.highCount,
          analysis.summary.mediumCount,
          analysis.summary.lowCount,
          aiExplanation || 'الفحص مكتمل',
          JSON.stringify({ analysis, aiExplanation })
        ]);
      }
    }
    
    return {
      success: true,
      scanId,
      ambassador: { id: ambassador.id, name: ambassador.name },
      analysis,
      aiExplanation,
      summary: {
        total: analysis.total,
        critical: analysis.summary.criticalCount,
        high: analysis.summary.highCount,
        medium: analysis.summary.mediumCount,
        low: analysis.summary.lowCount
      }
    };
  } catch (error) {
    if (saveResults && scanId) {
      await db.query(`
        UPDATE ai_fraud_scans SET status = 'failed', summary = $2, completed_at = NOW()
        WHERE id = $1
      `, [scanId, error.message]);
    }
    throw error;
  }
}

async function getScanHistory(ambassadorId, limit = 10) {
  const result = await db.query(`
    SELECT * FROM ai_fraud_scans
    WHERE ambassador_id = $1
    ORDER BY started_at DESC
    LIMIT $2
  `, [ambassadorId, limit]);
  
  return result.rows;
}

async function getReferralRiskScores(ambassadorId, buildingNumber) {
  const offset = buildingNumber ? (buildingNumber - 1) * 20 : 0;
  const limit = buildingNumber ? 20 : 1000;
  
  const result = await db.query(`
    SELECT 
      rrs.*,
      r.referred_id,
      u.email,
      u.name
    FROM referral_risk_scores rrs
    JOIN referrals r ON r.id = rrs.referral_id
    JOIN users u ON u.id = r.referred_id
    WHERE rrs.ambassador_id = $1
    ORDER BY rrs.risk_score DESC
    LIMIT $2 OFFSET $3
  `, [ambassadorId, limit, offset]);
  
  return result.rows;
}

module.exports = {
  analyzeAmbassadorReferrals,
  getAIExplanation,
  runFullScan,
  getScanHistory,
  getReferralRiskScores,
  RULES
};
