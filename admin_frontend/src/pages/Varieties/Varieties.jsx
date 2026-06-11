import { useEffect, useState } from "react";
import { imgUrl } from "../../utils/cloudinary";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { API_ENDPOINTS } from "../../config/api";
import "./Varieties.css";

const INITIAL_FORM = { name: "", description: "", image: "" };

const generateSlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export default function Varieties() {
  const [varieties, setVarieties] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVariety, setEditingVariety] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [modal, setModal] = useState({
    show: false,
    type: "info",
    title: "",
    message: "",
    onConfirm: null,
    onCancel: null,
  });

  const showModal = (type, title, message, onConfirm = null, onCancel = null) => {
    setModal({ show: true, type, title, message, onConfirm, onCancel });
  };

  const closeModal = () => {
    setModal((prev) => ({ ...prev, show: false }));
    setTimeout(() => {
      setModal({
        show: false,
        type: "info",
        title: "",
        message: "",
        onConfirm: null,
        onCancel: null,
      });
    }, 200);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [varietyRes, productRes] = await Promise.all([
        fetch(API_ENDPOINTS.varieties),
        fetch(API_ENDPOINTS.products),
      ]);

      const [varietyData, productData] = await Promise.all([
        varietyRes.json(),
        productRes.json(),
      ]);

      const nextVarieties = Array.isArray(varietyData) ? varietyData : varietyData.data || [];
      const nextProducts = Array.isArray(productData)
        ? productData
        : productData.items || productData.data || [];

      setVarieties(nextVarieties.sort((a, b) => b.id - a.id));
      setProducts(nextProducts);
    } catch (error) {
      console.error("Variety load failed:", error);
      showModal("error", "Load failed", "Failed to load varieties from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const openFormModal = (variety = null) => {
    setEditingVariety(variety);
    setFormData(
      variety
        ? { name: variety.name || "", description: variety.description || "", image: variety.image || "" }
        : INITIAL_FORM,
    );
    setImageFile(null);
    setImagePreview(variety?.image || "");
    setIsModalOpen(true);
  };

  const linkedProducts = (varietyId) =>
    products.filter((product) => product.variety_id === varietyId);

  const handleSave = async (event) => {
    event.preventDefault();
    const itemName = formData.name.trim();
    if (!itemName) return;

    showModal(
      "confirm",
      editingVariety ? "Update Variety?" : "Create Variety?",
      editingVariety
        ? `Are you sure you want to update "${itemName}"?`
        : `Are you sure you want to create variety "${itemName}"?`,
      async () => {
        setSubmitting(true);
        closeModal();

        const payload = new FormData();
        payload.append("name", itemName);
        payload.append("description", formData.description || "");
        payload.append("slug", editingVariety ? editingVariety.slug : generateSlug(itemName));
        if (formData.image && !imageFile) payload.append("image", formData.image);
        if (imageFile) payload.append("image", imageFile);

        try {
          const url = editingVariety
            ? `${API_ENDPOINTS.varieties}/${editingVariety.id}`
            : API_ENDPOINTS.varieties;
          const token = localStorage.getItem("accessToken");
          const res = await fetch(url, {
            method: editingVariety ? "PUT" : "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: payload,
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to save variety");
          }

          await fetchData();
          setIsModalOpen(false);
          showModal("success", "Saved", `Variety "${itemName}" saved successfully.`);
        } catch (error) {
          showModal("error", "Save failed", error.message || "Network error.");
        } finally {
          setSubmitting(false);
        }
      },
      closeModal,
    );
  };

  const checkAndConfirmDelete = (variety) => {
    const productsUsingVariety = linkedProducts(variety.id);
    if (productsUsingVariety.length > 0) {
      const names = productsUsingVariety
        .slice(0, 3)
        .map((product) => `- ${product.name}`)
        .join("\n");
      const more =
        productsUsingVariety.length > 3
          ? `\n... and ${productsUsingVariety.length - 3} more products`
          : "";

      showModal(
        "error",
        "Cannot Delete Variety",
        `"${variety.name}" is linked to ${productsUsingVariety.length} product(s):\n\n${names}${more}\n\nPlease change those products before deleting this variety.`,
        closeModal,
      );
      return;
    }

    showModal(
      "danger",
      "Delete Variety?",
      `Are you sure you want to delete "${variety.name}"? This action cannot be undone.`,
      async () => {
        closeModal();
        try {
          const token = localStorage.getItem("accessToken");
          const res = await fetch(`${API_ENDPOINTS.varieties}/${variety.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to delete variety");
          }
          await fetchData();
          showModal("success", "Deleted", `Variety "${variety.name}" deleted successfully.`);
        } catch (error) {
          showModal("error", "Delete failed", error.message || "Network error.");
        }
      },
      closeModal,
    );
  };

  const filteredVarieties = varieties.filter((variety) => {
    const term = searchTerm.toLowerCase();
    return (
      variety.name.toLowerCase().includes(term) ||
      (variety.description || "").toLowerCase().includes(term)
    );
  });

  const getIcon = (type) => {
    if (type === "success") return <CheckCircle className="w-6 h-6 text-green-500" />;
    if (type === "error") return <AlertCircle className="w-6 h-6 text-red-500" />;
    if (type === "danger") return <AlertTriangle className="w-6 h-6 text-red-600" />;
    return <AlertTriangle className="w-6 h-6 text-amber-500" />;
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="bg-white/90 p-8 rounded-2xl shadow-xl border border-[#D4AF37]/20 flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-[#800020] animate-spin mb-4" />
          <p className="text-[#4A3F35] font-medium">Loading varieties...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#800020]">Varieties</h1>
          <p className="text-sm text-gray-500 mt-1">Manage weave and style types.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search varieties..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none text-sm w-full sm:w-64"
            />
          </div>
          <button
            onClick={() => openFormModal()}
            className="px-6 py-2.5 bg-[#800020] text-white font-bold rounded-lg flex items-center gap-2 hover:bg-[#6b001a] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Variety
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-[#D4AF37]/20 shadow-sm w-full sm:w-72">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#800020]/10 rounded-xl">
            <GitBranch className="w-6 h-6 text-[#800020]" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Varieties</p>
            <p className="text-2xl font-bold text-[#4A3F35]">{varieties.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#D4AF37]/20 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#FAF8F6]">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase w-16">S.No</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Variety</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Image</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Slug</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredVarieties.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-16 text-center">
                  <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No varieties found.</p>
                </td>
              </tr>
            ) : (
              filteredVarieties.map((variety, index) => (
                <tr key={variety.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4 font-bold text-gray-400">{index + 1}</td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-xs text-[#800020] bg-[#800020]/10 px-2 py-1 rounded font-bold">
                      #{variety.id}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-bold text-[#4A3F35]">{variety.name}</td>
                  <td className="px-4 py-4">
                    {variety.image ? (
                      <img src={imgUrl(variety.image)} alt={variety.name} className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/20" />
                    ) : (
                      <span className="text-xs text-gray-400">No image</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {variety.slug}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 max-w-md">
                    {variety.description || "-"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openFormModal(variety)} className="p-2 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => checkAndConfirmDelete(variety)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-[#800020] to-[#a0152d] text-white rounded-t-2xl">
              <h2 className="text-lg font-bold">{editingVariety ? "Edit Variety" : "New Variety"}</h2>
              <p className="text-white/80 text-sm mt-1">
                {editingVariety ? "Update variety details" : "Add a new weave or style type"}
              </p>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Variety Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  required
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none"
                  placeholder="e.g., Katan, Kadhwa, Tissue"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  rows={3}
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none resize-none"
                  placeholder="Describe this variety..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Variety Image {editingVariety ? "" : "*"}
                </label>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setImageFile(file);
                    setImagePreview(file ? URL.createObjectURL(file) : formData.image || "");
                  }}
                  className="w-full mt-1.5 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#800020]/20 focus:border-[#800020] outline-none"
                />
                {imagePreview && (
                  <img src={imgUrl(imagePreview)} alt="Variety preview" className="mt-3 w-20 h-20 object-cover rounded-lg border border-[#D4AF37]/20" />
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.name.trim() || (!editingVariety && !imageFile && !formData.image)}
                  className="px-5 py-2 bg-[#800020] text-white font-bold rounded-lg flex items-center gap-2 hover:bg-[#6b001a] disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingVariety ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={modal.type === "success" || modal.type === "error" ? closeModal : undefined} />
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10">
            <div className={`px-6 py-4 border-b rounded-t-2xl ${
              modal.type === "success"
                ? "bg-gradient-to-r from-green-500 to-green-600"
                : modal.type === "error"
                  ? "bg-gradient-to-r from-red-600 to-red-700"
                  : modal.type === "danger"
                    ? "bg-gradient-to-r from-red-500 to-red-600"
                    : "bg-gradient-to-r from-[#800020] to-[#a0152d]"
            } text-white`}>
              <div className="flex items-center gap-3">
                {getIcon(modal.type === "confirm" ? "warning" : modal.type)}
                <h2 className="text-lg font-bold">{modal.title}</h2>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-600 whitespace-pre-line leading-relaxed">{modal.message}</p>
            </div>
            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3 rounded-b-2xl">
              {modal.onCancel && (
                <button onClick={modal.onCancel} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
              )}
              <button
                onClick={modal.onConfirm || closeModal}
                className={`px-6 py-2 font-bold rounded-lg text-white ${
                  modal.type === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-[#800020] hover:bg-[#6b001a]"
                }`}
              >
                {modal.type === "danger" ? "Delete" : modal.onConfirm ? "Confirm" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
