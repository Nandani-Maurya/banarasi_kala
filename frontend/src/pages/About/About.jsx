import "./About.css";
import heroImage from "../../assets/aboutus/hero-about.png";
import introImage from "../../assets/aboutus/intro-saree.png";
import loomImage from "../../assets/aboutus/loom-process.png";
import whyImage from "../../assets/aboutus/why-choose.png";
import qualityImage from "../../assets/aboutus/quality-sarees.png";
import founderImage from "../../assets/aboutus/founder-message.png";
import ghatImage from "../../assets/aboutus/ghat.png";
import CraftSection from "../Home/CraftSection/CraftSection";

const curationChecks = [
  "Fabric softness and richness",
  "Zari detailing and finishing",
  "Elegance of the design",
  "Weaving quality",
  "Color combinations and overall look",
  "Uniqueness and premium feel",
];

const promiseItems = [
  "Authentic Banarasi Sarees",
  "Premium Handpicked Collections",
  "Rich Silk & Elegant Zari Work",
  "Strict Quality Checks",
  "Timeless & Graceful Designs",
  "Honest Pricing for Genuine Craftsmanship",
  "Transparency and Trust",
];

const About = () => {
  return (
    <main className="about-page">
      <section className="about-hero">
        <img src={heroImage} alt="" className="about-hero-image" aria-hidden="true" />
        <div className="about-hero-overlay" />
        <div className="about-shell about-hero-content">
          <h1>About Us</h1>
          <p className="about-hero-subtitle">
            The Essence of Banaras.   
            <span>The Promise of Quality.</span>
          </p>
          <span className="about-ornament" aria-hidden="true" />
          <p className="about-hero-copy">
            Welcome to Banarasi Kala, where luxury you can see meets quality you
            can feel. We are based in Banaras and personally curate every saree
            to ensure you receive nothing but fine Banarasi craftsmanship.
          </p>
        </div>
      </section>

      <section className="about-shell about-intro-card">
        <div className="about-intro-image">
          <img src={introImage} alt="Banarasi saree detail" />
        </div>
        <div className="about-intro-copy">
          <h2>Banarasi Kala was started with a clear focus.</h2>
          <p>
            To provide genuinely good-quality Banarasi sarees without
            compromising on fabric, weaving, or finishing.
          </p>
          <p>
            Since we are based in Banaras itself, our team personally checks
            every saree, from the fabric and zari work to the weaving and
            finishing, before making it part of our collection.
          </p>
          <p>
            We openly claim quality because we put time and effort into
            selecting better products. Genuine Banarasi craftsmanship, good
            materials, and detailed work naturally carry value.
          </p>
          <p>
            At Banarasi Kala, our goal is simple: to offer authentic,
            well-selected Banarasi sarees that look elegant, feel premium, and
            match the quality we present online.
          </p>
          <p>
            What you see on our website is what we aim to deliver in reality,
            with honesty, consistency, and attention to detail.
          </p>
        </div>
      </section>

      <section className="about-shell about-editorial-grid">
        <article className="about-text-panel about-philosophy">
          <span className="about-icon">BQ</span>
          <h2>Our Philosophy</h2>
          <h3>We Believe in Real Quality</h3>
          <p>
            At Banarasi Kala, we proudly stand behind the quality we offer. We
            do not believe in ordinary collections or mass-produced fashion.
          </p>
          <p>
            Every saree we select reflects richness, purity, craftsmanship, and
            elegance. True Banarasi luxury is never average.
          </p>
          <p>Real quality deserves real value.</p>
        </article>

        <div className="about-photo-panel about-loom-photo">
          <img src={loomImage} alt="Banarasi weaving process" />
        </div>

        <article className="about-text-panel about-curation">
          <span className="about-icon">CP</span>
          <h2>Our Curation Process</h2>
          <p>
            Our collection is not randomly sourced. Our team personally explores
            the markets of Banaras to handpick every saree with complete
            attention to quality, craftsmanship, and detail.
          </p>
          <p>Before a saree becomes part of Banarasi Kala, we carefully examine:</p>
          <ul>
            {curationChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <div className="about-photo-panel about-why-photo">
          <img src={whyImage} alt="Banarasi Kala saree" />
        </div>

        <article className="about-text-panel about-why">
          <span className="about-icon">WQ</span>
          <h2>Why Choose Banarasi Kala?</h2>
          <h3>Crafted for Those Who Understand Real Quality</h3>
          <p>
            At Banarasi Kala, we do not chase quantity. We focus on selecting
            masterpieces. Every saree is chosen to give you a royal and elegant
            feel, premium craftsmanship, and timeless beauty.
          </p>
          <p>
            Luxury is not about flashy words. It is about detail, authenticity,
            and quality you can feel.
          </p>
        </article>

        <article className="about-text-panel about-quality">
          <span className="about-icon">QT</span>
          <h2>Quality That Speaks for Itself</h2>
          <p>
            We believe customers should receive exactly what they are promised.
            From the shine of the zari to the grace of the weave, every detail
            is selected carefully.
          </p>
          <strong>No false presentation.</strong>
          <strong>No compromise in quality.</strong>
        </article>

        <div className="about-photo-panel about-quality-photo">
          <img src={qualityImage} alt="Premium Banarasi sarees" />
        </div>
      </section>

      <CraftSection />

      <section className="about-shell about-promise">
        <h2>Our Promise</h2>
        <p>At Banarasi Kala, we promise:</p>
        <div className="about-promise-row">
          {promiseItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="about-shell about-founder">
        <div className="about-founder-photo">
          <img src={founderImage} alt="Banarasi Kala founder message" />
        </div>
        <blockquote>
          <span className="about-founder-quote about-founder-quote-start">"</span>
          <h2>A Message from the Founder</h2>
          <p>
            "Banarasi Kala began with a simple dream: to bring the richness of
            Banaras to every wardrobe with honesty, elegance, and authenticity.
          </p>
          <p>
            I personally believe that real luxury lies in quality, detail, and
            craftsmanship. Every saree we select carries a story of tradition,
            beauty, and artistry.
          </p>
          <p>
            True luxury is never cheap. Real quality always carries value. If
            someone promises premium quality at throwaway prices, the difference
            eventually shows in the product.
          </p>
          <p>
            When you wear Banarasi Kala, you are not just wearing a saree. You
            are wearing the soul of Banaras."
          </p>
          <span className="about-founder-quote about-founder-quote-end">"</span>
          <img src={ghatImage} alt="" className="about-founder-ghat" aria-hidden="true" />
        </blockquote>
      </section>
    </main>
  );
};

export default About;
