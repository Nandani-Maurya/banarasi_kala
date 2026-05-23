const CustomerAddress = require("../models/CustomerAddress");

const MAX_ADDRESSES = 3;

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

class CustomerAddressController {
  async list(req, res) {
    try {
      const rows = await CustomerAddress.findAll({
        where: { customer_id: req.user.id },
        order: [["is_default", "DESC"], ["updated_at", "DESC"]],
      });
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  async create(req, res) {
    try {
      const existingCount = await CustomerAddress.count({
        where: { customer_id: req.user.id },
      });
      if (existingCount >= MAX_ADDRESSES) {
        return res.status(400).json({ message: `You can save maximum ${MAX_ADDRESSES} addresses.` });
      }

      const {
        label,
        name,
        phone,
        country,
        address_line1,
        address_line2,
        city,
        state,
        pincode,
        landmark,
        delivery_instructions,
        is_default,
      } = req.body || {};

      if (!cleanText(address_line1)) {
        return res.status(400).json({ message: "Please enter Address Line 1." });
      }

      const payload = {
        customer_id: req.user.id,
        label: cleanText(label),
        name: cleanText(name),
        phone: cleanText(phone),
        country: cleanText(country) || "India",
        address_line1: cleanText(address_line1),
        address_line2: cleanText(address_line2),
        city: cleanText(city),
        state: cleanText(state),
        pincode: cleanText(pincode),
        landmark: cleanText(landmark),
        delivery_instructions: cleanText(delivery_instructions),
        is_default: !!is_default,
      };

      if (payload.is_default) {
        await CustomerAddress.update(
          { is_default: false },
          { where: { customer_id: req.user.id } },
        );
      }

      const created = await CustomerAddress.create(payload);
      return res.status(201).json(created);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const address = await CustomerAddress.findOne({
        where: { id, customer_id: req.user.id },
      });
      if (!address) return res.status(404).json({ message: "Address not found" });

      const {
        label,
        name,
        phone,
        country,
        address_line1,
        address_line2,
        city,
        state,
        pincode,
        landmark,
        delivery_instructions,
        is_default,
      } = req.body || {};

      const payload = {};
      if (label !== undefined) payload.label = cleanText(label);
      if (name !== undefined) payload.name = cleanText(name);
      if (phone !== undefined) payload.phone = cleanText(phone);
      if (country !== undefined) payload.country = cleanText(country) || "India";
      if (address_line1 !== undefined) payload.address_line1 = cleanText(address_line1);
      if (address_line2 !== undefined) payload.address_line2 = cleanText(address_line2);
      if (city !== undefined) payload.city = cleanText(city);
      if (state !== undefined) payload.state = cleanText(state);
      if (pincode !== undefined) payload.pincode = cleanText(pincode);
      if (landmark !== undefined) payload.landmark = cleanText(landmark);
      if (delivery_instructions !== undefined) payload.delivery_instructions = cleanText(delivery_instructions);
      if (is_default !== undefined) payload.is_default = !!is_default;

      if (payload.address_line1 !== undefined && !payload.address_line1) {
        return res.status(400).json({ message: "Please enter Address Line 1." });
      }

      if (payload.is_default) {
        await CustomerAddress.update(
          { is_default: false },
          { where: { customer_id: req.user.id } },
        );
      }

      await address.update(payload);
      return res.status(200).json(address);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  async remove(req, res) {
    try {
      const { id } = req.params;
      const address = await CustomerAddress.findOne({
        where: { id, customer_id: req.user.id },
      });
      if (!address) return res.status(404).json({ message: "Address not found" });

      await address.destroy();
      return res.status(200).json({ message: "Address deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
}

module.exports = new CustomerAddressController();
