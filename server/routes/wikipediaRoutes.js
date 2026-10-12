/**
 * 📚 위키피디아(Wikipedia) 지반공학 지식 조회 라우터 (wikipediaRoutes.js)
 * 
 * - 위키백과 공식 REST API 기반 검색 및 요약(Summary) 엔드포인트
 * - AI 튜터 질문 및 문제 출제 전 지반공학 사전 지식(Grounding) 조회
 */

import express from 'express';
import {
  getWikiSummary,
  searchWiki,
  getWikipediaKnowledge
} from '../services/wikipediaService.js';

const router = express.Router();

/**
 * GET /api/wiki/summary
 * 특정 표제어 요약 조회 (예: /api/wiki/summary?title=지반공학&lang=ko)
 */
router.get('/summary', async (req, res) => {
  try {
    const { title, lang } = req.query;
    if (!title) {
      return res.status(400).json({ success: false, error: '표제어(title)를 입력하십시오.' });
    }
    const summary = await getWikiSummary(title, lang || 'ko');
    if (!summary) {
      return res.status(404).json({ success: false, error: '해당 표제어 정보를 찾지 못했습니다.' });
    }
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('[wikipediaRoutes] /summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/wiki/search
 * 위키백과 본문/제목 검색 (예: /api/wiki/search?q=연약지반&lang=ko)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, lang, limit } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: '검색어(q)를 입력하십시오.' });
    }
    const maxLimit = limit ? Math.min(Number(limit), 20) : 5;
    const results = await searchWiki(q, lang || 'ko', maxLimit);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('[wikipediaRoutes] /search error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
