import { getMatchingTopicContent } from './aiService.js';
import { getKcscVerificationContext } from './kcscService.js';
import { getWikipediaKnowledge } from './wikipediaService.js';

/**
 * Fetch combined [topic, kcsc, wiki] engineering grounding in parallel.
 * Used by uniform endpoints where the join order and error fallback match.
 */
export async function fetchStandardGrounding(query, options = {}, deps = {}) {
  const {
    topicId = null,
    category = '',
    maxChars = 4500,
    skipTopic = false,
    logTag = 'grounding'
  } = options || {};

  const {
    getTopic = getMatchingTopicContent,
    getKcsc = getKcscVerificationContext,
    getWiki = getWikipediaKnowledge
  } = deps || {};

  let topicGrounding = '';
  let kcscGrounding = '';
  let wikiGrounding = '';

  try {
    const [tRes, kRes, wRes] = await Promise.allSettled([
      skipTopic ? Promise.resolve('') : getTopic(query, topicId || null, maxChars),
      getKcsc(query, category || ''),
      getWiki(query)
    ]);
    if (tRes.status === 'fulfilled') topicGrounding = tRes.value || '';
    if (kRes.status === 'fulfilled') kcscGrounding = kRes.value || '';
    if (wRes.status === 'fulfilled') wikiGrounding = wRes.value || '';
  } catch (gErr) {
    console.warn(`[${logTag}] Grounding lookup warning:`, gErr.message);
  }

  const groundingBlock = [topicGrounding, kcscGrounding, wikiGrounding].filter(Boolean).join('\n\n');
  return { topicGrounding, kcscGrounding, wikiGrounding, groundingBlock };
}
