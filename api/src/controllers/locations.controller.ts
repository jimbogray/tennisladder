import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../config/prisma.js";
import { getLocationForecast, WeatherUnavailableError } from "../services/weatherService.js";

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
    if (!(err instanceof WeatherUnavailableError)) throw err;
    console.warn("Weather forecast unavailable:", err.message);
    res.status(502).json({ error: "The weather forecast is unavailable right now" });
  }
});

const isDuplicateName = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const upsertLocationSchema = z.object({
  // Trimmed so " Riverside" can't sit beside "Riverside" as a separate court.
  name: z.string().trim().min(1, "Give the location a name"),
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

  // Deleting a location only archives it (its matches still point at it), so the name stays
  // taken and a plain insert would collide. Adding the same name back is therefore a restore:
  // the original row returns with whatever details were just entered, and its match history
  // comes back with it.
  const archived = await prisma.location.findFirst({
    where: { name, NOT: { archivedAt: null } },
  });
  if (archived) {
    const restored = await prisma.location.update({
      where: { id: archived.id },
      data: { address, isIndoor, archivedAt: null },
    });
    res.status(200).json(restored);
    return;
  }

  try {
    const location = await prisma.location.create({ data: { name, address, isIndoor } });
    res.status(201).json(location);
  } catch (err) {
    // Another request took the name between the lookup above and this insert.
    if (!isDuplicateName(err)) throw err;
    res.status(409).json({ error: `There's already a location called "${name}"` });
  }
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { name, address, isIndoor } = upsertLocationSchema.parse(req.body);
  try {
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: { name, address, isIndoor },
    });
    res.json(location);
  } catch (err) {
    if (!isDuplicateName(err)) throw err;
    res.status(409).json({ error: `There's already a location called "${name}"` });
  }
});

export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  // Soft delete — preserves historical matches referencing this location.
  const location = await prisma.location.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  res.json(location);
});
