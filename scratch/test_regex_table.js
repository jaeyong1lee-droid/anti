const html = '< tableborder = "1"style = "border - collapse: collapse;">';
const thStr = '< thstyle = "padding: 8px;">';
const tdStr = '< tdstyle = "padding: 8px;">';

const tableRe = /<\s*table[^>]*>/gi;
const thRe = /<\s*th[^>]*>/gi;
const tdRe = /<\s*td[^>]*>/gi;

console.log('tableRe match:', tableRe.test(html), '->', html.replace(tableRe, '<table>'));
console.log('thRe match:', thRe.test(thStr), '->', thStr.replace(thRe, '<th>'));
console.log('tdRe match:', tdRe.test(tdStr), '->', tdStr.replace(tdRe, '<td>'));
