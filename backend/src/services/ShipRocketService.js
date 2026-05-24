const axios = require('axios');

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

/**
 * ShipRocketService
 * -----------------
 * Wraps the ShipRocket REST API.
 * Auth token is cached in memory and refreshed automatically before it expires (24h).
 */
class ShipRocketService {
  constructor() {
    this._token = null;
    this._tokenExpiry = null; // ms timestamp
  }

  // ─── AUTH ────────────────────────────────────────────────────────────────────

  async getToken() {
    // Return cached token if still valid (with a 5-min buffer)
    if (this._token && this._tokenExpiry && Date.now() < this._tokenExpiry - 5 * 60 * 1000) {
      return this._token;
    }

    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    });

    this._token = response.data.token;
    // ShipRocket tokens are valid for 24 hours
    this._tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

    console.log('[ShipRocket] Auth token refreshed.');
    return this._token;
  }

  async _headers() {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ─── ORDER ────────────────────────────────────────────────────────────────────
  _computePackageMetrics(items, productMap) {
    let totalWeight = 0;
    let maxItemLengthCm = 0;
    let maxItemBreadthCm = 0;
    let sumItemHeightCm = 0;

    items.forEach((item) => {
      const quantity = Number(item.quantity) || 1;
      const product = productMap[item.product_id];

      let itemWeightKg = 0.5;
      if (product && Number(product.weight) > 0) {
        const rawWeight = Number(product.weight);
        itemWeightKg = rawWeight > 5 ? rawWeight / 1000 : rawWeight;
      }
      totalWeight += itemWeightKg * quantity;

      const rawLength = Number(product?.length);
      const rawWidth = Number(product?.width);
      const rawHeight = Number(product?.height);
      const lengthCm = Number.isFinite(rawLength) && rawLength > 0
        ? (rawLength <= 10 ? rawLength * 100 : rawLength)
        : 30;
      const widthCm = Number.isFinite(rawWidth) && rawWidth > 0
        ? (rawWidth <= 10 ? rawWidth * 100 : rawWidth)
        : 20;
      const heightCm = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 5;

      maxItemLengthCm = Math.max(maxItemLengthCm, lengthCm);
      maxItemBreadthCm = Math.max(maxItemBreadthCm, widthCm);
      sumItemHeightCm += heightCm * quantity;
    });

    return {
      pkgLength: Math.max(10, Math.round(maxItemLengthCm || 30)),
      pkgBreadth: Math.max(10, Math.round(maxItemBreadthCm || 20)),
      pkgHeight: Math.max(5, Math.round(sumItemHeightCm || 5)),
      pkgWeight: Math.max(0.1, Number(totalWeight.toFixed(3))),
    };
  }

  /**
   * Create a shipment order on ShipRocket.
   * @param {object} orderData  - VNS Saree Order model instance + items array
   * @returns ShipRocket order + shipment_id
   */
  async createOrder(orderData) {
    const { order, items } = orderData;

    // Fetch product details for true dimensions & weights
    const productIds = items.map(item => item.product_id).filter(Boolean);
    const Product = require('../models/Product');
    const dbProducts = await Product.findAll({ where: { id: productIds } });
    const productMap = {};
    dbProducts.forEach(p => {
      productMap[p.id] = p;
    });

    // ShipRocket expects all weight in kg; default each item to 0.5 kg if unknown
    const orderItems = items.map((item, idx) => ({
      name: item.name || item.product_name || `Product ${idx + 1}`,
      sku: item.product_id ? `SKU-${item.product_id}` : `SKU-${idx}`,
      units: item.quantity,
      selling_price: item.price,
      discount: 0,
      tax: 0,
      hsn: '',
    }));

    const { pkgLength, pkgBreadth, pkgHeight, pkgWeight } = this._computePackageMetrics(items, productMap);

    const now = new Date();
    const orderDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const isCod = order.payment_method === 'COD';
    const payload = {
      order_id: `VNS-${order.id}`,
      order_date: orderDate,
      pickup_location: 'Home',  // Matches pickup location name in ShipRocket dashboard

      // Billing == Shipping for this store
      billing_customer_name: order.customer_name,
      billing_last_name: '',
      billing_address: order.address,
      billing_city: order.city,
      billing_pincode: String(order.pincode),
      billing_state: order.state || 'Uttar Pradesh',
      billing_country: 'India',
      billing_email: order.customer_email,
      billing_phone: String(order.phone),
      billing_is_billing_address: true,

      shipping_is_billing: 1,

      // Items
      order_items: orderItems,

      payment_method: isCod ? 'COD' : 'Prepaid',
      cod_amount: isCod ? Number(order.total_amount) : 0,
      shipping_charges: 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: Number(order.discount_amount) || 0,
      sub_total: Number(order.total_amount),
      length: pkgLength,  // cm
      breadth: pkgBreadth,
      height: pkgHeight,
      weight: pkgWeight,
      is_insurance: 0,
    };

    const headers = await this._headers();
    const response = await axios.post(`${BASE_URL}/orders/create/adhoc`, payload, { headers });
    return response.data;
  }

  /**
   * Create a return shipment order on ShipRocket.
   * @param {object} returnData
   * @returns ShipRocket return order details
   */
  async createReturnOrder(returnData) {
    const { order, items, reason } = returnData;

    // Fetch product details for true dimensions & weights
    const productIds = items.map(item => item.product_id).filter(Boolean);
    const Product = require('../models/Product');
    const dbProducts = await Product.findAll({ where: { id: productIds } });
    const productMap = {};
    dbProducts.forEach(p => {
      productMap[p.id] = p;
    });

    const orderItems = items.map((item, idx) => ({
      name: item.name || item.product_name || `Product ${idx + 1}`,
      sku: item.product_id ? `SKU-${item.product_id}` : `SKU-${idx}`,
      units: item.quantity,
      selling_price: item.price,
      discount: 0,
      tax: 0,
      hsn: '',
    }));

    const { pkgLength, pkgBreadth, pkgHeight, pkgWeight } = this._computePackageMetrics(items, productMap);

    const now = new Date();
    const orderDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const payload = {
      order_id: `RET-VNS-${order.id}`,
      order_date: orderDate,
      pickup_location: 'Home', // Warehouse/Home where customer return gets delivered

      // Returns are picked up from the customer
      pickup_customer_name: order.customer_name,
      pickup_last_name: '',
      pickup_address: order.address,
      pickup_address_2: '',
      pickup_city: order.city,
      pickup_pincode: String(order.pincode),
      pickup_state: order.state || 'Uttar Pradesh',
      pickup_country: 'India',
      pickup_email: order.customer_email,
      pickup_phone: String(order.phone),

      // Delivered back to your warehouse address
      shipping_customer_name: 'Banaras Heritage',
      shipping_last_name: '',
      shipping_address: 'D-36/248, August Kunda, August Kunda Road',
      shipping_address_2: 'Dashashwamedh',
      shipping_city: 'Varanasi',
      shipping_pincode: '221001',
      shipping_state: 'Uttar Pradesh',
      shipping_country: 'India',
      shipping_email: '2000nanmaurya@gmail.com',
      shipping_phone: '9876543210',

      order_items: orderItems,
      payment_method: 'Prepaid',
      channel_id: '',
      comment: reason || 'Customer requested return',
      total_discount: 0,
      sub_total: Number(order.total_amount),
      length: pkgLength,
      breadth: pkgBreadth,
      height: pkgHeight,
      weight: pkgWeight,
    };

    const headers = await this._headers();
    const response = await axios.post(`${BASE_URL}/orders/create/return`, payload, { headers });
    return response.data;
  }

  // ─── AWB / COURIER ───────────────────────────────────────────────────────────

  /**
   * Recommend best courier for a shipment.
   * @param {string|number} shipmentId
   * @param {string} pincode  - destination pincode
   * @param {number} weight - actual weight in kg
   * @param {boolean} isCod - cash on delivery flag
   */
  async getServiceableCouries(shipmentId, pincode, weight = 0.5, isCod = false) {
    const headers = await this._headers();
    const response = await axios.get(
      `${BASE_URL}/courier/serviceability/?pickup_postcode=221001&delivery_postcode=${pincode}&weight=${weight}&cod=${isCod ? 1 : 0}`,
      { headers }
    );
    return response.data;
  }

  /**
   * Assign courier and generate AWB for a shipment.
   * @param {string|number} shipmentId
   * @param {string|number|null} courierId  - leave null to let ShipRocket auto-assign
   */
  async assignAWB(shipmentId, courierId = null) {
    const headers = await this._headers();
    const payload = { shipment_id: String(shipmentId) };
    if (courierId) payload.courier_id = courierId;

    const response = await axios.post(`${BASE_URL}/courier/assign/awb`, payload, { headers });
    return response.data;
  }

  // ─── LABEL & MANIFEST ────────────────────────────────────────────────────────

  /**
   * Generate shipping label for one or more shipments.
   * @param {Array<string|number>} shipmentIds
   */
  async generateLabel(shipmentIds) {
    const headers = await this._headers();
    const response = await axios.post(
      `${BASE_URL}/courier/generate/label`,
      { shipment_id: shipmentIds },
      { headers }
    );
    return response.data; // Contains label_url
  }

  /**
   * Generate pickup manifest.
   * @param {Array<string|number>} shipmentIds
   */
  async generateManifest(shipmentIds) {
    const headers = await this._headers();
    const response = await axios.post(
      `${BASE_URL}/manifests/generate`,
      { shipment_id: shipmentIds },
      { headers }
    );
    return response.data; // Contains manifest_url
  }

  // ─── TRACKING ────────────────────────────────────────────────────────────────

  /**
   * Track shipment by AWB number.
   * @param {string} awb
   */
  async trackByAWB(awb) {
    const headers = await this._headers();
    const response = await axios.get(`${BASE_URL}/courier/track/awb/${awb}`, { headers });
    return response.data;
  }

  /**
   * Track shipment by ShipRocket order ID.
   * @param {string|number} shiprocketOrderId
   */
  async trackByOrderId(shiprocketOrderId) {
    const headers = await this._headers();
    const response = await axios.get(`${BASE_URL}/orders/show/${shiprocketOrderId}`, { headers });
    return response.data;
  }

  // ─── CANCEL ──────────────────────────────────────────────────────────────────

  /**
   * Cancel ShipRocket orders.
   * @param {Array<string|number>} shiprocketOrderIds
   */
  async cancelOrders(shiprocketOrderIds) {
    const headers = await this._headers();
    const response = await axios.post(
      `${BASE_URL}/orders/cancel`,
      { ids: shiprocketOrderIds },
      { headers }
    );
    return response.data;
  }

  // ─── PICKUP ──────────────────────────────────────────────────────────────────

  /**
   * Schedule a pickup for shipments.
   * @param {Array<string|number>} shipmentIds
   */
  async schedulePickup(shipmentIds) {
    const headers = await this._headers();
    const response = await axios.post(
      `${BASE_URL}/courier/generate/pickup`,
      { shipment_id: shipmentIds },
      { headers }
    );
    return response.data;
  }
}

module.exports = new ShipRocketService();
