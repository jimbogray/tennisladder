import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as addressService from "../services/addressService.js";
import { UpstreamUnavailableError } from "../services/upstream.js";

// Every route here acts on the signed-in user's own addresses — there is deliberately no way to
// read someone else's, admins included.

export const listMyAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await addressService.listAddresses(req.user!.id);
  res.json(addresses.map(addressService.toUserAddressDto));
});

export const createMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const input = addressService.addressInputSchema.parse(req.body);
  try {
    const address = await addressService.createAddress(req.user!.id, input);
    res.status(201).json(addressService.toUserAddressDto(address));
  } catch (err) {
    // The address is geocoded before it's saved, and only the coordinates are kept, so a map
    // provider that's down means the address can't be saved at all — not that it's a bad address.
    // Worth distinguishing: the player should try again later rather than retype it.
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    console.warn("Saved address rejected, geocoding unavailable:", err.message);
    res.status(502).json({ error: "Address lookup is unavailable right now. Please try again shortly." });
  }
});

export const deleteMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await addressService.deleteAddress(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  res.status(204).end();
});
