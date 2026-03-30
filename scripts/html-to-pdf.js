const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, 'introduction.html');
  await page.goto('file://' + filePath, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for fonts and rendering
  await new Promise(r => setTimeout(r, 3000));

  await page.pdf({
    path: path.resolve(__dirname, 'introduction.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });

  await browser.close();
  console.log('PDF created: introduction.pdf');
})();
