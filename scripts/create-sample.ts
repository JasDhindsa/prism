import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
const pdf = await PDFDocument.create();
const serif = await pdf.embedFont(StandardFonts.TimesRoman); const bold = await pdf.embedFont(StandardFonts.TimesRomanBold); const sans = await pdf.embedFont(StandardFonts.Helvetica);
const pages = [
  { title: 'The intuition behind derivatives', eyebrow: '01 / CALCULUS', paragraphs: [
    'A derivative measures how quickly one quantity changes with respect to another. If a function describes position over time, its derivative describes velocity: the instantaneous rate of change of position.',
    'Imagine travelling along a curved road. Your average speed over an hour tells you about the whole journey. Your speedometer tells you how fast you are moving right now. The derivative is the mathematical equivalent of that speedometer.',
    'For a function f(x), the average rate of change between x and x + h is the difference in their outputs divided by h. As h approaches zero, this average approaches the instantaneous rate of change. Geometrically, a secant line approaches the tangent line at the point.',
    'For f(x) = x squared, the difference quotient simplifies to 2x + h. Taking the limit as h approaches zero gives f prime of x = 2x. At x = 3, the slope is 6: a small increase in x produces about six times that increase in f(x).'
  ], takeaway: 'A derivative is a local rate of change, represented by the slope of a tangent line.' },
  { title: 'Updating beliefs with Bayes', eyebrow: '02 / PROBABILITY', paragraphs: [
    'Conditional probability describes the chance of an event given that another event has occurred. Bayes theorem lets us reverse the direction of that conditioning: from the probability of evidence given a hypothesis to the probability of the hypothesis given the evidence.',
    'The posterior probability is proportional to the prior probability multiplied by the likelihood. The prior is what you believed before seeing the evidence. The likelihood is how probable that evidence would be if the hypothesis were true.',
    'Suppose one percent of a population has a condition. A test detects the condition ninety percent of the time and incorrectly reports a positive result for five percent of people without it. In a group of ten thousand, about ninety true positives and four hundred ninety-five false positives are expected.',
    'Among the five hundred eighty-five positive tests, only ninety are true positives. The probability of having the condition given a positive test is therefore ninety divided by five hundred eighty-five, about fifteen percent. A positive result does not erase the importance of the base rate.'
  ], takeaway: 'Posterior beliefs combine prior knowledge with new evidence.' },
  { title: 'Thinking recursively', eyebrow: '03 / COMPUTER SCIENCE', paragraphs: [
    'Recursion solves a problem by reducing it to a smaller instance of the same problem. A recursive function needs a base case, which returns a result without another recursive call, and a recursive case, which makes progress toward the base case.',
    'The factorial of a positive integer n is n multiplied by the factorial of n minus one. The base case is factorial of zero equals one. To calculate factorial of four, we multiply four by three by two by one, producing twenty-four.',
    'Each recursive call waits for the next call to return. These waiting calls form the call stack. Once the base case returns, the stack unwinds, passing intermediate results back through the earlier calls.',
    'Without a reachable base case, recursion may continue until the stack limit is exceeded. The key questions are: what is the smallest solvable case, and how does each call move closer to it?'
  ], takeaway: 'A base case stops recursion; each recursive step reduces the problem.' }
];
for (const [index, source] of pages.entries()) {
  const page = pdf.addPage([612, 792]);
  const draw = (value: string, x: number, y: number, size: number, font = serif, color = rgb(.12,.2,.19)) => page.drawText(value, { x, y, size, font, color });
  draw('LUMEN / CONCEPT NOTES', 56, 739, 10, sans); draw(source.eyebrow, 56, 690, 10, sans, rgb(.32,.43,.40));
  draw(source.title, 56, 655, 27, bold);
  let y = 614;
  for (const paragraph of source.paragraphs) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = `${line}${line ? ' ' : ''}${word}`;
      if (serif.widthOfTextAtSize(next, 13) > 495) { draw(line, 56, y, 13); y -= 21; line = word; } else line = next;
    }
    if (line) { draw(line, 56, y, 13); y -= 21; } y -= 14;
  }
  page.drawRectangle({ x: 56, y: 114, width: 500, height: 58, color: rgb(.93,.96,.95) });
  draw('KEY IDEA', 70, 150, 9, sans); draw(source.takeaway, 70, 129, 11);
  if (index === 0) {
    page.drawLine({start:{x:95,y:218},end:{x:490,y:218},thickness:1,color:rgb(.6,.65,.63)});
    page.drawLine({start:{x:95,y:218},end:{x:95,y:298},thickness:1,color:rgb(.6,.65,.63)});
    for(let i=0;i<30;i++) page.drawLine({start:{x:100+i*12,y:223+(i/4)**2},end:{x:112+i*12,y:223+((i+1)/4)**2},thickness:2,color:rgb(.18,.43,.36)});
    draw('f(x) = x squared', 350, 292, 10, sans);
  }
  draw('Select a passage to adapt it, quiz yourself, or see the idea in motion.', 56, 70, 10, sans); draw(String(index+1).padStart(2,'0'), 539, 70, 10, sans);
}
pdf.setTitle('Lumen Concept Notes'); pdf.setAuthor('Lumen');
await mkdir('public', { recursive: true }); await writeFile('public/sample.pdf', await pdf.save());
console.log('Created public/sample.pdf');
