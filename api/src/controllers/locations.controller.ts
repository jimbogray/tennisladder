import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { getLocationForecast } from "../services/weatherService.js";
import { UpstreamUnavailableError } from "../services/upstream.js";

export const listLocations = asyncHandler(async (_req: Request, res: Response) => {
  const locations = await prisma.location.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  res.json(locations);
});

const forecastQuerySchema = z.object({
  // The match start time. Omit for a daily outlook instead of the hours around a match.
  at: z.string().datetime().optional(),
});

export const getForecast = asyncHandler(async (req: Request, res: Response) => {
  const { at } = forecastQuerySchema.parse(req.query);
  try {
    const forecast = await getLocationForecast(req.params.id, at ? new Date(at) : undefined);
    if (!forecast) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    res.json(forecast);
  } catch (err) {
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    console.warn("Weather forecast unavailable:", err.message);
    res.status(502).json({ error: "The weather forecast is unavailable right now" });
  }
});

const upsertLocationSchema = z.object({
  name: z.string().min(1),
  // Normalized to null so a cleared address field doesn't persist an empty string.
  address: z
    .string()
    .max(500)
    .optional()
    .transform((value) => value?.trim() || null),
  // Defaulted rather than required, so a client that predates indoor courts still creates one.
  isIndoor: z.boolean().optional().default(false),
});

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const { name, address, isIndoor } = upsertLocationSchema.parse(req.body);
  const location = await prisma.location.create({ data: { name, address, isIndoor } });
  res.status(201).json(location);
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { name, address, isIndoor } = upsertLocationSchema.parse(req.body);
  const location = await prisma.location.update({
    where: { id: req.params.id },
    data: { name, address, isIndoor },
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
