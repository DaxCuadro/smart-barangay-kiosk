const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const files = [
  { svg: 'public/resident-request-guide.svg', png: 'public/resident-request-guide.png' },
  { svg: 'public/admin-guide.svg', png: 'public/admin-guide.png' },
  { svg: 'public/kiosk-guide.svg', png: 'public/kiosk-guide.png' },
  { svg: 'public/kiosk-pubmat.svg', png: 'public/kiosk-pubmat.png' },
  { svg: 'public/pubmat.svg', png: 'public/pubmat.png' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  for (const { svg, png } of files) {
    const svgPath = path.resolve(__dirname, svg);
    const pngPath = path.resolve(__dirname, png);

    if (!fs.existsSync(svgPath)) {
      console.log(`⚠ Skipping ${svg} (not found)`);
      continue;
    }

    // Read SVG to get dimensions from viewBox
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const vbMatch = svgContent.match(/viewBox="0 0 (\d+) (\d+)"/);
    const width = vbMatch ? parseInt(vbMatch[1]) : 1200;
    const height = vbMatch ? parseInt(vbMatch[2]) : 2600;

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });

    const fileUrl = 'file:///' + svgPath.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    await page.screenshot({ path: pngPath, fullPage: true, type: 'png' });
    await page.close();

    const sizeKB = Math.round(fs.statSync(pngPath).size / 1024);
    console.log(`✅ ${png} (${sizeKB} KB)`);
  }

  await browser.close();
  console.log('\nDone! All PNGs saved to public/');
})();
