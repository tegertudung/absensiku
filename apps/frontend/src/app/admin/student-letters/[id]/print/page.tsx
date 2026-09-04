"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import StudentLetterDocument, { StudentLetterDocumentData } from "@/components/StudentLetterDocument";

export default function PrintStudentLetterPage() {
  const params = useParams<{ id: string }>(); const searchParams = useSearchParams(); const preview = searchParams.get("preview") === "1"; const [letter, setLetter] = useState<StudentLetterDocumentData | null>(null); const [error, setError] = useState(false);
  useEffect(() => { api.get(`/student-letters/${params.id}`).then((response) => setLetter(response.data.data)).catch(() => setError(true)); }, [params.id]);
  useEffect(() => { if (letter && !preview) window.setTimeout(() => window.print(), 350); }, [letter, preview]);
  if (error) return <main className="print-document-screen p-8 text-sm text-red-700">Gagal memuat surat untuk dicetak.</main>;
  if (!letter) return <main className="print-document-screen p-8 text-sm text-gray-500">Menyiapkan surat...</main>;
  return <main className="print-document-screen">{!preview && <div className="print-toolbar"><button onClick={() => window.history.back()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">Kembali</button><button onClick={() => window.print()} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white">Cetak / Simpan PDF</button></div>}<StudentLetterDocument letter={letter} /></main>;
}
