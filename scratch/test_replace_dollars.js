const str3 = "This has a lone $ symbol here.\nAnd a formula $K_0 = \\frac{u}{1-u}$ on the next line.";
console.log("INPUT:", str3);

const result = str3.replace(/\$([^\$\n]+?)\$/g, (match, innerContent) => {
  let cleanedInner = innerContent.replace(/\s+/g, ' ').trim();
  cleanedInner = cleanedInner.replace(/\\(dfrac|frac)\s*\{\s*/g, '\\$1{')
                             .replace(/\s*\}\s*\{\s*/g, '}{')
                             .replace(/\s*\}\s*$/g, '}');
  return `$${cleanedInner}$`;
});

console.log("OUTPUT:\n", result);
