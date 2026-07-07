import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";

export const listLocations = asyncHandler(async (_req: Request, res: Response) => {
  const locations = await prisma.location.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  res.json(locations);
});

const upsertLocationSchema = z.object({ name: z.string().min(1) });

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const { name } = upsertLocationSchema.parse(req.body);
  const location = await prisma.location.create({ data: { name } });
  res.status(201).json(location);
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { name } = upsertLocationSchema.parse(req.body);
  const location = await prisma.location.update({
    where: { id: req.params.id },
    data: { name },
  });
  res.json(location);
});

export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  // Soft delete — preserves historical matches referencing this location.
  const location = await prisma.location.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  res.json(location);
});
