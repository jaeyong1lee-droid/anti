import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
let content = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

// Locate start of target block
const targetSignature = 'function extractVariablesFromMath(mathContent) {';
const startIndex = content.indexOf(targetSignature);
if (startIndex === -1) {
  console.error('Could not find extractVariablesFromMath signature!');
  process.exit(1);
}

// Locate end of recommend endpoint block
const endSignature = `    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});`;

const endIndex = content.indexOf(endSignature, startIndex);
if (endIndex === -1) {
  console.error('Could not find end of suggest-title endpoint!');
  process.exit(1);
}

const replacement = `function extractVariablesFromMath(mathContent) {
  if (!mathContent) return '';
  const cleanMath = mathContent
    .replace(/\\\\[a-zA-Z]+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[\\{\\}\\\[\\\]\\(\\)\\+\\-\\*\\/\\=\\_\\^]/g, ' ');
  
  const words = cleanMath.split(/\\s+/);
  const uniqueVars = Array.from(new Set(words))
    .map(w => w.trim())
    .filter(w => /^[a-zA-Z]$|^[a-zA-Z]_[a-zA-Z0-9]+$/.test(w));
  
  if (uniqueVars.length === 0) return '';
  return uniqueVars.map(v => \`- \$\${v\}: (이 기호의 공학적 정의를 입력해 보세요)\`).join('\\n');
}

function filterStructureLines(mathContent, structure) {
  if (!structure) return '';
  
  const layoutCommands = [
    '\\\\frac', '\\\\sqrt', '\\\\left', '\\\\right', '\\\\times', '\\\\cdot',
    '\\\\partial', '\\\\sin', '\\\\cos', '\\\\tan', '\\\\log', '\\\\ln',
    '\\\\text', '\\\\operatorname', '\\\\mathrm', '\\\\mathbf', '\\\\over', '\\\\choose',
    '\\\\quad', '\\\\qquad', '\\\\;', '\\\\:', '\\\\,', '\\\\!', '\\\\begin', '\\\\end', '\\\\array'
  ];
  let cleanedFormula = mathContent;
  for (const cmd of layoutCommands) {
    cleanedFormula = cleanedFormula.split(cmd).join(' ');
  }

  const tokenRegex = /[\\\\a-zA-Z0-9_\\{\\}]+/g;
  const formulaTokens = cleanedFormula.match(tokenRegex) || [];
  
  const normalize = (v) => {
    if (!v) return '';
    return v
      .replace(/[\\$\\s\\{\\}\\\[\\\]\\(\\)]/g, '')
      .replace(/\\\\/g, '')
      .replace(/_/g, '');
  };

  const formulaTokenSet = new Set(formulaTokens.map(t => normalize(t)).filter(Boolean));

  const lines = structure.split('\\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    
    if (/^\\s*[\\-\\*\\d\\.]/.test(trimmed)) {
      const colonIdx = trimmed.indexOf(':');
      const dashIdx = trimmed.indexOf('-', 1);
      const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
      
      if (sepIdx !== -1) {
        const symbolPortion = trimmed.substring(0, sepIdx);
        const symbolTokens = symbolPortion.match(tokenRegex) || [];
        const normalizedSymbols = symbolTokens.map(s => normalize(s)).filter(Boolean);
        
        if (normalizedSymbols.length === 0) return true;
        
        const hasMatch = normalizedSymbols.some(s => formulaTokenSet.has(s));
        return hasMatch;
      }
    }
    return true;
  });

  return filteredLines.join('\\n').trim();
}

// 6-4. Formula Analysis & Title/Structure Generation
app.post('/api/formula/suggest-title', async (req, res) => {
  try {
    const { mathContent, fullText } = req.body;
    if (!mathContent) {
      return res.status(400).json({ error: '수식 내용이 존재하지 않습니다.' });
    }

    // 1) 로컬 사전 매칭 시도
    let bestLocalMatch = null;
    let maxMatchCount = 0;
    const cleanMathContent = mathContent.replace(/\\s+/g, '');
    
    // LaTeX 명령어(예: \\frac, \\left, \\right)의 내부 텍스트만 추출하고 명령어 단어 자체는 차단
    const mathTokens = mathContent
      .replace(/\\\\[a-zA-Z]+/g, ' ') // 모든 \\명령어를 공백으로 지움 (변수만 남김)
      .replace(/[^a-zA-Z0-9\\_]/g, ' ') // 알파벳, 숫자, 언더바만 남김
      .split(/\\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    for (const dict of LOCAL_FORMULA_DICTIONARY) {
      let matchCount = 0;
      for (const kw of dict.keywords) {
        const cleanKw = kw.replace(/\\\\\\\\/g, '\\\\');
        // 만약 키워드가 그리스 문자(\\gamma 등)나 LaTeX 기호 형식이면 mathContent에 백슬래시 기호가 포함되었는지 안전 검사
        if (cleanKw.startsWith('\\\\')) {
          if (cleanMathContent.includes(cleanKw)) {
            matchCount++;
          }
        } else {
          // 키워드가 일반 알파벳(C, D_f 등)이면, 오염된 \\frac 등의 단어를 피하기 위해
          // 위에서 정제한 mathTokens 배열에 정확히 존재하는지 검사!
          if (mathTokens.includes(cleanKw) || mathTokens.some(tok => tok === cleanKw || tok.startsWith(cleanKw + '_') || tok.endsWith('_' + cleanKw))) {
            matchCount++;
          }
        }
      }
      
      // 매칭 신뢰도 판단 (최소 2개 이상의 핵심 변수 매칭 필요)
      if (matchCount > maxMatchCount && matchCount >= 2) {
        maxMatchCount = matchCount;
        bestLocalMatch = dict;
      }
    }

    const systemInstruction = \`당신은 지반공학 및 토질역학/토목 전공 학술 공식을 완벽히 분석해주는 기술사 전문 튜터입니다. 입력받은 LaTeX 수식과 전체적인 튜터 대화 맥락을 기반으로 공식의 세부 정보를 분석하여 반드시 아래 지정된 JSON 형식으로만 응답해 주세요.
 
JSON 형식:
{
  "title": "해당 수식이 상징하는 가장 적절하고 간결한 전공 공식 명칭입니다. 반드시 '한글(영어 전공명, LaTeX 수식 기호)'의 표준 포맷으로 한 줄 작명해야 합니다. 조사, 서술어, '산정 공식' 등 미사여구는 일체 빼고 명사형 위주로 극도로 콤팩트하게 작성하십시오. [중요 규칙]: 1) 공식에 학자/사람이름(예: 테르자기, 바톤, 랭킹, 쿨롱 등)이 연관된 경우 반드시 '테르자기 1차 압밀방정식', '바톤 암반 Q분류', '랭킹 주동토압계수'와 같이 사람이름을 최전방 한글명에 무조건 추가해 작명하시오. 2) '고착력 계산식', '설계수압' 등과 같이 대상이나 주어가 불분명한 수식은 반드시 '락볼트 고착력 계산식', '싱글쉘 터널 설계수압'처럼 주어를 확실히 명시하여 작명하시오. [작명 예시]: '테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, \\$C_v\\$)', '락볼트 고착력 계산식(Rockbolt Bond Strength, \\$P\\$)', '랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, \\$K_a\\$)', '바톤 암반 Q분류(Barton Q-system, \\$Q\\$)', '테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, \\$q_{ult}\\$)'",
  "concept": "이 공식이 상징하는 공학적/물리적 의미를 수험생이 머릿속에 아주 쉽게 직관적으로 이해할 수 있도록 설명하는 극도로 직관적이고 친절한 1~2문장의 명품 공학 개념 설명입니다. 기호의 나열이나 딱딱한 학술 사전 정의를 복사하는 것은 절대 엄금합니다. 수식의 본질적 존재 이유와 실무 공학적 대조(비유)를 섞어 쉽고 흥미롭게 작성하십시오. [개념 설명 작성 예시 (압밀계수 Cv 관련 수식 유입 시)]: '압밀계수 : \\"물이 빠져나가며 흙이 압축되는 속도(Speed)\" 입니다. 즉시침하 공식들이 \\"침하가 최종적으로 얼마나(침하량) 일어나는가?\\" 를 묻는 것이라면, 압밀계수는 그 침하가 \\"얼마나 빨리(시간) 끝나는가?\\" 를 결정하는 핵심 지표입니다.' 이와 같이 다른 모든 전공 공식(지지력, Q분류, 토압 등)에 대해서도 '실무적으로 이 공식이 결정해주는 진짜 물리적 의의가 무엇인지'를 이해하기 쉬운 비유와 대조를 섞어 반드시 작성하십시오.",
  "structure": "이 공식에 포함된 각각의 기호, 변수, 상수가 무엇을 의미하는지 공학적으로 명쾌하게 분석한 설명 리스트. [매우 중요 규칙]: 1) 반드시 제공된 [수식]에 명시적으로 표기된 기호와 상수들에 한해서만 기호 정의 목록을 작성하십시오. 공식에 포함되지 않은 엉뚱한 변수나 다른 공식의 기호를 리스트에 포함하는 것은 절대 엄금합니다. 수식에 등장하지 않는 기호(예: 수식에는 c나 B가 없는데 Terzaghi 공식을 상상해 c나 B를 적는 행위 등)가 단 하나라도 포함되면 절대 안 됩니다. 2) 각 기호의 뜻뿐만 아니라 그 값이 수식에서 분자/분모/계수 등에 위치함으로써 가지는 물리적/역학적 의의(예: 'A는 단면적으로, 분모에 있어 면적이 넓어질수록... 등')를 기호당 1~2줄씩 LaTeX(\\$ 기호)를 섞어서 친절하게 서술해주세요. 반드시 순수한 기호 및 상수 설명 목록만 Markdown 불릿 리스트 형태로 반환하고, '각 기호와 상수의 의미를 대화 맥락을 기반으로 복습해 보세요' 등 학습을 유도하는 사족 문장은 절대 포함하지 마십시오."
}

반드시 다른 잡설 없이 오직 JSON 객체만 반환하시오. 마크다운 코드 블록(\`\`\`json) 등은 감싸지 말고 순수 JSON만 반환하시오.\`;

    const userPrompt = \`[수식]: \${mathContent\}\\n\\n[대화 본문 맥락]:\\n\${fullText || '(대화 없음)'}\`;

    try {
      const responseText = await callLLMWithFailover(systemInstruction, userPrompt);
      
      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('\`\`\`')) {
        cleanJsonText = cleanJsonText.replace(/^\`\`\`(json)?/, '').replace(/\`\`\$/$/, '').trim();
      }
      
      try {
        const result = JSON.parse(cleanJsonText);
        let structure = result.structure || '';
        structure = structure
          .replace(/-\\s*각\\s*기호와\\s*상수의\\s*의미를\s*대화\\s*맥락을\\s*기반으로\\s*복습해\\s*보세요\\.?/gi, '')
          .replace(/각\\s*기호와\\s*상수의\\s*의미를\\s*대화\\s*맥락을\\s*기반으로\\s*복습해\\s*보세요\\.?/gi, '')
          .trim();

        if (!structure && bestLocalMatch) {
          structure = bestLocalMatch.structure;
        } else if (!structure) {
          structure = extractVariablesFromMath(mathContent);
        }

        // Apply strict filter
        structure = filterStructureLines(mathContent, structure);

        res.json({
          title: result.title ? result.title.replace(/^["'\`\\s\\t\\n]+|["'\`\\s\\t\\n]+\$/g, '') : (bestLocalMatch ? bestLocalMatch.title : '실시간 추출 공식'),
          concept: result.concept ? result.concept.trim() : (bestLocalMatch ? bestLocalMatch.concept : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.'),
          structure: structure
        });
      } catch (parseErr) {
        console.warn('JSON parsing failed, falling back to plaintext parse or local dictionary:', parseErr);
        
        let fallbackTitle = bestLocalMatch ? bestLocalMatch.title : '실시간 추출 공식';
        const titleMatch = responseText.match(/"title"\\s*:\\s*"([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
          fallbackTitle = titleMatch[1].replace(/^["'\`\\s]+|["'\`\\s]+\$/g, '').trim();
        }

        let fallbackConcept = bestLocalMatch ? bestLocalMatch.concept : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.';
        const conceptMatch = responseText.match(/"concept"\\s*:\\s*"([^"]+)"/);
        if (conceptMatch && conceptMatch[1]) {
          fallbackConcept = conceptMatch[1].trim();
        }

        let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
        fallbackStructure = filterStructureLines(mathContent, fallbackStructure);

        res.json({
          title: fallbackTitle,
          concept: fallbackConcept,
          structure: fallbackStructure
        });
      }
    } catch (err) {
      console.warn('Formula suggest title LLM error, falling back to local dictionary:', err);
      let fallbackTitle = bestLocalMatch ? bestLocalMatch.title : '실시간 추출 공식';
      let fallbackConcept = bestLocalMatch ? bestLocalMatch.concept : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.';
      let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
      fallbackStructure = filterStructureLines(mathContent, fallbackStructure);
      res.json({
        title: fallbackTitle,
        concept: fallbackConcept,
        structure: fallbackStructure
      });
    }
  } catch (err) {
    console.error('Formula suggest title route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }`;

const updatedContent = content.substring(0, startIndex) + replacement + content.substring(endIndex + endSignature.length);
fs.writeFileSync(serverIndexPath, updatedContent, 'utf8');
console.log('Successfully updated server/index.js with clean filter logic at correct position!');
