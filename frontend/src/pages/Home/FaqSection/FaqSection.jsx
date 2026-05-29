import { useState } from "react";
import "./FaqSection.css";

const FAQ_ITEMS = [
  ["How can I track my order?", "Once your order is shipped, you will receive a tracking link via SMS/email powered by Shiprocket."],
  ["How many days does delivery take?", "Orders are usually delivered within 4-7 business days depending on your location."],
  ["Do you offer Cash on Delivery (COD)?", "Yes, Cash on Delivery is available on selected pin codes."],
  ["Do sarees include blouse pieces?", "Yes, most sarees come with an unstitched blouse piece unless otherwise mentioned."],
  ["Will the product color exactly match the images?", "Slight color variations may occur due to photography lighting and screen settings."],
  ["How can I contact customer support?", "You can contact us via WhatsApp, email, or phone during business hours."],
  ["My payment failed but money was deducted. What should I do?", "If your payment was deducted but the order was not confirmed, the amount is usually refunded automatically within 5-7 business days."],
  ["Can I return or exchange my saree?", "Yes, eligible products can be returned or exchanged as per our Return & Exchange Policy."],
  ["Do you accept bulk or wholesale orders?", "Yes, we accept bulk and wedding collection orders. Please contact us for special pricing."],
  ["Are online payments secure?", "Yes, all transactions are encrypted and securely processed through Razorpay."],
];

const FaqSection = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleItem = (index) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section className="bk-faq-section" aria-labelledby="faq-title">
      <div className="bk-faq-shell">
        <h2 id="faq-title">Frequently Asked Questions</h2>
        <div className="bk-faq-grid">
          {FAQ_ITEMS.map(([question, answer], index) => {
            const isOpen = openIndex === index;

            return (
              <div className={`bk-faq-item ${isOpen ? "is-open" : ""}`} key={question}>
                <button
                  type="button"
                  className="bk-faq-question"
                  aria-expanded={isOpen}
                  onClick={() => toggleItem(index)}
                >
                  <span>{question}</span>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isOpen && <p>{answer}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
