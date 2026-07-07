import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { generateRegistrationCode } from "../services/registrationCodeService.js";

const createCodeSchema = z.object({ intendedForNote: z.string().optional() });

export const createRegistrationCode = asyncHandler(async (req: Request, res: Response) => {
  const { intendedForNote } = createCodeSchema.parse(req.body ?? {});
  const code = await generateRegistrationCode(req.user!.id, intendedForNote);
  res.status(201).json(code);
});

export const listRegistrationCodes = asyncHandler(async (_req: Request, res: Response) => {
  const codes = await prisma.registrationCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  // `expired` is computed at read time (expiresAt < now), not tracked via a background sweep.
  const now = new Date();
  res.json(
    codes.map((c) => ({
      ...c,
      isActive: !c.usedAt && c.expiresAt > now,
    })),
  );
});
