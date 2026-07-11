import { parseLlmJson } from './latexUtils.js';

const cp1252CustomMap = {
  '\u20AC': 0x80, // €
  '\u201A': 0x82, // ‚
  '\u0192': 0x83, // ƒ
  '\u201E': 0x84, // „
  '\u2026': 0x85, // …
  '\u2020': 0x86, // †
  '\u2021': 0x87, // ‡
  '\u02C6': 0x88, // ˆ
  '\u2030': 0x89, // ‰
  '\u0160': 0x8A, // Š
  '\u2039': 0x8B, // ‹
  '\u0152': 0x8C, // Œ
  '\u017D': 0x8E, // Ž
  '\u2018': 0x91, // ‘
  '\u2019': 0x92, // ’
  '\u201C': 0x93, // “
  '\u201D': 0x94, // ”
  '\u2022': 0x95, // •
  '\u2013': 0x96, // –
  '\u2014': 0x97, // —
  '\u02DC': 0x98, // ˜
  '\u2122': 0x99, // ™
  '\u0161': 0x9A, // š
  '\u203A': 0x9B, // ›
  '\u0153': 0x9C, // œ
  '\u017E': 0x9E, // ž
  '\u0178': 0x9F  // Ÿ
};

const cp1252ReverseLookup = new Map();
for (const [char, byteVal] of Object.entries(cp1252CustomMap)) {
  cp1252ReverseLookup.set(char.charCodeAt(0), byteVal);
}

export function stringToCp1252Buffer(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (cp1252ReverseLookup.has(code)) {
      bytes.push(cp1252ReverseLookup.get(code));
    } else if (code <= 0xFF) {
      bytes.push(code);
    } else {
      bytes.push(code & 0xFF);
    }
  }
  return Buffer.from(bytes);
}

export function isBufferHtml(buffer) {
  if (!buffer || buffer.length < 5) return false;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return false;
  }
  const prefix = buffer.toString('utf-8', 0, Math.min(1000, buffer.length)).trim().toLowerCase();
  return prefix.includes('<!doctype html') || 
         prefix.includes('<html') || 
         prefix.includes('<head') || 
         prefix.includes('<body') || 
         prefix.includes('<div') || 
         prefix.includes('<p') || 
         prefix.includes('<script') ||
         prefix.includes('</html>') ||
         prefix.includes('<style');
}

export function decodeHtmlBuffer(buffer) {
  if (!buffer) return '';
  const asciiText = buffer.toString('ascii').toLowerCase();
  const hasEucKrTag = asciiText.includes('charset=euc-kr') || 
                      asciiText.includes('charset="euc-kr"') || 
                      asciiText.includes('charset=cp949') || 
                      asciiText.includes('charset="cp949"');
  
  if (hasEucKrTag) {
    console.log('EUC-KR / CP949 meta charset tag detected. Decoding as EUC-KR.');
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch (e) {
      console.warn('TextDecoder euc-kr failed, falling back to standard flow:', e);
    }
  }

  let decodedText = '';
  let utf8Success = false;
  try {
    decodedText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    utf8Success = true;
  } catch (e) {
    console.log('UTF-8 decoding failed (fatal: true). Falling back to direct EUC-KR.');
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch (e2) {
      console.error('EUC-KR decoding failed as well, returning raw string:', e2);
      return buffer.toString('utf-8');
    }
  }

  if (utf8Success) {
    try {
      const restoredBytes = stringToCp1252Buffer(decodedText);
      const restoredText = new TextDecoder('euc-kr').decode(restoredBytes);
      const originalKoreanCount = (decodedText.match(/[가-힣]/g) || []).length;
      const restoredKoreanCount = (restoredText.match(/[가-힣]/g) || []).length;
      if (restoredKoreanCount > originalKoreanCount) {
        console.log(`Double-encoded EUC-KR (mojibake) successfully detected! (Healed Korean chars: ${originalKoreanCount} -> ${restoredKoreanCount})`);
        return restoredText;
      }
    } catch (restoreErr) {
      console.warn('EUC-KR mojibake restoration check failed:', restoreErr);
    }
  }

  return decodedText;
}

export function convertHtmlTablesToMarkdown(html) {
  if (!html) return '';
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const mdRows = [];
    let maxCols = 0;
    
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const trContent = trMatch[1];
      const tdRegex = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let tdMatch;
      const row = [];
      
      while ((tdMatch = tdRegex.exec(trContent)) !== null) {
        let cellText = tdMatch[1].replace(/<[^>]+>/g, '').trim();
        cellText = cellText.replace(/\s+/g, ' ');
        row.push(cellText);
      }
      
      if (row.length > 0) {
        mdRows.push(row);
        if (row.length > maxCols) {
          maxCols = row.length;
        }
      }
    }
    
    if (mdRows.length === 0) return '';
    
    let mdTable = '\n';
    const headers = mdRows[0];
    mdTable += '| ' + headers.join(' | ') + ' |\n';
    
    const separator = Array(maxCols).fill('---');
    mdTable += '| ' + separator.join(' | ') + ' |\n';
    
    for (let i = 1; i < mdRows.length; i++) {
      const row = mdRows[i];
      while (row.length < maxCols) {
        row.push('');
      }
      mdTable += '| ' + row.join(' | ') + ' |\n';
    }
    
    mdTable += '\n';
    return mdTable;
  });
}

export function htmlToPlainText(html) {
  if (!html) return '';
  let text = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  text = text.replace(/style\s*=\s*(?:"[^"]*"|'[^']*'|夸[^夸]*夸)/gi, '');
  text = convertHtmlTablesToMarkdown(text);
  text = text.replace(/<\/p>|<\/div>|<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>|<\/th>/gi, '   ');
  text = text.replace(/<[^>]+>/g, '');

  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
    '&copy;': '©',
    '&reg;': '®'
  };
  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  const lines = text.split('\n');
  const processedLines = [];
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.startsWith('|')) {
      if (!inTable) {
        processedLines.push('');
        inTable = true;
      }
      processedLines.push(trimmedLine);
    } else {
      if (inTable) {
        processedLines.push('');
        inTable = false;
      }
      if (trimmedLine.length > 0) {
        processedLines.push(trimmedLine);
      }
    }
  }
  
  let joinedText = '';
  for (let i = 0; i < processedLines.length; i++) {
    const current = processedLines[i];
    if (i === 0) {
      joinedText += current;
      continue;
    }
    const prev = processedLines[i - 1];
    if (current.startsWith('|') && prev.startsWith('|')) {
      joinedText += '\n' + current;
    } else if (current === '' || prev === '') {
      joinedText += '\n' + current;
    } else {
      joinedText += '\n\n' + current;
    }
  }
  
  return mergeVerticalText(joinedText);
}

export function mergeVerticalText(text) {
  if (!text) return '';
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const mergedLines = [];
  let currentSingleCharGroup = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSingleChar = line.length === 1 || 
                         (line.length === 2 && (line.startsWith('(') || line.endsWith(')') || line.startsWith('[') || line.endsWith(']')));
    
    if (isSingleChar) {
      currentSingleCharGroup.push(line);
    } else {
      if (currentSingleCharGroup.length > 0) {
        if (currentSingleCharGroup.length > 1) {
          mergedLines.push(currentSingleCharGroup.join(''));
        } else {
          mergedLines.push(currentSingleCharGroup[0]);
        }
        currentSingleCharGroup = [];
      }
      mergedLines.push(line);
    }
  }
  
  if (currentSingleCharGroup.length > 0) {
    if (currentSingleCharGroup.length > 1) {
      mergedLines.push(currentSingleCharGroup.join(''));
    } else {
      mergedLines.push(currentSingleCharGroup[0]);
    }
  }
  return mergedLines.join('\n');
}

export function getLocalDateString(baseDate = new Date(), daysToAdd = 0) {
  const date = new Date(baseDate);
  // Convert UTC time to KST time (UTC+9)
  const kstTime = date.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstTime);
  
  if (daysToAdd !== 0) {
    kstDate.setUTCDate(kstDate.getUTCDate() + daysToAdd);
  }
  
  const yyyy = kstDate.getUTCFullYear();
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function smartTruncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  const sub = text.substring(0, maxLength);
  const lastParagraph = sub.lastIndexOf('\n\n');
  if (lastParagraph > maxLength * 0.8) {
    return sub.substring(0, lastParagraph).trim() + '\n\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastLine = sub.lastIndexOf('\n');
  if (lastLine > maxLength * 0.8) {
    return sub.substring(0, lastLine).trim() + '\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastSentence = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('? '), sub.lastIndexOf('! '));
  if (lastSentence > maxLength * 0.5) {
    return sub.substring(0, lastSentence + 1).trim() + ' ... [텍스트가 너무 길어 중략됨]';
  }
  return sub.trim() + ' ... [텍스트가 너무 길어 중략됨]';
}

export function extractFirstImageFromTopic(topic) {
  if (!topic || !topic.pdf_data) return null;
  const pdfName = (topic.pdf_name || '').toLowerCase();
  const isImage = pdfName.endsWith('.png') || pdfName.endsWith('.jpg') || pdfName.endsWith('.jpeg') || pdfName.endsWith('.gif') || pdfName.endsWith('.webp');

  if (isImage) {
    const mimeType = pdfName.endsWith('.png') ? 'image/png' :
                     (pdfName.endsWith('.gif') ? 'image/gif' :
                      (pdfName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
    return {
      data: topic.pdf_data.toString('base64'),
      mimeType: mimeType
    };
  }

  const isHtml = pdfName.endsWith('.html') || pdfName.endsWith('.htm') || isBufferHtml(topic.pdf_data);
  if (isHtml) {
    try {
      const rawHtml = decodeHtmlBuffer(topic.pdf_data);
      const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/i;
      const match = imgRegex.exec(rawHtml);
      if (match) {
        return {
          data: match[2],
          mimeType: match[1]
        };
      }
    } catch (e) {
      console.warn('Failed to parse HTML base64 image in extractFirstImage:', e.message);
    }
  }
  return null;
}
