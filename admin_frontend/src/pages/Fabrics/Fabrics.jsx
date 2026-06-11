import { useState, useEffect } from "react";
import { imgUrl } from "../../utils/cloudinary";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Search,
  Scissors,
} from "lucide-react";
import { API_ENDPOINTS } from "../../config/api";

const INITIAL_FORM = { name: "", description: "", image: "" };

export default function Fabrics() {
  const [fabrics, setFabrics] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFabric, setEditingFabric] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Unified modal system
  const [modal, setModal] = useState({
    show: false,
    type: "info",
    title: "",
    message: "",
    onConfirm: null,
    onCancel: null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [matRes, prodRes] = await Promise.all([
        fetch(API_ENDPOINTS.materials),
        fetch(API_ENDPOINTS.products),
      ]);
      let data = await matRes.json();
      let prods = await prodRes.json();
      if (!Array.isArray(data)) data = data.data || [];
      if (!Array.isArray(prods)) prods = prods.data || [];
      data.sort((a, b) => b.id - a.id);
      setFabrics(data);
      setProducts(prods);
    } catch {
      showModal("error", "Error", "Failed to load fabrics from server");
    } finally {
      setLoading(false);
    }
  };

  const showModal = (type, title, message, onConfirm = null, onCancel = null) => {
    setModal({ show: true, type, title, message, onConfirm, onCancel });
  };

  const closeModal = () => {
    setModal((prev) => ({ ...prev, show: false }));
    setTimeout(() => {
      setModal({ show: false, type: "info", title: "", message: "", onConfirm: null, onCancel: null });
    }, 200);
  };

  const filteredFabrics = fabrics.filter(
    (f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openFormModal = (fabric = null) => {
    if (fabric) {
      setEditingFabric(fabric);
      setFormData({ name: fabric.name, description: fabric.description || "", image: fabric.image || "" });
      setImagePreview(fabric.image || "");
    } else {
      setEditingFabric(null);
      setFormData(INITIAL_FORM);
      setImagePreview("");
    }
    setImageFile(null);
    setIsModalOpen(true);
  };

  const generateSlug = (name) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const handleSave = async (e) => {
    e.preventDefault();
    const itemName = formData.name;
    const slug = generateSlug(itemName);

    showModal(
      "confirm",
      editingFabric ? "Update Fabric?" : "Create Fabric?",
      editingFabric
        ? `Are you sure you want to update "${itemName}"?`
        : `Are you sure you want to create fabric "${itemName}"?`,
      async () => {
        setSubmitting(true);
        closeModal();

        const payload = new FormData();
        payload.append("name", formData.name);
        payload.append("description", formData.description || "");
        payload.append("slug", editingFabric ? editingFabric.slug : slug);
        if (formData.image && !imageFile) payload.append("image", formData.image);
        if (imageFile) payload.append("image", imageFile);

        try {
          const url = editingFabric
            ? `${API_ENDPOINTS.materials}/${editingFabric.id}`
            : API_ENDPOINTS.materials;
          const method = editingFabric ? "PUT" : "POST";
          const res = await fetch(url, {
            method,
            body: payload,
          });

          if (res.ok) {
            await fetchData();
            setIsModalOpen(false);
            showModal(
              "success",
              "Success",
              editingFabric
                ? `Fabric "${itemName}" updated successfully!`
                : `Fabric "${itemName}" created successfully!`
            );
          } else {
            const err = await res.json();
            showModal("error", "Error", err.message || "Failed to save fabric");
          }
        } catch {
          showModal("error", "Error", "Network error. Please try again.");
        } finally {
          setSubmitting(false);
        }
      },
      closeModal
    );
  };

  const checkAndConfirmDelete = (fabric) => {
    // Check if fabric is linked to any products
    const linkedProducts = products.filter((p) => p.material_id === fabric.id);

    if (linkedProducts.length > 0) {
      const productNames = linkedProducts
        .slice(0, 3)
        .map((p) => `• ${p.name}`)
        .join("\n");
      const moreCount =
        linkedProducts.length > 3
          ? `\n... and ${linkedProducts.length - 3} more products`
          : "";
      showModal(
        "error",
        "Cannot Delete Fabric",
        `"${fabric.name}" is linked to ${linkedProducts.length} product(s):\n\n${productNames}${moreCount}\n\nPlease remove these products or change their fabric before deleting.`,
        closeModal,
      );
      return;
    }

    // No linked products — show confirmation
    showModal(
      "danger",
      "Delete Fabric?",
      `Are you sure you want to delete "${fabric.name}"?\n\nThis action cannot be undone.`,
      async () => {
        closeModal();
        try {
          const res = await fetch(`${API_ENDPOINTS.materials}/${fabric.id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            await fetchData();
            showModal("success", "Success", `Fabric "${fabric.name}" deleted successfully!`);
          } else {
            const err = await res.json();
            showModal("error", "Error", err.message || "Failed to delete fabric");
          }
        } catch {
          showModal("error", "Error", "Network error. Please try again.");
        }
      },
      closeModal
    );
  };

  const getIcon = (type) => {
    switch (type) {
      case "success": return <CheckCircle className="w-6 h-6 text-green-500" />;
      case "error":   return <AlertCircle className="w-6 h-6 text-red-500" />;
      case "danger":  return <AlertTriangle className="w-6 h-6 text-red-600" />;
      default:        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="relative min-h-[calc(100vh-120px)]">
        <div className="space-y-6 opacity-50 pointer-events-none">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#800020]">Fabrics</h1>
              <p className="text-sm text-gray-500 mt-1">Fabric & material types</p>
            </div>
            <button className="px-6 py-2.5 bg-[#800020] text-white font-bold rounded-lg opacity-50">
              Add Fabric
            </button>
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#D4AF37]/20 h-20"></div>
          <div className="bg-white rounded-xl border border-[#D4AF37]/20 h-96"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-[#D4AF37]/20 flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#800020] animate-spin mb-4" />
            <p className="text-[#4A3F35] font-medium">Loading fabrics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Header with Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#800020]">Fabrics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fabric &amp; material types (Silk, Georgette, etc.)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search fabrics..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none text-sm w-full sm:w-64"
            />
          </div>
          <button
            onClick={() => openFormModal()}
            className="px-6 py-2.5 bg-[#800020] text-white font-bold rounded-lg flex items-center gap-2 hover:bg-[#6b001a] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Fabric
          </button>
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-white p-4 rounded-xl border border-[#D4AF37]/20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#800020]/10 rounded-xl">
            <Scissors className="w-6 h-6 text-[#800020]" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Fabrics</p>
            <p className="text-2xl font-bold text-[#4A3F35]">{fabrics.length}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#D4AF37]/20 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#FAF8F6]">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-16">
                S.No
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Fabric Name
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Image
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredFabrics.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-16 text-center">
                  <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No fabrics found. Add your first fabric!</p>
                </td>
              </tr>
            ) : (
              filteredFabrics.map((fabric, index) => (
                <tr key={fabric.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4">
                    <span className="font-bold text-gray-400">{index + 1}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-xs text-[#800020] bg-[#800020]/10 px-2 py-1 rounded font-bold">
                      #{fabric.id}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-bold text-[#4A3F35]">{fabric.name}</span>
                  </td>
                  <td className="px-4 py-4">
                    {fabric.image ? (
                      <img src={imgUrl(fabric.image)} alt={fabric.name} className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/20" />
                    ) : (
                      <span className="text-xs text-gray-400">No image</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {fabric.slug}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 max-w-md">
                    {fabric.description || "-"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openFormModal(fabric)}
                        className="p-2 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          checkAndConfirmDelete(fabric);
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal - Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-[#800020] to-[#a0152d] text-white rounded-t-2xl">
              <h2 className="text-lg font-bold">
                {editingFabric ? "Edit Fabric" : "New Fabric"}
              </h2>
              <p className="text-white/80 text-sm mt-1">
                {editingFabric ? "Update fabric details" : "Add a new fabric material"}
              </p>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Fabric Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none transition-all"
                  placeholder="e.g., Katan Silk, Georgette"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none transition-all resize-none"
                  placeholder="Describe this fabric material..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Fabric Image
                </label>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setImageFile(file);
                    setImagePreview(file ? URL.createObjectURL(file) : formData.image || "");
                  }}
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none transition-all"
                />
                {imagePreview && (
                  <img src={imgUrl(imagePreview)} alt="Fabric preview" className="mt-3 w-20 h-20 object-cover rounded-lg border border-[#D4AF37]/20" />
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.name.trim()}
                  className="px-5 py-2 bg-[#800020] text-white font-bold rounded-lg flex items-center gap-2 hover:bg-[#6b001a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingFabric ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Modal - Success / Error / Confirm / Danger */}
      {modal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={modal.type === "success" || modal.type === "error" ? closeModal : undefined}
          />
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div
              className={`px-6 py-4 border-b rounded-t-2xl ${
                modal.type === "success"
                  ? "bg-gradient-to-r from-green-500 to-green-600"
                  : modal.type === "error"
                  ? "bg-gradient-to-r from-red-600 to-red-700"
                  : modal.type === "danger"
                  ? "bg-gradient-to-r from-red-500 to-red-600"
                  : "bg-gradient-to-r from-[#800020] to-[#a0152d]"
              } text-white`}
            >
              <div className="flex items-center gap-3">
                {getIcon(modal.type === "confirm" ? "warning" : modal.type)}
                <h2 className="text-lg font-bold">{modal.title}</h2>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-600 whitespace-pre-line leading-relaxed">{modal.message}</p>
            </div>

            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3 rounded-b-2xl">
              {(modal.type === "success" || modal.type === "error") && (
                <button
                  onClick={closeModal}
                  className={`px-6 py-2 font-bold rounded-lg transition-colors ${
                    modal.type === "success"
                      ? "bg-green-500 hover:bg-green-600 text-white"
                      : "bg-red-500 hover:bg-red-600 text-white"
                  }`}
                >
                  OK
                </button>
              )}

              {modal.type === "confirm" && (
                <>
                  <button
                    onClick={modal.onCancel || closeModal}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={modal.onConfirm}
                    className="px-6 py-2 bg-[#800020] hover:bg-[#6b001a] text-white font-bold rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                </>
              )}

              {modal.type === "danger" && (
                <>
                  <button
                    onClick={modal.onCancel || closeModal}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={modal.onConfirm}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
