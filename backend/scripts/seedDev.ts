// Local dev seed — creates a verified clinic admin you can log in with on the
// LOCAL database (never run against production). Idempotent.
//   Run:  npx tsx scripts/seedDev.ts
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

const EMAIL = 'demo@clinic.local';
const PASSWORD = 'demo12345';

const main = async () => {
  const clinic = await prisma.clinic.upsert({
    where: { email: 'demo@clinic.local' },
    update: {},
    create: { name: 'Demo Clinic', email: 'demo@clinic.local', phone: '919000000000' }
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { emailVerified: true },
    create: {
      clinicId: clinic.id,
      name: 'Demo Doctor',
      email: EMAIL,
      passwordHash,
      role: 'CLINIC_ADMIN',
      emailVerified: true
    }
  });

  console.log(JSON.stringify({ clinicId: clinic.id, userId: user.id, email: EMAIL, password: PASSWORD }));
  process.exit(0);
};

main().catch((e) => { console.error(e); process.exit(1); });
