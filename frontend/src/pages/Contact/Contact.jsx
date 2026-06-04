import { useState } from "react";
import { Icon } from "@iconify/react";
import { Clock, Mail, MapPin, Phone, Send } from "lucide-react";
import toast from "react-hot-toast";
import { API_ENDPOINTS } from "../../config/api";
import "./Contact.css";

const WHATSAPP_NUMBER = "919555098884";
const WHATSAPP_TEXT = encodeURIComponent("Hi Banarasi Kala, I need quick help.");
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_TEXT}`;

const EMPTY_FORM = { name: "", email: "", phone: "", subject: "", message: "" };

// Strip non-digits, remove leading zeros, keep last 10 digits
const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  const stripped = digits.replace(/^0+/, "");
  return stripped.length > 10 ? stripped.slice(-10) : stripped;
};

const Contact = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "phone" ? normalizePhone(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const { name, email, phone, subject, message } = form;
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error("Please enter a valid 10-digit mobile number starting with 6–9.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(API_ENDPOINTS.contactSubmit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone, subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Message sent! We will get back to you soon.");
        setForm(EMPTY_FORM);
      } else {
        toast.error(data.message || "Could not send message. Please try again.");
      }
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="contact-page">
      <section className="contact-shell">
        <div className="contact-info-panel">
          <div className="contact-kicker">Get In Touch</div>
          <h1>We're Here to Help You</h1>
          <p className="contact-intro">
            Have a question, need styling advice, or looking for something
            special? We'd love to hear from you.
          </p>

          <span className="contact-divider" aria-hidden="true" />

          <div className="contact-info-list">
            <article>
              <span><Phone size={20} /></span>
              <div>
                <h2>Call Us</h2>
                <p>+91 98765 43210</p>
                <small>Mon - Sat, 10:00 AM - 7:00 PM</small>
              </div>
            </article>
            <article>
              <span><Mail size={20} /></span>
              <div>
                <h2>Email Us</h2>
                <p>hello@banarasikala.com</p>
                <small>We reply within 24 hours</small>
              </div>
            </article>
            <article>
              <span><MapPin size={20} /></span>
              <div>
                <h2>Visit Us</h2>
                <p>B-15/42, Assi Ghat Road, Varanasi, Uttar Pradesh - 221005</p>
              </div>
            </article>
            <article>
              <span><Clock size={20} /></span>
              <div>
                <h2>Store Hours</h2>
                <p>Monday to Saturday: 10:00 AM - 7:00 PM</p>
                <small>Sunday: Closed</small>
              </div>
            </article>
          </div>
        </div>

        <div className="contact-form-panel">
          <div className="contact-kicker">Send Us a Message</div>

          <form onSubmit={handleSubmit} className="contact-form" noValidate>
            <div className="contact-form-grid">
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Full Name *"
              />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="Email Address *"
              />
            </div>

            <div className="contact-form-grid">
              <div className="contact-phone-wrap">
                <span className="contact-phone-prefix">+91</span>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  required
                  placeholder="10-digit mobile number *"
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
              <input
                type="text"
                name="subject"
                value={form.subject}
                onChange={handleChange}
                required
                placeholder="Subject *"
              />
            </div>

            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              rows="5"
              required
              placeholder="Your Message *"
            />

            <button type="submit" className="contact-submit" disabled={submitting}>
              <span>{submitting ? "Sending..." : "Send Message"}</span>
              <Send size={17} />
            </button>
          </form>

          <div className="contact-help-card">
            <span>
              <Icon icon="logos:whatsapp-icon" />
            </span>
            <div>
              <h2>Looking for quick help?</h2>
              <p>Chat with our support team on WhatsApp.</p>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Chat with Banarasi Kala support on WhatsApp"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Contact;
