/**
 * 🏛️ 국가건설기준(KCSC) KDS/KCS 전용 라우터 (kcscRoutes.js)
 * 
 * - KDS/KCS 기준 지능형 검색 API
 * - 조항별 전문 및 법정 기준값(허용오차, 안전율, 양생일령) / 시공·품질검사 항목 조회
 * - 답안 및 공학 명제 KCSC 공식 부합성 검증 API
 */

import express from 'express';
import { getKcscVerificationContext } from '../services/kcscService.js';

const router = express.Router();

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

export default router;
