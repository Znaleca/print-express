"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import { normalizePhilippinePhone, toPhilippinePhoneInput } from "@/lib/phone";
import { normalizeCoordinates } from "@/lib/coordinates";
import { calculateDeliveryFeeFromDistance, DEFAULT_DELIVERY_SETTINGS, DELIVERY_ROUNDING_RULES, formatDeliveryDistance, normalizeDeliverySettings, validateDeliverySettings } from "@/lib/delivery";
import { formatPesoAmount } from "@/lib/paymentSummary";
import { startMinuteAlignedRefresh } from "@/lib/openStateRefresh";
import {
  Store, Save, Loader2, UploadCloud, QrCode, Power, MapPin, MapPinned, LocateFixed, Truck,
  CheckCircle2, ShieldCheck, Phone, Mail, ExternalLink, Info, Clock, RotateCcw
} from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const BUCKET = "shop-logos";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_DAY = (day_of_week) => ({ day_of_week, configured: false, is_closed: false, opens_at: "09:00", closes_at: "17:00" });
const SOCIAL_URL_FIELDS = [
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/yourshop" },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/yourshop" },
  { key: "tiktok_url", label: "TikTok", placeholder: "https://tiktok.com/@yourshop" },
];

async function getEffectiveOpenState(targetBusinessId, fallback = false) {
  const { data, error } = await supabase.rpc("is_business_open_now", { p_business_id: targetBusinessId });
  return error ? fallback : Boolean(data);
}

function isValidOptionalSocialUrl(value) {
  if (!value?.trim()) return true;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export default function ShopProfilePage() {
  const [form, setForm] = useState({
    name: "", description: "", products_summary: "", address: "",
    phone: "", email: "", facebook_url: "", instagram_url: "", tiktok_url: "", logo_url: "", qr_url: "",
    lat: null, lng: null,
    min_downpayment_percent: 30,
    delivery_enabled: DEFAULT_DELIVERY_SETTINGS.delivery_enabled,
    delivery_base_fee: String(DEFAULT_DELIVERY_SETTINGS.delivery_base_fee),
    delivery_included_distance_km: String(DEFAULT_DELIVERY_SETTINGS.delivery_included_distance_km),
    delivery_fee_per_extra_km: String(DEFAULT_DELIVERY_SETTINGS.delivery_fee_per_extra_km),
    delivery_max_distance_km: "",
    delivery_distance_rounding: DEFAULT_DELIVERY_SETTINGS.delivery_distance_rounding,
  });
  const [initialForm, setInitialForm] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [businessStatus, setBusinessStatus] = useState("PENDING");
  const [isOpen, setIsOpen] = useState(true);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [hours, setHours] = useState(DAY_NAMES.map((_, day) => DEFAULT_DAY(day)));
  const [initialHours, setInitialHours] = useState(DAY_NAMES.map((_, day) => DEFAULT_DAY(day)));
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [initialTimezone, setInitialTimezone] = useState("Asia/Manila");
  const [manualOverride, setManualOverride] = useState(null);
  const [initialManualOverride, setInitialManualOverride] = useState(null);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [profileValidationError, setProfileValidationError] = useState("");
  const [deliveryValidationErrors, setDeliveryValidationErrors] = useState({});
  const [addressLookupStatus, setAddressLookupStatus] = useState("idle");
  const [locatingCurrentLocation, setLocatingCurrentLocation] = useState(false);
  const addressLookupControllerRef = useRef(null);
  const addressEditVersionRef = useRef(0);
  const addressLookupIdRef = useRef(0);
  const addressLookupValueRef = useRef("");

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const fileInputRef = useRef(null);

  // QR upload state
  const [qrPreview, setQrPreview] = useState(null);
  const [qrFile, setQrFile] = useState(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const qrInputRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadError("Sign in to access your shop profile.");
        setLoading(false);
        return;
      }

      const { data: biz, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, description, products_summary, status, address, phone, email, facebook_url, instagram_url, tiktok_url, logo_url, qr_url, lat, lng, min_downpayment_percent, delivery_enabled, delivery_base_fee, delivery_included_distance_km, delivery_fee_per_extra_km, delivery_max_distance_km, delivery_distance_rounding, is_open, timezone, manual_open_override")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (businessError) {
        setLoadError(businessError.message || "Could not load your shop profile.");
      } else if (biz) {
        setBusinessId(biz.id);
        setBusinessStatus(String(biz.status || "PENDING").toUpperCase());
        const coordinates = normalizeCoordinates(biz.lat, biz.lng);
        const loadedForm = {
          name: biz.name || "",
          description: biz.description || "",
          products_summary: biz.products_summary || "",
          address: biz.address || "",
          phone: toPhilippinePhoneInput(biz.phone || ""),
          email: biz.email || "",
          facebook_url: biz.facebook_url || "",
          instagram_url: biz.instagram_url || "",
          tiktok_url: biz.tiktok_url || "",
          logo_url: biz.logo_url || "",
          qr_url: biz.qr_url || "",
          lat: coordinates?.lat ?? null,
          lng: coordinates?.lng ?? null,
          min_downpayment_percent: Math.min(100, Math.max(1, Number.parseInt(String(biz.min_downpayment_percent ?? 30), 10) || 30)),
          delivery_enabled: biz.delivery_enabled !== false,
          delivery_base_fee: String(biz.delivery_base_fee ?? DEFAULT_DELIVERY_SETTINGS.delivery_base_fee),
          delivery_included_distance_km: String(biz.delivery_included_distance_km ?? DEFAULT_DELIVERY_SETTINGS.delivery_included_distance_km),
          delivery_fee_per_extra_km: String(biz.delivery_fee_per_extra_km ?? DEFAULT_DELIVERY_SETTINGS.delivery_fee_per_extra_km),
          delivery_max_distance_km: biz.delivery_max_distance_km == null ? "" : String(biz.delivery_max_distance_km),
          delivery_distance_rounding: biz.delivery_distance_rounding || DEFAULT_DELIVERY_SETTINGS.delivery_distance_rounding,
        };
        setForm(loadedForm);
        setInitialForm(loadedForm);
        if (biz.logo_url) setLogoPreview(biz.logo_url);
        if (biz.qr_url) setQrPreview(biz.qr_url);
        setIsOpen(await getEffectiveOpenState(biz.id, biz.is_open ?? true));
        setTimezone(biz.timezone || "Asia/Manila");
        setInitialTimezone(biz.timezone || "Asia/Manila");
        const loadedManualClose = biz.manual_open_override === false ? false : null;
        setManualOverride(loadedManualClose);
        setInitialManualOverride(loadedManualClose);

        const { data: savedHours } = await supabase
          .from("business_hours")
          .select("id, business_id, day_of_week, opens_at, closes_at, is_closed")
          .eq("business_id", biz.id)
          .order("day_of_week");
        const nextHours = DAY_NAMES.map((_, day) => {
          const saved = (savedHours || []).find((row) => row.day_of_week === day);
          return saved
            ? { ...DEFAULT_DAY(day), ...saved, configured: true, opens_at: saved.opens_at?.slice(0, 5) || "09:00", closes_at: saved.closes_at?.slice(0, 5) || "17:00" }
            : DEFAULT_DAY(day);
        });
        setHours(nextHours);
        setInitialHours(nextHours);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => () => addressLookupControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!businessId || manualOverride !== null) return undefined;

    return startMinuteAlignedRefresh(async () => {
      setIsOpen(await getEffectiveOpenState(businessId, false));
    });
  }, [businessId, manualOverride]);

  const handleToggleOpen = async () => {
    if (!businessId || togglingOpen) return;
    setTogglingOpen(true);

    const reopening = !isOpen;
    const { error: err } = await supabase
      .from("businesses")
      .update(reopening
        ? { is_open: true, manual_open_override: null, manual_override_until: null }
        : { is_open: false, manual_open_override: false, manual_override_until: null })
      .eq("id", businessId);

    if (err) {
      alert("Failed to update status: " + err.message);
    } else {
      const effectiveOpen = reopening
        ? await getEffectiveOpenState(businessId, false)
        : false;
      setIsOpen(effectiveOpen);
      setManualOverride(reopening ? null : false);
      setInitialManualOverride(reopening ? null : false);
      showToast(reopening
        ? (effectiveOpen ? "Manual close removed. Your shop is now following its schedule." : "Manual close removed. Your shop will open at its next scheduled time.")
        : "Shop closed until you turn it back on.");
    }
    setTogglingOpen(false);
  };

  const handleResumeSchedule = async () => {
    if (!businessId || togglingOpen) return;
    setTogglingOpen(true);
    const { error: err } = await supabase
      .from("businesses")
      .update({ is_open: true, manual_open_override: null, manual_override_until: null })
      .eq("id", businessId);

    if (!err) {
      const effectiveOpen = await getEffectiveOpenState(businessId, false);
      setIsOpen(effectiveOpen);
      setManualOverride(null);
      setInitialManualOverride(null);
      showToast(effectiveOpen ? "Your shop is following its schedule and is currently open." : "Your shop is following its schedule and is currently closed.");
    }
    setTogglingOpen(false);
    if (err) alert("Failed to resume schedule: " + err.message);
  };

  const updateDay = (day, patch) => {
    setHours((current) => current.map((row) => row.day_of_week === day ? { ...row, ...patch } : row));
  };

  const saveOperatingHours = async () => {
    if (!businessId) return;
    setHoursSaving(true);
    try {
      const { error: timezoneError } = await supabase
        .from("businesses")
        .update({ timezone: timezone || "Asia/Manila" })
        .eq("id", businessId);
      if (timezoneError) throw timezoneError;

      const rowsToSave = hours
        .filter((row) => row.configured)
        .map((row) => ({
          business_id: businessId,
          day_of_week: row.day_of_week,
          opens_at: row.is_closed ? null : row.opens_at,
          closes_at: row.is_closed ? null : row.closes_at,
          is_closed: row.is_closed,
          updated_at: new Date().toISOString(),
        }));

      if (rowsToSave.length > 0) {
        const { error: upsertError } = await supabase
          .from("business_hours")
          .upsert(rowsToSave, { onConflict: "business_id,day_of_week" });
        if (upsertError) throw upsertError;
      }

      const removedDays = initialHours
        .filter((row) => row.configured && !hours.find((next) => next.day_of_week === row.day_of_week)?.configured)
        .map((row) => row.day_of_week);
      if (removedDays.length > 0) {
        const { error: deleteError } = await supabase
          .from("business_hours")
          .delete()
          .eq("business_id", businessId)
          .in("day_of_week", removedDays);
        if (deleteError) throw deleteError;
      }

      setInitialHours(hours);
      setInitialTimezone(timezone);
      if (manualOverride === null) {
        setIsOpen(await getEffectiveOpenState(businessId, false));
      }
      showToast("Operating hours saved.");
    } catch (error) {
      showToast(error.message || "Could not save operating hours.", "error");
      throw error;
    } finally {
      setHoursSaving(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "address") {
      addressEditVersionRef.current += 1;
      addressLookupControllerRef.current?.abort();
      addressLookupValueRef.current = "";
      setAddressLookupStatus("idle");
    }
    setForm((p) => ({
      ...p,
      [name]: name === "phone" ? toPhilippinePhoneInput(value) : value,
    }));
    if (name === "phone") setPhoneTouched(true);
    if (name.startsWith("delivery_")) {
      setDeliveryValidationErrors((current) => ({ ...current, [name]: "" }));
    }
  };

  const formatDistanceInput = (name) => {
    if (!["delivery_included_distance_km", "delivery_max_distance_km"].includes(name)) return;
    const numericValue = Number(form[name]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    setForm((current) => ({ ...current, [name]: numericValue.toFixed(1) }));
  };

  const handleAddressLookup = async () => {
    const addressToSearch = form.address.trim();
    if (!addressToSearch) return;
    if (addressLookupValueRef.current === addressToSearch) return;

    addressLookupControllerRef.current?.abort();
    addressLookupValueRef.current = addressToSearch;
    const controller = new AbortController();
    const lookupId = addressLookupIdRef.current + 1;
    const editVersion = addressEditVersionRef.current;
    addressLookupControllerRef.current = controller;
    addressLookupIdRef.current = lookupId;
    setAddressLookupStatus("loading");
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 8000);

    const searchAddress = async (query) => {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json", "Accept-Language": "en" },
        }
      );
      if (!response.ok) throw new Error("Address lookup failed");
      const results = await response.json();
      return results?.[0] || null;
    };

    try {
      let coordinates = null;
      const parts = addressToSearch.split(/[\s,]+/).filter(Boolean);
      const potentialCode = parts[0] || "";

      if (potentialCode.includes("+")) {
        const { OpenLocationCode } = await import("open-location-code");
        const olc = new OpenLocationCode();

        if (olc.isFull(potentialCode)) {
          const decoded = olc.decode(potentialCode);
          coordinates = normalizeCoordinates(decoded.latitudeCenter, decoded.longitudeCenter);
        } else if (olc.isShort(potentialCode) && parts.length > 1) {
          const reference = await searchAddress(addressToSearch.replace(potentialCode, "").trim());
          if (reference) {
            const fullCode = olc.recoverNearest(potentialCode, Number(reference.lat), Number(reference.lon));
            const decoded = olc.decode(fullCode);
            coordinates = normalizeCoordinates(decoded.latitudeCenter, decoded.longitudeCenter);
          }
        }
      }

      if (!coordinates) {
        const result = await searchAddress(addressToSearch);
        coordinates = normalizeCoordinates(result?.lat, result?.lon);
      }

      if (!coordinates) throw new Error("No address found for this location");
      if (controller.signal.aborted || addressLookupIdRef.current !== lookupId || addressEditVersionRef.current !== editVersion) return;

      setForm((current) => ({ ...current, lat: coordinates.lat, lng: coordinates.lng }));
      setAddressLookupStatus("success");
    } catch (error) {
      if ((error?.name !== "AbortError" || didTimeout) && addressLookupIdRef.current === lookupId) {
        addressLookupValueRef.current = "";
        setAddressLookupStatus("error");
      }
    } finally {
      clearTimeout(timeoutId);
      if (addressLookupControllerRef.current === controller) addressLookupControllerRef.current = null;
    }
  };

  const handleLocationChange = async (lat, lng) => {
    const coordinates = normalizeCoordinates(lat, lng);
    if (!coordinates) return;

    setForm((current) => ({ ...current, lat: coordinates.lat, lng: coordinates.lng }));

    addressLookupControllerRef.current?.abort();
    const controller = new AbortController();
    const lookupId = addressLookupIdRef.current + 1;
    const editVersion = addressEditVersionRef.current;
    addressLookupControllerRef.current = controller;
    addressLookupIdRef.current = lookupId;
    setAddressLookupStatus("loading");
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 8000);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coordinates.lat}&lon=${coordinates.lng}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json", "Accept-Language": "en" },
        }
      );
      if (!response.ok) throw new Error("Address lookup failed");

      const result = await response.json();
      if (!result?.display_name) throw new Error("No address found for this location");
      if (controller.signal.aborted || addressLookupIdRef.current !== lookupId || addressEditVersionRef.current !== editVersion) return;

      setForm((current) => {
        const currentCoordinates = normalizeCoordinates(current.lat, current.lng);
        if (!currentCoordinates || currentCoordinates.lat !== coordinates.lat || currentCoordinates.lng !== coordinates.lng) return current;
        return { ...current, address: result.display_name };
      });
      setAddressLookupStatus("success");
    } catch (error) {
      if ((error?.name !== "AbortError" || didTimeout) && addressLookupIdRef.current === lookupId) {
        setAddressLookupStatus("error");
      }
    } finally {
      clearTimeout(timeoutId);
      if (addressLookupControllerRef.current === controller) addressLookupControllerRef.current = null;
    }
  };

  const handleUseCurrentLocation = () => {
    if (locatingCurrentLocation) return;
    if (!navigator.geolocation) {
      setAddressLookupStatus("error");
      showToast("Your browser does not support location access.", "error");
      return;
    }

    setLocatingCurrentLocation(true);
    setAddressLookupStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        handleLocationChange(coords.latitude, coords.longitude).finally(() => {
          setLocatingCurrentLocation(false);
        });
      },
      (error) => {
        setLocatingCurrentLocation(false);
        setAddressLookupStatus("error");
        const message = error.code === 1
          ? "Location access was blocked. Allow it in your browser, then try again."
          : error.code === 3
            ? "We could not get your location in time. Try again."
            : "We could not get your current location. Try again.";
        showToast(message, "error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const hasUnsavedChanges = Boolean(initialForm) && (
    JSON.stringify(form) !== JSON.stringify(initialForm)
    || Boolean(logoFile)
    || Boolean(qrFile)
    || JSON.stringify(hours) !== JSON.stringify(initialHours)
    || timezone !== initialTimezone
    || manualOverride !== initialManualOverride
  );

  const handleLogoSelected = async (file) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setLogoError("Supported formats: PNG, JPG, or WebP.");

    try {
      const optimized = await optimizeImageForUpload(file);
      setLogoError(null);
      setLogoFile(optimized);
      setLogoPreview(URL.createObjectURL(optimized));
    } catch (error) {
      setLogoError(error.message || "Could not optimize this image.");
    }
  };

  const handleQrSelected = async (file) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setQrError("Supported formats: PNG, JPG, or WebP.");

    try {
      const optimized = await optimizeImageForUpload(file);
      setQrError(null);
      setQrFile(optimized);
      setQrPreview(URL.createObjectURL(optimized));
    } catch (error) {
      setQrError(error.message || "Could not optimize this image.");
    }
  };

  const uploadFileToBucket = async (file, prefix) => {
    const optimized = await optimizeImageForUpload(file);
    const ext = getUploadExtension(optimized);
    const fileName = `${businessId}/${prefix}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(fileName, optimized, {
        upsert: true,
        cacheControl: "31536000",
        contentType: optimized.type,
      });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setProfileValidationError("");
    setDeliveryValidationErrors({});

    try {
      const normalizedPhone = form.phone ? normalizePhilippinePhone(form.phone) : "";
      const trimmedName = form.name.trim();
      const trimmedAddress = form.address.trim();
      const profileLocked = businessStatus === "APPROVED";
      let validationMessage = "";
      if (trimmedName.length < 2) {
        validationMessage = "Add a business name with at least 2 characters.";
      } else if (!profileLocked && (form.description.trim().length < 20 || form.description.trim().length > 800)) {
        validationMessage = "Business background must be between 20 and 800 characters.";
      } else if (!profileLocked && (form.products_summary.trim().length < 10 || form.products_summary.trim().length > 500)) {
        validationMessage = "Products and services must be between 10 and 500 characters.";
      } else if (!form.phone || !normalizedPhone) {
        setPhoneTouched(true);
        validationMessage = "Enter the 10 digits after +63. Example: 9123456789.";
      } else if (trimmedAddress.length < 5) {
        validationMessage = "Add the shop address customers should use for pickup or delivery.";
      } else if (!normalizeCoordinates(form.lat, form.lng)) {
        validationMessage = "Place the map pin at your shop entrance before saving.";
      } else if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        validationMessage = "Enter a valid business email or leave the field blank.";
      } else {
        const invalidSocial = SOCIAL_URL_FIELDS.find(({ key }) => !isValidOptionalSocialUrl(form[key]));
        if (invalidSocial) {
          validationMessage = `${invalidSocial.label} URL must start with https:// (or leave it blank).`;
        }
      }
      const deliveryValidation = form.delivery_enabled
        ? validateDeliverySettings(form)
        : {
          valid: true,
          errors: {},
          values: { ...normalizeDeliverySettings(form), delivery_enabled: false },
        };
      if (!deliveryValidation.valid) {
        setDeliveryValidationErrors(deliveryValidation.errors);
        validationMessage = validationMessage || "Fix the delivery pricing fields before saving.";
      }
      if (validationMessage) {
        setProfileValidationError(validationMessage);
        showToast(validationMessage, "error");
        setSaving(false);
        return;
      }

      let finalLogoUrl = form.logo_url;
      let finalQrUrl = form.qr_url;

      if (logoFile) {
        setLogoUploading(true);
        finalLogoUrl = await uploadFileToBucket(logoFile, "logo");
        setLogoUploading(false);
      }

      if (qrFile) {
        setQrUploading(true);
        finalQrUrl = await uploadFileToBucket(qrFile, "qr");
        setQrUploading(false);
      }

      const parsedDp = Number.parseInt(String(form.min_downpayment_percent), 10);
      const minDp = Number.isFinite(parsedDp) ? Math.min(100, Math.max(1, parsedDp)) : 30;
      const deliveryValues = deliveryValidation.values;

      const coordinates = normalizeCoordinates(form.lat, form.lng);
      const payload = {
        address: trimmedAddress,
        phone: normalizedPhone,
        email: form.email.trim(),
        facebook_url: form.facebook_url.trim(),
        instagram_url: form.instagram_url.trim(),
        tiktok_url: form.tiktok_url.trim(),
        logo_url: finalLogoUrl,
        qr_url: finalQrUrl,
        lat: coordinates.lat,
        lng: coordinates.lng,
        min_downpayment_percent: minDp,
        ...deliveryValues,
      };
      payload.name = trimmedName;
      if (!profileLocked) {
        payload.description = form.description.trim();
        payload.products_summary = form.products_summary.trim();
      }

      const { error: err } = await supabase
        .from("businesses")
        .update(payload)
        .eq("id", businessId);

      if (err) throw err;

      const savedForm = {
        ...form,
        name: trimmedName,
        address: trimmedAddress,
        email: form.email.trim(),
        facebook_url: form.facebook_url.trim(),
        instagram_url: form.instagram_url.trim(),
        tiktok_url: form.tiktok_url.trim(),
        phone: toPhilippinePhoneInput(normalizedPhone),
        logo_url: finalLogoUrl,
        qr_url: finalQrUrl,
        min_downpayment_percent: minDp,
        delivery_enabled: deliveryValues.delivery_enabled,
        delivery_base_fee: String(deliveryValues.delivery_base_fee),
        delivery_included_distance_km: String(deliveryValues.delivery_included_distance_km),
        delivery_fee_per_extra_km: String(deliveryValues.delivery_fee_per_extra_km),
        delivery_max_distance_km: deliveryValues.delivery_max_distance_km == null ? "" : String(deliveryValues.delivery_max_distance_km),
        delivery_distance_rounding: deliveryValues.delivery_distance_rounding,
      };
      setForm(savedForm);
      setInitialForm(savedForm);
      setPhoneTouched(false);
      await saveOperatingHours();
      setLogoFile(null);
      setQrFile(null);
      showToast("Shop profile updated successfully.");

    } catch (err) {
      showToast(err.message || "Failed to save profile.", "error");
    } finally {
      setSaving(false);
      setLogoUploading(false);
      setQrUploading(false);
    }
  };

  const phoneError = phoneTouched && (!form.phone || !normalizePhilippinePhone(form.phone))
    ? !form.phone
      ? "A shop contact number is required."
      : form.phone.startsWith("9")
        ? "Enter all 10 digits of the shop mobile number."
        : "Your number must start with 9. Example: 9123456789."
    : "";
  const hasMapCoordinates = Boolean(normalizeCoordinates(form.lat, form.lng));
  const deliveryPreviewSettings = normalizeDeliverySettings(form);
  const deliveryStandardPreview = calculateDeliveryFeeFromDistance(
    Math.min(2.5, deliveryPreviewSettings.delivery_included_distance_km),
    deliveryPreviewSettings
  );
  const deliveryExtraPreview = calculateDeliveryFeeFromDistance(
    deliveryPreviewSettings.delivery_included_distance_km + 2.2,
    deliveryPreviewSettings
  );
  const deliveryDescription = `Delivery costs ${formatPesoAmount(deliveryPreviewSettings.delivery_base_fee)} within ${deliveryPreviewSettings.delivery_included_distance_km} km. Each additional kilometer adds ${formatPesoAmount(deliveryPreviewSettings.delivery_fee_per_extra_km)}.`;
  const missingRequiredFields = [
    !form.name.trim() && "business name",
    !form.phone && "phone number",
    !form.address.trim() && "address",
    !hasMapCoordinates && "map pin",
  ].filter(Boolean);

  if (loading) {
    return (
      <main className="owner-shop-page min-h-screen bg-[#F6F6F2] flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading shop settings...</p>
        </div>
      </main>
    );
  }

  if (!initialForm) {
    return (
      <main className="owner-shop-page flex min-h-screen items-center justify-center bg-[#F6F6F2] p-6 font-sans text-slate-900">
        <div className="w-full max-w-lg rounded-3xl border border-[#D8D6CE] bg-white p-7 text-center shadow-sm sm:p-10">
          <Store size={34} className="mx-auto text-[#EC008C]" />
          <h1 className="mt-4 text-2xl font-black">Shop profile unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{loadError || "We could not find a shop profile for this owner account yet."}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black text-white hover:bg-[#EC008C]">Reload profile</button>
        </div>
      </main>
    );
  }

  return (
    <main data-tour="owner-shop-profile" className={`owner-shop-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 ${hasUnsavedChanges ? "pb-56 sm:pb-40" : "pb-20"}`}>
      <section className="relative overflow-hidden border-b border-slate-200 bg-white px-4 pb-7 pt-8 sm:px-8 sm:pb-8 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-[#00AFC0]/15" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#EC008C]">Storefront settings</p>
            <h1 className="mt-2 text-4xl font-black uppercase leading-[0.9] tracking-tight sm:text-6xl">
              My shop<span className="text-[#00AFC0]">.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
              Keep your public profile, customer contact details, payment QR, and shop location accurate.
            </p>
          </div>

          <div className="flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-2.5 shadow-sm sm:w-auto sm:min-w-[300px]">
            <div className="flex min-w-0 items-center gap-2.5 px-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${isOpen ? "bg-emerald-500 ring-emerald-500/10" : "bg-slate-500 ring-slate-500/10"}`} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Store status</p>
                <p className="truncate text-xs font-bold text-slate-800">{isOpen ? "Visible to customers" : "Temporarily closed"}</p>
              </div>
            </div>
            <button
              data-tour="owner-shop-status"
              type="button"
              onClick={handleToggleOpen}
              disabled={togglingOpen}
              aria-pressed={isOpen}
              aria-label={isOpen ? "Close shop to customers" : "Open shop to customers"}
              className={`inline-flex min-w-[88px] shrink-0 items-center justify-center gap-2 rounded-xl border-2 px-3.5 py-2.5 text-xs font-black shadow-sm transition-colors disabled:cursor-wait disabled:opacity-60 ${
                isOpen ? "border-[#00AFC0] bg-[#00FFFF] !text-slate-950 hover:border-[#756D00] hover:bg-[#FFF200]" : "border-slate-900 bg-slate-900 !text-white hover:border-[#EC008C] hover:bg-[#EC008C]"
              }`}
            >
              {togglingOpen ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} {togglingOpen ? "Saving" : isOpen ? "Open" : "Closed"}
            </button>
          </div>
        </div>
      </section>

      {toast && (
        <div className={`fixed bottom-5 left-4 right-4 z-[200] flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg sm:left-auto sm:right-6 ${
          toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <CheckCircle2 size={16} /> {toast.msg}
        </div>
      )}

      <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-8 lg:px-10" aria-live="polite">
        <div className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between ${missingRequiredFields.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div>
            <p className="font-black uppercase tracking-[0.12em]">Profile readiness</p>
            <p className="mt-1 leading-relaxed">{missingRequiredFields.length === 0 ? "Required customer-facing details are complete." : `Still needed: ${missingRequiredFields.join(", ")}.`}</p>
          </div>
          <span className="font-mono text-[10px] font-black uppercase tracking-widest">{missingRequiredFields.length === 0 ? "Ready to save" : `${missingRequiredFields.length} required`}</span>
        </div>
        {profileValidationError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{profileValidationError}</p>}
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        <form onSubmit={handleSubmit}>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Store hours</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">When customers can order</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Set a weekly schedule. Unconfigured days stay closed.</p>
                  </div>
                  <Clock size={20} className="text-[#00AFC0]" />
                </div>

                <div className="mt-5 grid gap-2">
                  {hours.map((row) => (
                    <div key={row.day_of_week} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#F9F9F7] p-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                      <label className="flex items-center gap-2 text-xs font-black text-slate-800">
                        <input
                          type="checkbox"
                          checked={row.configured}
                          onChange={(event) => updateDay(row.day_of_week, { configured: event.target.checked })}
                          className="h-4 w-4 accent-[#EC008C]"
                        />
                        {DAY_NAMES[row.day_of_week]}
                      </label>
                      {row.configured ? (
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                          Opens
                          <input
                            type="time"
                            value={row.opens_at}
                            disabled={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { opens_at: event.target.value })}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0] disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      ) : <span className="text-[11px] text-slate-400 sm:col-span-2">No schedule configured</span>}
                      {row.configured && (
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                          Closes
                          <input
                            type="time"
                            value={row.closes_at}
                            disabled={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { closes_at: event.target.value })}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0] disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      )}
                      {row.configured && (
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                          <input
                            type="checkbox"
                            checked={row.is_closed}
                            onChange={(event) => updateDay(row.day_of_week, { is_closed: event.target.checked })}
                            className="h-4 w-4 accent-[#EC008C]"
                          />
                          Closed
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#00AFC0]/25 bg-[#00FFFF]/[0.06] p-4 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block max-w-xs">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Shop timezone</span>
                    <select
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#00AFC0]"
                    >
                      <option value="Asia/Manila">Asia/Manila (Philippine Time)</option>
                      <option value="Asia/Singapore">Asia/Singapore</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </label>
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Manual status</p>
                    <p className="mt-1 text-xs font-bold text-slate-800">{manualOverride === null ? "Following schedule" : "Closed until reopened"}</p>
                    {manualOverride !== null && (
                      <button type="button" onClick={handleResumeSchedule} disabled={togglingOpen} className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#C40075] hover:underline disabled:opacity-50">
                        <RotateCcw size={12} /> Resume schedule
                      </button>
                    )}
                  </div>
                </div>
                {hoursSaving && <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#C40075]">Saving hours...</p>}
              </section>

              <section className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm">
                <div className="cmyk-bar-sm" />
                <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">01 / Identity</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Make your shop recognizable</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">This name and logo are used across your storefront, orders, and customer messages.</p>
                </div>
                <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
                  <div className="flex flex-col items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Shop logo preview" className="h-32 w-full max-w-[260px] rounded-2xl border border-[#D8D6CE] bg-white object-contain p-2 shadow-sm" />
                    ) : (
                      <div className="flex h-32 w-full max-w-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#F6F6F2] text-slate-400">
                        <Store size={38} />
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoSelected(e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving || logoUploading}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:opacity-50"
                    >
                      <UploadCloud size={14} /> {logoUploading ? "Uploading..." : "Change logo"}
                    </button>
                    <p className="text-center text-[10px] leading-relaxed text-slate-400">PNG, JPG, or WebP<br />Optimized on upload</p>
                    {logoError && <p className="text-center text-[11px] font-medium text-rose-600">{logoError}</p>}
                  </div>

                  <div>
                    <label htmlFor="shop-name" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Business name <span className="text-[#EC008C]">*</span></label>
                    <input
                      id="shop-name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="e.g. Apex Print Studio"
                      required
                      aria-required="true"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3.5 text-sm font-semibold outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40"
                    />
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
                      <Info size={13} className="mt-0.5 shrink-0 text-[#00AFC0]" />
                       You can update this shop name anytime. It does not require Admin approval.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="border-b border-slate-100 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">02 / Public profile</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Tell customers what you do</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">These customer-facing details are reviewed before your shop is approved.</p>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {[
                    ["Business background", "description", "A short overview of your shop", "Tell customers when you started, what you specialize in, and what makes your shop reliable."],
                    ["Products & services", "products_summary", "What customers can order", "Business cards, flyers, posters, tarpaulins, stickers, photo printing, and rush orders."],
                  ].map(([label, key, helper, fallback]) => (
                    <div key={key} className="rounded-2xl border border-slate-200 bg-[#F9F9F7] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-800">{label}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{helper}</p>
                        </div>
                        <ShieldCheck size={16} className="shrink-0 text-[#00AFC0]" />
                      </div>
                      {businessStatus === "APPROVED" ? <p className={`mt-4 min-h-24 text-xs leading-relaxed ${form[key] ? "text-slate-700" : "italic text-slate-400"}`}>
                        {form[key] || fallback}
                      </p> : <textarea
                        name={key}
                        value={form[key]}
                        onChange={handleChange}
                        minLength={key === "description" ? 20 : 10}
                        maxLength={key === "description" ? 800 : 500}
                        rows={4}
                        placeholder={fallback}
                        aria-label={label}
                        className="mt-4 min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-700 outline-none transition-colors focus:border-[#00AFC0] focus:ring-2 focus:ring-[#00FFFF]/30"
                      />}
                      <p className="mt-3 border-t border-slate-200 pt-3 text-[10px] leading-relaxed text-slate-400">
                        {businessStatus === "APPROVED"
                          ? <>Locked after approval. Request changes from the <Link href="/owner/documents" className="font-bold text-[#C40075] hover:underline">Documents</Link> page.</>
                          : "You can edit this field while your shop is pending. Saving sends the updated value back for review."}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="border-b border-slate-100 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">03 / Contact</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">How customers can reach you</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Keep these details current so customers know where to ask questions.</p>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Phone number <span className="text-[#EC008C]">*</span></span>
                    <span className={`mt-2 flex overflow-hidden rounded-2xl border bg-[#F6F6F2] transition-colors focus-within:ring-2 ${
                      phoneError
                        ? "border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-200"
                        : "border-slate-200 focus-within:border-[#00AFC0] focus-within:bg-white focus-within:ring-[#00FFFF]/40"
                    }`}>
                      <span className="flex items-center gap-2 border-r border-slate-200 bg-slate-100 px-3.5 text-sm font-bold text-slate-700" aria-hidden="true">
                        <Phone size={15} className="text-[#EC008C]" />
                        +63
                      </span>
                      <input
                        type="tel"
                        name="phone"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        pattern="[0-9]*"
                        value={form.phone}
                        onBlur={() => setPhoneTouched(true)}
                        onChange={handleChange}
                        placeholder="9123456789"
                        aria-label="Shop mobile number without country code"
                        aria-invalid={Boolean(phoneError)}
                        aria-required="true"
                        aria-describedby="shop-phone-help shop-phone-error"
                        className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm outline-none"
                      />
                    </span>
                    <span id="shop-phone-help" className="mt-1 block text-[11px] text-slate-500">Required · enter 10 digits after +63. We save the complete number for customers.</span>
                    {phoneError && (
                      <span id="shop-phone-error" role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                        <Info size={14} aria-hidden="true" />
                        {phoneError}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Business email</span>
                    <span className="relative mt-2 block">
                      <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#EC008C]" />
                      <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="contact@yourshop.com" className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] py-3.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                    </span>
                  </label>
                  {SOCIAL_URL_FIELDS.map(({ key, label, placeholder }) => (
                    <label key={key} className="block">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label} <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span></span>
                      <span className="relative mt-2 block">
                        <ExternalLink size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#EC008C]" />
                        <input type="url" name={key} value={form[key]} onChange={handleChange} placeholder={placeholder} aria-label={`${label} URL`} className="w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] py-3.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">04 / Location</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">Help customers find you</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Add a clear address and place the marker at your shop entrance.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={locatingCurrentLocation || saving}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#00AFC0]/40 bg-[#EFFFFF] px-3 py-1.5 text-[10px] font-black text-[#007F8A] transition-colors hover:border-[#00AFC0] hover:bg-[#00FFFF]/30 disabled:cursor-wait disabled:opacity-60"
                    >
                      {locatingCurrentLocation ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
                      {locatingCurrentLocation ? "Locating…" : "Use my current location"}
                    </button>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${hasMapCoordinates ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      <MapPin size={12} /> {hasMapCoordinates ? "Map pin ready" : "Map pin needed"}
                    </span>
                  </div>
                </div>
                <label className="mt-5 block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Address <span className="text-[#EC008C]">*</span></span>
                  <input type="text" name="address" value={form.address} onChange={handleChange} onBlur={handleAddressLookup} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleAddressLookup(); } }} placeholder="e.g. QFV5+Q6V, Sampaguita Street, Orani, Bataan" required aria-required="true" aria-describedby="shop-address-help" className="mt-2 w-full rounded-2xl border border-slate-200 bg-[#F6F6F2] px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/40" />
                  <span id="shop-address-help" aria-live="polite" className={`mt-2 block text-[11px] ${addressLookupStatus === "error" ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                    {addressLookupStatus === "loading" && "Finding the address for this map pin…"}
                    {addressLookupStatus === "success" && "Address and map pin are synchronized. You can still edit the address."}
                    {addressLookupStatus === "error" && "We could not find an exact address. You can type it manually."}
                    {addressLookupStatus === "idle" && "Type an address or Plus Code, then press Enter or click away to pin it on the map."}
                  </span>
                </label>
                <div className="mt-5 overflow-hidden rounded-2xl border border-[#D8D6CE] bg-[#ECECE8]">
                  <div className="flex items-center gap-2 border-b border-[#D8D6CE] bg-white px-4 py-3 text-xs font-bold text-slate-700">
                    <MapPinned size={15} className="text-[#00AFC0]" /> Drag the marker or click the map to adjust it.
                  </div>
                  <div className="relative h-[340px] sm:h-[420px]">
                    <LocationPicker
                      lat={form.lat}
                      lng={form.lng}
                      onChange={handleLocationChange}
                    />
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-6">
              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Customer view</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Your storefront preview</h2>
                  </div>
                  <Store size={20} className="text-[#00AFC0]" />
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-4">
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Preview logo" className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-[#00FFFF]"><Store size={22} /></div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{form.name || "Your shop name"}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${isOpen ? "text-emerald-700" : "text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-emerald-500" : "bg-slate-400"}`} /> {isOpen ? "Open for orders" : "Currently closed"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-[11px] text-slate-600">
                    <p className="flex items-start gap-2"><MapPin size={13} className="mt-0.5 shrink-0 text-[#EC008C]" /> <span>{form.address || "Add your shop address"}</span></p>
                    <p className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-[#EC008C]" /> <span>{normalizePhilippinePhone(form.phone) || "Add a contact number"}</span></p>
                    <p className="flex items-center gap-2">
                      <Truck size={13} className="shrink-0 text-[#EC008C]" />
                      <span>
                        {!form.delivery_enabled
                          ? "Store pickup only"
                          : !hasMapCoordinates
                            ? "Delivery setup needs a map pin"
                            : `Delivery available · ${formatPesoAmount(deliveryPreviewSettings.delivery_base_fee)} within ${deliveryPreviewSettings.delivery_included_distance_km} km`}
                      </span>
                    </p>
                  </div>
                </div>
                <Link href="/browse" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#C40075] hover:underline">
                  <ExternalLink size={14} /> View customer marketplace
                </Link>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Payments</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Payment QR code</h2>
                  </div>
                  <QrCode size={20} className="text-[#00AFC0]" />
                </div>
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-200 bg-[#F6F6F2] p-3">
                  {qrPreview ? (
                    <img src={qrPreview} alt="Payment QR code preview" className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400"><QrCode size={34} /></div>
                  )}
                  <div className="min-w-0">
                    <input ref={qrInputRef} type="file" accept="image/*" onChange={(e) => handleQrSelected(e.target.files?.[0])} className="hidden" />
                    <button type="button" onClick={() => qrInputRef.current?.click()} disabled={saving || qrUploading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:opacity-50">
                      <UploadCloud size={14} /> {qrUploading ? "Uploading..." : "Change QR"}
                    </button>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">GCash or Maya QR image.<br />Customers can use it at checkout.</p>
                    {qrError && <p className="mt-1 text-[11px] font-medium text-rose-600">{qrError}</p>}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Checkout settings</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Downpayment policy</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">Set the minimum percentage customers must pay before production starts.</p>
                <div className="mt-4 flex items-center gap-2">
                  <input type="number" min="1" max="100" name="min_downpayment_percent" value={form.min_downpayment_percent} onChange={handleChange} className="w-24 rounded-xl border border-slate-200 bg-[#F6F6F2] px-3 py-3 text-sm font-black outline-none focus:border-[#EC008C] focus:bg-white focus:ring-2 focus:ring-[#EC008C]/20" />
                  <span className="text-sm font-black text-slate-500">%</span>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm" aria-labelledby="delivery-pricing-title">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Delivery settings</p>
                    <h2 id="delivery-pricing-title" className="mt-1 text-lg font-black text-slate-900">Delivery pricing</h2>
                  </div>
                  <Truck size={20} className="text-[#00AFC0]" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">Set a fair local delivery price. Customers see the fee before they place an order.</p>

                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#F6F6F2] p-3">
                  <span>
                    <span className="block text-xs font-black text-slate-800">Offer local delivery</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">Turn this off to keep Store Pickup available only.</span>
                  </span>
                  <input
                    type="checkbox"
                    name="delivery_enabled"
                    checked={form.delivery_enabled}
                    onChange={(event) => setForm((current) => ({ ...current, delivery_enabled: event.target.checked }))}
                    className="h-5 w-5 shrink-0 accent-[#EC008C]"
                  />
                </label>

                {form.delivery_enabled && (
                  <>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Base delivery fee</span>
                    <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-[#F6F6F2] focus-within:border-[#00AFC0] focus-within:ring-2 focus-within:ring-[#00FFFF]/30">
                      <span className="px-3 text-xs font-black text-slate-500">₱</span>
                      <input type="number" min="0" step="0.01" name="delivery_base_fee" value={form.delivery_base_fee} onChange={handleChange} aria-invalid={Boolean(deliveryValidationErrors.delivery_base_fee)} aria-describedby="delivery-base-fee-error" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-black outline-none" />
                    </div>
                    {deliveryValidationErrors.delivery_base_fee && <span id="delivery-base-fee-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-700">{deliveryValidationErrors.delivery_base_fee}</span>}
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Included distance</span>
                    <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-[#F6F6F2] focus-within:border-[#00AFC0] focus-within:ring-2 focus-within:ring-[#00FFFF]/30">
                      <input type="number" min="0.01" step="any" name="delivery_included_distance_km" value={form.delivery_included_distance_km} onChange={handleChange} onBlur={() => formatDistanceInput("delivery_included_distance_km")} aria-invalid={Boolean(deliveryValidationErrors.delivery_included_distance_km)} aria-describedby="delivery-included-distance-error" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-black outline-none" />
                      <span className="px-3 text-xs font-black text-slate-500">km</span>
                    </div>
                    {deliveryValidationErrors.delivery_included_distance_km && <span id="delivery-included-distance-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-700">{deliveryValidationErrors.delivery_included_distance_km}</span>}
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Fee per extra km</span>
                    <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-[#F6F6F2] focus-within:border-[#00AFC0] focus-within:ring-2 focus-within:ring-[#00FFFF]/30">
                      <span className="px-3 text-xs font-black text-slate-500">₱</span>
                      <input type="number" min="0" step="0.01" name="delivery_fee_per_extra_km" value={form.delivery_fee_per_extra_km} onChange={handleChange} aria-invalid={Boolean(deliveryValidationErrors.delivery_fee_per_extra_km)} aria-describedby="delivery-extra-fee-error" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-black outline-none" />
                    </div>
                    {deliveryValidationErrors.delivery_fee_per_extra_km && <span id="delivery-extra-fee-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-700">{deliveryValidationErrors.delivery_fee_per_extra_km}</span>}
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Maximum distance <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span></span>
                    <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-[#F6F6F2] focus-within:border-[#00AFC0] focus-within:ring-2 focus-within:ring-[#00FFFF]/30">
                      <input type="number" min="0.01" step="any" name="delivery_max_distance_km" value={form.delivery_max_distance_km} onChange={handleChange} onBlur={() => formatDistanceInput("delivery_max_distance_km")} placeholder="No limit" aria-invalid={Boolean(deliveryValidationErrors.delivery_max_distance_km)} aria-describedby="delivery-max-distance-error" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-black outline-none" />
                      <span className="px-3 text-xs font-black text-slate-500">km</span>
                    </div>
                    {deliveryValidationErrors.delivery_max_distance_km && <span id="delivery-max-distance-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-700">{deliveryValidationErrors.delivery_max_distance_km}</span>}
                  </label>
                    </div>

                    <label className="mt-3 block">
                  <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Distance rounding</span>
                  <select name="delivery_distance_rounding" value={form.delivery_distance_rounding} onChange={handleChange} aria-invalid={Boolean(deliveryValidationErrors.delivery_distance_rounding)} aria-describedby="delivery-rounding-error" className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F6F6F2] px-3 py-3 text-xs font-bold outline-none focus:border-[#00AFC0] focus:bg-white focus:ring-2 focus:ring-[#00FFFF]/30">
                    {DELIVERY_ROUNDING_RULES.map((rule) => <option key={rule.value} value={rule.value}>{rule.label}</option>)}
                  </select>
                  {deliveryValidationErrors.delivery_distance_rounding && <span id="delivery-rounding-error" role="alert" className="mt-1 block text-[10px] font-semibold text-rose-700">{deliveryValidationErrors.delivery_distance_rounding}</span>}
                    </label>

                    <p className="mt-4 rounded-xl border border-[#00AFC0]/25 bg-[#EFFFFF] p-3 text-[11px] font-semibold leading-relaxed text-slate-700">{deliveryDescription}</p>

                    <div className="mt-4 rounded-2xl border border-[#00AFC0]/25 bg-[#EFFFFF] p-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-[#EC008C]" />
                        <div>
                          <p className="text-xs font-black text-slate-900">Delivery distance uses the shop pin</p>
                          <p className="mt-0.5 text-[10px] text-slate-600">Customers are charged based on the distance from this pin to their delivery address.</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Within included distance</p>
                        <p className="mt-1 font-bold text-slate-900">{formatDeliveryDistance(deliveryStandardPreview.distanceKm)} · {formatPesoAmount(deliveryStandardPreview.deliveryFee)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">At included + 2.2 km</p>
                        <p className="mt-1 font-bold text-slate-900">{formatDeliveryDistance(deliveryExtraPreview.distanceKm)} · {formatPesoAmount(deliveryExtraPreview.deliveryFee)}</p>
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section
                data-floating-save={hasUnsavedChanges ? "true" : "false"}
                aria-live="polite"
                className={`rounded-3xl border-2 border-slate-900 bg-slate-900 text-white shadow-[6px_6px_0_rgba(0,255,255,0.8)] transition-[transform,box-shadow] ${
                  hasUnsavedChanges
                    ? "fixed bottom-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 items-center gap-4 px-4 py-3 sm:w-[min(92vw,760px)] sm:px-5"
                    : "relative p-5"
                }`}
              >
                <div className={`${hasUnsavedChanges ? "min-w-0 flex-1" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Save size={17} className="shrink-0 text-[#00FFFF]" />
                    <p className="truncate text-sm font-black">Save your storefront</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">Changes are not visible to customers until you save them.</p>
                </div>
                <p className={`shrink-0 text-[10px] font-black uppercase tracking-[0.16em] ${hasUnsavedChanges ? "text-[#FFF200]" : "mt-4 text-white/45"}`}>
                  {hasUnsavedChanges ? "Unsaved changes" : "Everything is up to date"}
                </p>
                <button type="submit" disabled={saving || !hasUnsavedChanges} className={`flex items-center justify-center gap-2 rounded-xl bg-[#00FFFF] px-4 py-3.5 text-xs font-black text-slate-900 transition-colors hover:bg-[#FFF200] disabled:cursor-not-allowed disabled:opacity-45 ${hasUnsavedChanges ? "w-auto min-w-[150px] shrink-0" : "mt-4 w-full"}`}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
              </section>
            </aside>
          </div>
        </form>
      </section>
    </main>
  );
}
