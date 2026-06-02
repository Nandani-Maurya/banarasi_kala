const ProductService = require('../services/ProductService');
const { uploadBufferToCloudinary } = require("../config/cloudinary");

const logServerError = (scope, error) => {
  console.error(`[ProductController:${scope}]`, error);
};

const userFacingMessage = (error, fallback) => {
  if (!error) return fallback;
  const raw = error.message || "";

  if (raw.includes("must have at least 1 image")) return raw;
  if (raw.includes("maximum 6 images")) return raw;
  if (raw.includes("At least one product color is required")) return raw;
  if (raw.includes("At least one product image is required")) return raw;
  if (raw.includes("Choose at least one payment option")) return raw;
  if (raw.includes("Choose at least one return/exchange option")) return raw;
  if (raw.includes("Product not found")) return "Product not found.";

  return fallback;
};

const buildProductPayloadWithImages = async (req) => {
  const rawProductData = req.body.productData;
  if (!rawProductData) {
    throw new Error("productData is required");
  }

  const productData = typeof rawProductData === "string" ? JSON.parse(rawProductData) : rawProductData;
  
  const existingImages = Array.isArray(productData.images) ? productData.images : [];
  
  const files = Array.isArray(req.files) ? req.files : [];
  const uploadTargets = files
    .map((file) => ({ file, match: /^color_(\d+)$/.exec(file.fieldname || "") }))
    .filter(({ match }) => match !== null);

  const newImages = await Promise.all(
    uploadTargets.map(async ({ file, match }) => {
      const colorId = parseInt(match[1], 10);
      const uploadResult = await uploadBufferToCloudinary(file.buffer);
      return { color_id: colorId, url: uploadResult.secure_url };
    })
  );

  const finalImages = [...existingImages, ...newImages];
  const selectedColorIds = Object.entries(productData.color_stocks || {})
    .filter(([, qty]) => parseInt(qty, 10) > 0)
    .map(([colorId]) => parseInt(colorId, 10));

  selectedColorIds.forEach((colorId) => {
    const colorImages = finalImages.filter((image) => parseInt(image.color_id, 10) === colorId);
    if (colorImages.length > 6) {
      throw new Error("Each color can have maximum 6 images");
    }
    if (colorImages.length < 1) throw new Error(`Color ${colorId} must have at least 1 image`);
  });

  if (selectedColorIds.length < 1) {
    throw new Error("At least one product color is required");
  }

  const coverColorId = parseInt(productData.cover_color_id, 10);
  const effectiveCoverColorId = selectedColorIds.includes(coverColorId) ? coverColorId : selectedColorIds[0];

  const images = finalImages.map((image, index) => ({
    color_id: parseInt(image.color_id, 10),
    url: image.url || image.image_url,
    display_order: parseInt(image.display_order, 10) || index,
    is_cover: parseInt(image.color_id, 10) === effectiveCoverColorId,
  }));

  return {
    ...productData,
    images,
    cover_color_id: effectiveCoverColorId,
  };
};

class ProductController {
  async getAll(req, res) {
    try {
      const products = await ProductService.getAllProducts(req.query);
      res.status(200).json(products);
    } catch (error) {
      logServerError("getAll", error);
      res.status(500).json({ message: "Failed to load products." });
    }
  }

  async getSummary(req, res) {
    try {
      const summary = await ProductService.getProductSummary();
      res.status(200).json(summary);
    } catch (error) {
      logServerError("getSummary", error);
      res.status(500).json({ message: "Failed to load product summary." });
    }
  }

  async getById(req, res) {
    try {
      const product = await ProductService.getProductById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.status(200).json(product);
    } catch (error) {
      logServerError("getById", error);
      res.status(500).json({ message: "Failed to load product." });
    }
  }

  async getBySlug(req, res) {
    try {
      const product = await ProductService.getProductBySlug(req.params.slug);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.status(200).json(product);
    } catch (error) {
      logServerError("getBySlug", error);
      res.status(500).json({ message: "Failed to load product." });
    }
  }

  async getDetailBySlug(req, res) {
    try {
      const product = await ProductService.getProductDetailBySlug(req.params.slug, req.query.color);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.status(200).json(product);
    } catch (error) {
      logServerError("getDetailBySlug", error);
      res.status(500).json({ message: "Failed to load product detail." });
    }
  }

  async getColorImages(req, res) {
    try {
      const payload = await ProductService.getProductColorImages(req.params.slug, req.params.colorId);
      if (!payload) return res.status(404).json({ message: 'Product not found' });
      res.status(200).json(payload);
    } catch (error) {
      logServerError("getColorImages", error);
      res.status(500).json({ message: "Failed to load product color images." });
    }
  }

  async create(req, res) {
    try {
      const product = await ProductService.createProduct(req.body);
      res.status(201).json(product);
    } catch (error) {
      logServerError("create", error);
      res.status(400).json({ message: userFacingMessage(error, "Could not create product. Please check the form values.") });
    }
  }

  async update(req, res) {
    try {
      const product = await ProductService.updateProduct(req.params.id, req.body);
      res.status(200).json(product);
    } catch (error) {
      logServerError("update", error);
      res.status(400).json({ message: userFacingMessage(error, "Could not update product. Please check the form values.") });
    }
  }

  async delete(req, res) {
    try {
      await ProductService.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      logServerError("delete", error);
      res.status(400).json({ message: userFacingMessage(error, "Could not delete product.") });
    }
  }

  async createWithImages(req, res) {
    try {
      const payload = await buildProductPayloadWithImages(req);
      const product = await ProductService.createProduct(payload);
      res.status(201).json(product);
    } catch (error) {
      logServerError("createWithImages", error);
      res.status(400).json({ message: userFacingMessage(error, "Could not create product. Please review entered values and images.") });
    }
  }

  async updateWithImages(req, res) {
    try {
      const payload = await buildProductPayloadWithImages(req);
      const product = await ProductService.updateProduct(req.params.id, payload);
      res.status(200).json(product);
    } catch (error) {
      logServerError("updateWithImages", error);
      res.status(400).json({ message: userFacingMessage(error, "Could not update product. Please review entered values and images.") });
    }
  }
}

module.exports = new ProductController();
