import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { signAccessToken } from '../../config/jwt.js';
import { AppError } from '../../utils/AppError.js';
import { LoginInput, SignupInput } from './auth.schemas.js';

// NOTE: raw prisma by design. Authentication runs BEFORE/ACROSS tenancy — login
// and getAuthenticatedUser resolve identity by globally-unique email / userId
// (there is no clinic context yet), and signup checks global email uniqueness.
// The User.create sets clinicId explicitly for the caller's clinic.

const publicUserSelect = {
  id: true,
  clinicId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const buildAuthResult = (user: PublicUser): AuthResult => ({
  user,
  accessToken: signAccessToken({
    userId: user.id,
    clinicId: user.clinicId,
    email: user.email,
    role: user.role
  })
});

export const signupUser = async (input: SignupInput, clinicId: string): Promise<AuthResult> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId }
  });

  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }

  const email = normalizeEmail(input.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      clinicId,
      name: input.name.trim(),
      email,
      passwordHash
    },
    select: publicUserSelect
  });

  return buildAuthResult(user);
};

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const email = normalizeEmail(input.email);
  const userRecord = await prisma.user.findUnique({
    where: { email },
    select: {
      ...publicUserSelect,
      passwordHash: true
    }
  });

  if (!userRecord) {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(input.password, userRecord.passwordHash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const { passwordHash: _passwordHash, ...user } = userRecord;

  return buildAuthResult(user);
};

export const getAuthenticatedUser = async (userId: string): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};