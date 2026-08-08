// Screenshot MediScribe AS THE PHONE APP sees it.
//
// The app is a WebView of the same site, and the native-style mobile UI is gated
// on `window.ReactNativeWebView` existing (utils/platform.isMobileApp). A plain
// browser therefore shows the DESKTOP layout — so checking the app in a browser
// checks the wrong thing. The shim below is what makes this the app's view.
//
// It also signs in as a DOCTOR: the app gates non-doctors to a "doctors only"
// screen, so an admin token would show a different app entirely.
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const cfg = dotenv.config({ path: path.resolve('.env') });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [OUT, TARGET, W = '390', H = '844', AS_APP = '1'] = process.argv.slice(2);

const prisma = new PrismaClient({ datasources: { db: { url: cfg.parsed.DIRECT_URL } } });
const doctor = await prisma.user.findFirst({
  where: { clinicId: cfg.parsed.WHATSAPP_CLINIC_ID, role: 'STAFF', email: { contains: 'a.k.das' } },
  select: { id: true, clinicId: true, email: true, role: true }
});
await prisma.$disconnect();
if (!doctor) throw new Error('doctor user not found');

const token = jwt.sign(
  { userId: doctor.id, clinicId: doctor.clinicId, email: doctor.email, role: doctor.role },
  cfg.parsed.JWT_SECRET,
  { expiresIn: '1h' }
);
console.log('signed in as:', doctor.email, '| as-app:', AS_APP === '1');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 2, isMobile: AS_APP === '1', hasTouch: AS_APP === '1' });

const origin = new URL(TARGET).origin;
await page.goto(origin, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('auth_token', t), token);
if (AS_APP === '1') {
  // Exactly what react-native-webview injects. Nothing else distinguishes the app.
  await page.evaluateOnNewDocument(() => {
    window.ReactNativeWebView = {
      postMessage: () => undefined
    };
  });
}
await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const report = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  return {
    isMobileApp: !!window.ReactNativeWebView,
    signedIn: !document.body.innerText.includes('Sign in'),
    pageScrollsSideways: document.documentElement.scrollWidth > cw + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: cw,
    // Anything sticking out past the screen edge — the clearest single signal.
    widest: [...document.querySelectorAll('*')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > cw + 1)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 6)
      .map(({ el, r }) => `${Math.round(r.right)}px  ${el.tagName.toLowerCase()} .${String(el.className).split(' ').slice(0, 3).join('.')}`),
    heading: document.querySelector('h1,h2')?.textContent?.trim() ?? '(none)'
  };
});
console.log(JSON.stringify(report, null, 2));

await page.screenshot({ path: OUT, fullPage: false });
fs.writeFileSync(OUT.replace('.png', '-full.png'), await page.screenshot({ fullPage: true }));
await browser.close();
console.log('saved', OUT);
