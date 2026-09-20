import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getDeparturePlan } from "../services/travelService.js";
import { UpstreamUnavailableError } from "../services/upstream.js";

// Everything here is worked out from one of the signed-in user's own saved addresses — there is
// deliberately no way to ask when somebody else would have to leave.

const departureQuerySchema = z.object({
  // One of the caller's own saved addresses.
  addressId: z.string().min(1),
  locationId: z.string().min(1),
  // The time the player wants to arrive by, i.e. the start being proposed.
  at: z.string().datetime(),
});

/**
 * When to leave for a match that's still being drafted on the propose/amend/counter forms, where
 * there's no match row (or no agreed time) to hang the answer off yet.
 */
export const getDeparture = asyncHandler(async (req: Request, res: Response) => {
  const { addressId, locationId, at } = departureQuerySchema.parse(req.query);
  try {
    const plan = await getDeparturePlan({
      userId: req.user!.id,
      addressId,
      locationId,
      arriveBy: new Date(at),
    });
    // Someone else's address is reported exactly like an address that doesn't exist.
    if (!plan) {
      res.status(404).json({ error: "Address or location not found" });
      return;
    }
    res.json(plan);
  } catch (err) {
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    console.warn("Departure time unavailable:", err.message);
    res.status(502).json({ error: "Driving times are unavailable right now" });
  }
});
