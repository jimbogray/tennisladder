import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { toSessionUserDto } from "../auth/sessionUser.js";
import * as phoneVerification from "../services/phoneVerificationService.js";

// Every route here acts on the signed-in user's own notification number. Nobody — admins
// included — can read or set someone else's.

/**
 * Both error types the service throws carry a message written for the user, so they're surfaced
 * as-is rather than mapped to something vaguer.
 */
function handleError(err: unknown, res: Response): void {
  if (err instanceof phoneVerification.PhoneNumberError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof phoneVerification.PhoneVerificationError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

export const startMyPhoneVerification = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber } = phoneVerification.startPhoneVerificationSchema.parse(req.body);
  try {
    const started = await phoneVerification.startPhoneVerification(req.user!.id, phoneNumber);
    res.status(202).json(started);
  } catch (err) {
    handleError(err, res);
  }
});

export const confirmMyPhoneVerification = asyncHandler(async (req: Request, res: Response) => {
  const { code } = phoneVerification.confirmPhoneVerificationSchema.parse(req.body);
  try {
    const user = await phoneVerification.confirmPhoneVerification(req.user!.id, code);
    res.json(toSessionUserDto(user));
  } catch (err) {
    handleError(err, res);
  }
});

export const removeMyPhoneNumber = asyncHandler(async (req: Request, res: Response) => {
  const user = await phoneVerification.removePhoneNumber(req.user!.id);
  res.json(toSessionUserDto(user));
});
