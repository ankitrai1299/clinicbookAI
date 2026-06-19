import { prisma } from '../src/config/prisma.js';

const WEBHOOK = 'http://localhost:4000/api/whatsapp/webhook';
const USERS = [
  { name: 'Ankit', national: '7903884686' },
  { name: 'Ayush Parshar', national: '8884292411' }
];
const SEQUENCE = ['hi', '1', '1', '1', '1', 'YES'];

const payload = (phone: string, text: string, wamid: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID, changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
    contacts: [{ profile: { name: 'T' }, wa_id: phone }],
    messages: [{ from: phone, id: wamid, timestamp: '1750000000', type: 'text', text: { body: text } }]
  } }] }]
});
const post = (phone: string, text: string, wamid: string) =>
  fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(phone, text, wamid)) }).then((r) => r.status);
const sess = (phone: string) => prisma.whatsAppSession.findUnique({ where: { phone }, select: { state: true, data: true, updatedAt: true } });
const latestReply = (nat: string) => prisma.whatsAppLog.findFirst({ where: { messageType: 'auto_reply', to: { endsWith: nat } }, orderBy: { createdAt: 'desc' }, select: { body: true, status: true, createdAt: true } });
const parse = (s: any) => { try { return JSON.parse(s?.data || '{}'); } catch { return {}; } };

const main = async () => {
  const aiC0 = await prisma.aiConversation.count();
  const aiM0 = await prisma.aiMessage.count();
  console.log(`BASELINE: AiConversation=${aiC0}  AiMessage=${aiM0}`);

  for (const u of USERS) {
    const phone = '91' + u.national;
    await prisma.whatsAppSession.deleteMany({ where: { phone } });
    console.log(`\n========== BOT TEST: ${u.name} (${phone}) ==========`);
    let prevUpd: number | undefined;
    let prevReplyAt: number | undefined = (await latestReply(u.national))?.createdAt?.getTime();
    let step = 0;
    for (const input of SEQUENCE) {
      step++;
      const httpStatus = await post(phone, input, `wamid.FC_${u.national}_${step}`);
      let s = await sess(phone);
      for (let i = 0; i < 32 && (!s || s.updatedAt?.getTime() === prevUpd); i++) { await new Promise((r) => setTimeout(r, 250)); s = await sess(phone); }
      let rep = await latestReply(u.national);
      for (let i = 0; i < 20 && rep?.createdAt?.getTime() === prevReplyAt; i++) { await new Promise((r) => setTimeout(r, 250)); rep = await latestReply(u.national); }
      const d = parse(s);
      console.log(`\n  USER >> "${input}"  (webhook HTTP ${httpStatus})`);
      console.log(`  BOT  << ${JSON.stringify((rep?.body ?? '').split('\n').filter(Boolean).join(' / '))}  [${rep?.status}]`);
      console.log(`  DB   -> state=${s?.state} | speciality=${d.speciality ?? '-'} | doctor=${d.doctorName ?? '-'} | slot=${d.selected ? d.selected.date + ' ' + d.selected.time : '-'}`);
      prevUpd = s?.updatedAt?.getTime(); prevReplyAt = rep?.createdAt?.getTime();
    }
  }

  const aiC1 = await prisma.aiConversation.count();
  const aiM1 = await prisma.aiMessage.count();
  console.log('\n========== DB PROOF ==========');
  console.log(`  AiConversation: ${aiC0} -> ${aiC1}  NEW=${aiC1 - aiC0} ${aiC1 === aiC0 ? 'OK' : 'FAIL'}`);
  console.log(`  AiMessage:      ${aiM0} -> ${aiM1}  NEW=${aiM1 - aiM0} ${aiM1 === aiM0 ? 'OK' : 'FAIL'}`);
};
main().catch((e) => console.error('ERR:', e)).finally(() => prisma.$disconnect());
