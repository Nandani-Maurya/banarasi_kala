import headerBackground from "../../assets/header_backgroung.png";
import verticalLogo from "../../assets/vertical_logo.png";
import "./PreLoader.css";

const PreLoader = () => {
  return (
    <div
      className="preloader-container"
      style={{ "--preloader-bg": `url(${headerBackground})` }}
    >
      <div className="preloader-mark" aria-label="Loading Banarasi Kala">
        <span className="preloader-ring" aria-hidden="true" />
        <img src={verticalLogo} alt="Banarasi Kala" />
        <span className="preloader-progress" aria-hidden="true" />
      </div>
    </div>
  );
};

export default PreLoader;
