import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import headerBackground from "../../assets/header_backgroung.png";
import FabricStrip from "./FabricStrip/FabricStrip";
import HeroSlider from "./HeroSlider/HeroSlider";
import OfferBand from "./OfferBand/OfferBand";
import "./Home.css";

const WhyChooseUs = lazy(() => import("./WhyChooseUs/WhyChooseUs"));
const PopularSarees = lazy(() => import("./PopularSarees/PopularSarees"));
const BrowseCircles = lazy(() => import("./BrowseCircles/BrowseCircles"));
const NewArrivals = lazy(() => import("./NewArrivals/NewArrivals"));
const OccasionCollections = lazy(() => import("./OccasionCollections/OccasionCollections"));
const ReviewsStory = lazy(() => import("./ReviewsStory/ReviewsStory"));
const FaqSection = lazy(() => import("./FaqSection/FaqSection"));

const HomeSection = ({ children, id, variant = "default", active = false }) => (
  <div id={id} className={`home-deferred-section home-deferred-section--${variant}`}>
    <Suspense fallback={<div className="home-section-loader" aria-hidden="true" />}>
      {active ? children : <div className="home-section-loader" aria-hidden="true" />}
    </Suspense>
  </div>
);

const Home = () => {
  const location = useLocation();
  const [visibleSections, setVisibleSections] = useState(location.hash ? 7 : 0);

  // Progressive loading of lazy components when the browser is idle
  useEffect(() => {
    if (visibleSections >= 7) return;

    const loadNext = () => {
      setVisibleSections((prev) => prev + 1);
    };

    const idleCallback = (window.requestIdleCallback || ((cb) => window.setTimeout(cb, 200)))(loadNext);

    return () => {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(idleCallback);
      } else {
        window.clearTimeout(idleCallback);
      }
    };
  }, [visibleSections]);

  useEffect(() => {
    if (location.hash !== "#new-arrivals") return undefined;

    let attempts = 0;
    const scrollToNewArrivals = () => {
      const target = document.getElementById("new-arrivals");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      attempts += 1;
      if (attempts < 6) {
        window.setTimeout(scrollToNewArrivals, 160);
      }
    };

    const timer = window.setTimeout(scrollToNewArrivals, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  return (
    <div
      className="home-page"
      style={{
        "--bk-section-bg": `url(${headerBackground})`,
        "--bk-header-bg": `url(${headerBackground})`,
      }}
    >
      <main className="bk-home-main">
        <FabricStrip />
        <OfferBand />
        <HeroSlider />

        <HomeSection variant="why" active={visibleSections >= 1}>
          <WhyChooseUs />
        </HomeSection>
        <HomeSection variant="popular" active={visibleSections >= 2}>
          <PopularSarees />
        </HomeSection>
        <HomeSection variant="browse" active={visibleSections >= 3}>
          <BrowseCircles />
        </HomeSection>
        <HomeSection id="new-arrivals" variant="arrivals" active={visibleSections >= 4}>
          <NewArrivals />
        </HomeSection>
        <HomeSection variant="occasion" active={visibleSections >= 5}>
          <OccasionCollections />
        </HomeSection>
        <HomeSection variant="reviews" active={visibleSections >= 6}>
          <ReviewsStory />
        </HomeSection>
        <HomeSection variant="faq" active={visibleSections >= 7}>
<ReviewsStory />
        </HomeSection>
        <HomeSection variant="faq">
          <FaqSection />
        </HomeSection>
      </main>

    </div>
  );
};

export default Home;
