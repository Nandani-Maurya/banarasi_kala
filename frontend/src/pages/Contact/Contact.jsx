import { useState } from "react";
import { Icon } from "@iconify/react";
import { Clock, Mail, MapPin, Phone, Send } from "lucide-react";
import "./Contact.css";

const WHATSAPP_NUMBER = "919555098884";
const WHATSAPP_TEXT = encodeURIComponent("Hi Banarasi Kala, I need quick help.");
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_TEXT}`;

const Contact = () => {
  const [result, setResult] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setResult("Sending...");
    const formData = new FormData(event.target);

    formData.append("access_key", "f23a0283-8a44-4d5b-a9bb-bd25ea343936");

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      setResult("Message Sent Successfully!");
      event.target.reset();
    } else {
      console.log("Error", data);
      setResult(data.message);
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
              <span>
                <Phone size={20} />
              </span>
              <div>
                <h2>Call Us</h2>
                <p>+91 98765 43210</p>
                <small>Mon - Sat, 10:00 AM - 7:00 PM</small>
              </div>
            </article>
            <article>
              <span>
                <Mail size={20} />
              </span>
              <div>
                <h2>Email Us</h2>
                <p>hello@banarasikala.com</p>
                <small>We reply within 24 hours</small>
              </div>
            </article>
            <article>
              <span>
                <MapPin size={20} />
              </span>
              <div>
                <h2>Visit Us</h2>
                <p>B-15/42, Assi Ghat Road, Varanasi, Uttar Pradesh - 221005</p>
              </div>
            </article>
            <article>
              <span>
                <Clock size={20} />
              </span>
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

          <form onSubmit={onSubmit} className="contact-form">
            <div className="contact-form-grid">
              <input type="text" name="name" required placeholder="Full Name *" />
              <input
                type="email"
                name="email"
                required
                placeholder="Email Address *"
              />
            </div>

            <input
              type="text"
              name="subject"
              required
              placeholder="Subject *"
            />

            <textarea
              name="message"
              rows="5"
              required
              placeholder="Your Message *"
            />

            <button type="submit" className="contact-submit">
              <span>{result || "Send Message"}</span>
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
