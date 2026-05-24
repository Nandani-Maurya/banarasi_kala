import headerBackground from "../../assets/header_backgroung.png";
import verticalLogo from "../../assets/vertical_logo.png";
import "./PreLoader.css";

const PreLoader = () => {
  return (
    <div
      className="preloader-container"
      style={{ "--preloader-bg": `url(${headerBackground})` }}
    >
      <div className="preloader-splash" aria-label="Loading Banarasi Kala">
        <img src={verticalLogo} alt="Banarasi Kala" />
        <div className="preloader-copy">
          <strong>Banarasi Kala</strong>
          <span>Handwoven elegance, arriving sortly</span>
        </div>
        <span className="preloader-thread" aria-hidden="true" />
      </div>
    </div>
  );
};

export default PreLoader;
