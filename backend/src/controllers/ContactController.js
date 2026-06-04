const ContactMessage = require("../models/ContactMessage");

exports.submit = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({ message: "Please fill all required fields." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const entry = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : null,
      subject: String(subject).trim(),
      message: String(message).trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Message received! We will get back to you soon.",
      id: entry.id,
    });
  } catch (error) {
    console.error("ContactController.submit error:", error);
    return res.status(500).json({ message: "Unable to submit your message. Please try again." });
  }
};

exports.list = async (req, res) => {
  try {
    const messages = await ContactMessage.findAll({ order: [["createdAt", "DESC"]] });
    return res.json(messages);
  } catch (error) {
    console.error("ContactController.list error:", error);
    return res.status(500).json({ message: "Unable to fetch messages." });
  }
};

exports.markRead = async (req, res) => {
  try {
    await ContactMessage.update({ is_read: true }, { where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (error) {
    console.error("ContactController.markRead error:", error);
    return res.status(500).json({ message: "Unable to update message." });
  }
};
