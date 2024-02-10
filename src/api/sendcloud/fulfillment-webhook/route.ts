import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import SendcloudFulfillmentService from "../../../services/sendcloud-fulfillment";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const sendcloudFulfillmentService: SendcloudFulfillmentService =
    req.scope.resolve("sendcloudFulfillmentService");

  const payload = req.body;

  switch (payload.action) {
    case "integration_connected":
      console.log("A new integration is added to your SendCloud Account");
      break;

    case "integration_updated":
      console.log("Integration updated in your SendCloud Account");
      break;

    case "parcel_status_changed":
      const { parcel } = payload;

      if (parcel) {
        const result = await sendcloudFulfillmentService.cancelFulfillment(
          parcel
        );
        return res.json(result);
      }
      return res.json({ parcel });

    // Following case requires a return portal to be created in sendcloud and needs the url based on that portal
    // Use -> "await sendcloudFulfillmentService.createReturn"
    case "return_created":
      console.log(
        "method not implemented.parcel_status_changed:return_created"
      );
      break;

    default:
      return res.json(payload);
  }
};
