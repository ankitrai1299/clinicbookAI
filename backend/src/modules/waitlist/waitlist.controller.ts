import { Request, Response } from 'express';
import { WaitlistStatus } from '@prisma/client';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { AddToWaitlistInput, ConvertWaitlistInput, UpdateWaitlistPriorityInput } from './waitlist.schemas.js';
import {
  addToWaitlist,
  cancelWaitlistEntry,
  convertWaitlistToAppointment,
  getWaitlist,
  getWaitlistEntry,
  offerWaitlistSlot,
  respondWaitlistEntry,
  updateWaitlistPriority
} from './waitlist.service.js';

const getClinicId = (req: Request) => req.user!.clinicId;

export const getWaitlistHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as WaitlistStatus | undefined;
  const entries = await getWaitlist(getClinicId(req), status);
  res.status(200).json({ success: true, data: entries });
});

export const getWaitlistEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await getWaitlistEntry(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: entry });
});

export const addToWaitlistHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await addToWaitlist(getClinicId(req), req.body as AddToWaitlistInput);
  res.status(201).json({ success: true, data: entry });
});

export const updateWaitlistPriorityHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await updateWaitlistPriority(
    getClinicId(req),
    req.params.id!,
    req.body as UpdateWaitlistPriorityInput
  );
  res.status(200).json({ success: true, data: entry });
});

export const offerWaitlistSlotHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await offerWaitlistSlot(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: entry });
});

export const respondWaitlistEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await respondWaitlistEntry(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: entry });
});

export const convertWaitlistHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await convertWaitlistToAppointment(
    getClinicId(req),
    req.params.id!,
    req.body as ConvertWaitlistInput
  );
  res.status(200).json({ success: true, data: result });
});

export const cancelWaitlistEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await cancelWaitlistEntry(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: entry });
});
