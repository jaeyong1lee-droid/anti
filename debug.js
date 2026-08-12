import fs from 'fs';
import { healLatexFormulas } from './client/src/utils/latexUtils.js';

const input = '도입근입깊이($D_f$) 고려기초 측면의 저항을 균일 상재하중($q=\\gamma D_f$) 으로 치환하여';
console.log(healLatexFormulas(input));
