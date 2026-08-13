let text = "시간-침하비 <sup>t</sup>/S<sub>t</sub> (일/cm)";
let cleanText = text.replace(/<\/?sup>/gi, '').replace(/<\/?sub>/gi, '');
console.log(cleanText);
