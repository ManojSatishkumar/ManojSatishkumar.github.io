const puppeteer = require('puppeteer');
const path = require('path');

async function generateThumbnail() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport to exact thumbnail size
  await page.setViewport({ width: 1200, height: 630 });
  
  // Load the HTML file
  const htmlPath = path.join(__dirname, 'thumbnail-generator.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  
  // Wait a bit for fonts to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Find the thumbnail element
  const thumbnailElement = await page.$('.thumbnail');
  
  if (thumbnailElement) {
    // Screenshot just the thumbnail element
    await thumbnailElement.screenshot({
      path: path.join(__dirname, '..', 'images', 'system-design', 'thumbnail.jpg'),
      type: 'jpeg',
      quality: 90
    });
    console.log('✅ Thumbnail saved to images/system-design/thumbnail.jpg');
  } else {
    console.error('❌ Could not find .thumbnail element');
  }
  
  await browser.close();
}

generateThumbnail().catch(console.error);

