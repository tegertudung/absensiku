"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import HonorSlipDocument, { HonorSlipData } from "@/components/HonorSlipDocument";

// Tentor's own version of admin/recap/slip/[tutorId] — same document, but
// no tutorId in the URL: /honor/slip-summary resolves it server-side from
// the logged-in TENTOR, exactly like the old /honor/slip.pdf endpoint did.
export default function TentorHonorSlipPage() {
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "1";
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const [slip, setSlip] = useState<HonorSlipData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/honor/slip-summary", { params: { month, year } })
      .then((response) => setSlip(response.data.data))
      .catch((err) =>
        setError(err.response?.data?.message || "Gagal memuat Slip Honor."),
      );
  }, [month, year]);

  useEffect(() => {
    if (slip && !preview) window.setTimeout(() => window.print(), 350);
  }, [slip, preview]);

  if (error)
    return (
      <main className="print-document-screen p-8 text-sm text-red-700">
        {error}
      </main>
    );
  if (!slip)
    return (
      <main className="print-document-screen p-8 text-sm text-gray-500">
        Menyiapkan Slip Honor...
      </main>
    );

  return (
    <main className="print-document-screen">
      {!preview && (
        <div className="print-toolbar">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
          >
            Kembali
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white"
          >
            Cetak / Simpan PDF
          </button>
        </div>
      )}
      <HonorSlipDocument slip={slip} />
    </main>
  );
}
