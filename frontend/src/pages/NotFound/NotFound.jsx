import { Link } from "react-router-dom";

const NotFound = () => (
  <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
    <p className="serif-text italic text-2xl text-[#800020] mb-4">Page not found.</p>
    <Link to="/" className="text-[#800020] font-bold uppercase tracking-widest border-b border-[#800020]">
      Return to Home
    </Link>
  </div>
);

export default NotFound;
