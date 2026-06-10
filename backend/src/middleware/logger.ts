import morgan from 'morgan';

import { env } from '../config/env.js';

export const logger = morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev');