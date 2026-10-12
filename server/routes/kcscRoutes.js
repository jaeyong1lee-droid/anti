/**
 * 🏛️ 국가건설기준(KCSC) KDS/KCS 전용 라우터 (kcscRoutes.js)
 * 
 * - KDS/KCS 기준 지능형 검색 API
 * - 조항별 전문 및 법정 기준값(허용오차, 안전율, 양생일령) / 시공·품질검사 항목 조회
 * - 답안 및 공학 명제 KCSC 공식 부합성 검증 API
 */

import express from 'express';
import {
  searchStandards,
  getCleanClauses,
  extractVerificationCriteria,
  getKcscVerificationContext,
  verifyStatementAgainstKcsc
} from '../services/kcscService.js';

const router = express.Router();

/**
 * GET /api/kcsc/search
 * 국가건설기준 검색 (예: /api/kcsc/search?q=연약지반&type=KCS)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type, limit } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: '검색어(q)를 입력하십시오.' });
    }
    const maxLimit = limit ? Math.min(Number(limit), 50) : 10;
    const results = await searchStandards(q, type || null, maxLimit);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('[kcscRoutes] /search error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kcsc/viewer/:docType/:code
 * 특정 기준 전문 조항 조회 (예: /api/kcsc/viewer/KCS/113030)
 */
router.get('/viewer/:docType/:code', async (req, res) => {
  try {
    const { docType, code } = req.params;
    const clauses = await getCleanClauses(docType, code);
    if (!clauses || clauses.length === 0) {
      return res.status(404).json({ success: false, error: '해당 기준 조항을 찾을 수 없습니다.' });
    }
    res.json({
      success: true,
      docType: docType.toUpperCase(),
      code,
      docName: clauses[0]?.docName || '',
      count: clauses.length,
      clauses
    });
  } catch (err) {
    console.error('[kcscRoutes] /viewer error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kcsc/criteria/:docType/:code
 * 특정 기준의 기준값(허용오차, 안전율, 시간) 및 시공/품질검사 추출 항목 조회
 */
router.get('/criteria/:docType/:code', async (req, res) => {
  try {
    const { docType, code } = req.params;
    const clauses = await getCleanClauses(docType, code);
    if (!clauses || clauses.length === 0) {
      return res.status(404).json({ success: false, error: '해당 기준 조항을 찾을 수 없습니다.' });
    }
    const criteria = extractVerificationCriteria(clauses);
    res.json({
      success: true,
      docType: docType.toUpperCase(),
      code,
      docName: clauses[0]?.docName || '',
      summary: {
        thresholdsCount: criteria.thresholds.length,
        inspectionItemsCount: criteria.inspectionItems.length,
        environmentalItemsCount: criteria.environmentalItems.length
      },
      criteria
    });
  } catch (err) {
    console.error('[kcscRoutes] /criteria error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/kcsc/grounding
 * AI 프롬프트 주입용 KCSC Grounding 마크다운 블록 생성
 */
router.get('/grounding', async (req, res) => {
  try {
    const { q, category } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: '검색 문맥(q)을 입력하십시오.' });
    }
    const context = await getKcscVerificationContext(q, category || '');
    res.json({ success: true, groundingContext: context });
  } catch (err) {
    console.error('[kcscRoutes] /grounding error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/kcsc/verify
 * 특정 진술/수치/답안의 KCSC 공식 기준 부합성 검증
 */
router.post('/verify', async (req, res) => {
  try {
    const { statement, docType, code, query } = req.body;
    if (!statement) {
      return res.status(400).json({ success: false, error: '검증할 문장(statement)을 제공하십시오.' });
    }

    let targetDocType = docType || 'KCS';
    let targetCode = code;

    // 만약 code가 명시되지 않았다면 query 또는 statement로 기준 자동 탐색
    if (!targetCode) {
      const searchTarget = query || statement;
      const matched = await searchStandards(searchTarget, null, 1);
      if (matched && matched.length > 0) {
        targetDocType = matched[0].docType;
        targetCode = matched[0].code;
      } else {
        return res.json({
          success: false,
          verified: false,
          reason: '관련 국가건설기준 문서를 자동으로 식별하지 못했습니다.'
        });
      }
    }

    const verificationResult = await verifyStatementAgainstKcsc(statement, targetDocType, targetCode);
    res.json({
      success: true,
      docType: targetDocType,
      code: targetCode,
      ...verificationResult
    });
  } catch (err) {
    console.error('[kcscRoutes] /verify error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
