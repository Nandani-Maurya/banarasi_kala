import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { imgUrl } from "../../utils/cloudinary";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../utils/api";
import { requiredEnv } from "../../utils/env";
import "./Profile.css";

const SUPPORT_ERROR_MESSAGE = "Something went wrong. Please contact support or try again later.";
const MAP_SUPPORT_ERROR_MESSAGE = "Map is not available right now. Please enter the address manually or contact admin.";
const TECHNICAL_ERROR_PATTERNS = [
  /.*/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /syntax error/i,
  /database/i,
  /internal server error/i,
  /network error/i,
];

const getFriendlyError = (err, fallback = SUPPORT_ERROR_MESSAGE) => {
  const message = err?.response?.data?.message || err?.message || "";
  if (!message) return fallback;
  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return fallback;
  return message;
};

const getMapFriendlyError = () => MAP_SUPPORT_ERROR_MESSAGE;

const normalizeIndianPhone = (value) => String(value || "").trim().replace(/^0+/, "");

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
  alternate_phone: "",
  use_account_contact: true,
  country: "India",
  house_building: "",
  area_street: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  delivery_instructions: "",
  map_address: "",
  map_lat: "",
  map_lng: "",
  is_default: true,
};

const ADDRESS_LABEL_OPTIONS = ["Home", "Work", "Other"];
const MAPBOX_TOKEN = requiredEnv("VITE_MAPBOX_ACCESS_TOKEN");
const MAPBOX_GL_SCRIPT = "https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.js";
const MAPBOX_GL_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css";
const DEFAULT_LOCATION = {
  center: [82.9739, 25.3176],
  label: "Varanasi, Uttar Pradesh, India",
};

let mapboxLoaderPromise;

const loadMapboxGl = () => {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoaderPromise) return mapboxLoaderPromise;

  mapboxLoaderPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPBOX_GL_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPBOX_GL_CSS;
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(`script[src="${MAPBOX_GL_SCRIPT}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.mapboxgl), { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = MAPBOX_GL_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error("Map failed to load. Please try again."));
    document.body.appendChild(script);
  });

  return mapboxLoaderPromise;
};

const mapFeatureToAddress = (feature) => {
  const context = feature?.properties?.context || feature?.context || {};
  const contextList = Array.isArray(feature?.context) ? feature.context : [];
  const getContextText = (key) => {
    if (context[key]?.name) return context[key].name;
    const found = contextList.find((item) => item.id?.startsWith(`${key}.`));
    return found?.text || found?.text_en || "";
  };
  const properties = feature?.properties || {};
  const fullAddress = properties.full_address || feature?.place_name || feature?.name || feature?.text || "";
  const city = getContextText("place") || getContextText("locality") || getContextText("district");
  const state = getContextText("region");
  const pincode = getContextText("postcode");
  const country = getContextText("country") || "India";
  const streetParts = [
    properties.address,
    properties.context?.street?.name || feature?.name || feature?.text,
  ].filter(Boolean);

  return {
    house_building: streetParts.join(", ") || feature?.name || fullAddress,
    area_street: city && !fullAddress.toLowerCase().includes(city.toLowerCase()) ? fullAddress : "",
    city,
    state,
    pincode,
    country,
    displayName: fullAddress,
  };
};

export function LocationPickerModal({ open, initialQuery, onClose, onConfirm }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchAbortRef = useRef(null);
  const skipSearchRef = useRef(false);
  const userCenterRef = useRef(DEFAULT_LOCATION.center);
  const [query, setQuery] = useState(initialQuery || "");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [status, setStatus] = useState("");
  const canConfirmLocation = Boolean(selected?.center && selected?.displayName);

  const reverseGeocode = async (center) => {
    if (!MAPBOX_TOKEN) return null;
    const url = new URL(`https://api.mapbox.com/search/geocode/v6/reverse`);
    url.searchParams.set("longitude", center[0]);
    url.searchParams.set("latitude", center[1]);
    url.searchParams.set("access_token", MAPBOX_TOKEN);
    url.searchParams.set("country", "in");
    const response = await fetch(url);
    if (!response.ok) throw new Error("MAP_REVERSE_FAILED");
    const data = await response.json();
    return data.features?.[0] || null;
  };

  const selectFeature = (feature, zoom = 15) => {
    const center = feature?.geometry?.coordinates;
    if (!center) return;
    const address = mapFeatureToAddress(feature);
    const nextQuery = address.displayName || address.house_building || feature?.name || "";
    skipSearchRef.current = true;
    userCenterRef.current = center;
    setQuery(nextQuery);
    setResults([]);
    setSelected({ center, placeId: feature.id || feature.properties?.mapbox_id || "", ...address });
    markerRef.current?.setLngLat(center);
    mapRef.current?.flyTo({ center, zoom, essential: true });
  };

  const selectCenter = async (center) => {
    setStatus("");
    try {
      const feature = await reverseGeocode(center);
      if (feature) {
        selectFeature(feature, 15);
        return;
      }
    } catch {
      setStatus(getMapFriendlyError());
    }
    setSelected(null);
    markerRef.current?.setLngLat(center);
    mapRef.current?.flyTo({ center, zoom: 14, essential: true });
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Current location is not available. Please search or enter the address manually.");
      return;
    }
    setIsLocating(true);
    setStatus("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = [position.coords.longitude, position.coords.latitude];
        userCenterRef.current = center;
        selectCenter(center, "Current location").finally(() => setIsLocating(false));
      },
      () => {
        setStatus("Current location could not be used. Please search or enter the address manually.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!open) return undefined;
    setQuery(initialQuery || "");
    setResults([]);
    setStatus("");

    let cancelled = false;
    const setupMap = async () => {
      if (!MAPBOX_TOKEN) {
        setStatus(getMapFriendlyError());
        return;
      }

      try {
        const mapboxgl = await loadMapboxGl();
        if (cancelled || !mapNodeRef.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapRef.current = new mapboxgl.Map({
          container: mapNodeRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: DEFAULT_LOCATION.center,
          zoom: 12,
        });
        mapRef.current.on("moveend", () => {
          userCenterRef.current = mapRef.current.getCenter().toArray();
        });
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        markerRef.current = new mapboxgl.Marker({ color: "#800020", draggable: true })
          .setLngLat(DEFAULT_LOCATION.center)
          .addTo(mapRef.current);
        markerRef.current.on("dragend", () => selectCenter(markerRef.current.getLngLat().toArray()));
        mapRef.current.on("click", (event) => selectCenter(event.lngLat.toArray()));
        mapRef.current.once("load", () => {
          mapRef.current.resize();
          if (navigator.geolocation) {
            handleCurrentLocation();
          } else {
            selectCenter(DEFAULT_LOCATION.center, DEFAULT_LOCATION.label);
          }
        });
        window.setTimeout(() => mapRef.current?.resize(), 120);
      } catch {
        setStatus(getMapFriendlyError());
      }
    };

    setupMap();

    return () => {
      cancelled = true;
      searchAbortRef.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !MAPBOX_TOKEN) return undefined;
    const cleanQuery = query.trim();
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return undefined;
    }
    if (cleanQuery.length < 3) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      setStatus("");

      try {
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json`);
        url.searchParams.set("access_token", MAPBOX_TOKEN);
        url.searchParams.set("country", "in");
        url.searchParams.set("limit", "5");
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("language", "en");
        url.searchParams.set("types", "poi,address,neighborhood,locality,place,postcode");
        url.searchParams.set("proximity", userCenterRef.current.join(","));
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("MAP_SEARCH_FAILED");
        const data = await response.json();
        setResults(data.features || []);
      } catch (err) {
        if (err.name !== "AbortError") setStatus(getMapFriendlyError());
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  return (
    <div className="profile-map-modal" role="dialog" aria-modal="true" aria-label="Add location on map">
      <div className="profile-map-sheet">
        <div className="profile-map-head">
          <button type="button" onClick={onClose}>Cancel</button>
          <h2>Add Location on Map</h2>
          <button type="button" onClick={() => canConfirmLocation && onConfirm(selected)} disabled={!canConfirmLocation}>Done</button>
        </div>

        <div className="profile-map-content">
          <div className="profile-map-search-area">
            <div className="profile-map-search">
              <Icon icon="lucide:search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search area, street or landmark"
                autoFocus
              />
              {isSearching ? <Icon icon="lucide:loader-circle" className="profile-spin" /> : null}
            </div>

            {results.length > 0 && (
              <div className="profile-map-results">
                {results.map((feature) => (
                  <button type="button" key={feature.id} onClick={() => selectFeature(feature)}>
                    <Icon icon="lucide:map-pin" />
                    <span>{feature.properties?.full_address || feature.place_name || feature.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="profile-current-location" onClick={handleCurrentLocation} disabled={isLocating}>
            <Icon icon={isLocating ? "lucide:loader-circle" : "lucide:locate-fixed"} className={isLocating ? "profile-spin" : ""} />
            {isLocating ? "Finding current location..." : "Use current location"}
          </button>

          {status && <p className="profile-map-status">{status}</p>}
          <div className="profile-map-canvas" ref={mapNodeRef} />

          <div className="profile-map-bottom">
            <div>
              <strong>{selected?.house_building || "Choose delivery location"}</strong>
              <p>{selected?.displayName || "Search, use current location, or tap the map."}</p>
            </div>
          <button
            type="button"
            className="profile-btn profile-btn-primary"
            onClick={() => canConfirmLocation && onConfirm(selected)}
            disabled={!canConfirmLocation}
          >
            Confirm location
          </button>
            <button type="button" className="profile-map-manual" onClick={onClose}>
              Or, enter address manually
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSelect({ label, name, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  const chooseOption = (option) => {
    onChange({ target: { name, value: option, type: "select-one" } });
    setOpen(false);
  };

  return (
    <label className="profile-select-label">
      <span>{label}</span>
      <div className={`profile-select ${open ? "is-open" : ""}`} ref={wrapperRef}>
        <button type="button" className="profile-select-trigger" onClick={() => setOpen((current) => !current)}>
          <span>{value}</span>
          <Icon icon="lucide:chevron-down" />
        </button>
        {open && (
          <div className="profile-select-menu">
            {options.map((option) => (
              <button
                type="button"
                className={option === value ? "is-selected" : ""}
                key={option}
                onClick={() => chooseOption(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

function ProfileMiniModal({ modal, onClose, onConfirm }) {
  if (!modal) return null;
  const isConfirm = modal.type === "confirm";

  return (
    <div className="profile-mini-modal" role="dialog" aria-modal="true" aria-label={modal.title}>
      <div className="profile-mini-card">
        <div className={`profile-mini-icon ${modal.tone || "success"}`}>
          <Icon icon={isConfirm ? "lucide:trash-2" : "lucide:check"} />
        </div>
        <h3>{modal.title}</h3>
        {modal.message ? <p>{modal.message}</p> : null}
        {isConfirm ? (
          <div className="profile-mini-actions">
            <button type="button" className="profile-mini-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="profile-mini-btn danger" onClick={onConfirm} disabled={modal.loading}>
              {modal.loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        ) : modal.type === "error" ? (
          <div className="profile-mini-actions single">
            <button type="button" className="profile-mini-btn" onClick={onClose}>
              OK
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [addrForm, setAddrForm] = useState(emptyAddress);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrError, setAddrError] = useState("");
  const [addrFieldErrors, setAddrFieldErrors] = useState({});
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [miniModal, setMiniModal] = useState(null);
  const [deleteAddressId, setDeleteAddressId] = useState(null);
  const [deletingAddressId, setDeletingAddressId] = useState(null);
  const profileErrorRef = useRef(null);
  const addressErrorRef = useRef(null);

  const scrollToRef = (ref) => {
    window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const setProfileInlineError = (message) => {
    setError(message);
    scrollToRef(profileErrorRef);
  };

  const setAddressInlineError = (message) => {
    setAddrError(message);
    scrollToRef(addressErrorRef);
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError("");
      setAddrError("");
      setAddrLoading(true);
      try {
        const meRes = await api.get("/api/customers/me");

        if (!alive) return;
        setProfile(meRes.data);
        if (updateUser) {
          updateUser(meRes.data);
        }
        try {
          const addressRes = await api.get("/api/addresses");
          if (!alive) return;
          setAddresses(Array.isArray(addressRes.data) ? addressRes.data : []);
        } catch (addressErr) {
          if (!alive) return;
          setAddresses([]);
          setAddressInlineError(getFriendlyError(addressErr, "Unable to load addresses. Please try again later."));
        } finally {
          if (alive) setAddrLoading(false);
        }
      } catch (err) {
        if (!alive) return;
        setProfileInlineError(getFriendlyError(err, "Unable to load profile. Please contact support or try again later."));
        setAddrLoading(false);
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
      email: profile.email || "",
      phone: profile.phone || "",
    });
    setAddrForm((prev) => ({
      ...prev,
      name: profile.name || prev.name,
      phone: profile.phone || prev.phone,
    }));
  }, [profile]);

  useEffect(() => {
    if (!profile || !addrForm.use_account_contact) return;
    setAddrForm((prev) => ({
      ...prev,
      name: profile.name || "",
      phone: profile.phone || "",
    }));
  }, [profile, addrForm.use_account_contact]);

  useEffect(() => {
    if (!miniModal || miniModal.type === "confirm") return undefined;
    const timer = window.setTimeout(() => setMiniModal(null), 1400);
    return () => window.clearTimeout(timer);
  }, [miniModal]);

  const showSuccess = (title, message = "") => {
    setMiniModal({ type: "success", tone: "success", title, message });
  };

  const refreshAddresses = async () => {
    setAddrLoading(true);
    setAddrError("");
    try {
      const res = await api.get("/api/addresses");
      setAddresses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setAddressInlineError(getFriendlyError(err, "Unable to load addresses. Please try again later."));
    } finally {
      setAddrLoading(false);
    }
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
      setProfileInlineError(getFriendlyError(err, "Avatar upload failed. Please try again later."));
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
        email: form.email,
      });
      const updated = res.data?.customer || res.data;
      setProfile((prev) => {
        const next = prev ? { ...prev, ...updated } : prev;
        if (updateUser && next) updateUser(next);
        return next;
      });
      setIsEditing(false);
      showSuccess("Profile updated", "Your account details were saved.");
    } catch (err) {
      setProfileInlineError(getFriendlyError(err, "Failed to update profile. Please try again later."));
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
    if (name === "use_account_contact") {
      setAddrForm((prev) => ({
        ...prev,
        use_account_contact: checked,
        name: checked ? profile?.name || "" : "",
        phone: checked ? profile?.phone || "" : "",
      }));
      setAddrFieldErrors((prev) => ({ ...prev, name: "", phone: "" }));
      return;
    }
    setAddrForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setAddrFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const resetAddressForm = () => {
    setMapOpen(false);
    setAddrForm((prev) => ({
      ...emptyAddress,
      name: profile?.name || prev.name || "",
      phone: profile?.phone || prev.phone || "",
      alternate_phone: "",
      use_account_contact: true,
    }));
    setAddrFieldErrors({});
    setEditingAddressId(null);
    setShowAddressForm(false);
  };

  const validateAddressForm = () => {
    const errors = {};
    if (!addrForm.name.trim()) errors.name = "Name is required.";
    const receiverPhone = normalizeIndianPhone(addrForm.phone);
    const alternatePhone = normalizeIndianPhone(addrForm.alternate_phone);
    if (!receiverPhone) errors.phone = "Phone is required.";
    if (!addrForm.house_building.trim()) errors.house_building = "Address is required.";
    if (!addrForm.city.trim()) errors.city = "City is required.";
    if (!addrForm.state.trim()) errors.state = "State is required.";
    if (!addrForm.pincode.trim()) errors.pincode = "Pincode is required.";
    if (receiverPhone && !/^[6-9]\d{9}$/.test(receiverPhone)) {
      errors.phone = "Enter a valid 10 digit mobile number.";
    }
    if (alternatePhone && !/^[6-9]\d{9}$/.test(alternatePhone)) {
      errors.alternate_phone = "Enter a valid 10 digit mobile number.";
    }
    if (alternatePhone && alternatePhone === receiverPhone) {
      errors.alternate_phone = "Alternate number must be different.";
    }
    if (addrForm.pincode.trim() && !/^\d{6}$/.test(addrForm.pincode.trim())) {
      errors.pincode = "Enter a valid 6 digit pincode.";
    }
    setAddrFieldErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    if (!isValid) {
      window.setTimeout(() => {
        document.querySelector(".profile-address-form em")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
    return isValid;
  };

  const buildAddressPayload = () => ({
    ...addrForm,
    name: addrForm.name.trim(),
    phone: normalizeIndianPhone(addrForm.phone),
    alternate_phone: normalizeIndianPhone(addrForm.alternate_phone),
    house_building: addrForm.house_building.trim(),
    area_street: addrForm.area_street.trim(),
    city: addrForm.city.trim(),
    state: addrForm.state.trim(),
    pincode: addrForm.pincode.trim(),
    landmark: addrForm.landmark.trim(),
    delivery_instructions: addrForm.delivery_instructions.trim(),
    map_address: addrForm.map_address.trim(),
    map_lat: addrForm.map_lat || null,
    map_lng: addrForm.map_lng || null,
  });

  const onEditAddress = (address) => {
    setEditingAddressId(address.id);
    setShowAddressForm(true);
    setAddrError("");
    setAddrFieldErrors({});
    setAddrForm({
      label: address.label || "Home",
      name: address.name || "",
      phone: address.phone || "",
      alternate_phone: address.alternate_phone || "",
      use_account_contact: Boolean(
        profile?.name &&
        profile?.phone &&
        address.name === profile.name &&
        address.phone === profile.phone,
      ),
      country: address.country || "India",
      house_building: address.house_building || address.address_line1 || "",
      area_street: address.area_street || address.address_line2 || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
      landmark: address.landmark || "",
      delivery_instructions: address.delivery_instructions || "",
      map_address: address.map_address || "",
      map_lat: address.map_lat || "",
      map_lng: address.map_lng || "",
      is_default: Boolean(address.is_default),
    });
  };

  const onRemoveMapLocation = () => {
    setAddrForm((prev) => ({
      ...prev,
      map_address: "",
      map_lat: "",
      map_lng: "",
    }));
  };

  const onAddAddress = async () => {
    if (!validateAddressForm()) return;
    setAddrSaving(true);
    setAddrError("");
    try {
      const payload = buildAddressPayload();
      if (editingAddressId) {
        await api.put(`/api/addresses/${editingAddressId}`, payload);
      } else {
        await api.post("/api/addresses", payload);
      }
      const wasEditing = Boolean(editingAddressId);
      resetAddressForm();
      await refreshAddresses();
      showSuccess(wasEditing ? "Address updated" : "Address saved", wasEditing ? "Your delivery details were updated." : "Your delivery address was saved.");
    } catch (err) {
      setAddressInlineError(getFriendlyError(err, "Failed to save address. Please try again later."));
    } finally {
      setAddrSaving(false);
    }
  };

  const onConfirmLocation = (location) => {
    setAddrForm((prev) => ({
      ...prev,
      country: location.country || prev.country || "India",
      house_building: location.house_building || prev.house_building,
      area_street: location.area_street || prev.area_street,
      city: location.city || prev.city,
      state: location.state || prev.state,
      pincode: location.pincode || prev.pincode,
      landmark: prev.landmark || location.displayName || "",
      map_address: location.displayName || location.house_building || "",
      map_lat: location.center?.[1] || "",
      map_lng: location.center?.[0] || "",
    }));
    setAddrFieldErrors((prev) => ({
      ...prev,
      house_building: "",
      city: "",
      state: "",
      pincode: "",
    }));
    setMapOpen(false);
  };

  const onDeleteAddress = (id) => {
    if (!id) return;
    setDeleteAddressId(id);
    setMiniModal({
      type: "confirm",
      tone: "danger",
      title: "Delete address?",
      message: "This saved address will be removed from your profile.",
    });
  };

  const confirmDeleteAddress = async () => {
    if (!deleteAddressId) return;
    setAddrError("");
    setDeletingAddressId(deleteAddressId);
    setMiniModal((prev) => (prev ? { ...prev, loading: true } : prev));
    try {
      await api.delete(`/api/addresses/${deleteAddressId}`);
      if (editingAddressId === deleteAddressId) resetAddressForm();
      await refreshAddresses();
      setDeleteAddressId(null);
      showSuccess("Address deleted", "The saved address was removed.");
    } catch (err) {
      setMiniModal(null);
      setDeleteAddressId(null);
      setAddressInlineError(getFriendlyError(err, "Failed to delete address. Please try again later."));
    }
    setDeletingAddressId(null);
  };

  const onSetDefault = async (address) => {
    if (!address?.id) return;
    setAddrError("");
    try {
      await api.put(`/api/addresses/${address.id}`, { is_default: true });
      await refreshAddresses();
      showSuccess("Default updated", "This address is now your default.");
    } catch (err) {
      setAddressInlineError(getFriendlyError(err, "Failed to update address. Please try again later."));
    }
  };

  return (
    <main className="profile-page">
      <section className="profile-shell">
        <header className="profile-hero">
          <div className="profile-identity">
            <div className="profile-avatar">
              {profile?.avatar_url ? (
                <img src={imgUrl(profile.avatar_url)} alt="Profile" />
              ) : (
                <div className="profile-avatar-fallback" aria-label="Default profile avatar">
                  <Icon icon="lucide:user-round" />
                </div>
              )}
              <label className={`profile-avatar-upload ${uploading ? "is-loading" : ""}`} title="Change photo">
                <input type="file" accept="image/*" onChange={onPickAvatar} disabled={uploading} />
                <Icon icon={uploading ? "lucide:loader-circle" : "lucide:camera"} />
              </label>
            </div>

            <div className="profile-meta">
              <span className="profile-kicker">Your Account</span>
              {loading && !profile ? (
                <>
                  <span className="profile-skeleton profile-skeleton-title" />
                  <div className="profile-contact-line">
                    <span className="profile-skeleton profile-skeleton-line" />
                    <span className="profile-skeleton profile-skeleton-line short" />
                  </div>
                  <span className="profile-skeleton profile-skeleton-line tiny" />
                </>
              ) : (
                <>
                  <h1>{profile?.name || "My Profile"}</h1>
                  <div className="profile-contact-line">
                    <span><Icon icon="lucide:mail" />{profile?.email || "-"}</span>
                    <span><Icon icon="lucide:phone" />{profile?.phone || "-"}</span>
                  </div>
                  <p>Member since {toDateString(profile?.createdAt)}</p>
                </>
              )}
            </div>
          </div>

          <div className="profile-hero-actions">
            {!isEditing ? (
              <button type="button" className="profile-btn profile-btn-primary" onClick={() => setIsEditing(true)} disabled={loading && !profile}>
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
                    setForm({ name: profile?.name || "", email: profile?.email || "", phone: profile?.phone || "" });
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

        {error && <p className="profile-error" ref={profileErrorRef}>{error}</p>}

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
                <span>Email</span>
                <input name="email" value={form.email} onChange={onChange} type="email" />
              </label>
              <label>
                <span>Phone</span>
                <input name="phone" value={form.phone} disabled inputMode="tel" />
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
            <span>Reset password by email OTP</span>
          </button>
        </section>

        <div className="profile-grid">
          <section className="profile-panel profile-panel-wide">
            <div className="profile-section-title profile-section-title-row">
              <Icon icon="lucide:map-pin-house" />
              <div>
                <h2>Your Addresses</h2>
                <p>Save up to 3 delivery addresses for faster checkout.</p>
              </div>
              <span className="profile-count-pill">{addresses.length}/3 saved</span>
            </div>

            {addrError && <p className="profile-error" ref={addressErrorRef}>{addrError}</p>}

            <div className="profile-address-list">
              {addrLoading ? (
                <div className="profile-address-skeletons">
                  <span className="profile-skeleton profile-skeleton-row" />
                  <span className="profile-skeleton profile-skeleton-row" />
                </div>
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
                        {address.alternate_phone ? <p>Alternate: {address.alternate_phone}</p> : null}
                        <p>
                          {address.house_building || address.address_line1}
                          {address.area_street || address.address_line2 ? `, ${address.area_street || address.address_line2}` : ""}
                          {address.city ? `, ${address.city}` : ""}
                          {address.state ? `, ${address.state}` : ""}
                          {address.pincode ? ` - ${address.pincode}` : ""}
                        </p>
                        {address.landmark ? <p>Landmark: {address.landmark}</p> : null}
                        {address.map_address ? (
                          <p className="profile-map-address-line">
                            <Icon icon="lucide:map-pin" />
                            Map: {address.map_address}
                          </p>
                        ) : null}
                      </div>
                      <div className="profile-address-actions">
                        <button type="button" className="profile-btn" onClick={() => onEditAddress(address)}>
                          Edit
                        </button>
                        {!address.is_default && (
                          <button type="button" className="profile-btn" onClick={() => onSetDefault(address)}>
                            Set Default
                          </button>
                        )}
                        <button type="button" className="profile-btn" onClick={() => onDeleteAddress(address.id)}>
                          {deletingAddressId === address.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  ))}
                  {addresses.length === 0 && <p className="profile-empty-text">No saved addresses yet.</p>}
                </>
              )}
            </div>

            {addresses.length < 3 || editingAddressId ? (
              <div className="profile-address-form">
                {!showAddressForm ? (
                  <button type="button" className="profile-add-address-trigger" onClick={() => setShowAddressForm(true)}>
                    <Icon icon="lucide:plus-circle" />
                    <span>Add new address</span>
                  </button>
                ) : (
                  <div className="profile-address-modal" role="dialog" aria-modal="true" aria-label={editingAddressId ? "Edit address" : "Add new address"}>
                    <div className="profile-address-modal-card">
                      <button type="button" className="profile-address-modal-close" onClick={resetAddressForm} aria-label="Close address form">
                        <Icon icon="lucide:x" />
                      </button>
                    <div className="profile-section-title profile-form-heading">
                      <Icon icon={editingAddressId ? "lucide:pencil" : "lucide:plus-circle"} />
                      <div>
                        <h2>{editingAddressId ? "Edit address" : "Add new address"}</h2>
                        <p>Required fields are marked with *.</p>
                      </div>
                    </div>
                <div className="profile-location-card">
                  <div>
                    <span>Map address</span>
                    {addrForm.map_address ? (
                      <>
                        <strong>{addrForm.map_address}</strong>
                        <p>Saved separately from the address you type below.</p>
                      </>
                    ) : (
                      <p>No map location selected.</p>
                    )}
                  </div>
                  <div className="profile-location-actions">
                    <button type="button" className="profile-location-link" onClick={() => setMapOpen(true)}>
                      <Icon icon="lucide:map-pinned" />
                      <span>{addrForm.map_address ? "Change map location" : "Add map location"}</span>
                    </button>
                    {addrForm.map_address ? (
                      <button type="button" className="profile-location-link is-danger" onClick={onRemoveMapLocation}>
                        <Icon icon="lucide:x" />
                        <span>Remove</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="profile-form-row">
                  <ProfileSelect label="Country/Region" name="country" value={addrForm.country} options={["India"]} onChange={onAddrChange} />
                  <ProfileSelect label="Label" name="label" value={addrForm.label} options={ADDRESS_LABEL_OPTIONS} onChange={onAddrChange} />
                </div>

                <label>
                  <span>Flat, House no., Building, Company, Apartment *</span>
                  <input name="house_building" value={addrForm.house_building} onChange={onAddrChange} />
                  {addrFieldErrors.house_building ? <em>{addrFieldErrors.house_building}</em> : null}
                </label>
                <label>
                  <span>Area, Street, Sector, Village</span>
                  <input name="area_street" value={addrForm.area_street} onChange={onAddrChange} />
                </label>
                <label>
                  <span>Landmark</span>
                  <input name="landmark" value={addrForm.landmark} onChange={onAddrChange} />
                </label>

                <div className="profile-form-row">
                  <label>
                    <span>Pincode *</span>
                    <input name="pincode" value={addrForm.pincode} onChange={onAddrChange} inputMode="numeric" />
                    {addrFieldErrors.pincode ? <em>{addrFieldErrors.pincode}</em> : null}
                  </label>
                  <label>
                    <span>Town/City *</span>
                    <input name="city" value={addrForm.city} onChange={onAddrChange} />
                    {addrFieldErrors.city ? <em>{addrFieldErrors.city}</em> : null}
                  </label>
                  <label>
                    <span>State *</span>
                    <input name="state" value={addrForm.state} onChange={onAddrChange} />
                    {addrFieldErrors.state ? <em>{addrFieldErrors.state}</em> : null}
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

                <div className="profile-receiver-box">
                  <div className="profile-section-title profile-form-heading">
                    <Icon icon="lucide:user-round-check" />
                    <div>
                      <h2>Receiver details</h2>
                      <p>Add the person who will receive this delivery.</p>
                    </div>
                  </div>
                  <label className="profile-checkbox">
                    <input
                      type="checkbox"
                      name="use_account_contact"
                      checked={addrForm.use_account_contact}
                      onChange={onAddrChange}
                    />
                    <span>Use account name and number</span>
                  </label>
                  <div className="profile-form-row">
                    <label>
                      <span>Receiver name *</span>
                      <input
                        name="name"
                        value={addrForm.name}
                        onChange={onAddrChange}
                        disabled={addrForm.use_account_contact}
                      />
                      {addrFieldErrors.name ? <em>{addrFieldErrors.name}</em> : null}
                    </label>
                    <label>
                      <span>Receiver number *</span>
                      <input
                        name="phone"
                        value={addrForm.phone}
                        onChange={onAddrChange}
                        disabled={addrForm.use_account_contact}
                        inputMode="tel"
                      />
                      {addrFieldErrors.phone ? <em>{addrFieldErrors.phone}</em> : null}
                    </label>
                    <label>
                      <span>Alternate number (optional)</span>
                      <input
                        name="alternate_phone"
                        value={addrForm.alternate_phone}
                        onChange={onAddrChange}
                        inputMode="tel"
                      />
                      {addrFieldErrors.alternate_phone ? <em>{addrFieldErrors.alternate_phone}</em> : null}
                    </label>
                  </div>
                </div>

                <label className="profile-checkbox">
                  <input type="checkbox" name="is_default" checked={addrForm.is_default} onChange={onAddrChange} />
                  <span>Set as default address</span>
                </label>

                <div className="profile-form-actions">
                  {editingAddressId ? (
                    <button type="button" className="profile-btn" onClick={resetAddressForm} disabled={addrSaving}>
                      Cancel Edit
                    </button>
                  ) : null}
                  <button type="button" className="profile-btn profile-btn-primary" onClick={onAddAddress} disabled={addrSaving}>
                    {addrSaving ? "Saving..." : editingAddressId ? "Save Address" : "Add Address"}
                  </button>
                </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="profile-empty-text">You reached the maximum of 3 saved addresses.</p>
            )}
          </section>
        </div>
      </section>
      <LocationPickerModal
        open={mapOpen}
        initialQuery={[addrForm.house_building, addrForm.city, addrForm.state].filter(Boolean).join(", ")}
        onClose={() => setMapOpen(false)}
        onConfirm={onConfirmLocation}
      />
      <ProfileMiniModal
        modal={miniModal}
        onClose={() => {
          setMiniModal(null);
          setDeleteAddressId(null);
        }}
        onConfirm={confirmDeleteAddress}
      />

    </main>
  );
}
