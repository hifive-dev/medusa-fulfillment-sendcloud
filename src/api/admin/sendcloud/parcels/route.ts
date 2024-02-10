import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

import SendcloudFulfillmentService from "../../../../services/sendcloud-fulfillment";

// This route is to fetch shipments in the admin panel
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const sendcloudFulfillmentService: SendcloudFulfillmentService =
    req.scope.resolve("sendcloudFulfillmentService");

  const parcels = await sendcloudFulfillmentService.retrieveParcels();
  if (parcels) {
    res.json(parcels);
  } else {
    res.status(404).json({ message: "not found" });
  }
};
