import bcrypt from 'bcryptjs';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { issueOtp } from '../auth/otp.service.js';
import { RegisterClinicInput, UpdateClinicInput } from './clinic.schemas.js';

// NOTE: this module intentionally uses the RAW prisma client. It manages the
// `Clinic` ROW itself (whose tenant key is its own id, so the tenant engine does
// not scope it) and clinic registration, which runs BEFORE any tenant exists.
// Every authenticated query here is still scoped by `where: { id: clinicId }`.

export const getMyClinic = async (clinicId: string) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    // `products` is here so the client can show a clinic only what it owns. The
    // backend refuses a product they have not bought either way — this is what
    // stops them being offered it and then refused, which reads as a fault in
    // the product rather than the absence of a purchase.
    select: { id: true, name: true, email: true, phone: true, plan: true, hfrId: true, products: true },
  });
  if (!clinic) throw new AppError('Clinic not found', 404);
  return clinic;
};

export const updateMyClinic = async (clinicId: string, input: UpdateClinicInput) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);

  return prisma.clinic.update({
    where: { id: clinicId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      // Empty string CLEARS it, rather than being treated as "not supplied" —
      // a wrongly-typed registry id has to be correctable.
      ...(input.hfrId !== undefined ? { hfrId: input.hfrId || null } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, plan: true, hfrId: true },
  });
};

export const registerClinic = async (input: RegisterClinicInput) => {
  const email = input.email.trim().toLowerCase();

  const [existingClinic, existingUser] = await Promise.all([
    prisma.clinic.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (existingClinic || existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: input.clinicName.trim(),
        email,
        phone: input.phone.trim(),
        // A clinic that signs up buys अन्वयBook, so that is what it gets.
        //
        // The column's default grants BOTH products, which was right while the
        // only clinics were ours: an existing clinic keeps what it had. It is
        // wrong for a public signup. अन्वयScribe is not for sale yet, and a
        // clinic handed it anyway would meet a product still being tested,
        // decide the whole thing is unreliable, and never come back — the one
        // impression there is no second chance at.
        //
        // Named here rather than changed in the schema default, because the
        // default is what protects every clinic already in the database. When
        // Scribe is ready this line grows a second entry; nothing migrates.
        products: ['clinicbook'],
      },
    });

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        name: input.ownerName.trim(),
        email,
        passwordHash,
        // Self-service signups must verify their email before getting a token.
        emailVerified: false,
      },
      select: { id: true, email: true },
    });

    return { clinic, user };
  });

  // Hard gate: issue + email a verification OTP and return NO access token. The
  // owner verifies the code (POST /api/auth/verify-otp) to receive their token.
  await issueOtp(result.user.id, result.user.email);

  return { needsVerification: true as const, email: result.user.email };
};
