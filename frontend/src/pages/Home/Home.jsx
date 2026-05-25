import { lazy, Suspense, useEffect } from "react";
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

const HomeSection = ({ children, id, variant = "default" }) => (
  <div id={id} className={`home-deferred-section home-deferred-section--${variant}`}>
    <Suspense fallback={<div className="home-section-loader" aria-hidden="true" />}>
      {children}
    </Suspense>
  </div>
);

const Home = () => {
  const location = useLocation();

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

        <HomeSection variant="why">
          <WhyChooseUs />
        </HomeSection>
        <HomeSection variant="popular">
          <PopularSarees />
        </HomeSection>
        <HomeSection variant="browse">
          <BrowseCircles />
        </HomeSection>
        <HomeSection id="new-arrivals" variant="arrivals">
          <NewArrivals />
        </HomeSection>
        <HomeSection variant="occasion">
          <OccasionCollections />
        </HomeSection>
        <HomeSection variant="reviews">
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
