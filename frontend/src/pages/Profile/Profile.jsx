import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../utils/api";
import "./Profile.css";

const formatMoney = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const toDateString = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const emptyAddress = {
  label: "Home",
  name: "",
  phone: "",
  country: "India",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  delivery_instructions: "",
  is_default: true,
};

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [addrForm, setAddrForm] = useState(emptyAddress);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrError, setAddrError] = useState("");

  const referralLink = useMemo(() => {
    if (!profile?.referral_code) return "";
    const url = new URL("/login", window.location.origin);
    url.searchParams.set("mode", "signup");
    url.searchParams.set("ref", profile.referral_code);
    return url.toString();
  }, [profile?.referral_code]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [meRes, walletRes, addressRes] = await Promise.all([
          api.get("/api/customers/me"),
          api.get("/api/wallet"),
          api.get("/api/addresses"),
        ]);

        if (!alive) return;
        setProfile(meRes.data);
        setWallet(walletRes.data);
        setAddresses(Array.isArray(addressRes.data) ? addressRes.data : []);
      } catch (err) {
        if (!alive) return;
        setError(err?.response?.data?.message || err.message || "Failed to load profile");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      phone: profile.phone || "",
    });
    setAddrForm((prev) => ({
      ...prev,
      name: profile.name || prev.name,
      phone: profile.phone || prev.phone,
    }));
  }, [profile]);

  const refreshAddresses = async () => {
    setAddrLoading(true);
    setAddrError("");
    try {
      const res = await api.get("/api/addresses");
      setAddresses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setAddrError(err?.response?.data?.message || err.message || "Failed to load addresses");
    } finally {
      setAddrLoading(false);
    }
  };

  const onCopyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const onShareReferral = async () => {
    if (!referralLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Refer & Earn",
          text: "Sign up using my referral link and get wallet rewards.",
          url: referralLink,
        });
        return;
      }
    } catch {
      // Fall back to copy.
    }
    await onCopyReferral();
  };

  const onPickAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("avatar", file);
      const res = await api.post("/api/customers/me/avatar", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile((prev) => (prev ? { ...prev, avatar_url: res.data.avatar_url } : prev));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Avatar upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const goResetPassword = () => {
    const email = profile?.email || user?.email || "";
    const url = new URL("/login", window.location.origin);
    url.searchParams.set("mode", "forgot");
    if (email) url.searchParams.set("email", email);
    navigate(`${url.pathname}${url.search}`);
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.put("/api/customers/me", {
        name: form.name,
        phone: form.phone,
      });
      const updated = res.data?.customer || res.data;
      setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
      setIsEditing(false);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onAddrChange = (event) => {
    const { name, value, type, checked } = event.target;
    setAddrForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onAddAddress = async () => {
    setAddrSaving(true);
    setAddrError("");
    try {
      await api.post("/api/addresses", addrForm);
      setAddrForm((prev) => ({
        ...prev,
        address_line1: "",
        address_line2: "",
        city: "",
        state: "",
        pincode: "",
        landmark: "",
        delivery_instructions: "",
      }));
      await refreshAddresses();
    } catch (err) {
      setAddrError(err?.response?.data?.message || err.message || "Failed to add address");
    } finally {
      setAddrSaving(false);
    }
  };

  const onDeleteAddress = async (id) => {
    if (!id || !window.confirm("Delete this address?")) return;
    setAddrError("");
    try {
      await api.delete(`/api/addresses/${id}`);
      await refreshAddresses();
    } catch (err) {
      setAddrError(err?.response?.data?.message || err.message || "Failed to delete address");
    }
  };

  const onSetDefault = async (address) => {
    if (!address?.id) return;
    setAddrError("");
    try {
      await api.put(`/api/addresses/${address.id}`, { is_default: true });
      await refreshAddresses();
    } catch (err) {
      setAddrError(err?.response?.data?.message || err.message || "Failed to update address");
    }
  };

  if (loading) {
    return (
      <main className="profile-page">
        <section className="profile-shell profile-loading">Loading profile...</section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="profile-page">
        <section className="profile-shell profile-loading">
          <p className="profile-error">{error}</p>
          <button type="button" className="profile-btn profile-btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <section className="profile-shell">
        <header className="profile-hero">
          <div className="profile-identity">
            <div className="profile-avatar">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" />
              ) : (
                <div className="profile-avatar-fallback">{(profile?.name || "U").slice(0, 1).toUpperCase()}</div>
              )}
              <label className={`profile-avatar-upload ${uploading ? "is-loading" : ""}`} title="Change photo">
                <input type="file" accept="image/*" onChange={onPickAvatar} disabled={uploading} />
                <Icon icon={uploading ? "lucide:loader-circle" : "lucide:camera"} />
              </label>
            </div>

            <div className="profile-meta">
              <span className="profile-kicker">Your Account</span>
              <h1>{profile?.name || "My Profile"}</h1>
              <div className="profile-contact-line">
                <span><Icon icon="lucide:mail" />{profile?.email || "-"}</span>
                <span><Icon icon="lucide:phone" />{profile?.phone || "-"}</span>
              </div>
              <p>Member since {toDateString(profile?.createdAt)}</p>
            </div>
          </div>

          <div className="profile-hero-actions">
            {!isEditing ? (
              <button type="button" className="profile-btn profile-btn-primary" onClick={() => setIsEditing(true)}>
                <Icon icon="lucide:pencil" />
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="profile-btn"
                  disabled={saving}
                  onClick={() => {
                    setIsEditing(false);
                    setForm({ name: profile?.name || "", phone: profile?.phone || "" });
                  }}
                >
                  Cancel
                </button>
                <button type="button" className="profile-btn profile-btn-primary" onClick={onSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}
          </div>
        </header>

        {isEditing && (
          <section className="profile-panel">
            <div className="profile-section-title">
              <Icon icon="lucide:user-cog" />
              <div>
                <h2>Edit personal details</h2>
                <p>Keep your contact details updated for orders and delivery.</p>
              </div>
            </div>
            <div className="profile-edit">
              <label>
                <span>Name</span>
                <input name="name" value={form.name} onChange={onChange} />
              </label>
              <label>
                <span>Phone</span>
                <input name="phone" value={form.phone} onChange={onChange} inputMode="tel" />
              </label>
            </div>
          </section>
        )}

        <section className="profile-quick-grid" aria-label="Account shortcuts">
          <button type="button" className="profile-quick-card" onClick={() => navigate("/my-orders")}>
            <Icon icon="lucide:package-check" />
            <strong>Your Orders</strong>
            <span>Track, return or reorder</span>
          </button>
          <button type="button" className="profile-quick-card" onClick={() => navigate("/wishlist")}>
            <Icon icon="lucide:heart" />
            <strong>Wishlist</strong>
            <span>Saved sarees and picks</span>
          </button>
          <button type="button" className="profile-quick-card" onClick={() => navigate("/cart")}>
            <Icon icon="lucide:shopping-bag" />
            <strong>Shopping Bag</strong>
            <span>Continue checkout</span>
          </button>
          <button type="button" className="profile-quick-card" onClick={goResetPassword}>
            <Icon icon="lucide:shield-check" />
            <strong>Login & Security</strong>
            <span>Password reset by OTP</span>
          </button>
        </section>

        <div className="profile-grid">
          <section className="profile-panel profile-wallet-panel">
            <div className="profile-section-title">
              <Icon icon="lucide:wallet-cards" />
              <div>
                <h2>Wallet</h2>
                <p>Rewards and referral credits</p>
              </div>
            </div>
            <div className="profile-wallet-balance">{formatMoney(wallet?.wallet_balance ?? profile?.wallet_balance)}</div>
            <div className="profile-transactions">
              {(wallet?.transactions || []).slice(0, 5).map((tx) => (
                <div className="profile-tx" key={tx.id}>
                  <div>
                    <strong>{tx.type}</strong>
                    <span>{toDateString(tx.created_at || tx.createdAt)}</span>
                  </div>
                  <div className={`profile-tx-amount ${Number(tx.amount) >= 0 ? "is-plus" : "is-minus"}`}>
                    {formatMoney(tx.amount)}
                    <span>{tx.status}</span>
                  </div>
                </div>
              ))}
              {(!wallet?.transactions || wallet.transactions.length === 0) && (
                <p className="profile-empty-text">No wallet transactions yet.</p>
              )}
            </div>
          </section>

          <section className="profile-panel">
            <div className="profile-section-title">
              <Icon icon="lucide:gift" />
              <div>
                <h2>Refer & Earn</h2>
                <p>Invite friends and earn wallet rewards</p>
              </div>
            </div>
            <div className="profile-referral-code">
              <span>Referral code</span>
              <strong>{profile?.referral_code || "-"}</strong>
            </div>
            <div className="profile-referral">
              <input value={referralLink || "Referral code not available"} readOnly />
              <div className="profile-referral-actions">
                <button type="button" className="profile-btn" onClick={onCopyReferral} disabled={!referralLink}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="profile-btn profile-btn-primary" onClick={onShareReferral} disabled={!referralLink}>
                  Share
                </button>
              </div>
            </div>
          </section>

          <section className="profile-panel profile-panel-wide">
            <div className="profile-section-title profile-section-title-row">
              <Icon icon="lucide:map-pin-house" />
              <div>
                <h2>Your Addresses</h2>
                <p>Save up to 3 delivery addresses for faster checkout.</p>
              </div>
              <span className="profile-count-pill">{addresses.length}/3 saved</span>
            </div>

            {addrError && <p className="profile-error">{addrError}</p>}

            <div className="profile-address-list">
              {addrLoading ? (
                <p className="profile-empty-text">Loading addresses...</p>
              ) : (
                <>
                  {addresses.map((address) => (
                    <article className="profile-address" key={address.id}>
                      <div className="profile-address-main">
                        <strong>
                          {address.label || "Address"}
                          {address.is_default ? <span className="profile-badge">Default</span> : null}
                        </strong>
                        <div className="profile-address-person">
                          {address.name || "-"} <span>{address.phone || "-"}</span>
                        </div>
                        <p>
                          {address.address_line1}
                          {address.address_line2 ? `, ${address.address_line2}` : ""}
                          {address.city ? `, ${address.city}` : ""}
                          {address.state ? `, ${address.state}` : ""}
                          {address.pincode ? ` - ${address.pincode}` : ""}
                        </p>
                        {address.landmark ? <p>Landmark: {address.landmark}</p> : null}
                      </div>
                      <div className="profile-address-actions">
                        {!address.is_default && (
                          <button type="button" className="profile-btn" onClick={() => onSetDefault(address)}>
                            Set Default
                          </button>
                        )}
                        <button type="button" className="profile-btn" onClick={() => onDeleteAddress(address.id)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                  {addresses.length === 0 && <p className="profile-empty-text">No saved addresses yet.</p>}
                </>
              )}
            </div>

            {addresses.length < 3 ? (
              <div className="profile-address-form">
                <div className="profile-section-title profile-form-heading">
                  <Icon icon="lucide:plus-circle" />
                  <div>
                    <h2>Add new address</h2>
                    <p>Use this for delivery, billing and order updates.</p>
                  </div>
                </div>
                <div className="profile-form-row">
                  <label>
                    <span>Country/Region</span>
                    <select name="country" value={addrForm.country} onChange={onAddrChange}>
                      <option value="India">India</option>
                    </select>
                  </label>
                  <label>
                    <span>Label</span>
                    <select name="label" value={addrForm.label} onChange={onAddrChange}>
                      <option value="Home">Home</option>
                      <option value="Work">Work</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label>
                    <span>Name</span>
                    <input name="name" value={addrForm.name} onChange={onAddrChange} />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input name="phone" value={addrForm.phone} onChange={onAddrChange} inputMode="tel" />
                  </label>
                </div>

                <label>
                  <span>Flat, House no., Building, Company, Apartment *</span>
                  <input name="address_line1" value={addrForm.address_line1} onChange={onAddrChange} />
                </label>
                <label>
                  <span>Area, Street, Sector, Village</span>
                  <input name="address_line2" value={addrForm.address_line2} onChange={onAddrChange} />
                </label>
                <label>
                  <span>Landmark</span>
                  <input name="landmark" value={addrForm.landmark} onChange={onAddrChange} />
                </label>

                <div className="profile-form-row">
                  <label>
                    <span>Pincode</span>
                    <input name="pincode" value={addrForm.pincode} onChange={onAddrChange} inputMode="numeric" />
                  </label>
                  <label>
                    <span>Town/City</span>
                    <input name="city" value={addrForm.city} onChange={onAddrChange} />
                  </label>
                  <label>
                    <span>State</span>
                    <input name="state" value={addrForm.state} onChange={onAddrChange} />
                  </label>
                </div>
                <label>
                  <span>Delivery instructions (optional)</span>
                  <input
                    name="delivery_instructions"
                    value={addrForm.delivery_instructions}
                    onChange={onAddrChange}
                    placeholder="Notes, preferences and more"
                  />
                </label>

                <label className="profile-checkbox">
                  <input type="checkbox" name="is_default" checked={addrForm.is_default} onChange={onAddrChange} />
                  <span>Set as default address</span>
                </label>

                <div className="profile-form-actions">
                  <button type="button" className="profile-btn profile-btn-primary" onClick={onAddAddress} disabled={addrSaving}>
                    {addrSaving ? "Saving..." : "Add Address"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="profile-empty-text">You reached the maximum of 3 saved addresses.</p>
            )}
          </section>
        </div>
      </section>

    </main>
  );
}
