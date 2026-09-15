import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as addressService from "../services/addressService.js";

// Every route here acts on the signed-in user's own addresses — there is deliberately no way to
// read someone else's, admins included.

export const listMyAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await addressService.listAddresses(req.user!.id);
  res.json(addresses.map(addressService.toUserAddressDto));
});

export const createMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const input = addressService.addressInputSchema.parse(req.body);
  const address = await addressService.createAddress(req.user!.id, input);
  res.status(201).json(addressService.toUserAddressDto(address));
});

export const deleteMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await addressService.deleteAddress(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  res.status(204).end();
});
