import { useState } from "react";
import "./Feedback.css";
import { MessageSquare, Send, ShieldCheck, Sparkles, Star, LogIn } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../../config/api";

const Feedback = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: "", text: "" });

    try {
      const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
      const response = await fetch(API_ENDPOINTS.feedbackGeneral, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ rating, comment })
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Thank you! Your feedback has been submitted." });
        setComment("");
        setRating(5);
      } else {
        setMessage({ type: "error", text: data.message || "Something went wrong." });
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      setMessage({ type: "error", text: "Failed to connect to the server." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="feedback-page">
      <section className="feedback-shell">
        <div className="feedback-info-panel">
          <div className="feedback-kicker">Customer Feedback</div>
          <h1>Share Your Experience</h1>
          <p className="feedback-intro">
            Your opinion helps us improve every Banarasi Kala order, from
            product quality to delivery care.
          </p>

          <span className="feedback-divider" aria-hidden="true" />

          <div className="feedback-info-list">
            <article>
              <span><Sparkles size={20} /></span>
              <div>
                <h2>Quality Check</h2>
                <p>Tell us what felt premium and what can be refined.</p>
              </div>
            </article>
            <article>
              <span><MessageSquare size={20} /></span>
              <div>
                <h2>Your Voice</h2>
                <p>Reviews are read by our team before publishing.</p>
              </div>
            </article>
            <article>
              <span><ShieldCheck size={20} /></span>
              <div>
                <h2>Trusted Review</h2>
                <p>{user ? `Logged in as ${user.name}.` : "Login to share your experience."}</p>
              </div>
            </article>
          </div>
        </div>

        <div className="feedback-form-panel">
          <div className="feedback-kicker">Send Us a Review</div>

          {!user ? (
            <div className="feedback-login-prompt">
              <LogIn size={36} strokeWidth={1.5} />
              <h2>Login to Leave a Review</h2>
              <p>Only logged-in customers can submit feedback.</p>
              <button
                type="button"
                className="feedback-submit"
                onClick={() => navigate("/auth?redirect=/feedback")}
              >
                <span>Login / Sign Up</span>
                <LogIn size={17} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="feedback-form">
              <div className="feedback-rating">
                <label>Rate your experience</label>
                <div className="feedback-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={(hover || rating) >= star ? "is-active" : ""}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(star)}
                      aria-label={`${star} star rating`}
                    >
                      <Star />
                    </button>
                  ))}
                </div>
                <p>
                  {rating === 5 ? "Exceptional!" : rating === 4 ? "Very Good" : rating === 3 ? "Good" : rating === 2 ? "Fair" : "Needs Improvement"}
                </p>
              </div>

              <label className="feedback-review-field">
                <span><MessageSquare size={14} /> Your Review</span>
                <textarea
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what you loved about our sarees or how we can improve..."
                />
              </label>

              {message.text && (
                <div className={`feedback-message ${message.type}`}>
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="feedback-submit"
              >
                <span>{submitting ? "Submitting..." : "Post Review"}</span>
                <Send size={17} />
              </button>
            </form>
          )}

          {user && (
            <div className="feedback-note">
              Your review will be published after a quick quality check by our team.
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Feedback;
