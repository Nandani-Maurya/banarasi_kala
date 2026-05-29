import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import API_ENDPOINTS from "../../config/api";

const ACTION_LABELS = {
  cancel: "Cancellation Requests",
  return: "Return Requests",
  exchange: "Exchange Requests",
};

const ACTION_ICONS = {
  cancel: XCircle,
  return: RotateCcw,
  exchange: RefreshCw,
};

const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

const ACTION_STATUSES = ["all", "Initiated", "Completed", "Rejected", "Cancelled"];

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("accessToken") || localStorage.getItem("token") || ""}`,
  "Content-Type": "application/json",
});

export default function OrderActions({ type = "return" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const Icon = ACTION_ICONS[type] || RotateCcw;
  const title = ACTION_LABELS[type] || "Order Requests";

  const counts = useMemo(() => rows.reduce((map, row) => ({
    ...map,
    [row.status]: (map[row.status] || 0) + 1,
  }), {}), [rows]);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(`${API_ENDPOINTS.orders}/admin/item-actions?${params.toString()}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load requests.");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [type, statusFilter]);

  const updateStatus = async (id, status) => {
    setSavingId(id);
    try {
      const response = await fetch(`${API_ENDPOINTS.orders}/admin/item-actions/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update request.");
      await loadRows();
    } catch (err) {
      setError(err.message || "Unable to update request.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#800020]/10 text-[#800020]">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="brand-font text-xl font-bold text-[#800020]">{title}</h2>
          </div>
          <p className="hidden">
            Requested {counts.Requested || 0} · Approved {counts.Approved || 0} · Completed {counts.Completed || 0}
          </p>
          <p className="mt-1 text-xs text-[#4A3F35]/60">
            Initiated {counts.Initiated || 0} · Completed {counts.Completed || 0}
          </p>
        </div>
        <button
          type="button"
          onClick={loadRows}
          className="rounded-lg border border-[#800020]/20 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#800020]"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTION_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase ${
              statusFilter === status
                ? "border-[#800020] bg-[#800020] text-white"
                : "border-[#800020]/15 bg-white text-[#800020]"
            }`}
          >
            {status === "all" ? "All" : status}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="glass-card overflow-hidden rounded-2xl shadow-sm">
        <table className="w-full text-left">
          <thead className="border-b border-[#D4AF37]/10 bg-[#FAF8F6] text-[10px] font-bold uppercase text-gray-400">
            <tr>
              <th className="px-5 py-4">Order</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Product</th>
              <th className="px-5 py-4">Qty</th>
              <th className="px-5 py-4">Estimate</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4AF37]/5 bg-white text-xs">
            {loading && (
              <tr><td className="px-5 py-8 text-center text-gray-500" colSpan="7">Loading requests...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="px-5 py-8 text-center text-gray-500" colSpan="7">No requests found.</td></tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="hover:bg-[#FAF8F6]/60">
                <td className="px-5 py-4 font-mono font-bold text-[#4A3F35]">
                  {row.Order?.order_number || `#${row.order_id}`}
                  <div className="mt-1 font-sans text-[10px] font-normal text-gray-400">{row.Order?.status}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-[#4A3F35]">{row.Order?.customer_name}</div>
                  <div className="text-[10px] text-gray-400">{row.Order?.customer_email}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-[#4A3F35]">{row.OrderItem?.product_name || row.OrderItem?.Product?.name}</div>
                  <div className="text-[10px] text-gray-400">{row.OrderItem?.sku}</div>
                </td>
                <td className="px-5 py-4 font-bold">{row.quantity}</td>
                <td className="px-5 py-4">
                  <div>{formatMoney(row.estimated_refund_amount)}</div>
                  {type === "return" && (
                    <div className="mt-1 text-[10px] text-gray-400">
                      Fwd {formatMoney(row.forward_shipping_deduction)} · Pickup {formatMoney(row.reverse_shipping_deduction)}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-[#800020]/10 px-2.5 py-1 text-[10px] font-bold text-[#800020]">{row.status}</span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => updateStatus(row.id, "Completed")}
                      className="rounded bg-green-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white"
                    >
                      <CheckCircle2 className="mr-1 inline h-3 w-3" /> Complete
                    </button>
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => updateStatus(row.id, "Rejected")}
                      className="rounded border border-red-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase text-red-600"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
