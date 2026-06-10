export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        clinicId: string;
        email: string;
        role: string;
      };
    }
  }
}