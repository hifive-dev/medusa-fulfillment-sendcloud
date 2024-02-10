import {
  AbstractFulfillmentService,
  Cart,
  Fulfillment,
  LineItem,
  Order,
} from "@medusajs/medusa";
import { MedusaContainer } from "@medusajs/types";
import axios from "axios";

class SendcloudFulfillmentService extends AbstractFulfillmentService {
  static identifier = "sendcloud-fulfillment";
  protected readonly options_: { token: any };
  protected readonly orderService_: {
    retrieve: (
      arg0: any,
      arg1: { select: string[]; relations: string[] }
    ) => any;
  };

  constructor(
    container: MedusaContainer,
    { orderService }: any,
    options: { token: any }
  ) {
    super(container);
    this.orderService_ = orderService;
    this.options_ = options;
  }

  // This method is used when retrieving the list of fulfillment options available in a region
  // Each of these options can have different data associated with them.
  // These methods appears in medusa admin -> regions -> select fulfillment provider
  async getFulfillmentOptions(): Promise<any[]> {
    const shippingOptionsData = await this.getShippingMethods();

    return shippingOptionsData.shipping_methods;
  }

  // Method is called when a shipping method is created.
  // To validate the selected shipping method from admin panel
  async validateOption(data: { [x: string]: unknown }): Promise<boolean> {
    const shippingOptionsData = await this.getShippingMethods();
    const isOptionValid = shippingOptionsData.shipping_methods.some(
      (shippingMethod) => shippingMethod.id == data.id
    );
    return isOptionValid;
  }

  // This method is called when a shipping method is created. This typically happens when the customer chooses a shipping option during checkout.
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    cart: Cart
  ): Promise<Record<string, unknown>> {
    return {
      ...data,
      ...optionData,
    };
  }

  // This method is used when a fulfillment is created for an order.
  async createFulfillment(
    data: { [x: string]: unknown },
    items: LineItem[],
    order: Order,
    fulfillment: Fulfillment
  ): Promise<{ [x: string]: unknown }> {
    const parcelItems = [];
    items.forEach((item) => {
      const { id, title, hs_code, weight, description, origin_country } =
        item.variant.product;

      const { quantity, unit_price } = item;

      const extractedProperties = {
        description: `${title} - ${description}`,
        weight: weight,
        properties: {
          title: title,
        },
        hs_code: hs_code,
        origin_country: origin_country,
        product_id: id,
        quantity: quantity,
        value: unit_price / 100,
      };
      parcelItems.push(extractedProperties);
    });

    const customer_name =
      order.shipping_address.first_name +
      " " +
      order.shipping_address.last_name;
    const city = order.shipping_address.city;
    const address = order.shipping_address.address_1;
    const postalCode = order.shipping_address.postal_code;
    const country = order.shipping_address.country_code.toUpperCase();
    const customer_phone = order.billing_address.phone;
    const customer_email = order.email;
    const order_number = order.display_id;
    const shipping_method_checkout_name = order.shipping_methods[0]
      .shipping_option.data.name as string;
    const shipment = {
      id: order.shipping_methods[0].shipping_option.data.id as number,
    };

    const house_number = order.shipping_address.address_2;

    const external_reference = order.id;

    const { parcel } = await this.createParcel(
      parcelItems,
      customer_name,
      city,
      address,
      postalCode,
      country,
      order_number,
      shipping_method_checkout_name,
      shipment,
      customer_phone,
      customer_email,
      external_reference,
      house_number
    );
    return parcel;
  }

  // This method is called when a fulfillment is cancelled by the admin. This fulfillment can be for an order
  async cancelFulfillment(data: Record<string, any>): Promise<any> {
    // if triggered by webhook event
    // id type not sure
    if (data.status.id == 2000) {
      return Promise.resolve({});
    } else {
      // if triggered from medusa admin
      const result = await this.cancelParcel(data.id); //data.id -> parcel id
      return Promise.resolve({ result });
    }
  }

  // This method is used in different places, including:
  // When the shipping options for a cart are retrieved during checkout. If a shipping option has their price_type set to calculated, this method is used to set the amount of the returned shipping option.
  // When a shipping method is created. If the shipping option associated with the method has their price_type set to calculated, this method is used to set the price attribute of the shipping method in the database.
  // When the cart's totals are calculated.
  async calculatePrice(
    optionData: { [x: string]: unknown },
    data: { [x: string]: unknown },
    cart: Cart
  ): Promise<number> {
    let addressData = await this.getAddress();
    let contracts = await this.getContracts();
    // we need weight to calculate price and also compare that items weight is less then
    // shipping method maximum
    let totalWeightGrams = 0;
    cart.items.forEach((item) => {
      const itemWeight = item.variant.product.weight;
      const itemQuantity = item.quantity;

      totalWeightGrams += itemWeight * itemQuantity;
    });
    let totalWeightKilograms = totalWeightGrams / 1000;
    if ((data.max_weight as number) < totalWeightKilograms) {
      return null;
    }

    // extractedAddressArray store the postalCode and countryCode of sender address
    let extractedAddressArray: { postalCode: string; country: string }[] = [];

    addressData.sender_addresses.forEach((address) => {
      const extractedData = {
        postalCode: address.postal_code,
        country: address.country,
      };
      extractedAddressArray.push(extractedData);
    });

    const targetCountries = (data?.countries as Array<{ iso_2: string }>).map(
      (country) => country.iso_2
    );
    const targetCarrier = data.carrier;
    const matchingContracts = contracts.contracts.filter((contract) => {
      if (contract.is_active) {
        // contractCountries store the country code i.e NL of contract
        const contractCountries = [contract.country];
        // contractCarrier store the carrier of contract
        const contractCarrier = contract.carrier.code;

        // match the contact country code and carrier code with shipping method country and carrie code
        return (
          targetCountries.some((country) =>
            contractCountries.includes(country)
          ) && targetCarrier === contractCarrier
        );
      }
    });

    //  if there is same sender address and same weight of each parcel user select that
    // shipping method that allow multicollo , ship multiple parcels at same time
    const isSameWeight =
      cart.items.length > 1 &&
      cart.items.every((item, index, array) => {
        return item.variant.product.weight === array[0].variant.product.weight;
      });

    let sender_country;
    let sender_postal;
    let receiver_country = cart.shipping_address.country_code.toUpperCase();
    let receiver_postal = cart.shipping_address.postal_code;
    let contractId;
    let weight = totalWeightGrams;
    let weight_unit = "gram";
    let shipping_method_id = data.id;

    if (extractedAddressArray.length === 1) {
      sender_country = extractedAddressArray[0].country;
      sender_postal = extractedAddressArray[0].postalCode;
    }
    if (matchingContracts.length === 1) {
      contractId = matchingContracts[0].id;
    }

    let result = await this.getPrice(
      sender_country,
      sender_postal,
      receiver_country,
      receiver_postal,
      contractId,
      weight,
      weight_unit,
      shipping_method_id
    );
    let price = result[0].price * 100;

    return price;
  }

  // Used to determine whether a shipping option is calculated dynamically or flat rate.
  async canCalculate(data: { [x: string]: unknown }): Promise<boolean> {
    const shippingOptionsData = await this.getShippingMethods();
    const isCalculateValid = shippingOptionsData.shipping_methods.some(
      (shippingMethod) => shippingMethod.id == data.id
    );
    return isCalculateValid;
  }

  async createReturn(returnOrder) {
    // TODO; Create a Return Portal on SENDCLOUD
    // Call API https://panel.sendcloud.sc/api/v2/brand/{brand_domain}/return-portal/incoming
    // sc_return payload to be sent in body in above API to create a return
    let orderId;
    if (returnOrder.order_id) {
      orderId = returnOrder.order_id;
    } else if (returnOrder.swap) {
      orderId = returnOrder.swap.order_id;
    } else if (returnOrder.claim_order) {
      orderId = returnOrder.claim_order.order_id;
    }

    const fromOrder = await this.orderService_.retrieve(orderId, {
      select: ["total"],
      relations: [
        "discounts",
        "discounts.rule",
        "shipping_address",
        "returns",
        "fulfillments",
      ],
    });

    const { shipping_address } = fromOrder;

    const sc_return = {
      reason: 0,
      message: "string",
      outgoing_parcel: 0,
      service_point: {
        id: 10875349,
      },
      refund: {
        refund_type: {
          code: "money",
        },
        message: "string",
      },
      delivery_option: "drop_off_point",
      products0: [
        {
          product_id: "1234",
          quantity: 1,
          description: "golden pen",
          value: 1,
          return_reason: 1,
        },
      ],
      products: returnOrder.items.map((item) => {
        return {
          product_id: item.id,
          quantity: item.quantity,
          description: item.description,
          value: item.price || 0.0,
          return_reason: 1,
        };
      }),
      incoming_parcel: {
        collo_count: 1,
        from_address_1: shipping_address.address_1,
        from_address_2: shipping_address.address_2,
        from_city: shipping_address.city,
        from_company_name: `${shipping_address.first_name} ${shipping_address.last_name}`,
        from_country: shipping_address.country_code.toUpperCase(),
        from_email: fromOrder.email,
        from_house_number: shipping_address.address_2,
        from_country_state: shipping_address.province,
        from_name: `${shipping_address.first_name} ${shipping_address.last_name}`,
        from_postal_code: shipping_address.postal_code,
        from_telephone: shipping_address.phone,
      },
      selected_functionalities: {
        first_mile: "dropoff",
      },
      // selected_carrier_code: "string",
      // pickup_date: "string",
    };

    const Options = {
      method: "POST",
      url: `https://panel.sendcloud.sc/api/v2/brand/{brand_domain}/return-portal/incoming`,
      params: { to_country: "NL" },
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    await axios.request(Options);
    return sc_return;
  }

  // This methods used to retrieve any documents associated with a fulfillment.
  // This method isn't used by default in the backend, but you can use it for
  // custom use cases such as allowing admins to download these documents.

  getFulfillmentDocuments(data: { [x: string]: unknown }): Promise<any> {
    throw new Error("Method not implemented.getFulfillmentDocuments");
  }
  getReturnDocuments(data: Record<string, unknown>): Promise<any> {
    throw new Error("Method not implemented.getReturnDocuments");
  }
  getShipmentDocuments(data: Record<string, unknown>): Promise<any> {
    throw new Error("Method not implemented.getShipmentDocuments");
  }
  retrieveDocuments(
    fulfillmentData: Record<string, unknown>,
    documentType: "invoice" | "label"
  ): Promise<any> {
    throw new Error("Method not implemented.retrieveDocuments");
  }

  // The Following all methods are helper methods used for ease in above methods
  async getShippingMethods() {
    const shippingMethodsOptions = {
      method: "GET",
      url: "https://panel.sendcloud.sc/api/v2/shipping_methods",
      params: { to_country: "NL" },
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    const shippingOptionsResponse = await axios.request(shippingMethodsOptions);
    const shippingOptionsData = shippingOptionsResponse.data;

    const returnShippingMethodsOptions = {
      method: "GET",
      url: "https://panel.sendcloud.sc/api/v2/shipping_methods",
      params: { to_country: "NL", is_return: true },
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };

    const returnShippingOptionsResponse = await axios.request(
      returnShippingMethodsOptions
    );

    const returnShippingOptionsData = returnShippingOptionsResponse.data;

    const modifiedReturnShippingOptionsData = {
      ...returnShippingOptionsData,
      shipping_methods: returnShippingOptionsData.shipping_methods.map(
        (method) => ({
          ...method,
          is_return: true,
        })
      ),
    };

    const all_shipping_methods = {
      ...shippingOptionsData.shipping_methods,
      ...modifiedReturnShippingOptionsData.shipping_methods,
    };
    return all_shipping_methods;
  }

  async retrieveParcelById(id) {
    const Options = {
      method: "POST",
      url: `https://panel.sendcloud.sc/api/v2/parcels/${id}`,
      params: { to_country: "NL" },
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    const Response = await axios.request(Options);
    return Response.data;
  }

  async retrieveParcels() {
    const Options = {
      method: "GET",
      url: `https://panel.sendcloud.sc/api/v2/parcels`,
      params: {},
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    const Response = await axios.request(Options);
    return Response.data;
  }

  async retrieveOrderById(id) {
    const Options = {
      method: "GET",
      url: `https://panel.sendcloud.sc/api/v2/parcels/${id}`,
      headers: {
        "X-Requested-With": "",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    const Response = await axios.request(Options);
    return Response.data;
  }

  async getContracts() {
    const options = {
      method: "GET",
      url: "https://panel.sendcloud.sc/api/v2/contracts",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    const { data } = await axios.request(options);
    return data;
  }

  async getAddress() {
    const options = {
      method: "GET",
      url: "https://panel.sendcloud.sc/api/v2/user/addresses/sender",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };

    const { data } = await axios.request(options);
    return data;
  }

  async getPrice(
    sender_country,
    sender_postal,
    receiver_country,
    receiver_postal,
    contractId,
    weight,
    weight_unit,
    shipping_method_id
  ) {
    const options = {
      method: "GET",
      url: "https://panel.sendcloud.sc/api/v2/shipping-price",
      params: {
        shipping_method_id: shipping_method_id,
        from_country: sender_country,
        to_country: receiver_country,
        weight: weight,
        weight_unit: weight_unit,
        contract: contractId,
        from_postal_code: sender_postal,
        to_postal_code: receiver_postal,
      },
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };

    const { data } = await axios.request(options);
    return data;
  }

  async createParcel(
    parcelItems: any[],
    customer_name: string,
    customer_city: string,
    customer_address: string,
    postalCode: string,
    customer_country: string,
    order_number: number,
    shipping_method_checkout_name: string,
    shipment: { id: number },
    customer_phone: string,
    customer_email: string,
    external_reference: string,
    house_number: string
  ) {
    const options = {
      method: "POST",
      url: "https://panel.sendcloud.sc/api/v2/parcels",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
      data: {
        parcel: {
          name: customer_name,
          address: customer_address,
          city: customer_city,
          postal_code: postalCode,
          country: customer_country,
          parcel_items: parcelItems,
          request_label: true,
          order_number,
          shipping_method_checkout_name,
          shipment,
          telephone: customer_phone,
          email: customer_email,
          external_reference,
          house_number,
        },
      },
    };

    try {
      const { data } = await axios.request(options);
      return data;
    } catch (error) {
      console.error(error.response.data.error);
    }
  }

  async cancelParcel(parcelId) {
    const options = {
      method: "POST",
      url: `https://panel.sendcloud.sc/api/v2/parcels/${parcelId}/cancel`,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${this.options_.token}`,
      },
    };
    try {
      const { data } = await axios.request(options);
      return data;
    } catch (error) {
      console.error(error);
    }
  }
}

export default SendcloudFulfillmentService;
