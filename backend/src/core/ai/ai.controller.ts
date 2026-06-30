import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { chat, getHistory } from './ai.service.js';

export const chatHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = req.user!;
  const { message, conversationId } = req.body as { message: string; conversationId?: string };

  if (!message?.trim()) {
    res.status(400).json({ success: false, message: 'message is required' });
    return;
  }

  const result = await chat(clinicId, userId, message.trim(), conversationId);
  res.status(200).json({ success: true, data: result });
});

export const historyHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId, userId } = req.user!;
  const { conversationId } = req.params;

  const messages = await getHistory(clinicId, userId, conversationId!);
  res.status(200).json({ success: true, data: messages });
});
