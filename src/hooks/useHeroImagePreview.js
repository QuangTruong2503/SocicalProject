import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadDoanTrangHeroImage,
  saveDoanTrangHeroImage,
} from "./useIndexedDB.js";
import { uploadDoanTrangHeroPreview } from "../services/uploadService.js";

export function useHeroImagePreview(userId) {
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroImageName, setHeroImageName] = useState("");
  const [heroImageError, setHeroImageError] = useState("");
  const [heroImageLoading, setHeroImageLoading] = useState(true);
  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const [heroImageStorageUrl, setHeroImageStorageUrl] = useState("");
  const heroImageUrlRef = useRef("");

  useEffect(() => {
    let isActive = true;

    loadDoanTrangHeroImage()
      .then((result) => {
        if (!isActive || !result) return;

        heroImageUrlRef.current = result.url;
        setHeroImageUrl(result.url);
        setHeroImageName(result.name);
      })
      .catch((error) => {
        console.warn("[DoanTrangWatermark] Could not load hero image", error);
      })
      .finally(() => {
        if (isActive) {
          setHeroImageLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (heroImageUrlRef.current) {
        URL.revokeObjectURL(heroImageUrlRef.current);
      }
    },
    [],
  );

  const handleHeroImageChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      setHeroImageError("");

      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setHeroImageError("Vui lòng chọn file ảnh hợp lệ.");
        event.target.value = "";
        return;
      }

      try {
        await saveDoanTrangHeroImage(file);
        const nextUrl = URL.createObjectURL(file);

        if (heroImageUrlRef.current) {
          URL.revokeObjectURL(heroImageUrlRef.current);
        }

        heroImageUrlRef.current = nextUrl;
        setHeroImageUrl(nextUrl);
        setHeroImageName(file.name);
        setHeroImageStorageUrl("");
        setHeroImageUploading(true);

        const uploadResult = await uploadDoanTrangHeroPreview({
          userId,
          file,
        });

        if (uploadResult.error) {
          setHeroImageError(uploadResult.error);
          return;
        }

        setHeroImageStorageUrl(uploadResult.data?.image_url || "");
      } catch (error) {
        console.error("[DoanTrangWatermark] Could not save hero image", error);
        setHeroImageError(
          "Chưa lưu được ảnh preview vào IndexedDB. Bạn thử lại nhé.",
        );
      } finally {
        setHeroImageUploading(false);
        event.target.value = "";
      }
    },
    [userId],
  );

  return {
    heroImageUrl,
    heroImageName,
    heroImageError,
    heroImageLoading,
    heroImageUploading,
    heroImageStorageUrl,
    handleHeroImageChange,
  };
}
