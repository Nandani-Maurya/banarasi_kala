const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Admin = require("../models/Admin");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user = null;
    let role = decoded.role || "customer";

    if (role === "admin") {
      user = await Admin.findByPk(decoded.id);
    } else {
      user = await Customer.findByPk(decoded.id);
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user and role to request
    req.user = user;
    req.userRole = role;
    req.customer = user; // For backward compatibility
    
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role || "customer";
    const user = role === "admin"
      ? await Admin.findByPk(decoded.id)
      : await Customer.findByPk(decoded.id);

    if (user) {
      req.user = user;
      req.userRole = role;
      req.customer = user;
    }
  } catch (error) {
    console.error("Optional Auth Middleware Error:", error.message);
  }
  next();
};

const adminMiddleware = (req, res, next) => {
  if (req.userRole === 'admin' || (req.user && req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }
};

module.exports = { authMiddleware, optionalAuthMiddleware, adminMiddleware };
