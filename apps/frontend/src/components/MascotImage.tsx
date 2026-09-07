"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function MascotImage({
  mascotId,
  alt,
  className = "",
  fallbackSrc,
  fallbackMascotId,
}: {
  mascotId: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  fallbackMascotId?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let disposed = false;
    setSrc(null);
    const loadMascot = (id: string) =>
      api.get(`/tutor-mascots/${id}/image`, { responseType: "blob" });
    loadMascot(mascotId)
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data as Blob);
        if (disposed) URL.revokeObjectURL(objectUrl);
        else setSrc(objectUrl);
      })
      .catch(() => {
        if (!fallbackMascotId || fallbackMascotId === mascotId) {
          setSrc(null);
          return;
        }
        loadMascot(fallbackMascotId)
          .then((response) => {
            objectUrl = URL.createObjectURL(response.data as Blob);
            if (disposed) URL.revokeObjectURL(objectUrl);
            else setSrc(objectUrl);
          })
          .catch(() => setSrc(null));
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallbackMascotId, mascotId]);

  if (!src) {
    if (fallbackSrc)
      return <img src={fallbackSrc} alt={alt} className={className} />;
    return (
      <span
        className={`block ${className}`}
        aria-label={`${alt} tidak tersedia`}
      />
    );
  }
  return <img src={src} alt={alt} className={className} />;
}
