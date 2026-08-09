import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeStringify);

async function test() {
  const text1 = '<ul><li>임계하중({cr}$) 산정</li></ul>';
  const html1 = await processor.process(text1);
  console.log('Test 1 (Raw HTML ul/li):', String(html1));

  const text2 = '- 임계하중({cr}$) 산정';
  const html2 = await processor.process(text2);
  console.log('\nTest 2 (Markdown list):', String(html2));
  
  const text3 = '<p>임계하중({cr}$) 산정</p>';
  const html3 = await processor.process(text3);
  console.log('\nTest 3 (Raw HTML p):', String(html3));
}

test();
