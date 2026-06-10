import jwt, { SignOptions } from 'jsonwebtoken';

import { env } from './env.js';

export interface JwtUserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

export const signAccessToken = (payload: JwtUserPayload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET) as JwtUserPayload;
};