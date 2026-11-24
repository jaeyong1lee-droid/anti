/**
 * 📚 위키피디아(Wikipedia) 지반공학 지식 조회 라우터 (wikipediaRoutes.js)
 * 
 * - 위키백과 공식 REST API 기반 검색 및 요약(Summary) 엔드포인트
 * - AI 튜터 질문 및 문제 출제 전 지반공학 사전 지식(Grounding) 조회
 */

import express from 'express';
import { getWikipediaKnowledge } from '../services/wikipediaService.js';

const router = express.Router();

/**
 * GET /api/wiki/grounding
 * AI 프롬프트 사전 주입용 위키백과 마크다운 Grounding 블록 생성
 */
router.get('/grounding', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: '검색 문맥(q)을 입력하십시오.' });
    }
    const grounding = await getWikipediaKnowledge(q);
    res.json({ success: true, groundingContext: grounding });
  } catch (err) {
    console.error('[wikipediaRoutes] /grounding error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
