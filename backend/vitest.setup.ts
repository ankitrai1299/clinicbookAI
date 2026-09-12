// Unit tests must not need a .env file.
//
// `config/env.ts` validates the environment at IMPORT time and throws when
// DATABASE_URL or JWT_SECRET is missing. On a developer's machine `.env` fills
// them in, so the suite passed here and failed in CI — where no `.env` exists,
// because it is git-ignored and must stay that way. Twenty-eight test files
// died before their first assertion with "Invalid environment configuration".
//
// This runs before any test file is imported and supplies the two required
// values, so the suite depends on nothing outside the repository.
//
// Deliberately fake, and deliberately NOT a real database. Only values absent
// from the actual environment are filled: `.env` is loaded with override:false,
// so what is set here wins over the file — which is the point. A unit test
// should have no route to a live database, least of all production's.
const fallback = (key: string, value: string): void => {
  if (!process.env[key]) process.env[key] = value;
};

fallback('DATABASE_URL', 'postgresql://test:test@127.0.0.1:5432/clinicbook_test?schema=public');
fallback('JWT_SECRET', 'unit-tests-only-secret-not-a-real-key-0123456789');
