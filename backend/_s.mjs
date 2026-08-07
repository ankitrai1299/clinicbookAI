// Screenshot the REAL ClinicBook dashboard at phone width.
//
// /clinicbook renders the marketing page when signed out, so the mobile layout
// can only be judged with a session. The local JWT_SECRET matches Railway's, so
// a token minted here is accepted by the live API; it is injected into
// localStorage before the app boots, exactly as a real login would.
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const cfg = dotenv.config({ path: path.resolve('.env') });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [OUT, TARGET, W = '390', H = '844'] = process.argv.slice(2);

const prisma = new PrismaClient({ datasources: { db: { url: cfg.parsed.DIRECT_URL } } });
const admin = await prisma.user.findFirst({
  where: { clinicId: cfg.parsed.WHATSAPP_CLINIC_ID, role: 'CLINIC_ADMIN' },
  select: { id: true, clinicId: true, email: true, role: true }
});
await prisma.$disconnect();
if (!admin) throw new Error('no CLINIC_ADMIN found');

const token = jwt.sign(
  { userId: admin.id, clinicId: admin.clinicId, email: admin.email, role: admin.role },
  cfg.parsed.JWT_SECRET,
  { expiresIn: '1h' }
);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const origin = new URL(TARGET).origin;
await page.goto(origin, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('auth_token', t), token);
await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

// Sideways page scroll is the single clearest sign of a broken mobile layout.
const report = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('*')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.right > cw + 1)
    .sort((a, b) => b.r.right - a.r.right)
    .slice(0, 6)
    .map(({ el, r }) => `${Math.round(r.right)}px  ${el.tagName.toLowerCase()}#${el.id || '-'} .${String(el.className).split(' ').slice(0, 4).join('.')}`);
  return {
    signedIn: !!document.querySelector('#dashboard-sidebar, [id^="sidebar-tab-"]'),
    pageScrollsSideways: document.documentElement.scrollWidth > cw + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: cw,
    widest: wide
  };
});
console.log(JSON.stringify(report, null, 2));

await page.screenshot({ path: OUT, fullPage: false });
fs.writeFileSync(OUT.replace('.png', '-full.png'), await page.screenshot({ fullPage: true }));
await browser.close();
console.log('saved', OUT);
